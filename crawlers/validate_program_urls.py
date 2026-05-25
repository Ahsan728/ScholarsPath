#!/usr/bin/env python3
"""
Phase 1: validate every program's apply_url.

For each program:
  * resolve redirects (HEAD, fall back to GET)
  * classify as:
      ok            — 2xx and final domain ~ matches university name
      redirect      — 2xx but ends up on different domain (suspicious)
      wrong_domain  — final URL host doesn't relate to listed university
      dead          — 4xx / 5xx / DNS / TLS / connection error
      timeout       — request timed out
      unknown       — anything else
  * writes back url_status, url_http_code, url_final_url, url_checked_at, url_check_error

Run:
  cd crawlers
  python validate_program_urls.py                  # everything missing or > 7 days old
  python validate_program_urls.py --limit 100      # smoke test
  python validate_program_urls.py --country Germany
  python validate_program_urls.py --refresh        # re-check ALL, ignore url_checked_at
  python validate_program_urls.py --only-status dead   # re-check only previously dead
"""

import argparse
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import urlparse

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import httpx
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

from crawler_logger import CrawlerRun

SB_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SB_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
SB_HEADERS = {
    "apikey": SB_KEY,
    "Authorization": f"Bearer {SB_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

UA = ("Mozilla/5.0 (compatible; ScholarAssistBot/1.0; "
      "+https://scholars.ahsansuny.com)")
REQ_HEADERS = {"User-Agent": UA, "Accept": "text/html,*/*;q=0.5"}
TIMEOUT = 15
STALE_DAYS = 7

# Aggregators / link-shorteners — if final URL ends up on one of these,
# the original URL is effectively dead even if HTTP 200.
AGGREGATOR_HOSTS = {
    "mastersportal.com", "mastersportal.eu", "bachelorsportal.eu",
    "phdportal.com", "phdportal.eu", "studyportals.com",
    "findamasters.com", "topuniversities.com", "study.eu",
    "educations.com", "shiksha.com", "hotcourses.com",
}


def normalize_uni(name: str) -> set[str]:
    """Return a set of significant tokens from a university name."""
    if not name:
        return set()
    stop = {"the", "of", "and", "university", "universite", "universita",
            "universidad", "universitat", "universidade", "universiteit",
            "uniwersytet", "egyetem", "polytechnic", "institute", "school",
            "college", "technische", "hochschule"}
    toks = re.findall(r"[a-z0-9]+", name.lower())
    return {t for t in toks if len(t) > 2 and t not in stop}


def host_of(url: str) -> str:
    try:
        return (urlparse(url).hostname or "").lower().lstrip(".")
    except Exception:
        return ""


def domain_relates_to_uni(host: str, uni: str) -> bool:
    """Loose check: does the URL host share tokens with the university name?"""
    if not host:
        return False
    host_tokens = set(re.findall(r"[a-z0-9]+", host)) - {"www", "com", "org", "net", "edu"}
    uni_tokens = normalize_uni(uni)
    if not uni_tokens:
        return True  # nothing to check against
    # accept if any non-trivial uni token appears in host, or vice versa
    for t in uni_tokens:
        if len(t) < 4:
            continue
        for h in host_tokens:
            if t == h or t in h or h in t:
                return True
    return False


def classify(url: str, university: str, client: httpx.Client) -> dict:
    """Returns dict with status, http_code, final_url, error."""
    result = {
        "url_status": "unknown",
        "url_http_code": None,
        "url_final_url": None,
        "url_check_error": None,
    }
    if not url or not url.startswith(("http://", "https://")):
        result["url_status"] = "dead"
        result["url_check_error"] = "missing or non-http URL"
        return result

    try:
        # Try HEAD first (cheap); some servers refuse it → fall back to GET.
        try:
            r = client.head(url, follow_redirects=True, headers=REQ_HEADERS, timeout=TIMEOUT)
            if r.status_code in (405, 403, 400):
                r = client.get(url, follow_redirects=True, headers=REQ_HEADERS, timeout=TIMEOUT)
        except httpx.HTTPError:
            r = client.get(url, follow_redirects=True, headers=REQ_HEADERS, timeout=TIMEOUT)

        result["url_http_code"] = r.status_code
        result["url_final_url"] = str(r.url)
        final_host = host_of(str(r.url))
        orig_host = host_of(url)

        if r.status_code >= 400:
            result["url_status"] = "dead"
            return result

        if final_host in AGGREGATOR_HOSTS:
            result["url_status"] = "wrong_domain"
            result["url_check_error"] = f"redirects to aggregator: {final_host}"
            return result

        # If the original host and final host differ meaningfully, mark redirect.
        if orig_host and final_host and orig_host != final_host:
            # Strip "www." for fair comparison
            o = orig_host.removeprefix("www.")
            f = final_host.removeprefix("www.")
            # Same registrable domain → still OK (subdomain change is fine)
            o_root = ".".join(o.split(".")[-2:])
            f_root = ".".join(f.split(".")[-2:])
            if o_root != f_root:
                # Domain actually changed. Check if new domain relates to university.
                if domain_relates_to_uni(final_host, university):
                    result["url_status"] = "redirect"  # different domain, but plausibly correct
                else:
                    result["url_status"] = "wrong_domain"
                return result

        # Same domain, 2xx — check it still relates to the university name.
        if not domain_relates_to_uni(final_host, university):
            # We DON'T mark this as wrong here — the URL might just be a CDN host.
            # Leave as ok; admin / domain-mismatch crawler in Phase 2 handles the deeper audit.
            pass

        result["url_status"] = "ok"
        return result

    except httpx.TimeoutException:
        result["url_status"] = "timeout"
        result["url_check_error"] = "request timed out"
        return result
    except httpx.HTTPError as e:
        result["url_status"] = "dead"
        result["url_check_error"] = f"{type(e).__name__}: {str(e)[:200]}"
        return result
    except Exception as e:
        result["url_status"] = "unknown"
        result["url_check_error"] = f"{type(e).__name__}: {str(e)[:200]}"
        return result


def fetch_programs(args) -> list[dict]:
    """Pull programs to validate, paginated."""
    select = "id,apply_url,university,country,url_status,url_checked_at"
    base = f"{SB_URL}/rest/v1/masters_programs?select={select}&apply_url=not.is.null"
    filters = []
    if args.country:
        filters.append(f"country=eq.{args.country}")
    if args.only_status:
        filters.append(f"url_status=eq.{args.only_status}")
    if not args.refresh and not args.only_status:
        # Skip programs checked in the last N days unless --refresh
        cutoff = (datetime.now(timezone.utc) - timedelta(days=STALE_DAYS)).isoformat()
        # url_checked_at IS NULL OR < cutoff
        # PostgREST doesn't support OR easily here, so do two queries
        pass

    rows: list[dict] = []
    page_size = 1000
    offset = 0
    while True:
        url = base + ("&" + "&".join(filters) if filters else "")
        url += f"&order=url_checked_at.asc.nullsfirst&limit={page_size}&offset={offset}"
        r = httpx.get(url, headers={**SB_HEADERS, "Range-Unit": "items"}, timeout=60)
        if r.status_code != 200:
            print(f"fetch error: {r.status_code} {r.text[:200]}", flush=True)
            break
        batch = r.json()
        if not batch:
            break

        # Client-side stale filter (when not --refresh / --only-status)
        if not args.refresh and not args.only_status:
            cutoff = datetime.now(timezone.utc) - timedelta(days=STALE_DAYS)
            keep = []
            for row in batch:
                if not row.get("url_checked_at"):
                    keep.append(row)
                else:
                    try:
                        ts = datetime.fromisoformat(row["url_checked_at"].replace("Z", "+00:00"))
                        if ts < cutoff:
                            keep.append(row)
                    except Exception:
                        keep.append(row)
            rows.extend(keep)
        else:
            rows.extend(batch)

        if len(batch) < page_size:
            break
        offset += page_size

        if args.limit and len(rows) >= args.limit:
            rows = rows[: args.limit]
            break
    return rows


def update_program(program_id: str, result: dict) -> bool:
    body = {
        **result,
        "url_checked_at": datetime.now(timezone.utc).isoformat(),
    }
    r = httpx.patch(
        f"{SB_URL}/rest/v1/masters_programs?id=eq.{program_id}",
        headers=SB_HEADERS, json=body, timeout=30,
    )
    return r.status_code in (200, 204)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--country", type=str, default=None)
    ap.add_argument("--refresh", action="store_true",
                    help="ignore url_checked_at and re-check everything")
    ap.add_argument("--only-status", type=str, default=None,
                    help="only re-check rows with this current url_status")
    ap.add_argument("--concurrency", type=int, default=8)
    args = ap.parse_args()

    params = {k: v for k, v in vars(args).items() if v is not None}

    with CrawlerRun("url_validator", params=params) as run:
        programs = fetch_programs(args)
        run.set_total(len(programs))
        print(f"validating {len(programs)} program URLs...", flush=True)

        counts = {"ok": 0, "dead": 0, "redirect": 0, "wrong_domain": 0,
                  "timeout": 0, "unknown": 0}

        with httpx.Client(http2=False, verify=True) as client:
            for i, p in enumerate(programs, 1):
                result = classify(p["apply_url"], p.get("university") or "", client)
                ok = update_program(p["id"], result)
                if ok:
                    if result["url_status"] in ("ok", "redirect"):
                        run.ok()
                    else:
                        run.failed(target_id=p["id"],
                                   target_url=p["apply_url"],
                                   message=f"{result['url_status']}: {result['url_check_error'] or result['url_http_code']}")
                else:
                    run.failed(target_id=p["id"], target_url=p["apply_url"],
                               message="DB update failed")

                counts[result["url_status"]] = counts.get(result["url_status"], 0) + 1
                if i % 25 == 0 or i == len(programs):
                    print(f"  [{i}/{len(programs)}] {counts}", flush=True)
                time.sleep(0.05)  # gentle

        run.summary = counts
        print(f"\nDONE: {counts}", flush=True)


if __name__ == "__main__":
    main()
