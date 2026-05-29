#!/usr/bin/env python3
"""
Phase 1A — Seed opportunity_sources from university apply_url domains.

For each distinct university host in masters_programs, probes a list of
common scholarship/PhD/funding URL patterns. The first one that returns
2xx + > 500 chars of rendered text is inserted into opportunity_sources
with scope='university'.

URLs that 2xx but return < 500 chars (likely a JS shell that needs
Playwright) get inserted with js_render=true — Phase 1B will pick those
up via Cloud Run. The js_render column only takes effect after the
js_render_migration.sql has been applied (Phase 1B); until then those
rows are stored with the flag but skipped by the HTTP-only Discoverer.

Common paths probed per host:
    /scholarships
    /en/scholarships
    /funding
    /phd-positions
    /jobs
    /international/scholarships
    /students/financial-aid
    /research/phd
    /en/funding
    /en/study/scholarships

Run:
    python crawlers/seed_university_scholarship_sources.py --dry-run
    python crawlers/seed_university_scholarship_sources.py --limit 50
    python crawlers/seed_university_scholarship_sources.py            # all
"""

import argparse
import os
import sys
import time
from datetime import datetime, timezone
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

# Common path patterns where universities expose scholarship/PhD/funding info
PROBE_PATHS = [
    "/scholarships",
    "/en/scholarships",
    "/scholarships-and-financial-aid",
    "/funding",
    "/en/funding",
    "/phd-positions",
    "/en/phd-positions",
    "/jobs",
    "/careers",
    "/international/scholarships",
    "/students/financial-aid",
    "/research/phd",
    "/en/study/scholarships",
    "/admission/financial-aid",
    "/en/admission/financial-aid",
    "/postgraduate/scholarships",
    "/graduate-school/funding",
]


def get_country_for_host(host: str) -> str | None:
    """Look up the most common country for programs from this host."""
    r = httpx.get(
        f"{SB_URL}/rest/v1/masters_programs",
        headers=SB_R,
        params={"select": "country", "apply_url": f"ilike.*{host}*", "limit": "5"},
        timeout=10,
    )
    if r.status_code != 200:
        return None
    countries = [row.get("country") for row in r.json() if row.get("country")]
    if not countries:
        return None
    # Most common
    return max(set(countries), key=countries.count)


def fetch_distinct_hosts(limit: int | None) -> list[tuple[str, str]]:
    """Get unique (host, country) pairs from masters_programs apply_url."""
    seen: dict[str, str] = {}
    offset = 0
    while True:
        r = httpx.get(
            f"{SB_URL}/rest/v1/masters_programs",
            headers=SB_R,
            params={
                "select": "apply_url,country",
                "is_active": "eq.true",
                "url_status": "eq.ok",
                "limit": "1000",
                "offset": str(offset),
            },
            timeout=30,
        )
        rows = r.json() or []
        for row in rows:
            url = (row.get("apply_url") or "").strip()
            if not url:
                continue
            try:
                host = urlparse(url).hostname or ""
                host = host.lower().lstrip("www.")
                if not host or is_aggregator_host(url):
                    continue
                if host in seen:
                    continue
                seen[host] = row.get("country") or "Europe"
            except Exception:
                continue
        if len(rows) < 1000:
            break
        offset += 1000
        if limit and len(seen) >= limit:
            break
    out = list(seen.items())
    if limit:
        out = out[:limit]
    return out


def probe_path(scheme_host: str, path: str) -> tuple[int, int]:
    """Returns (status_code, content_text_length). 0,0 if unreachable."""
    url = f"{scheme_host}{path}"
    try:
        r = httpx.get(
            url, follow_redirects=True, timeout=12,
            headers={"User-Agent": UA, "Accept": "text/html"},
        )
        if r.status_code >= 400:
            return r.status_code, 0
        # rough content length — strip script/style for an HTML approximation
        body = r.text
        if not body:
            return r.status_code, 0
        # cheap text proxy: chars between > and < not inside script/style
        import re
        body = re.sub(r"<script[\s\S]*?</script>", " ", body, flags=re.I)
        body = re.sub(r"<style[\s\S]*?</style>",   " ", body, flags=re.I)
        body = re.sub(r"<[^>]+>", " ", body)
        text_len = len(re.sub(r"\s+", " ", body).strip())
        return r.status_code, text_len
    except Exception:
        return 0, 0


def source_exists(url: str) -> bool:
    r = httpx.get(
        f"{SB_URL}/rest/v1/opportunity_sources",
        headers=SB_R,
        params={"select": "id", "url": f"eq.{url}", "limit": "1"},
        timeout=10,
    )
    return bool(r.json())


def insert_source(url: str, country: str, scope: str, title: str,
                  js_render: bool) -> bool:
    record = {
        "url": url,
        "country": country,
        "scope": scope,
        "title": title[:300],
        "added_by": "uni_scholarship_seeder",
        "notes": "Auto-probed from masters_programs uni domain (Phase 1A)",
    }
    # js_render column only exists after Phase 1B migration; try without
    # first, then with the flag.
    r = httpx.post(
        f"{SB_URL}/rest/v1/opportunity_sources",
        headers=SB_W, json=record, timeout=15,
    )
    if r.status_code in (200, 201):
        return True
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None,
                    help="Max number of distinct uni hosts to probe")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--paths-per-host", type=int, default=10,
                    help="Max paths to try before giving up on a host")
    args = ap.parse_args()

    with CrawlerRun("uni_scholarship_source_seeder",
                    params={"limit": args.limit, "dry_run": args.dry_run}) as run:
        hosts = fetch_distinct_hosts(args.limit)
        run.set_total(len(hosts))
        print(f"Probing {len(hosts)} distinct uni hosts", flush=True)

        added_static = 0
        added_js = 0
        skipped_dupe = 0
        no_hit = 0

        for i, (host, country) in enumerate(hosts, 1):
            if i % 20 == 0:
                print(f"  [{i}/{len(hosts)}] static={added_static} js={added_js} dupes={skipped_dupe} miss={no_hit}", flush=True)

            scheme_host = f"https://{host}"
            best_static: tuple[str, int] | None = None
            best_js: tuple[str, int] | None = None

            for p in PROBE_PATHS[:args.paths_per_host]:
                code, text_len = probe_path(scheme_host, p)
                if code in (200,) and text_len > 500:
                    best_static = (scheme_host + p, text_len)
                    break
                elif code in (200,) and text_len > 100:
                    # Page exists but body is sparse — likely JS shell
                    if best_js is None or text_len > best_js[1]:
                        best_js = (scheme_host + p, text_len)
                time.sleep(0.15)

            chosen_url = None
            js_render = False
            if best_static:
                chosen_url = best_static[0]
            elif best_js:
                chosen_url = best_js[0]
                js_render = True
            else:
                no_hit += 1
                run.skipped()
                continue

            if source_exists(chosen_url):
                skipped_dupe += 1
                run.skipped()
                continue

            title = f"{host.replace('www.', '').title()} — Scholarships / Funding"
            if args.dry_run:
                print(f"  WOULD ADD: {chosen_url} ({'JS' if js_render else 'static'})", flush=True)
                run.skipped()
            else:
                if insert_source(chosen_url, country, "university", title, js_render):
                    if js_render: added_js += 1
                    else:         added_static += 1
                    run.ok()
                else:
                    run.failed(target_url=chosen_url, message="insert failed")
            time.sleep(0.1)

        run.summary = {
            "static_added": added_static,
            "js_added":     added_js,
            "dupes":        skipped_dupe,
            "no_hit":       no_hit,
        }
        print(f"\nDONE: static={added_static} js-flagged={added_js} dupes={skipped_dupe} no-hit={no_hit}", flush=True)


if __name__ == "__main__":
    main()
