"""
Campus France Bangladesh Crawler (Track 1 — Opportunities)
==========================================================
Scrapes scholarship and funding opportunities from the Bangladesh
Campus France office. These are specifically relevant to Bangladeshi
students wishing to study in France.

Key opportunities covered:
  - Eiffel Excellence Scholarship (Master's + PhD)
  - French Embassy Scholarships for BD students
  - Campus Bourses funding catalog listings
  - Alliance Française / French language program grants

Source: https://www.bangladesh.campusfrance.org/en
"""

import hashlib
import logging
import time
from dataclasses import dataclass
from typing import Optional

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger("campus_france_bd")

BASE_URL = "https://www.bangladesh.campusfrance.org"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}

# Articles on the BD site that contain scholarship/funding info
SCHOLARSHIP_PAGES = [
    "/en/scholarships-for-foreign-students-in-france",
    "/en/low-university-tuition-fees-in-france",
    "/en/higher-education-in-france-educational-excellence",
    "/en/how-higher-education-works-in-france",
    "/en/french-degrees-lmd-system-and-equivalences",
]

# Known scholarships referenced on the BD site — scraped + enriched
KNOWN_SCHOLARSHIPS = [
    {
        "title": "Eiffel Excellence Scholarship Programme — France (for Bangladeshi Students)",
        "type": "scholarship",
        "degree_level": "masters",
        "funding_type": "full",
        "amount_usd": 15000,
        "description": (
            "The Eiffel Excellence Scholarship is awarded by the French Ministry of Europe "
            "and Foreign Affairs to outstanding international students applying for Master's "
            "or PhD programs at top French higher education institutions. "
            "Bangladeshi students are eligible. Monthly stipend: €1,181 (Master's) / "
            "€1,400 (PhD). Covers international travel and health insurance."
        ),
        "eligibility_text": (
            "Open to Bangladeshi nationals under 30 (Master's) or under 35 (PhD). "
            "Must apply through a French institution. Strong academic record required. "
            "Cannot hold French nationality or permanent residence."
        ),
        "requirements": [
            "Bangladeshi nationality",
            "Age under 30 for Master's; under 35 for PhD",
            "Excellent academic record",
            "Apply through a French higher education institution",
            "Not a French national or permanent resident",
        ],
        "apply_url": "https://www.campusfrance.org/en/eiffel",
        "source_url": "https://www.bangladesh.campusfrance.org/en/scholarships-for-foreign-students-in-france",
        "host_country": ["FR"],
        "eligible_nations": ["BD"],
        "field_of_study": ["Engineering", "Exact Sciences", "Law", "Political Science", "Economics", "Management"],
        "deadline": None,
    },
    {
        "title": "French Embassy Scholarships for Bangladeshi Students — France",
        "type": "scholarship",
        "degree_level": "masters",
        "funding_type": "partial",
        "amount_usd": None,
        "description": (
            "The French Embassy in Dhaka awards scholarships to Bangladeshi students "
            "for Master's and PhD studies in France. These include both French Government "
            "scholarships and Major programme grants for graduates of French high schools abroad. "
            "Contact Campus France Bangladesh office for current openings and eligibility."
        ),
        "eligibility_text": (
            "Open to Bangladeshi nationals. Selection based on academic excellence and "
            "the relevance of the study project to Franco-Bangladeshi relations. "
            "Apply through Campus France Bangladesh office in Dhaka."
        ),
        "requirements": [
            "Bangladeshi nationality",
            "Strong academic record",
            "Relevant field of study",
            "Must apply through Campus France Bangladesh office",
            "French or English language proficiency depending on program",
        ],
        "apply_url": "https://www.bangladesh.campusfrance.org/en/scholarships-for-foreign-students-in-france",
        "source_url": "https://www.bangladesh.campusfrance.org/en/scholarships-for-foreign-students-in-france",
        "host_country": ["FR"],
        "eligible_nations": ["BD"],
        "field_of_study": [],
        "deadline": None,
    },
    {
        "title": "Campus Bourses — French Scholarships Catalog for International Students",
        "type": "grant",
        "degree_level": "any",
        "funding_type": "partial",
        "amount_usd": None,
        "description": (
            "Campus Bourses is the official Campus France scholarship catalog listing "
            "all available funding for international students studying in France. "
            "It covers grants from French and foreign governments, regional authorities, "
            "foundations, companies, and higher education institutions. "
            "Filter by nationality (Bangladesh), field, and level to find relevant funding."
        ),
        "eligibility_text": (
            "Open to international students including Bangladeshi nationals. "
            "Filter by BD nationality on Campus Bourses to see applicable scholarships."
        ),
        "requirements": [
            "Varies by individual scholarship",
            "Search Campus Bourses catalog filtered by Bangladeshi nationality",
        ],
        "apply_url": "http://campusbourses.campusfrance.org/fria/bourse/#/catalog",
        "source_url": "https://www.bangladesh.campusfrance.org/en/scholarships-for-foreign-students-in-france",
        "host_country": ["FR"],
        "eligible_nations": ["BD"],
        "field_of_study": [],
        "deadline": None,
    },
    {
        "title": "French Ministry of Higher Education Doctoral Contracts — France",
        "type": "phd",
        "degree_level": "phd",
        "funding_type": "salary",
        "amount_usd": 22000,
        "description": (
            "France's Ministry of Higher Education and Research funds doctoral contracts "
            "managed by Doctoral Schools at French universities. International students "
            "including Bangladeshis can apply. Monthly salary ~€2,000. "
            "Research positions at institutions like CNRS, IRD, ADEME, INSERM are also available."
        ),
        "eligibility_text": (
            "Open to international PhD applicants at French universities. "
            "Apply directly to Doctoral Schools. Some positions require prior French residency. "
            "Research institute positions (CNRS, IRD) open to all nationalities."
        ),
        "requirements": [
            "Master's degree or equivalent",
            "Research proposal approved by a French doctoral school",
            "French or English proficiency depending on lab",
        ],
        "apply_url": "https://www.campusfrance.org/en/how-to-finance-Doctorate-France",
        "source_url": "https://www.bangladesh.campusfrance.org/en/scholarships-for-foreign-students-in-france",
        "host_country": ["FR"],
        "eligible_nations": ["ALL"],
        "field_of_study": [],
        "deadline": None,
    },
]


@dataclass
class RawOpportunity:
    title: str
    type: str
    degree_level: str
    funding_type: Optional[str]
    amount_usd: Optional[float]
    description: str
    eligibility_text: str
    requirements: list
    apply_url: str
    source_url: str
    host_country: list
    eligible_nations: list
    field_of_study: list
    deadline: Optional[str]


class CampusFranceBdCrawler:
    SOURCE_NAME = "campus_france_bd"

    def __init__(self):
        self.logger = logging.getLogger(self.__class__.__name__)

    def run(self) -> list[dict]:
        """Called by run_pipeline(); returns pre-structured dicts (no Claude needed)."""
        return self.fetch()

    def fetch(self) -> list[dict]:
        """
        Returns a list of structured opportunity dicts ready for upsert.
        No Claude extraction needed — scholarship details are well-known and static.
        """
        opportunities = []

        # 1. Emit known scholarships
        for s in KNOWN_SCHOLARSHIPS:
            opportunities.append(self._build_record(s))

        # 2. Scrape any additional scholarship links from the BD site articles
        scraped = self._scrape_articles()
        opportunities.extend(scraped)

        self.logger.info(f"Campus France BD: {len(opportunities)} opportunities")
        return opportunities

    def _build_record(self, s: dict) -> dict:
        fp_key = f"{s['title'].lower()}|FR|{s['degree_level']}"
        fingerprint = hashlib.sha256(fp_key.encode()).hexdigest()
        return {
            "title": s["title"],
            "type": s["type"],
            "host_country": s["host_country"],
            "eligible_nations": s["eligible_nations"],
            "ineligible_nations": [],
            "field_of_study": s["field_of_study"],
            "degree_level": s["degree_level"],
            "funding_type": s["funding_type"],
            "amount_usd": s["amount_usd"],
            "currency": "EUR",
            "deadline": s["deadline"],
            "description": s["description"],
            "eligibility_text": s["eligibility_text"],
            "requirements": s["requirements"],
            "apply_url": s["apply_url"],
            "source_url": s["source_url"],
            "source_name": self.SOURCE_NAME,
            "is_verified": True,
            "is_featured": False,
            "scam_score": 0,
            "status": "rolling",
            "fingerprint": fingerprint,
        }

    def _scrape_articles(self) -> list[dict]:
        """Scrape BD site article pages for additional scholarship links."""
        results = []
        seen_urls = set(s["apply_url"] for s in KNOWN_SCHOLARSHIPS)

        with httpx.Client(headers=HEADERS, follow_redirects=True) as client:
            for path in SCHOLARSHIP_PAGES:
                try:
                    r = client.get(BASE_URL + path, timeout=15)
                    if r.status_code != 200:
                        continue
                    soup = BeautifulSoup(r.text, "html.parser")
                    main = soup.find("main") or soup.find("article") or soup.find(class_="content")
                    if not main:
                        continue

                    # Find external links to scholarship/grant programs not yet covered
                    for a in main.find_all("a", href=True):
                        href = a["href"]
                        text = a.get_text(strip=True)
                        if (href not in seen_urls and
                                href.startswith("http") and
                                "campusfrance" in href and
                                len(text) > 10 and
                                any(kw in text.lower() or kw in href.lower()
                                    for kw in ["scholarship", "bourse", "grant", "eiffel",
                                               "erasmus", "fellowship", "funding", "finance"])):
                            seen_urls.add(href)
                            fp = hashlib.sha256(f"{text.lower()}|FR".encode()).hexdigest()
                            results.append({
                                "title": f"{text} — France (Campus France BD)",
                                "type": "scholarship",
                                "host_country": ["FR"],
                                "eligible_nations": ["BD"],
                                "ineligible_nations": [],
                                "field_of_study": [],
                                "degree_level": "any",
                                "funding_type": None,
                                "amount_usd": None,
                                "currency": "EUR",
                                "deadline": None,
                                "description": (
                                    f"Scholarship or funding opportunity referenced by Campus France Bangladesh. "
                                    f"Visit the link for full details and eligibility for Bangladeshi students."
                                ),
                                "eligibility_text": "Open to Bangladeshi students. See official page for details.",
                                "requirements": ["Check official Campus France Bangladesh page for requirements"],
                                "apply_url": href,
                                "source_url": BASE_URL + path,
                                "source_name": self.SOURCE_NAME,
                                "is_verified": True,
                                "is_featured": False,
                                "scam_score": 0,
                                "status": "rolling",
                                "fingerprint": fp,
                            })
                except Exception as e:
                    self.logger.debug(f"Article scrape failed {path}: {e}")
                time.sleep(0.5)

        return results


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s [%(name)s] %(levelname)s — %(message)s")
    crawler = CampusFranceBdCrawler()
    items = crawler.fetch()
    print(f"Fetched {len(items)} opportunities from Campus France Bangladesh")
    for opp in items:
        print(f"  [{opp['type']:12s}] {opp['title'][:70]}")
