#!/usr/bin/env python3
"""
Enrich Erasmus Mundus rows with their direct consortium homepage URL.

Most EMJMs have a dedicated consortium domain (e.g. emjm-photonics.eu,
spacemaster.eu) that's the real apply page. We seeded 36 EMJMs but 32 of
them point apply_url back at the EACEA catalogue — useless to a student.

This script DDG-searches each EMJM by name + finds the consortium site
that ISN'T an aggregator and ISN'T eacea/erasmus-plus EU portal.

DDG is rate-limit-sensitive. If DDG is currently blocking us this script
will fail gracefully — try again the next day.

Run:
  cd crawlers
  python enrich_emjm_consortium_urls.py --dry-run
  python enrich_emjm_consortium_urls.py --limit 10   # smoke test
  python enrich_emjm_consortium_urls.py              # all stuck rows
"""

import argparse
import os
import re
import sys
import time
from typing import Optional
from urllib.parse import urlparse

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import httpx
from ddgs import DDGS
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

from crawler_logger import CrawlerRun

SB_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SB_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
SB_HEADERS = {
    "apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}",
    "Content-Type": "application/json", "Prefer": "return=minimal",
}

# Domains we DON'T want as consortium URLs — these are aggregators or
# the EU's own catalogue indexes, never the consortium's own site.
EXCLUDE_DOMAINS = {
    "eacea.ec.europa.eu", "erasmus-plus.ec.europa.eu", "ec.europa.eu",
    "mastersportal.com", "mastersportal.eu", "phdportal.com",
    "studyportals.com", "findamasters.com", "topuniversities.com",
    "shiksha.com", "study.eu", "studyabroad.com", "hotcourses.com",
    "facebook.com", "linkedin.com", "twitter.com", "wikipedia.org",
    "youtube.com", "instagram.com", "reddit.com",
    # SEO aggregators that impersonate Erasmus Mundus consortium pages
    "erasmuscatalogue.com", "erasmusscholarships.com", "scholarshipsgpt.com",
    "scholarshipsads.com", "afterschoolafrica.com", "opportunitydesk.org",
    "scholars4dev.com", "scholarshipdb.net", "scholarshipportal.com",
    "scholarship-positions.com", "findaphd.com", "phdstudies.com",
    "masterstudies.com", "academiccourses.com", "studyqa.com",
    "erudera.com", "ambitio.club", "weuni.com", "idp.com",
    "applyboard.com", "unischolars.com", "stuudy.com",
}

# Hints that a result IS the consortium homepage (good signal)
CONSORTIUM_HINTS = re.compile(
    r"emjm|erasmus.?mundus|joint.?master|consortium|"
    r"(?:welcome|home|about).+(?:programme|program|master)",
    re.IGNORECASE,
)


def is_excluded(url: str) -> bool:
    try:
        host = urlparse(url).hostname or ""
        host = host.lower().lstrip("www.")
        return any(host == d or host.endswith("." + d) for d in EXCLUDE_DOMAINS)
    except Exception:
        return True


def url_alive(url: str) -> bool:
    """Quick HEAD to confirm the URL actually serves something."""
    try:
        r = httpx.head(url, follow_redirects=True, timeout=8,
                       headers={"User-Agent": "Mozilla/5.0 (ScholarAssistBot/1.0)"})
        if r.status_code in (405, 403, 400):
            r = httpx.get(url, follow_redirects=True, timeout=10,
                          headers={"User-Agent": "Mozilla/5.0 (ScholarAssistBot/1.0)"})
        return r.is_success
    except Exception:
        return False


def find_consortium_url(ddgs: DDGS, program: dict) -> Optional[str]:
    """Try a few searches; return the first non-excluded alive URL."""
    name = program["program_name"]
    queries = [
        f'"{name}" consortium application',
        f'"{name}" erasmus mundus apply',
        f"{name} erasmus mundus official site",
    ]
    candidates: list[str] = []
    for q in queries:
        try:
            results = list(ddgs.text(q, max_results=8))
        except Exception as e:
            print(f"    DDG error on '{q[:50]}': {e}", flush=True)
            time.sleep(2)
            continue
        for r in results:
            url = r.get("href") or ""
            if not url.startswith("http"):
                continue
            if is_excluded(url):
                continue
            candidates.append(url)
        # If we already have promising hits, stop early
        good = [c for c in candidates if CONSORTIUM_HINTS.search(c)]
        if good:
            return good[0]
        time.sleep(0.8)
    # Fall back: any non-excluded result
    return candidates[0] if candidates else None


def fetch_stuck_emjms(limit: Optional[int]) -> list[dict]:
    """Pull EMJMs whose apply_url is the catalogue-redirect placeholder."""
    base = f"{SB_URL}/rest/v1/masters_programs"
    params = {
        "select": "id,program_name,apply_url,consortium_universities",
        "program_type": "eq.erasmus_mundus_joint",
        "or": "(apply_url.like.*eacea.ec.europa.eu*,apply_url.like.*erasmus-plus.ec.europa.eu*)",
        "order": "program_name.asc",
        "limit": str(limit or 500),
    }
    r = httpx.get(base, headers={"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"},
                  params=params, timeout=30)
    r.raise_for_status()
    return r.json() or []


def update_program(program_id: str, url: str) -> bool:
    r = httpx.patch(
        f"{SB_URL}/rest/v1/masters_programs?id=eq.{program_id}",
        headers=SB_HEADERS,
        json={"apply_url": url, "source_url": url,
              # Reset validation flags so the next pass re-checks the new URL
              "url_status": None, "url_http_code": None, "url_final_url": None,
              "url_checked_at": None, "url_check_error": None,
              "domain_match_status": None, "domain_match_host": None,
              "domain_match_checked_at": None,
              "page_status": None, "page_checked_at": None},
        timeout=20,
    )
    return r.status_code in (200, 204)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    with CrawlerRun("emjm_consortium_url_finder", params={"dry_run": args.dry_run, "limit": args.limit}) as run:
        programs = fetch_stuck_emjms(args.limit)
        run.set_total(len(programs))
        print(f"Found {len(programs)} EMJMs with placeholder apply_url\n", flush=True)

        found = 0
        not_found = 0
        with DDGS() as ddgs:
            for i, p in enumerate(programs, 1):
                print(f"[{i}/{len(programs)}] {p['program_name'][:70]}", flush=True)
                url = find_consortium_url(ddgs, p)
                if not url:
                    print(f"  -- no consortium URL found", flush=True)
                    run.failed(target_id=p["id"], message="no candidate")
                    not_found += 1
                    continue
                if not url_alive(url):
                    print(f"  -- candidate dead: {url}", flush=True)
                    run.failed(target_id=p["id"], target_url=url, message="candidate URL dead")
                    not_found += 1
                    continue
                print(f"  {'WOULD WRITE' if args.dry_run else 'OK'} {url}", flush=True)
                if not args.dry_run:
                    if update_program(p["id"], url):
                        found += 1
                        run.ok()
                    else:
                        run.failed(target_id=p["id"], message="DB update failed")
                        not_found += 1
                else:
                    found += 1
                    run.skipped()
                time.sleep(1.0)  # polite between programs

        run.summary = {"found": found, "not_found": not_found, "dry_run": args.dry_run}
        print(f"\nDONE: {found} updated, {not_found} not found", flush=True)


if __name__ == "__main__":
    main()
