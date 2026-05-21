"""
DAAD Programs Crawler
=====================
Fetches bachelor, master, and German language programs from DAAD's
International Programmes API. Extends the logic in masters_enricher.py
to cover all three program levels.

Source: https://www2.daad.de/deutschland/studienangebote/international-programmes/
"""

import logging
import time
from typing import Optional

import httpx

from base_program import BaseProgramCrawler, RawProgram

logger = logging.getLogger("daad_programs")

DAAD_API = (
    "https://www2.daad.de/deutschland/studienangebote/international-programmes"
    "/api/solr/en/search.json"
)

EUR_TO_USD = 1.09  # approximate conversion rate

CATEGORY_KEYWORDS = {
    "cs_ai": ["computer", "data", "software", "information", "ai", "artificial",
               "machine", "cyber", "digital", "media informatics", "bioinformatics"],
    "engineering": ["electrical", "mechanical", "civil", "chemical", "automotive",
                    "aerospace", "materials", "biomedical engineering", "energy",
                    "environmental engineering", "industrial", "production", "mechatronics"],
    "business": ["finance", "economics", "management", "business", "accounting",
                 "marketing", "logistics", "supply chain", "mba", "commerce"],
    "science": ["physics", "chemistry", "biology", "biochemistry", "molecular",
                "mathematics", "statistics", "geology", "ecology", "neuroscience",
                "photonics", "optics", "materials science"],
    "languages": ["german language", "language", "deutsch", "sprachkurs",
                  "german studies", "linguistics"],
    "social": ["political", "sociology", "social", "psychology", "anthropology",
               "history", "law", "international relations", "public policy"],
    "arts": ["architecture", "design", "art", "music", "film", "media studies",
             "urban", "planning"],
    "health": ["medicine", "public health", "nursing", "pharmacy", "dentistry",
               "nutrition", "sport"],
    "agriculture": ["agriculture", "food science", "forestry", "rural development"],
}


def infer_category(subject: str) -> str:
    s = subject.lower()
    for cat, keywords in CATEGORY_KEYWORDS.items():
        if any(kw in s for kw in keywords):
            return cat
    return "cs_ai"  # safe default


def infer_fields(subject: str, category: str) -> list[str]:
    """Return a field_of_study list from the subject string."""
    if not subject:
        return []
    # Capitalize each word for consistency
    return [w.strip().title() for w in subject.split(",") if w.strip()][:4]


def parse_doc(doc: dict, level: str) -> Optional[RawProgram]:
    # New DAAD API field names (updated 2025)
    name = (doc.get("courseName") or doc.get("courseNameShort") or "").strip()
    university = (doc.get("academy") or "").strip()
    city = (doc.get("city") or "Germany").strip()
    subject = (doc.get("subject") or "").strip()
    apply_url = (doc.get("link") or "").strip()
    description_raw = ""  # new API doesn't include description in list endpoint

    if not name or not university:
        return None

    # Duration: programmeDuration is in months
    duration_raw = doc.get("programmeDuration")
    try:
        duration_years = round(float(duration_raw) / 12, 1) if duration_raw else (2.0 if level == "master" else 3.0)
    except (TypeError, ValueError):
        duration_years = 2.0 if level == "master" else 3.0

    # Tuition: tuitionFees is annual EUR amount
    tuition_usd: Optional[float] = None
    raw_fee = doc.get("tuitionFees")
    if raw_fee:
        try:
            fee_eur = float(raw_fee)
            if fee_eur > 200:
                tuition_usd = round(fee_eur * EUR_TO_USD)
        except (TypeError, ValueError):
            pass

    ielts = None  # new API doesn't expose IELTS score in list
    gpa_min = None

    # Deadline: from date array
    deadline = None
    dates = doc.get("date") or doc.get("applicationDeadline")
    if isinstance(dates, list) and dates:
        deadline = dates[0].get("registrationDeadline") or dates[0].get("start")
    elif isinstance(dates, str):
        deadline = dates

    # Language of instruction
    lang_list = doc.get("languages") or []
    if isinstance(lang_list, str):
        lang_list = [lang_list]
    langs_lower = [l.lower() for l in lang_list]
    if level == "language":
        language = "German"
    elif "english" in langs_lower:
        language = "English"
    elif "german" in langs_lower:
        language = "German"
    else:
        language = "English"

    category = infer_category(subject)
    if level == "language":
        category = "languages"

    fields = infer_fields(subject, category)

    description = (
        description_raw[:500].strip()
        if description_raw
        else f"{level.title()} program at {university}, Germany. Source: DAAD International Programmes."
    )

    return RawProgram(
        program_name=name,
        university=university,
        country="Germany",
        city=city,
        level=level,
        source_name="daad",
        source_url=apply_url,
        apply_url=apply_url,
        category=category,
        field_of_study=fields,
        duration_years=duration_years,
        tuition_usd_year=tuition_usd,
        language=language,
        ielts_min=ielts if level != "language" else None,
        gre_required=False,
        gpa_min=gpa_min,
        gpa_scale=4.0,
        intake="Winter/Summer",
        deadline=deadline,
        scholarship_available=False,
        description=description,
        requirements=[
            f"Bachelor's degree in relevant field" if level in ("master", "language") else "Secondary school certificate",
            f"{'English' if language == 'English' else 'German'} language proficiency",
            "Motivation letter",
            "Academic transcripts",
        ],
        qs_ranking=None,
    )


class DaadProgramsCrawler(BaseProgramCrawler):
    SOURCE_NAME = "daad"
    CRAWL_DELAY = 0.2

    # (degree_param, our_level, lang_param)
    # degree: 1=bachelor, 2=master, 5=language courses
    # lang:   2=English, None=no lang filter
    LEVELS = [
        ("1", "bachelor",  "2"),
        ("2", "master",    "2"),
        ("5", "language",  None),  # German language courses — no English filter
    ]

    def fetch(self) -> list[RawProgram]:
        results: list[RawProgram] = []
        for degree_val, our_lvl, lang_val in self.LEVELS:
            programs = self._fetch_level(degree_val, our_lvl, lang_val)
            self.logger.info(f"  DAAD {our_lvl}: {len(programs)} programs fetched")
            results.extend(programs)
            time.sleep(1)
        return results

    def _fetch_level(self, degree_val: str, our_lvl: str, lang_val: Optional[str]) -> list[RawProgram]:
        params: list[tuple[str, str]] = [
            ("q", ""),
            ("degree[]", degree_val),
            ("rows", "2000"),
            ("start", "0"),
        ]
        if lang_val:
            params.append(("lang[]", lang_val))

        try:
            resp = httpx.get(DAAD_API, params=params, timeout=30)
            resp.raise_for_status()
            # New API response structure: courses[] instead of response.docs[]
            docs = resp.json().get("courses", [])
        except Exception as e:
            self.logger.error(f"DAAD fetch failed for degree={degree_val}: {e}")
            return []

        programs: list[RawProgram] = []
        for doc in docs:
            prog = parse_doc(doc, our_lvl)
            if prog:
                programs.append(prog)
        return programs


if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s [%(name)s] %(levelname)s — %(message)s")
    crawler = DaadProgramsCrawler()
    items = crawler.fetch()
    print(f"Fetched {len(items)} programs total")
    for lvl in ("bachelor", "master", "language"):
        count = sum(1 for p in items if p.level == lvl)
        print(f"  {lvl}: {count}")
    if "--save" in sys.argv:
        new, updated = crawler.run()
        print(f"Saved: {new} new, {updated} updated")
