#!/usr/bin/env python3
"""
Opportunity URL Validator (Phase 0 Gate #1).

For every row in discovered_opportunities, HEAD-checks the apply_url and
classifies the result:
  - ok           : 2xx and final host is NOT an aggregator
  - dead         : 4xx / 5xx
  - redirect     : final URL differs significantly from input
  - wrong_domain : 2xx but final host is on the aggregator/scam blocklist
  - timeout      : couldn't fetch within timeout

Mirrors crawlers/validate_program_urls.py — same status taxonomy as
masters_programs so admin UIs can reuse the same components.

Run:
  python crawlers/validate_opportunity_urls.py --limit 200
  python crawlers/validate_opportunity_urls.py --recheck   # re-check ones older than 30d
"""

import argparse
import os
import sys
import time
from datetime import datetime, timezone, timedelta
from urllib.parse import urlparse

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import httpx
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

from crawler_logger import CrawlerRun
from aggregator_hosts import is_aggregator_host

SB_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SB_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
SB_R = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"}
SB_W = {**SB_R, "Content-Type": "application/json", "Prefer": "return=minimal"}

UA = "Mozilla/5.0 (compatible; ScholarAssistBot/1.0; +https://scholars.ahsansuny.com)"


def classify_url(url: str) -> dict:
    """Returns dict with status, http_code, final_url, error."""
    if not url or not url.startswith("http"):
        return {"status": "dead", "http_code": 0, "final_url": url, "error": "no url"}
    try:
        r = httpx.head(
            url, follow_redirects=True, timeout=15,
            headers={"User-Agent": UA, "Accept": "text/html,*/*;q=0.5"},
        )
        # Some servers reject HEAD — retry with GET
        if r.status_code in (400, 403, 405, 501):
            r = httpx.get(
                url, follow_redirects=True, timeout=20,
                headers={"User-Agent": UA, "Accept": "text/html,*/*;q=0.5"},
            )
    except httpx.TimeoutException:
        return {"status": "timeout", "http_code": 0, "final_url": url, "error": "timeout"}
    except Exception as e:
        return {"status": "dead", "http_code": 0, "final_url": url, "error": str(e)[:200]}

    final = str(r.url)
    code = r.status_code

    if code >= 400:
        return {"status": "dead", "http_code": code, "final_url": final, "error": f"HTTP {code}"}

    # 2xx — check if it landed on an aggregator
    if is_aggregator_host(final):
        return {"status": "wrong_domain", "http_code": code, "final_url": final,
                "error": f"final host '{urlparse(final).hostname}' is on aggregator blocklist"}

    # 2xx + clean host. Was it a significant redirect?
    try:
        orig_host = (urlparse(url).hostname or "").lower().lstrip("www.")
        final_host = (urlparse(final).hostname or "").lower().lstrip("www.")
        if orig_host and final_host and orig_host != final_host:
            return {"status": "redirect", "http_code": code, "final_url": final, "error": None}
    except Exception:
        pass

    return {"status": "ok", "http_code": code, "final_url": final, "error": None}


def fetch_targets(limit: int | None, recheck: bool) -> list[dict]:
    """Get opportunities that need URL checking."""
    params = {
        "select": "id,apply_url,source_url,url_status,url_checked_at",
        "is_active": "eq.true",
    }
    if recheck:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        params["or"] = f"(url_status.is.null,url_checked_at.lt.{cutoff})"
    else:
        params["url_status"] = "is.null"
    params["limit"] = str(limit or 500)

    r = httpx.get(f"{SB_URL}/rest/v1/discovered_opportunities",
                  headers=SB_R, params=params, timeout=30)
    r.raise_for_status()
    return r.json() or []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=500)
    ap.add_argument("--recheck", action="store_true",
                    help="Also re-check opportunities last checked >30 days ago")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    with CrawlerRun("opportunity_url_validator",
                    params={"limit": args.limit, "recheck": args.recheck,
                            "dry_run": args.dry_run}) as run:
        rows = fetch_targets(args.limit, args.recheck)
        run.set_total(len(rows))
        print(f"Validating {len(rows)} opportunities", flush=True)

        counts = {"ok": 0, "dead": 0, "redirect": 0, "wrong_domain": 0, "timeout": 0}
        for i, row in enumerate(rows, 1):
            # Prefer apply_url, fall back to source_url
            target = (row.get("apply_url") or row.get("source_url") or "").strip()
            result = classify_url(target)
            counts[result["status"]] = counts.get(result["status"], 0) + 1

            if i % 50 == 0:
                print(f"  [{i}/{len(rows)}] {counts}", flush=True)

            if args.dry_run:
                run.skipped()
                continue

            patch = {
                "url_status": result["status"],
                "url_http_code": result["http_code"],
                "url_final_url": result["final_url"],
                "url_checked_at": datetime.now(timezone.utc).isoformat(),
                "url_check_error": result["error"],
            }
            httpx.patch(f"{SB_URL}/rest/v1/discovered_opportunities?id=eq.{row['id']}",
                        headers=SB_W, json=patch, timeout=15)

            if result["status"] == "ok":
                run.ok()
            else:
                run.failed(target_id=row["id"], target_url=target,
                           message=f"{result['status']}: {result['error']}")
            time.sleep(0.05)  # gentle

        run.summary = counts
        print(f"\nDONE: {counts}", flush=True)


if __name__ == "__main__":
    main()
