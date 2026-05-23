#!/usr/bin/env python3
"""
Enrich masters_programs with official university program page URLs.

For each program sourced from mastersportal, searches DuckDuckGo for the
specific program page on the university's own website and writes it to apply_url.

Run:
  cd crawlers
  python enrich_program_urls.py               # all mastersportal programs
  python enrich_program_urls.py --limit 20    # first 20 only (test)
  python enrich_program_urls.py --country Germany
  python enrich_program_urls.py --refill      # re-try programs marked 'not_found'
"""

import argparse
import os
import time
import urllib.parse
from typing import Optional

import httpx
from ddgs import DDGS
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

SB_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SB_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
SB_HEADERS = {
    "apikey": SB_KEY,
    "Authorization": f"Bearer {SB_KEY}",
    "Content-Type": "application/json",
}

# Aggregator / non-university domains to skip
SKIP_DOMAINS = {
    "mastersportal.eu", "mastersportal.com",
    "bachelorsportal.eu", "phdportal.eu",
    "studyportals.com", "hotcourses.com", "findamasters.com",
    "topuniversities.com", "timeshighereducation.com", "qs.com",
    "usnews.com", "niche.com", "educations.com", "mba.com",
    "study.eu", "studyeu.org", "eunicas.eu",
    "beyondthestates.com", "mygermanuniversity.com",
    "mastersavenue.com", "academiccourses.com", "postgraduatesearch.com",
    "mastersscout.com", "findcourse.com", "brive.com", "standyou.com",
    "invest4edu.com", "studylink.com", "gyanberry.com", "grokipedia.com",
    "soboly.com", "studyabroadhungary.com", "studyinnorway.no",
    "studyinternational.com", "masterstudies.co.uk", "masterstudies.com",
    "studyinpoland.pl", "studyabroad.com", "coursera.org", "edx.org",
    "reddit.com", "facebook.com", "linkedin.com", "twitter.com",
    "instagram.com", "youtube.com", "wikipedia.org",
    "researchgate.net", "academia.edu",
}

# URL path keywords that suggest a specific program page (not a homepage)
PROGRAM_KEYWORDS = [
    "programme", "program", "master", "msc", "course",
    "studies", "study", "education", "degree",
    "postgraduate", "graduate", "faculty", "school",
]


def is_official(url: str) -> bool:
    try:
        host = urllib.parse.urlparse(url).netloc.lower().lstrip("www.")
        return not any(skip in host for skip in SKIP_DOMAINS)
    except Exception:
        return False


def looks_like_program_page(url: str) -> bool:
    path = urllib.parse.urlparse(url).path.lower()
    return any(k in path for k in PROGRAM_KEYWORDS)


# ── Supabase helpers ──────────────────────────────────────────────────────────

def get_programs(country: Optional[str], limit: int, refill: bool) -> list[dict]:
    params = {
        "select": "id,university,program_name,country",
        "source_name": "eq.mastersportal",
        "limit": str(limit),
        "order": "id.asc",
        "apply_url": "eq.not_found" if refill else "eq.",
    }
    if country:
        params["country"] = f"eq.{country}"
    r = httpx.get(f"{SB_URL}/rest/v1/masters_programs", headers=SB_HEADERS,
                  params=params, timeout=30)
    r.raise_for_status()
    return r.json()


def update_program(program_id: int, apply_url: str, source_url: str):
    httpx.patch(
        f"{SB_URL}/rest/v1/masters_programs",
        headers=SB_HEADERS,
        params={"id": f"eq.{program_id}"},
        json={"apply_url": apply_url, "source_url": source_url},
        timeout=15,
    ).raise_for_status()


# ── Search ────────────────────────────────────────────────────────────────────

def find_program_url(ddgs: DDGS, university: str, program_name: str, country: str) -> Optional[str]:
    """
    Search DuckDuckGo for the specific program page on the university's website.
    Tries increasingly broad queries until a program-specific URL is found.
    """
    queries = [
        f'"{university}" "{program_name}" master programme',
        f'{university} "{program_name}" MSc programme',
        f'{university} {program_name} master {country}',
    ]

    all_results = []
    for query in queries:
        try:
            results = list(ddgs.text(query, max_results=8))
            urls = [r["href"] for r in results]
            all_results.extend(urls)

            # Prefer URLs that look like specific program pages
            program_urls = [u for u in urls if is_official(u) and looks_like_program_page(u)]
            if program_urls:
                return program_urls[0]

            time.sleep(0.8)
        except Exception as e:
            print(f"    search error: {e}")
            time.sleep(2)

    # Fallback: any official result from any query
    official = [u for u in all_results if is_official(u)]
    return official[0] if official else None


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit",   type=int, default=500)
    parser.add_argument("--country", type=str, default=None)
    parser.add_argument("--refill",  action="store_true",
                        help="Re-try programs previously marked not_found")
    args = parser.parse_args()

    programs = get_programs(args.country, args.limit, args.refill)
    print(f"Enriching {len(programs)} programs...\n")

    found = 0
    not_found = 0

    with DDGS() as ddgs:
        for i, prog in enumerate(programs):
            uni  = prog["university"]
            name = prog["program_name"]
            ctry = prog["country"]
            pid  = prog["id"]

            print(f"[{i+1}/{len(programs)}] {uni} -- {name} ({ctry})")

            url = find_program_url(ddgs, uni, name, ctry)

            if url:
                print(f"  OK {url}")
                update_program(pid, apply_url=url, source_url=url)
                found += 1
            else:
                print(f"  -- not found")
                update_program(pid, apply_url="not_found", source_url="")
                not_found += 1

            # Polite delay between programs
            time.sleep(2)

    print(f"\nDone. Found: {found}  Not found: {not_found}")


if __name__ == "__main__":
    main()
