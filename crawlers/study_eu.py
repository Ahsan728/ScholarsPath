"""
Study.eu Crawler
================
Fetches European bachelor and master programs from Study.eu.
Pages are server-rendered HTML accessible without JS execution.

Source: https://www.study.eu
"""

import logging
import re
import time
from typing import Optional

import httpx
from bs4 import BeautifulSoup

from base_program import BaseProgramCrawler, RawProgram

logger = logging.getLogger("study_eu")

BASE_URL = "https://www.study.eu"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}

# (url_path, our_level)
LEVEL_URLS = [
    ("/master?lang=en",   "master"),
    ("/bachelor?lang=en", "bachelor"),
]

COUNTRY_FLAGS = {
    "Germany": "DE", "Netherlands": "NL", "France": "FR", "Sweden": "SE",
    "Belgium": "BE", "Spain": "ES", "Italy": "IT", "Poland": "PL",
    "Denmark": "DK", "Finland": "FI", "Austria": "AT", "Norway": "NO",
    "Switzerland": "CH", "Czech Republic": "CZ", "Portugal": "PT",
    "Hungary": "HU", "Estonia": "EE", "Latvia": "LV", "Lithuania": "LT",
    "Slovakia": "SK", "Slovenia": "SI", "Romania": "RO", "Bulgaria": "BG",
    "Croatia": "HR", "Greece": "GR", "Ireland": "IE",
}

FIELD_CATEGORY = {
    "computer": "cs_ai", "software": "cs_ai", "data": "cs_ai",
    "information technology": "cs_ai", "artificial intelligence": "cs_ai",
    "machine learning": "cs_ai", "cybersecurity": "cs_ai",
    "electrical": "engineering", "mechanical": "engineering",
    "civil": "engineering", "chemical": "engineering",
    "energy": "engineering", "aerospace": "engineering",
    "environmental engineering": "engineering", "biomedical engineering": "engineering",
    "finance": "business", "economics": "business", "management": "business",
    "business administration": "business", "mba": "business", "accounting": "business",
    "physics": "science", "chemistry": "science", "biology": "science",
    "mathematics": "science", "statistics": "science", "neuroscience": "science",
    "medicine": "health", "pharmacy": "health", "public health": "health",
    "architecture": "arts", "design": "arts", "urban planning": "arts",
    "law": "social", "political": "social", "international relations": "social",
    "psychology": "social", "sociology": "social",
    "language": "languages", "linguistics": "languages", "translation": "languages",
}


def infer_category(name: str) -> str:
    n = name.lower()
    for kw, cat in FIELD_CATEGORY.items():
        if kw in n:
            return cat
    return "cs_ai"


def parse_tuition(text: str) -> Optional[float]:
    """Extract annual tuition in USD from a text like '€8,000/year' or 'free'."""
    if not text:
        return None
    text_lower = text.lower()
    if "free" in text_lower or "no tuition" in text_lower or "€0" in text_lower:
        return None  # None = free in our schema

    # Match numbers like €8,000 or €8.000
    match = re.search(r"[€$£]?\s*([\d.,]+)", text)
    if match:
        try:
            amount = float(match.group(1).replace(",", "").replace(".", ""))
            # Convert from EUR to USD if EUR symbol present
            if "€" in text:
                amount = round(amount * 1.09)
            return amount if amount > 100 else None
        except ValueError:
            pass
    return None


def parse_duration(text: str) -> float:
    """Extract duration in years from text like '2 years' or '18 months'."""
    if not text:
        return 2.0
    match_yr = re.search(r"(\d+(?:\.\d+)?)\s*year", text, re.I)
    if match_yr:
        return float(match_yr.group(1))
    match_mo = re.search(r"(\d+)\s*month", text, re.I)
    if match_mo:
        return round(int(match_mo.group(1)) / 12, 1)
    return 2.0


def parse_card(card, level: str) -> Optional[RawProgram]:
    """Parse a single program card from Study.eu HTML."""
    # Program name
    name_el = card.find(["h2", "h3", "h4", "a", ".programme-name", ".title"])
    name = name_el.get_text(strip=True) if name_el else ""
    if not name or len(name) < 4:
        return None

    # University
    uni_el = card.find(class_=re.compile(r"university|school|institution", re.I))
    if not uni_el:
        uni_el = card.find(["h5", "p", "span"], string=re.compile(r"University|College|School|Institute", re.I))
    university = uni_el.get_text(strip=True) if uni_el else "European University"

    # Country
    country = "Europe"
    for known_country in COUNTRY_FLAGS:
        card_text = card.get_text()
        if known_country in card_text:
            country = known_country
            break

    # City
    city_el = card.find(class_=re.compile(r"city|location", re.I))
    city = city_el.get_text(strip=True) if city_el else country

    # Link
    link = card.find("a", href=True)
    url = BASE_URL + link["href"] if link and link["href"].startswith("/") else (link["href"] if link else BASE_URL)

    # Tuition
    tuition_el = card.find(class_=re.compile(r"tuition|fee|cost", re.I))
    tuition_text = tuition_el.get_text(strip=True) if tuition_el else ""
    tuition = parse_tuition(tuition_text)

    # Duration
    dur_el = card.find(class_=re.compile(r"duration|length", re.I))
    dur_text = dur_el.get_text(strip=True) if dur_el else ""
    duration = parse_duration(dur_text)

    # Language indicator
    lang_el = card.find(class_=re.compile(r"language|lang", re.I))
    lang_text = lang_el.get_text(strip=True) if lang_el else "English"
    language = "English" if "english" in lang_text.lower() else lang_text

    category = infer_category(name)
    fields = [w.strip() for w in re.split(r"[,/&]", name) if len(w.strip()) > 3][:3]

    return RawProgram(
        program_name=name,
        university=university,
        country=country,
        city=city,
        level=level,
        source_name="study_eu",
        source_url=url,
        apply_url=url,
        category=category,
        field_of_study=fields if fields else [name],
        duration_years=duration,
        tuition_usd_year=tuition,
        language=language,
        ielts_min=6.0,
        gre_required=False,
        gpa_min=None,
        gpa_scale=4.0,
        intake="Annual",
        deadline=None,
        scholarship_available=False,
        description=(
            f"English-taught {level} program at {university}, {country}. "
            "Source: Study.eu European Programs Database."
        ),
        requirements=[
            "Relevant bachelor's degree (for master) or secondary school diploma (for bachelor)",
            "English language proficiency",
            "Academic transcripts",
        ],
        qs_ranking=None,
    )


class StudyEuCrawler(BaseProgramCrawler):
    SOURCE_NAME = "study_eu"
    CRAWL_DELAY = 0.3

    MAX_PAGES = 30   # cap to avoid excessive requests

    def fetch(self) -> list[RawProgram]:
        results: list[RawProgram] = []
        for path, level in LEVEL_URLS:
            programs = self._fetch_level(path, level)
            self.logger.info(f"  Study.eu {level}: {len(programs)} programs")
            results.extend(programs)
            time.sleep(1)
        return results

    def _fetch_level(self, path: str, level: str) -> list[RawProgram]:
        programs: list[RawProgram] = []
        seen_names: set[str] = set()

        for page in range(1, self.MAX_PAGES + 1):
            url = f"{BASE_URL}{path}&page={page}"
            try:
                resp = httpx.get(url, headers=HEADERS, timeout=20, follow_redirects=True)
                if resp.status_code != 200:
                    break
                html = resp.text
            except Exception as e:
                self.logger.warning(f"Study.eu page {page} failed: {e}")
                break

            soup = BeautifulSoup(html, "html.parser")

            # Try multiple card selectors Study.eu might use
            cards = (
                soup.select(".programme") or
                soup.select(".program-card") or
                soup.select("article") or
                soup.select(".search-result") or
                soup.select(".result-item") or
                soup.select("li.programme")
            )

            if not cards:
                # No recognisable cards — site structure may have changed
                self.logger.warning(f"No cards found on Study.eu page {page}, stopping")
                break

            page_programs = 0
            for card in cards:
                prog = parse_card(card, level)
                if prog and prog.program_name not in seen_names:
                    seen_names.add(prog.program_name)
                    programs.append(prog)
                    page_programs += 1

            if page_programs == 0:
                break  # reached end of results

            time.sleep(0.8)

        return programs


if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s [%(name)s] %(levelname)s — %(message)s")
    crawler = StudyEuCrawler()
    items = crawler.fetch()
    print(f"Fetched {len(items)} programs from Study.eu")
    for p in items[:5]:
        print(f"  {p.university} — {p.program_name} | {p.country} ({p.level})")
    if "--save" in sys.argv:
        new, updated = crawler.run()
        print(f"Saved: {new} new, {updated} updated")
