"""
Erasmus Mundus Joint Masters Crawler
=====================================
Fetches fully-funded EU Joint Master programmes from the EACEA catalogue.
All EMJM programmes carry a scholarship of ~€1,400/month for non-EU students.

Source: https://eacea.ec.europa.eu/scholarships/emjm-catalogue
"""

import logging
import re
from typing import Optional

import httpx
from bs4 import BeautifulSoup

from base_program import BaseProgramCrawler, RawProgram

logger = logging.getLogger("erasmus_mundus")

CATALOGUE_URL = "https://eacea.ec.europa.eu/scholarships/emjm-catalogue"

# Fallback: newer URL used since 2023
CATALOGUE_URL_ALT = (
    "https://erasmus-plus.ec.europa.eu/opportunities/individuals/students"
    "/erasmus-mundus-joint-masters"
)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}

FIELD_CATEGORY = {
    "computer": "cs_ai", "software": "cs_ai", "data": "cs_ai",
    "artificial": "cs_ai", "machine": "cs_ai", "information": "cs_ai",
    "electrical": "engineering", "mechanical": "engineering", "civil": "engineering",
    "chemical": "engineering", "energy": "engineering", "material": "engineering",
    "environmental engineering": "engineering", "aerospace": "engineering",
    "finance": "business", "economics": "business", "management": "business",
    "business": "business", "mba": "business",
    "physics": "science", "chemistry": "science", "biology": "science",
    "mathematics": "science", "neuroscience": "science", "ecology": "science",
    "medicine": "health", "public health": "health",
    "architecture": "arts", "design": "arts", "urban": "arts",
    "political": "social", "law": "social", "psychology": "social",
}


def infer_category(name: str) -> str:
    n = name.lower()
    for kw, cat in FIELD_CATEGORY.items():
        if kw in n:
            return cat
    return "cs_ai"


def parse_countries_from_text(text: str) -> list[str]:
    """Extract participating countries from consortium text."""
    known = [
        "Germany", "France", "Italy", "Spain", "Netherlands", "Belgium",
        "Sweden", "Poland", "Portugal", "Austria", "Denmark", "Finland",
        "Norway", "Czech Republic", "Hungary", "Greece", "Romania",
        "United Kingdom", "UK", "Ireland", "Switzerland",
    ]
    found = [c for c in known if c in text]
    return found[:3] if found else ["Europe"]


class ErasmusMundusCrawler(BaseProgramCrawler):
    SOURCE_NAME = "erasmus_mundus"
    CRAWL_DELAY = 0.3

    def fetch(self) -> list[RawProgram]:
        html = self._get_catalogue()
        if not html:
            self.logger.error("Could not fetch Erasmus Mundus catalogue")
            return []

        programs = self._parse_catalogue(html)
        self.logger.info(f"Erasmus Mundus: parsed {len(programs)} programmes")
        return programs

    def _get_catalogue(self) -> Optional[str]:
        for url in (CATALOGUE_URL, CATALOGUE_URL_ALT):
            try:
                resp = httpx.get(url, headers=HEADERS, timeout=30, follow_redirects=True)
                if resp.status_code == 200 and len(resp.text) > 5000:
                    return resp.text
            except Exception as e:
                self.logger.warning(f"Fetch failed for {url}: {e}")
        return None

    def _parse_catalogue(self, html: str) -> list[RawProgram]:
        soup = BeautifulSoup(html, "html.parser")
        programs: list[RawProgram] = []

        # Strategy 1: look for structured programme cards/rows
        # EACEA renders a table or card list — try multiple selectors
        rows = (
            soup.select("tr.views-row") or
            soup.select(".views-row") or
            soup.select("article.programme") or
            soup.select(".programme-item") or
            soup.select("table tbody tr")
        )

        if rows:
            for row in rows:
                prog = self._parse_row(row)
                if prog:
                    programs.append(prog)
        else:
            # Strategy 2: extract all links that look like programme names
            programs = self._extract_from_links(soup)

        return programs

    def _parse_row(self, row) -> Optional[RawProgram]:
        text = row.get_text(separator=" ", strip=True)
        if len(text) < 10:
            return None

        # Try to find programme name — usually the first bold/heading element
        name_el = row.find(["h2", "h3", "h4", "strong", "td", "a"])
        name = name_el.get_text(strip=True) if name_el else text[:100]

        if not name or len(name) < 5:
            return None

        link = row.find("a")
        url = link["href"] if link and link.get("href") else CATALOGUE_URL

        # Consortium text for countries
        countries = parse_countries_from_text(text)
        lead_country = countries[0] if countries else "Europe"

        return self._make_program(name, url, text, lead_country)

    def _extract_from_links(self, soup: BeautifulSoup) -> list[RawProgram]:
        """Fallback: extract programme names from all relevant links."""
        programs: list[RawProgram] = []
        seen: set[str] = set()

        for a in soup.find_all("a", href=True):
            href = a["href"]
            name = a.get_text(strip=True)
            # Filter: link text that looks like a programme name (8–120 chars, not nav)
            if (8 < len(name) < 120 and
                    name not in seen and
                    any(kw in name.lower() for kw in
                        ["master", "m.sc", "msc", "science", "engineering",
                         "management", "studies", "technology", "erasmus"])):
                seen.add(name)
                # Try to find surrounding country context
                parent_text = ""
                parent = a.parent
                if parent:
                    parent_text = parent.get_text(separator=" ", strip=True)
                countries = parse_countries_from_text(parent_text)
                lead_country = countries[0] if countries else "Europe"
                prog = self._make_program(name, href, parent_text, lead_country)
                if prog:
                    programs.append(prog)

        return programs[:200]  # cap at 200 to avoid noise

    def _make_program(
        self, name: str, url: str, context: str, lead_country: str
    ) -> Optional[RawProgram]:
        name = name.strip()
        if not name or len(name) < 5:
            return None

        # Normalise URL
        if url.startswith("/"):
            url = "https://eacea.ec.europa.eu" + url
        if not url.startswith("http"):
            url = CATALOGUE_URL

        category = infer_category(name)
        fields = [w.strip() for w in re.split(r"[,/&]", name) if len(w.strip()) > 3][:3]

        return RawProgram(
            program_name=name,
            university="Erasmus Mundus Consortium",
            country=lead_country,
            city="Multiple EU cities",
            level="master",
            source_name="erasmus_mundus",
            source_url=url,
            apply_url=url,
            category=category,
            field_of_study=fields if fields else [name],
            duration_years=2.0,
            tuition_usd_year=0,            # fully funded
            language="English",
            ielts_min=6.5,
            gre_required=False,
            gpa_min=None,
            gpa_scale=4.0,
            intake="Annual (September/October)",
            deadline=None,
            scholarship_available=True,    # all EMJM come with scholarship
            description=(
                f"Erasmus Mundus Joint Master: {name}. "
                "Fully funded by the EU — includes tuition waiver plus €1,400/month "
                "living allowance for non-EU students. Taught across multiple "
                "European universities."
            ),
            requirements=[
                "Bachelor's degree (min. 3 years)",
                "IELTS 6.5 or TOEFL 90 (or equivalent)",
                "Motivation letter",
                "2 academic references",
                "CV / résumé",
            ],
            qs_ranking=None,
        )


if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s [%(name)s] %(levelname)s — %(message)s")
    crawler = ErasmusMundusCrawler()
    items = crawler.fetch()
    print(f"Fetched {len(items)} Erasmus Mundus programmes")
    for p in items[:5]:
        print(f"  {p.program_name} | {p.country}")
    if "--save" in sys.argv:
        new, updated = crawler.run()
        print(f"Saved: {new} new, {updated} updated")
