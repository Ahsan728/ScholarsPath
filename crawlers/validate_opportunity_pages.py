#!/usr/bin/env python3
"""
Opportunity Page Validator (Phase 0 Gate #2).

For every opportunity with url_status='ok', fetches the page and checks
that the opportunity title actually appears on the page. Classifies into:
  - specific_match    : ≥70% of title tokens appear on the page (good)
  - name_changed      : page exists but title doesn't appear (renamed?)
  - not_found         : page exists but contains 404-style text
  - unreachable       : couldn't fetch

Mirrors crawlers/validate_program_pages.py — same logic, same status names.
Only runs after URL validator has marked rows url_status='ok'.

Run:
  python crawlers/validate_opportunity_pages.py --limit 200
"""

import argparse
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

SB_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SB_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
SB_R = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"}
SB_W = {**SB_R, "Content-Type": "application/json", "Prefer": "return=minimal"}

UA = "Mozilla/5.0 (compatible; ScholarAssistBot/1.0; +https://scholars.ahsansuny.com)"

NOT_FOUND_RX = re.compile(
    r"\b(?:404|not found|page not found|seite nicht gefunden|"
    r"page introuvable|p[aá]gina no encontrada|pagina non trovata|"
    r"this page (?:has been removed|does not exist)|"
    r"sorry,? (?:we couldn't find|the page))\b",
    re.IGNORECASE,
)

STOP_TOKENS = {
    "the", "of", "and", "a", "in", "for", "at", "on", "to", "by", "with",
    "or", "an", "as", "is", "be", "from", "into", "over", "under",
    "master", "masters", "phd", "doctoral", "doctorate", "fellowship",
    "scholarship", "grant", "internship", "postdoc", "program", "programme",
}


def title_tokens(title: str) -> set[str]:
    """Significant tokens from the title (length >2, non-stopword)."""
    toks = re.findall(r"[a-zA-Z0-9]+", (title or "").lower())
    return {t for t in toks if len(t) > 2 and t not in STOP_TOKENS}


def strip_html(html: str) -> str:
    html = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I)
    html = re.sub(r"<style[\s\S]*?</style>",   " ", html, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", html)
    text = (text.replace("&nbsp;", " ").replace("&amp;", "&")
                .replace("&lt;", "<").replace("&gt;", ">"))
    return re.sub(r"\s+", " ", text).strip()


def page_title(html: str) -> str:
    m = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
    if not m:
        return ""
    return re.sub(r"\s+", " ", m.group(1)).strip()[:300]


def classify_page(url: str, opp_title: str) -> dict:
    """Returns dict with status + page_title."""
    try:
        r = httpx.get(url, follow_redirects=True, timeout=20,
                      headers={"User-Agent": UA, "Accept": "text/html,*/*;q=0.5"})
    except Exception:
        return {"status": "unreachable", "page_title": ""}

    if r.status_code >= 400:
        return {"status": "unreachable", "page_title": ""}

    html = r.text
    if len(html) < 200:
        return {"status": "unreachable", "page_title": ""}

    text = strip_html(html)
    p_title = page_title(html)

    # 404-like content?
    if NOT_FOUND_RX.search(text[:5000]):
        return {"status": "not_found", "page_title": p_title}

    # Title token overlap
    want = title_tokens(opp_title)
    if not want:
        # Empty/generic title — can't validate, but page exists. Be lenient.
        return {"status": "specific_match", "page_title": p_title}

    text_lower = text.lower()
    found = sum(1 for t in want if t in text_lower)
    overlap = found / len(want)
    if overlap >= 0.7:
        return {"status": "specific_match", "page_title": p_title}
    if overlap >= 0.3:
        # Some tokens found — page may have been renamed
        return {"status": "name_changed", "page_title": p_title}
    # Few tokens found — title doesn't match this page
    return {"status": "name_changed", "page_title": p_title}


def fetch_targets(limit: int | None) -> list[dict]:
    params = {
        "select": "id,title,apply_url,url_final_url",
        "is_active": "eq.true",
        "url_status": "eq.ok",
        "page_status": "is.null",
        "limit": str(limit or 500),
    }
    r = httpx.get(f"{SB_URL}/rest/v1/discovered_opportunities",
                  headers=SB_R, params=params, timeout=30)
    r.raise_for_status()
    return r.json() or []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=500)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    with CrawlerRun("opportunity_page_validator",
                    params={"limit": args.limit, "dry_run": args.dry_run}) as run:
        rows = fetch_targets(args.limit)
        run.set_total(len(rows))
        print(f"Validating {len(rows)} opportunity pages", flush=True)

        counts = {"specific_match": 0, "name_changed": 0, "not_found": 0, "unreachable": 0}
        for i, row in enumerate(rows, 1):
            url = (row.get("url_final_url") or row.get("apply_url") or "").strip()
            if not url:
                counts["unreachable"] += 1
                continue
            result = classify_page(url, row.get("title", ""))
            counts[result["status"]] = counts.get(result["status"], 0) + 1

            if i % 50 == 0:
                print(f"  [{i}/{len(rows)}] {counts}", flush=True)

            if args.dry_run:
                run.skipped()
                continue

            patch = {
                "page_status": result["status"],
                "page_title": result["page_title"],
                "page_checked_at": datetime.now(timezone.utc).isoformat(),
            }
            httpx.patch(f"{SB_URL}/rest/v1/discovered_opportunities?id=eq.{row['id']}",
                        headers=SB_W, json=patch, timeout=15)

            if result["status"] == "specific_match":
                run.ok()
            else:
                run.failed(target_id=row["id"], target_url=url,
                           message=f"{result['status']}: title='{row.get('title','')[:60]}'")
            time.sleep(0.1)

        run.summary = counts
        print(f"\nDONE: {counts}", flush=True)


if __name__ == "__main__":
    main()
