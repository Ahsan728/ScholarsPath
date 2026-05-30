#!/usr/bin/env python3
"""
Campus France PhD Offers crawler.

Specific PhD positions advertised by French universities / labs, listed
at doctorat.campusfrance.org/phd/offers/search/my/reset. Each offer has:
  - title (research subject)
  - host (university + lab)
  - doctoral school (ED number)
  - field (Informatique / Biologie / etc.)
  - region
  - deadline, duration, funding type, tuition
  - detail URL doctorat.campusfrance.org/CF<id>

Uses the upgraded Cloud Run service with collect_pages=true to walk
through ~10 pages × 10 offers each. ~100 PhD positions per sweep.

Run:
  python crawlers/crawl_campus_france_offers.py --pages 10 --dry-run
  python crawlers/crawl_campus_france_offers.py --pages 10
"""

import argparse
import hashlib
import os
import re
import sys
import time
from datetime import datetime, timezone

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import httpx
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

from crawler_logger import CrawlerRun
from aggregator_hosts import is_aggregator_host
from domain_classifier import classify as classify_domain

SB_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SB_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
SB_H   = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}",
          "Content-Type": "application/json", "Prefer": "return=minimal"}
SB_R   = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"}

BROWSER_URL   = os.environ["BROWSER_FETCH_URL"].rstrip("/")
BROWSER_TOKEN = os.environ["BROWSER_FETCH_TOKEN"]

PAGE_URL = "https://doctorat.campusfrance.org/phd/offers/search/my/reset"
SOURCE   = "campus_france_offers"


def fetch_rendered(pages: int) -> str | None:
    """Walk ~`pages` pages with collect_pages=true, returns concatenated HTML."""
    try:
        r = httpx.post(
            f"{BROWSER_URL}/fetch",
            headers={"Authorization": f"Bearer {BROWSER_TOKEN}",
                     "Content-Type": "application/json"},
            json={
                "url": PAGE_URL,
                "wait_ms": 4000,
                "wait_selector": "tbody tr",
                "wait_selector_ms": 15000,
                "click_selector": "li.pNext a",
                "click_loop_max": pages,
                "click_wait_ms": 2500,
                "collect_pages": True,
                "max_html_chars": 5_000_000,
            },
            timeout=120,
        )
        if r.status_code != 200:
            return None
        data = r.json()
        if data.get("status", 0) >= 400:
            return None
        return data.get("html") or None
    except Exception as e:
        print(f"  browser-fetch error: {e}", flush=True)
        return None


ROW_RX = re.compile(
    r'<tr id="(CF\d+)"[^>]*>(.*?)</tr>',
    re.I | re.DOTALL,
)


def clean(s: str) -> str:
    s = re.sub(r"<[^>]+>", " ", s or "")
    s = (s.replace("&nbsp;", " ").replace("&amp;", "&")
           .replace("&lt;", "<").replace("&gt;", ">")
           .replace("&#039;", "'").replace("&quot;", '"'))
    return re.sub(r"\s+", " ", s).strip()


def parse_row(cf_id: str, body: str) -> dict | None:
    # Title is the first <div class="h3 ..."> with style="color:#..."
    title_m = re.search(
        r'<div class="h3[^"]*"[^>]*style="color:[^"]+"[^>]*>(.*?)</div>',
        body, re.I | re.DOTALL,
    )
    if not title_m:
        return None
    title = clean(title_m.group(1))
    if not title or len(title) < 10:
        return None

    # Each subsequent <div class="marginb5"> holds host, ecole doctorale,
    # then field/region/level meta, then description, then deadline.
    margins = re.findall(r'<div class="marginb5[^"]*"[^>]*>(.*?)</div>', body, re.I | re.DOTALL)
    host = clean(margins[0]) if margins else ""
    ed   = clean(margins[1]) if len(margins) > 1 else ""

    # Field of study + region + level live in the 3rd marginb5
    field_block = clean(margins[2]) if len(margins) > 2 else ""
    description = clean(margins[3]) if len(margins) > 3 else ""

    # Deadline
    deadline_m = re.search(r"Date limite de candidature\s+([\d/]+)", body)
    deadline_str = deadline_m.group(1) if deadline_m else None

    # Funding type
    funding_m = re.search(
        r'title="Offre financée"[^>]*></i>([^<]+)',
        body, re.I,
    )
    funding = clean(funding_m.group(1)) if funding_m else None

    # Tuition
    tuition_m = re.search(
        r'title="Frais de scolarité annuels"[^>]*></i>([^<]+)',
        body, re.I,
    )
    tuition = clean(tuition_m.group(1)) if tuition_m else None

    detail_url = f"https://doctorat.campusfrance.org/{cf_id}"

    return {
        "cf_id":       cf_id,
        "title":       title,
        "host":        host,
        "ecole_doctorale": ed,
        "field_block": field_block,
        "description": description,
        "deadline":    deadline_str,
        "funding":     funding,
        "tuition":     tuition,
        "detail_url":  detail_url,
    }


def insert(row: dict, dry_run: bool) -> bool:
    if is_aggregator_host(row["detail_url"]):
        return False

    content_hash = hashlib.sha256(
        f"{row['cf_id']}|{row['host']}|{row['title']}".encode()
    ).hexdigest()
    field_text = f"{row['field_block']} {row['ecole_doctorale']}".strip()
    category = classify_domain([field_text], row["title"])
    description = (
        f"PhD position ({row['cf_id']}) at {row['host']}. "
        f"Doctoral school: {row['ecole_doctorale']}. "
        f"{row['description'][:600]}"
    )[:2000]

    record = {
        "source_url":     PAGE_URL,
        "prompt_version": "campus-france-offers-v1",
        "content_hash":   content_hash,
        "type":           "phd",
        "title":          f"{row['title']} ({row['cf_id']})"[:300],
        "description":    description,
        "university":     row["host"][:300] if row["host"] else None,
        "country":        "France",
        "degree_level":   "phd",
        "field_of_study": [row["field_block"]] if row["field_block"] else [],
        "category":       category,
        "amount_text":    row.get("funding") or None,
        "funding_type":   "salary" if row.get("funding") and "contrat" in row.get("funding","").lower() else None,
        "eligibility_text": None,
        "eligible_nations": ["ALL"],
        "ineligible_nations": [],
        "deadline":       None,
        "deadline_text":  row.get("deadline"),
        "intake":         None,
        "apply_url":      row["detail_url"],
        "is_active":      True,
        "last_seen_at":   datetime.now(timezone.utc).isoformat(),
    }

    if dry_run:
        print(f"    WOULD INSERT: {record['title'][:80]}", flush=True)
        return True

    ex = httpx.get(
        f"{SB_URL}/rest/v1/discovered_opportunities",
        headers=SB_R,
        params={"select": "id", "content_hash": f"eq.{content_hash}", "limit": "1"},
        timeout=10,
    )
    if ex.status_code == 200 and ex.json():
        return False

    r = httpx.post(f"{SB_URL}/rest/v1/discovered_opportunities",
                   headers=SB_H, json=record, timeout=15)
    if r.status_code not in (200, 201, 204):
        print(f"    FAIL {r.status_code}: {r.text[:200]}", flush=True)
        return False
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=int, default=10,
                    help="How many 'Next' clicks (each ~10 offers)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    with CrawlerRun("campus_france_offers",
                    params={"pages": args.pages, "dry_run": args.dry_run}) as run:
        html = fetch_rendered(args.pages)
        if not html:
            print("Cloud Run fetch failed", flush=True)
            run.summary = {"error": "fetch failed"}
            return

        seen_ids = set()
        rows = []
        for cf_id, body in ROW_RX.findall(html):
            if cf_id in seen_ids:
                continue
            seen_ids.add(cf_id)
            parsed = parse_row(cf_id, body)
            if parsed:
                rows.append(parsed)

        print(f"Parsed {len(rows)} unique PhD offers across {args.pages+1} pages",
              flush=True)
        run.set_total(len(rows))

        written = 0
        for row in rows:
            if insert(row, args.dry_run):
                written += 1
                run.ok()
                print(f"  + {row['cf_id']}: {row['title'][:55]}", flush=True)
            else:
                run.skipped()
            time.sleep(0.15)

        run.summary = {"parsed": len(rows), "written": written}
        print(f"\nDONE: {written} PhD offers inserted (of {len(rows)} parsed)",
              flush=True)


if __name__ == "__main__":
    main()
