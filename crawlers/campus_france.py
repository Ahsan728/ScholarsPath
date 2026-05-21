"""
Campus France Crawler
=====================
Fetches French university master programs and language programs from
Campus France's public program search. Also scrapes DAAD-style language
programs for French from the French Institute network.

Source: https://www.campusfrance.org/en/france/study-in-france/find-a-program
"""

import logging
import re
import time
from typing import Optional

import httpx
from bs4 import BeautifulSoup

from base_program import BaseProgramCrawler, RawProgram

logger = logging.getLogger("campus_france")

SEARCH_URL = "https://www.campusfrance.org/en/france/study-in-france/find-a-program"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

# Campus France also exposes an API via their internal search
# These endpoints were discovered from public network inspection
API_ENDPOINTS = [
    # Try Algolia-based endpoint (may require app-id / api-key in headers)
    "https://www.campusfrance.org/api/programmes",
    # Fallback: direct search page pagination
]

FIELD_CATEGORY = {
    "informatique": "cs_ai", "computer": "cs_ai", "numérique": "cs_ai",
    "data": "cs_ai", "intelligence artificielle": "cs_ai", "réseau": "cs_ai",
    "génie électrique": "engineering", "génie mécanique": "engineering",
    "génie civil": "engineering", "génie chimique": "engineering",
    "ingénierie": "engineering", "engineering": "engineering",
    "finance": "business", "économie": "business", "gestion": "business",
    "management": "business", "commerce": "business",
    "physique": "science", "chimie": "science", "biologie": "science",
    "mathématiques": "science", "sciences": "science",
    "médecine": "health", "santé": "health",
    "architecture": "arts", "design": "arts",
    "droit": "social", "sciences politiques": "social",
    "langue": "languages", "linguistique": "languages", "français": "languages",
    "fle": "languages",
}


def infer_category(name: str) -> str:
    n = name.lower()
    for kw, cat in FIELD_CATEGORY.items():
        if kw in n:
            return cat
    # English fallback
    for kw in ["computer", "engineer", "management", "finance", "physics",
               "chemistry", "biology", "language", "french"]:
        if kw in n:
            return {"computer": "cs_ai", "engineer": "engineering",
                    "management": "business", "finance": "business",
                    "physics": "science", "chemistry": "science",
                    "biology": "science", "language": "languages",
                    "french": "languages"}.get(kw, "cs_ai")
    return "cs_ai"


def parse_program_item(item: dict | BeautifulSoup, source: str) -> Optional[RawProgram]:
    """Parse either a JSON API result or a BeautifulSoup element."""
    if isinstance(item, dict):
        name = (item.get("title") or item.get("name") or item.get("programme") or "").strip()
        university = (item.get("etablissement") or item.get("university") or
                      item.get("institution") or "French University").strip()
        city = (item.get("ville") or item.get("city") or "France").strip()
        url = item.get("url") or item.get("link") or SEARCH_URL
        level_raw = item.get("niveau") or item.get("level") or "master"
        lang_raw = item.get("langue") or item.get("language") or ""
    else:
        # BeautifulSoup element
        name_el = item.find(["h2", "h3", "h4", "a", ".title"])
        name = name_el.get_text(strip=True) if name_el else ""
        uni_el = item.find(class_=re.compile(r"university|etablissement|school", re.I))
        university = uni_el.get_text(strip=True) if uni_el else "French University"
        city_el = item.find(class_=re.compile(r"city|ville|location", re.I))
        city = city_el.get_text(strip=True) if city_el else "France"
        link = item.find("a", href=True)
        url = link["href"] if link else SEARCH_URL
        if url.startswith("/"):
            url = "https://www.campusfrance.org" + url
        level_raw = "master"
        lang_el = item.find(class_=re.compile(r"lang|langue", re.I))
        lang_raw = lang_el.get_text(strip=True) if lang_el else ""

    if not name or len(name) < 5:
        return None

    # Determine level
    level_lower = level_raw.lower()
    if "bachelor" in level_lower or "licence" in level_lower or "l3" in level_lower:
        level = "bachelor"
    elif "language" in level_lower or "langue" in level_lower or "fle" in level_lower:
        level = "language"
    else:
        level = "master"

    # Determine language of instruction
    lang_lower = lang_raw.lower()
    if "english" in lang_lower or "anglais" in lang_lower:
        language = "English"
    elif "français" in lang_lower or "french" in lang_lower:
        language = "French"
    else:
        language = "French/English"  # many French programs offer bilingual tracks

    category = infer_category(name)
    if level == "language":
        category = "languages"

    fields = [w.strip() for w in re.split(r"[,/&—–]", name) if len(w.strip()) > 3][:3]

    return RawProgram(
        program_name=name,
        university=university,
        country="France",
        city=city,
        level=level,
        source_name="campus_france",
        source_url=url,
        apply_url=url,
        category=category,
        field_of_study=fields if fields else [name[:50]],
        duration_years=2.0 if level == "master" else (3.0 if level == "bachelor" else 1.0),
        tuition_usd_year=None,   # French public unis: ~€3,770/year for non-EU (regulated)
        language=language,
        ielts_min=6.0 if language == "English" else None,
        gre_required=False,
        gpa_min=None,
        gpa_scale=4.0,
        intake="September/October",
        deadline=None,
        scholarship_available=False,
        description=(
            f"{level.title()} program at {university}, France. "
            "French public universities charge regulated tuition: "
            "~€170/year for EU students, €3,770/year for non-EU. "
            "Eiffel Excellence Scholarships available for international students."
        ),
        requirements=[
            "Relevant bachelor's degree (for master) or baccalaureate (for bachelor)",
            "French or English proficiency depending on program language",
            "Motivation letter (lettre de motivation)",
            "CV / academic transcripts",
        ],
        qs_ranking=None,
    )


class CampusFranceCrawler(BaseProgramCrawler):
    SOURCE_NAME = "campus_france"
    CRAWL_DELAY = 0.3
    MAX_PAGES = 20

    def fetch(self) -> list[RawProgram]:
        # Strategy 1: try internal JSON API
        programs = self._fetch_api()
        if programs:
            self.logger.info(f"Campus France API: {len(programs)} programs")
            return programs

        # Strategy 2: scrape HTML search page
        self.logger.info("Campus France API unavailable — falling back to HTML scrape")
        programs = self._scrape_html()
        self.logger.info(f"Campus France HTML: {len(programs)} programs")
        return programs

    def _fetch_api(self) -> list[RawProgram]:
        """Try Campus France internal API (JSON)."""
        programs: list[RawProgram] = []
        for endpoint in API_ENDPOINTS:
            try:
                resp = httpx.get(
                    endpoint,
                    headers={**HEADERS, "Accept": "application/json"},
                    params={"langue": "en", "niveau": "master", "limit": 200},
                    timeout=15,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    items = data if isinstance(data, list) else data.get("results") or data.get("programmes") or []
                    for item in items:
                        prog = parse_program_item(item, "api")
                        if prog:
                            programs.append(prog)
                    if programs:
                        return programs
            except Exception as e:
                self.logger.debug(f"API endpoint {endpoint} failed: {e}")
        return []

    def _scrape_html(self) -> list[RawProgram]:
        """Scrape Campus France search page HTML."""
        programs: list[RawProgram] = []
        seen: set[str] = set()

        for page in range(1, self.MAX_PAGES + 1):
            try:
                resp = httpx.get(
                    SEARCH_URL,
                    headers=HEADERS,
                    params={"page": page, "language": "en"},
                    timeout=20,
                    follow_redirects=True,
                )
                if resp.status_code != 200:
                    break
            except Exception as e:
                self.logger.warning(f"Campus France page {page} failed: {e}")
                break

            soup = BeautifulSoup(resp.text, "html.parser")
            cards = (
                soup.select(".programme") or
                soup.select(".program") or
                soup.select("article") or
                soup.select(".result") or
                soup.select(".field-content")
            )

            if not cards:
                break

            page_count = 0
            for card in cards:
                prog = parse_program_item(card, "html")
                if prog and prog.program_name not in seen:
                    seen.add(prog.program_name)
                    programs.append(prog)
                    page_count += 1

            if page_count == 0:
                break
            time.sleep(0.8)

        return programs


if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s [%(name)s] %(levelname)s — %(message)s")
    crawler = CampusFranceCrawler()
    items = crawler.fetch()
    print(f"Fetched {len(items)} French programs")
    for p in items[:5]:
        print(f"  {p.university} — {p.program_name} ({p.level}, {p.language})")
    if "--save" in sys.argv:
        new, updated = crawler.run()
        print(f"Saved: {new} new, {updated} updated")
