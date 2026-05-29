#!/usr/bin/env python3
"""
Campus France PhD Schools crawler — extracts the 10 visible doctoral
schools per fetch from `/phd/dschools/clear`.

Each French Ecole Doctorale (ED) becomes one row in masters_programs
with level='phd', country='France'. We capture the discipline, host
institution, region, and the detail URL.

Run:
  python crawlers/crawl_campus_france.py --dry-run     # smoke test
  python crawlers/crawl_campus_france.py               # live insert
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

PAGE_URL = "https://doctorat.campusfrance.org/phd/dschools/clear"
SOURCE   = "campus_france_phd"


def fetch_rendered(url: str) -> str | None:
    try:
        r = httpx.post(
            f"{BROWSER_URL}/fetch",
            headers={"Authorization": f"Bearer {BROWSER_TOKEN}",
                     "Content-Type": "application/json"},
            json={"url": url, "wait_ms": 5000,
                  "wait_selector": "tr[id^=\"ED\"]",
                  "wait_selector_ms": 15000},
            timeout=90,
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


# Each row looks like:
#   <tr id="ED467" role="row" class="odd">
#     <td>...<h3>ED 467</h3>...</td>
#     <td>
#       <h3>ED 467 Aéronautique - astronautique</h3>
#       <p>INSTITUT SUPÉRIEUR DE L'AÉRONAUTIQUE ET DE L'ESPACE</p>
#       <p><span>Sciences pour l'Ingénieur</span> ... <span>Occitanie</span></p>
#     </td>
#     <td><a href="https://doctorat.campusfrance.org/ED467">...</a></td>
#   </tr>
ROW_RX = re.compile(
    r'<tr id="ED(\d+)"[^>]*>(.*?)</tr>',
    re.I | re.DOTALL,
)
H3_RX  = re.compile(r"<h3[^>]*>(.*?)</h3>", re.I | re.DOTALL)
P_RX   = re.compile(r"<p[^>]*>(.*?)</p>",   re.I | re.DOTALL)
A_RX   = re.compile(r'href=["\'](https?://[^"\']+)["\']', re.I)
SPAN_RX= re.compile(r"<span[^>]*>(.*?)</span>", re.I | re.DOTALL)


def clean_text(s: str) -> str:
    s = re.sub(r"<[^>]+>", " ", s or "")
    s = (s.replace("&nbsp;", " ").replace("&amp;", "&")
           .replace("&lt;", "<").replace("&gt;", ">")
           .replace("&#039;", "'").replace("&quot;", '"'))
    return re.sub(r"\s+", " ", s).strip()


def parse_rows(html: str) -> list[dict]:
    out = []
    for ed_num, body in ROW_RX.findall(html):
        h3s = [clean_text(h) for h in H3_RX.findall(body)]
        ps  = [clean_text(p) for p in P_RX.findall(body)]
        urls = A_RX.findall(body)

        # Title is the second h3 (after the bare ED number h3): "ED 467 Aero..."
        title = None
        for h in h3s:
            stripped = re.sub(r"^ED\s*\d+\s*", "", h).strip()
            if stripped and len(stripped) > 3:
                title = stripped
                break

        # First p with len > 5 is host institution
        host = next((p for p in ps if len(p) > 5), None)

        # Domain text from spans inside the meta paragraph
        spans = []
        if len(ps) >= 2:
            spans = [clean_text(s) for s in SPAN_RX.findall(html.split(f'ED{ed_num}', 1)[-1][:3000])]

        # Detail URL: the campusfrance.org link
        detail_url = None
        for u in urls:
            if "campusfrance.org/ED" in u or "campusfrance.org" in u:
                detail_url = u
                break

        if not title or not host:
            continue

        out.append({
            "ed_number": ed_num,
            "title":     title,
            "host":      host,
            "spans":     [s for s in spans if s and len(s) > 1][:5],
            "detail_url": detail_url or f"https://doctorat.campusfrance.org/ED{ed_num}",
        })
    return out


def insert(row: dict, dry_run: bool) -> bool:
    """Each French doctoral school is inserted as a 'phd' type opportunity.
    They host PhD researchers; treating them as opportunities (not master
    programs) keeps the data model clean: masters_programs is for taught
    bachelor/master programs only."""
    title = row["title"]
    host  = row["host"]
    detail = row["detail_url"]

    if is_aggregator_host(detail):
        return False

    content_hash = hashlib.sha256(f"{row['ed_number']}|{host}|{title}".encode()).hexdigest()
    field = " ".join(row.get("spans") or [])
    category = classify_domain([field, title], title)

    record = {
        "source_url":     PAGE_URL,
        "prompt_version": "campus-france-phd-v1",
        "content_hash":   content_hash,
        "type":           "phd",
        "title":          f"{title} (ED{row['ed_number']}) — {host}"[:300],
        "description":    (f"French Ecole Doctorale {row['ed_number']} "
                           f"({title}) hosted by {host}. Listed in the "
                           f"Campus France official doctoral catalogue.")[:2000],
        "university":     host[:300],
        "country":        "France",
        "degree_level":   "phd",
        "field_of_study": [field, title] if field else [title],
        "amount_text":    None,
        "funding_type":   None,
        "eligibility_text": None,
        "eligible_nations": ["ALL"],
        "ineligible_nations": [],
        "deadline":       None,
        "deadline_text":  None,
        "intake":         None,
        "apply_url":      detail,
        "is_active":      True,
        "last_seen_at":   datetime.now(timezone.utc).isoformat(),
    }

    if dry_run:
        print(f"    WOULD INSERT: {record['title'][:80]}", flush=True)
        return True

    # Dedup by content_hash
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
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    with CrawlerRun("campus_france_phd_schools",
                    params={"dry_run": args.dry_run}) as run:
        html = fetch_rendered(PAGE_URL)
        if not html:
            print("Cloud Run fetch failed", flush=True)
            run.summary = {"error": "fetch failed"}
            return

        rows = parse_rows(html)
        print(f"Parsed {len(rows)} doctoral schools from rendered page", flush=True)
        run.set_total(len(rows))

        written = 0
        for row in rows:
            if insert(row, args.dry_run):
                written += 1
                run.ok()
                print(f"  + ED{row['ed_number']}: {row['title'][:50]}", flush=True)
            else:
                run.skipped()
            time.sleep(0.2)

        run.summary = {"parsed": len(rows), "written": written}
        print(f"\nDONE: {written} doctoral schools inserted "
              f"(of {len(rows)} parsed)", flush=True)


if __name__ == "__main__":
    main()
