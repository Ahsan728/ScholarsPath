"""
BachelorsPortal.com Crawler (Sitemap → Detail Pages)
=====================================================
Same strategy as MastersPortalCrawler:
  1. Walk sitemap to collect /studies/ URLs
  2. Fetch each detail page with httpx (server-rendered JSON-LD)
  3. Extract structured data

Source: https://www.bachelorsportal.com
"""

import gzip
import json
import logging
import re
import time
import xml.etree.ElementTree as ET
from typing import Optional

import httpx

from base_program import BaseProgramCrawler, RawProgram

logger = logging.getLogger("bachelors_portal")

BASE_URL = "https://www.bachelorsportal.com"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

SITEMAP_CANDIDATES = [
    f"{BASE_URL}/sitemap.xml",
    f"{BASE_URL}/sitemap_index.xml",
    f"{BASE_URL}/sitemaps/sitemap.xml",
    f"{BASE_URL}/sitemaps/programmes.xml",
]

NS = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}

FIELD_CATEGORY = {
    "computer": "cs_ai", "software": "cs_ai", "data": "cs_ai",
    "artificial": "cs_ai", "cybersecurity": "cs_ai", "information": "cs_ai",
    "electrical": "engineering", "mechanical": "engineering",
    "civil": "engineering", "chemical": "engineering", "energy": "engineering",
    "finance": "business", "economics": "business", "management": "business",
    "business": "business",
    "physics": "science", "chemistry": "science", "biology": "science",
    "mathematics": "science",
    "medicine": "health", "health": "health", "pharmacy": "health",
    "architecture": "arts", "design": "arts",
    "law": "social", "political": "social", "psychology": "social",
    "language": "languages", "linguistics": "languages",
}

KNOWN_COUNTRIES = [
    "Netherlands", "Germany", "France", "United Kingdom", "Sweden",
    "Belgium", "Spain", "Italy", "Denmark", "Finland", "Austria",
    "Norway", "Switzerland", "Portugal", "Czech Republic", "Poland",
    "Ireland", "Greece", "Hungary", "Romania",
    "USA", "Canada", "Australia", "New Zealand", "Japan", "Singapore",
]


def infer_category(name: str) -> str:
    n = name.lower()
    for kw, cat in FIELD_CATEGORY.items():
        if kw in n:
            return cat
    return "cs_ai"


def extract_country(text: str) -> str:
    for c in KNOWN_COUNTRIES:
        if c.lower() in text.lower():
            return c
    return "Europe"


def parse_duration(text: str) -> float:
    if not text:
        return 3.0
    m = re.search(r"(\d+(?:\.\d+)?)\s*year", str(text), re.I)
    if m:
        return float(m.group(1))
    m = re.search(r"(\d+)\s*month", str(text), re.I)
    if m:
        return round(int(m.group(1)) / 12, 1)
    return 3.0


def parse_tuition(text: str) -> Optional[float]:
    if not text:
        return None
    s = str(text).lower()
    if any(w in s for w in ["free", "no tuition", "0 eur", "€0", "statutory"]):
        return None
    m = re.search(r"[€$£]?\s*([\d,\.]+)", s)
    if m:
        try:
            amount = float(m.group(1).replace(",", "").replace(".", ""))
            if "€" in s or "eur" in s:
                amount = round(amount * 1.09)
            return amount if amount > 100 else None
        except ValueError:
            pass
    return None


def fetch_xml(client: httpx.Client, url: str) -> Optional[ET.Element]:
    try:
        resp = client.get(url, timeout=20, follow_redirects=True)
        if resp.status_code != 200:
            return None
        content = resp.content
        if url.endswith(".gz") or "gzip" in resp.headers.get("content-type", ""):
            content = gzip.decompress(content)
        return ET.fromstring(content)
    except Exception as e:
        logger.debug(f"XML fetch failed {url}: {e}")
        return None


def collect_programme_urls(client: httpx.Client, max_urls: int = 2000) -> list[str]:
    programme_urls: list[str] = []

    for sitemap_url in SITEMAP_CANDIDATES:
        root = fetch_xml(client, sitemap_url)
        if root is None:
            continue

        sub_sitemaps = root.findall(".//sm:sitemap/sm:loc", NS)
        if sub_sitemaps:
            for loc_el in sub_sitemaps:
                sub_url = (loc_el.text or "").strip()
                if not sub_url:
                    continue
                if any(kw in sub_url for kw in ["studie", "programme", "course", "bachelor"]):
                    sub_root = fetch_xml(client, sub_url)
                    if sub_root is None:
                        continue
                    for url_el in sub_root.findall(".//sm:url/sm:loc", NS):
                        href = (url_el.text or "").strip()
                        if re.search(r"/studies/\d+/", href):
                            programme_urls.append(href)
                            if len(programme_urls) >= max_urls:
                                return programme_urls
                time.sleep(0.3)
        else:
            for url_el in root.findall(".//sm:url/sm:loc", NS):
                href = (url_el.text or "").strip()
                if re.search(r"/studies/\d+/", href):
                    programme_urls.append(href)
                    if len(programme_urls) >= max_urls:
                        return programme_urls

        if programme_urls:
            logger.info(f"  Sitemap {sitemap_url}: {len(programme_urls)} programme URLs")
            return programme_urls

    return programme_urls


def parse_detail_page(html: str, url: str) -> Optional[RawProgram]:
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")

    # JSON-LD first
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
            entries = data if isinstance(data, list) else [data]
            for entry in entries:
                t = entry.get("@type", "")
                if t not in ("EducationalOccupationalProgram", "Course", "Event"):
                    continue
                name = (entry.get("name") or "").strip()
                if not name or len(name) < 5:
                    continue

                provider = entry.get("provider") or entry.get("organizer") or {}
                university = ""
                country = ""
                city = ""
                if isinstance(provider, dict):
                    university = provider.get("name", "")
                    addr = provider.get("address") or {}
                    country = addr.get("addressCountry", "") or extract_country(html[:5000])
                    city = addr.get("addressLocality", country)

                if not university:
                    university = "European University"
                if not country:
                    country = extract_country(html[:5000]) or "Europe"
                if not city:
                    city = country

                duration_raw = entry.get("timeToComplete") or entry.get("duration") or ""
                desc = entry.get("description") or f"Bachelor's program at {university}, {country}."

                offers = entry.get("offers") or {}
                tuition = None
                if isinstance(offers, dict):
                    tuition = parse_tuition(str(offers.get("price", "")))
                elif isinstance(offers, list) and offers:
                    tuition = parse_tuition(str(offers[0].get("price", "")))

                category = infer_category(name)
                fields = [w.strip() for w in re.split(r"[,/&—–]", name) if len(w.strip()) > 3][:3]

                return RawProgram(
                    program_name=name,
                    university=university,
                    country=country,
                    city=city,
                    level="bachelor",
                    source_name="bachelors_portal",
                    source_url=url,
                    apply_url=url,
                    category=category,
                    field_of_study=fields if fields else [name[:50]],
                    duration_years=parse_duration(str(duration_raw)),
                    tuition_usd_year=tuition,
                    language="English",
                    ielts_min=5.5,
                    gre_required=False,
                    gpa_min=None,
                    gpa_scale=4.0,
                    intake="Annual",
                    deadline=None,
                    scholarship_available=False,
                    description=str(desc)[:500],
                    requirements=[
                        "Secondary school diploma / A-levels or equivalent",
                        "English language proficiency (IELTS 5.5+)",
                        "Academic transcripts",
                    ],
                    qs_ranking=None,
                )
        except Exception:
            continue

    # Meta fallback
    og_title = soup.find("meta", property="og:title")
    h1 = soup.find("h1")
    raw_name = (
        (og_title.get("content") if og_title else None) or
        (h1.get_text(strip=True) if h1 else None) or ""
    )
    name = re.sub(r"\s*[-|]\s*BachelorsPortal.*$", "", raw_name, flags=re.I).strip()
    if not name or len(name) < 5:
        return None

    og_desc = soup.find("meta", property="og:description")
    desc = og_desc.get("content", "") if og_desc else ""
    uni_el = soup.find(class_=re.compile(r"university|institution|school|provider", re.I))
    university = uni_el.get_text(strip=True) if uni_el else "European University"
    country = extract_country(soup.get_text()[:4000]) or "Europe"
    category = infer_category(name)
    fields = [w.strip() for w in re.split(r"[,/&—–]", name) if len(w.strip()) > 3][:3]

    return RawProgram(
        program_name=name,
        university=university,
        country=country,
        city=country,
        level="bachelor",
        source_name="bachelors_portal",
        source_url=url,
        apply_url=url,
        category=category,
        field_of_study=fields if fields else [name[:50]],
        duration_years=3.0,
        tuition_usd_year=None,
        language="English",
        ielts_min=5.5,
        gre_required=False,
        gpa_min=None,
        gpa_scale=4.0,
        intake="Annual",
        deadline=None,
        scholarship_available=False,
        description=desc[:500] if desc else f"Bachelor's program at {university}, {country}.",
        requirements=[
            "Secondary school diploma or equivalent",
            "English language proficiency (IELTS 5.5+)",
        ],
        qs_ranking=None,
    )


class BachelorsPortalCrawler(BaseProgramCrawler):
    SOURCE_NAME = "bachelors_portal"
    CRAWL_DELAY = 0.4
    MAX_PROGRAMMES = 2000

    def fetch(self) -> list[RawProgram]:
        programs: list[RawProgram] = []
        seen: set[str] = set()

        with httpx.Client(headers=HEADERS, follow_redirects=True) as client:
            self.logger.info("Collecting programme URLs from sitemap...")
            urls = collect_programme_urls(client, max_urls=self.MAX_PROGRAMMES)

            if not urls:
                self.logger.warning(
                    "No programme URLs found in sitemap. "
                    "BachelorsPortal may have changed their sitemap structure."
                )
                return []

            self.logger.info(f"Found {len(urls)} programme URLs — scraping detail pages...")

            for i, url in enumerate(urls, 1):
                try:
                    resp = client.get(url, timeout=20)
                    if resp.status_code != 200:
                        continue
                    prog = parse_detail_page(resp.text, url)
                    if prog and prog.program_name not in seen:
                        seen.add(prog.program_name)
                        programs.append(prog)
                except Exception as e:
                    self.logger.debug(f"Failed {url}: {e}")

                if i % 100 == 0:
                    self.logger.info(f"  Scraped {i}/{len(urls)}, got {len(programs)} so far")

                time.sleep(self.CRAWL_DELAY)

        self.logger.info(f"BachelorsPortal total: {len(programs)} programs")
        return programs


if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s [%(name)s] %(levelname)s — %(message)s")
    crawler = BachelorsPortalCrawler()
    items = crawler.fetch()
    print(f"Fetched {len(items)} programs from BachelorsPortal.com")
    for p in items[:5]:
        print(f"  {p.university} — {p.program_name} | {p.country}")
    if "--save" in sys.argv:
        new, updated = crawler.run()
        print(f"Saved: {new} new, {updated} updated")
