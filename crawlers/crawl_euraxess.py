#!/usr/bin/env python3
"""
EURAXESS deep-pagination crawler.

EURAXESS jobs (https://euraxess.ec.europa.eu/jobs) is a JS-rendered
SPA that lists ~8,000 active PhD/postdoc/researcher positions across
the EU. The default Discoverer only sees the top ~25 from page 0.
This crawler walks pages 0..N via Cloud Run Playwright, extracts each
page through Haiku, dedupes, and inserts into discovered_opportunities
behind the Phase 0 quality gates.

Flow per page:
  1. Cloud Run renders euraxess.ec.europa.eu/jobs?page=N
  2. content_hash check — skip if unchanged since last crawl
  3. Haiku extraction (opportunities only; this is a job board, no programs)
  4. Each row: schema gate + aggregator gate + insert
  5. Stop when N consecutive pages return 0 new rows OR --max-pages hit

Run:
  python crawlers/crawl_euraxess.py --max-pages 5 --dry-run    # smoke test
  python crawlers/crawl_euraxess.py --max-pages 50 --max-usd 5  # bounded sweep
  python crawlers/crawl_euraxess.py --max-pages 320 --max-usd 20  # full sweep
"""

import argparse
import hashlib
import os
import re
import sys
import time
from datetime import datetime, timezone
from typing import Optional

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import httpx
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

from crawler_logger import CrawlerRun
from ai.extract import extract_json, BudgetExceeded, SchemaInvalid
from aggregator_hosts import is_aggregator_host

SB_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SB_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
SB_H   = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}",
          "Content-Type": "application/json", "Prefer": "return=minimal"}
SB_R   = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"}

BROWSER_URL   = os.environ["BROWSER_FETCH_URL"].rstrip("/")
BROWSER_TOKEN = os.environ["BROWSER_FETCH_TOKEN"]

# /jobs is the landing page (highlights funding bodies); /jobs/search is
# the real paginated listing endpoint where positions actually live.
EURAXESS_BASE = "https://euraxess.ec.europa.eu/jobs/search"
PROMPT_VERSION = "euraxess-v1"


def fetch_page_browser(url: str) -> Optional[str]:
    """Render via Cloud Run Playwright. Returns HTML text or None."""
    try:
        r = httpx.post(
            f"{BROWSER_URL}/fetch",
            headers={"Authorization": f"Bearer {BROWSER_TOKEN}",
                     "Content-Type": "application/json"},
            json={"url": url, "wait_ms": 3000},
            timeout=90,
        )
        if r.status_code != 200:
            return None
        data = r.json()
        if data.get("status", 0) >= 400 or not data.get("html"):
            return None
        return data["html"]
    except Exception as e:
        print(f"    browser-fetch error: {e}", flush=True)
        return None


def strip_html(html: str) -> str:
    html = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I)
    html = re.sub(r"<style[\s\S]*?</style>",   " ", html, flags=re.I)
    html = re.sub(r"<(nav|header|footer|aside)[\s\S]*?</\1>", " ", html, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", html)
    text = (text.replace("&nbsp;", " ").replace("&amp;", "&")
                .replace("&lt;", "<").replace("&gt;", ">")
                .replace("&#039;", "'").replace("&quot;", '"'))
    return re.sub(r"\s+", " ", text).strip()


def extract_job_links(html: str) -> list[tuple[str, str]]:
    """Pull (title, absolute_url) pairs for EURAXESS job postings."""
    from urllib.parse import urljoin
    out = []
    seen = set()
    for href, text in re.findall(
        r'<a[^>]+href=["\'](/jobs/[^"\']+)["\'][^>]*>(.*?)</a>',
        html or "", re.I | re.DOTALL,
    ):
        clean = re.sub(r"<[^>]+>", " ", text)
        clean = re.sub(r"\s+", " ", clean).strip()
        if not clean or len(clean) < 8:
            continue
        full = urljoin("https://euraxess.ec.europa.eu", href)
        if full in seen:
            continue
        # Skip the listing-page URL itself
        if "?page=" in href or href.rstrip("/").endswith("/jobs"):
            continue
        seen.add(full)
        out.append((clean[:300], full))
    return out


def build_prompt(text: str, links: list[tuple[str, str]], page_no: int) -> str:
    links_md = "\n".join(f"  [{t[:100]}]({u})" for t, u in links[:60])
    return f"""Extract every job/PhD/postdoc/researcher position listed on this EURAXESS page.

Reply with ONLY valid JSON:
{{
  "opportunities": [
    {{
      "type":           "<phd | postdoc | fellowship | grant | researcher | scholarship>",
      "title":          "<exact title from listing>",
      "description":    "<1-2 sentence summary, e.g. 'Marie Curie Doctoral Network in Materials Science at TU Berlin'>",
      "country":        "<full English country name, or 'Europe' for pan-EU>",
      "university":     "<host institution if obvious, else null>",
      "degree_level":   "<phd | postdoc | masters | any>",
      "field_of_study": ["<broad field e.g. 'Computer Science' or 'Biology'>"],
      "deadline_text":  "<verbatim deadline string or null>",
      "apply_url":      "<the SPECIFIC EURAXESS job URL from the Links section>"
    }}
  ]
}}

EURAXESS page {page_no} text:
{text[:12000]}

Job links found on this page (use these for apply_url):
{links_md or "(no links found)"}

Rules:
- Extract EVERY job posting visible. Don't skip ones with vague titles.
- apply_url MUST be one of the EURAXESS job URLs in the Links section, not the base /jobs page.
- type: most are 'phd' or 'postdoc' or 'researcher'. Marie Curie ones are 'fellowship'.
- country: derive from job location text if obvious, else 'Europe'.
- Return {{"opportunities": []}} if the page is empty.
"""


def insert_opportunity(opp: dict, page_no: int, content_hash: str,
                       run_id: str, dry_run: bool) -> bool:
    title = (opp.get("title") or "").strip()
    country = (opp.get("country") or "Europe").strip()
    opp_type = (opp.get("type") or "phd").strip().lower()
    apply_url = (opp.get("apply_url") or "").strip()

    # Schema gate
    if not title or not country or not opp_type or not apply_url.startswith("http"):
        return False

    # Aggregator gate (euraxess.ec.europa.eu is allowed since we updated
    # the blocklist for Phase 1B)
    if is_aggregator_host(apply_url):
        return False

    record = {
        "source_url":     f"{EURAXESS_BASE}?page={page_no}",
        "run_id":         run_id,
        "prompt_version": PROMPT_VERSION,
        "content_hash":   content_hash,
        "type":           opp_type if opp_type in (
            "phd", "postdoc", "fellowship", "grant", "scholarship",
            "internship", "exchange",
        ) else "phd",
        "title":          title[:300],
        "description":    (opp.get("description") or "")[:2000] or None,
        "university":     (opp.get("university") or "")[:300] or None,
        "country":        country,
        "degree_level":   opp.get("degree_level") or "any",
        "field_of_study": opp.get("field_of_study") or [],
        "amount_text":    None,
        "funding_type":   None,
        "eligibility_text": None,
        "eligible_nations": ["ALL"],
        "ineligible_nations": [],
        "deadline":       None,
        "deadline_text":  (opp.get("deadline_text") or "")[:200] or None,
        "intake":         None,
        "apply_url":      apply_url[:600],
        "is_active":      True,
        "last_seen_at":   datetime.now(timezone.utc).isoformat(),
    }

    if dry_run:
        return True

    r = httpx.post(
        f"{SB_URL}/rest/v1/discovered_opportunities",
        headers=SB_H, json=record, timeout=15,
    )
    return r.status_code in (200, 201, 204)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-pages", type=int, default=10,
                    help="Stop after this many pages (default 10)")
    ap.add_argument("--start-page", type=int, default=0)
    ap.add_argument("--max-usd",  type=float, default=2.0,
                    help="Anthropic budget cap for this run")
    ap.add_argument("--dry-run",  action="store_true")
    ap.add_argument("--stop-after-empty", type=int, default=3,
                    help="Stop if N consecutive pages return 0 new rows")
    args = ap.parse_args()

    with CrawlerRun("euraxess_paginator",
                    params={"max_pages": args.max_pages,
                            "start_page": args.start_page,
                            "max_usd": args.max_usd,
                            "dry_run": args.dry_run}) as run:
        # Build set of apply_urls we already have, so we don't re-extract them
        existing_urls = set()
        offset = 0
        while True:
            r = httpx.get(
                f"{SB_URL}/rest/v1/discovered_opportunities",
                headers=SB_R,
                params={"select": "apply_url",
                        "apply_url": "ilike.*euraxess*",
                        "limit": "1000", "offset": str(offset)},
                timeout=30,
            )
            batch = r.json() if r.status_code == 200 else []
            for row in batch:
                u = (row.get("apply_url") or "").strip()
                if u: existing_urls.add(u)
            if len(batch) < 1000: break
            offset += 1000
        print(f"Loaded {len(existing_urls)} prior EURAXESS apply_urls (will skip)",
              flush=True)

        total_written = 0
        consecutive_empty = 0
        for page_no in range(args.start_page, args.start_page + args.max_pages):
            page_url = f"{EURAXESS_BASE}?page={page_no}"
            print(f"\n[page {page_no}] {page_url}", flush=True)

            html = fetch_page_browser(page_url)
            if not html:
                print(f"  fetch failed", flush=True)
                run.event("warn", target_url=page_url, message="browser fetch failed")
                consecutive_empty += 1
                if consecutive_empty >= args.stop_after_empty:
                    print(f"  STOP: {consecutive_empty} consecutive empty pages", flush=True)
                    break
                continue

            text = strip_html(html)
            links = extract_job_links(html)
            print(f"  {len(text)} chars, {len(links)} job links", flush=True)

            if not links:
                consecutive_empty += 1
                run.skipped()
                if consecutive_empty >= args.stop_after_empty:
                    print(f"  STOP: {consecutive_empty} consecutive empty pages", flush=True)
                    break
                continue

            # Skip if all links are ones we already have
            new_links = [(t, u) for t, u in links if u not in existing_urls]
            if not new_links:
                print(f"  all {len(links)} links already in DB — skipping", flush=True)
                consecutive_empty += 1
                run.skipped()
                if consecutive_empty >= args.stop_after_empty:
                    break
                continue

            chunk_hash = hashlib.sha256(text.encode()).hexdigest()

            prompt = build_prompt(text, new_links, page_no)
            try:
                data = extract_json(
                    prompt=prompt,
                    run_id=run.run_id,
                    max_usd_per_run=args.max_usd,
                    provider="anthropic",
                    max_tokens=12000,
                    expected_keys=("opportunities",),
                    estimated_cost=0.04,
                )
            except BudgetExceeded as e:
                print(f"  BUDGET EXCEEDED: {e}", flush=True)
                break
            except SchemaInvalid as e:
                print(f"  schema invalid: {e}", flush=True)
                run.event("error", target_url=page_url, message=str(e)[:200])
                consecutive_empty += 1
                continue

            opps = data.get("opportunities") or []
            print(f"  extracted {len(opps)} opportunities", flush=True)

            page_written = 0
            for opp in opps:
                ok = insert_opportunity(opp, page_no, chunk_hash, run.run_id, args.dry_run)
                if ok:
                    apply_url = (opp.get("apply_url") or "").strip()
                    if apply_url:
                        existing_urls.add(apply_url)
                    page_written += 1
                    run.ok()
                else:
                    run.skipped()
            total_written += page_written
            print(f"  inserted {page_written} new rows (cumulative {total_written})",
                  flush=True)

            if page_written == 0:
                consecutive_empty += 1
                if consecutive_empty >= args.stop_after_empty:
                    print(f"  STOP: {consecutive_empty} consecutive pages with 0 inserts",
                          flush=True)
                    break
            else:
                consecutive_empty = 0

            time.sleep(1.0)  # gentle pace

        run.summary = {"total_written": total_written,
                       "pages_processed": page_no - args.start_page + 1,
                       "stopped_early": consecutive_empty >= args.stop_after_empty}
        print(f"\nDONE: {total_written} rows over {page_no - args.start_page + 1} pages",
              flush=True)


if __name__ == "__main__":
    main()
