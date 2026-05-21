"""
Universitaly Crawler
====================
Fetches Italian university programs (bachelor, master) from the
Italian Ministry of Education's international student portal.

Source: https://universitaly.it
API:    POST https://universitaly.it/index.php/scholarships/cercaCorsi
"""

import logging
import time
from typing import Optional

import httpx

from base_program import BaseProgramCrawler, RawProgram

logger = logging.getLogger("universitaly")

API_URL = "https://universitaly.it/index.php/scholarships/cercaCorsi"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Content-Type": "application/x-www-form-urlencoded",
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "X-Requested-With": "XMLHttpRequest",
    "Referer": "https://universitaly.it/index.php/scholarships/cercaCorsi",
}

# Universitaly level codes → our level
LEVEL_MAP = {
    "L":  "bachelor",
    "LM": "master",
    "LS": "master",
    "DR": "master",   # doctorate, map to master for now
}

FIELD_CATEGORY = {
    "informatica": "cs_ai", "ingegneria informatica": "cs_ai", "computer": "cs_ai",
    "intelligenza artificiale": "cs_ai", "data": "cs_ai",
    "ingegneria elettrica": "engineering", "ingegneria meccanica": "engineering",
    "ingegneria civile": "engineering", "ingegneria chimica": "engineering",
    "ingegneria": "engineering",
    "economia": "business", "finanza": "business", "management": "business",
    "business": "business", "amministrazione": "business",
    "fisica": "science", "chimica": "science", "biologia": "science",
    "scienze": "science", "matematica": "science",
    "medicina": "health", "farmacia": "health", "infermieristica": "health",
    "architettura": "arts", "design": "arts", "arte": "arts",
    "lingue": "languages", "lingua": "languages",
    "giurisprudenza": "social", "scienze politiche": "social",
    "psicologia": "social",
}


def infer_category(name: str, area: str) -> str:
    combined = f"{name} {area}".lower()
    for kw, cat in FIELD_CATEGORY.items():
        if kw in combined:
            return cat
    # Try English keywords too
    for kw in ["computer", "engineer", "management", "finance", "physics",
               "chemistry", "biology", "architecture", "design", "law"]:
        if kw in combined:
            eng_map = {
                "computer": "cs_ai", "engineer": "engineering",
                "management": "business", "finance": "business",
                "physics": "science", "chemistry": "science",
                "biology": "science", "architecture": "arts",
                "design": "arts", "law": "social",
            }
            return eng_map.get(kw, "cs_ai")
    return "cs_ai"


def parse_course(course: dict, level: str) -> Optional[RawProgram]:
    name = (course.get("nome_corso_en") or course.get("nome_corso") or "").strip()
    university = (course.get("ateneo_en") or course.get("ateneo") or "").strip()
    city = (course.get("citta") or course.get("comune") or "Italy").strip()
    area = (course.get("area_disciplinare_en") or course.get("area_disciplinare") or "").strip()
    lang = (course.get("lingua_insegnamento") or "Italian").strip()
    apply_url = (course.get("url") or course.get("link") or "https://universitaly.it").strip()
    duration_years_raw = course.get("durata") or (3 if level == "bachelor" else 2)

    if not name or not university:
        return None

    # Only English-medium for non-language courses
    if "english" not in lang.lower() and "inglese" not in lang.lower():
        return None

    try:
        duration_years = float(duration_years_raw)
    except (TypeError, ValueError):
        duration_years = 2.0

    category = infer_category(name, area)
    fields = [w.strip() for w in name.split(",") if w.strip()][:3]
    if not fields:
        fields = [area] if area else [name[:50]]

    return RawProgram(
        program_name=name,
        university=university,
        country="Italy",
        city=city,
        level=level,
        source_name="universitaly",
        source_url=apply_url,
        apply_url=apply_url,
        category=category,
        field_of_study=fields,
        duration_years=duration_years,
        tuition_usd_year=None,  # Italian public universities: ~€1,000–3,000/year; varies
        language="English",
        ielts_min=6.0,
        gre_required=False,
        gpa_min=None,
        gpa_scale=4.0,
        intake="September/October",
        deadline=None,
        scholarship_available=False,
        description=(
            f"English-taught {level} program at {university}, Italy. "
            f"Field: {area or name}. "
            "Italian public universities offer very affordable tuition — "
            "typically €900–3,000/year. Merit scholarships (DSU) available."
        ),
        requirements=[
            "Secondary school diploma (for bachelor) or bachelor's degree (for master)",
            "IELTS 6.0 or equivalent English proficiency",
            "Academic transcripts",
            "Motivation letter",
        ],
        qs_ranking=None,
    )


class UniversitalyCrawler(BaseProgramCrawler):
    SOURCE_NAME = "universitaly"
    CRAWL_DELAY = 0.3

    LEVELS_TO_FETCH = [
        ("L",  "bachelor"),
        ("LM", "master"),
    ]

    def fetch(self) -> list[RawProgram]:
        results: list[RawProgram] = []
        for api_code, our_level in self.LEVELS_TO_FETCH:
            programs = self._fetch_level(api_code, our_level)
            self.logger.info(f"  Universitaly {our_level}: {len(programs)} programs")
            results.extend(programs)
            time.sleep(1)
        return results

    def _fetch_level(self, api_code: str, our_level: str) -> list[RawProgram]:
        programs: list[RawProgram] = []
        page = 1
        max_pages = 20  # safety cap

        while page <= max_pages:
            try:
                resp = httpx.post(
                    API_URL,
                    headers=HEADERS,
                    data={
                        "livello": api_code,
                        "lingua": "EN",
                        "pagina": str(page),
                        "nazione": "",
                        "area": "",
                        "cerca": "",
                    },
                    timeout=20,
                )
                resp.raise_for_status()
                data = resp.json()
            except Exception as e:
                self.logger.warning(f"Universitaly page {page} failed ({api_code}): {e}")
                break

            courses = data if isinstance(data, list) else data.get("corsi") or data.get("data") or []
            if not courses:
                break

            for course in courses:
                prog = parse_course(course, our_level)
                if prog:
                    programs.append(prog)

            if len(courses) < 20:  # last page
                break
            page += 1
            time.sleep(0.5)

        return programs


if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s [%(name)s] %(levelname)s — %(message)s")
    crawler = UniversitalyCrawler()
    items = crawler.fetch()
    print(f"Fetched {len(items)} Italian programs")
    for p in items[:5]:
        print(f"  {p.university} — {p.program_name} ({p.level})")
    if "--save" in sys.argv:
        new, updated = crawler.run()
        print(f"Saved: {new} new, {updated} updated")
