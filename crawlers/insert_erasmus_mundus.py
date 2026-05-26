#!/usr/bin/env python3
"""
Seed the masters_programs table with Erasmus Mundus Joint Masters (EMJM)
extracted from the EACEA catalogue:

  https://www.eacea.ec.europa.eu/scholarships/erasmus-mundus-catalogue_en

These programs are multi-country consortia and always fully funded for
selected scholars. We mark them with program_type='erasmus_mundus_joint'
and store partner universities + countries in array columns.

Two-stage scrape:
  1. Fetch the catalogue page; extract program tiles (link + title + summary)
     — try regex first, fall back to Haiku JSON extraction
  2. For each program detail page: extract structured fields with Haiku

Run:
  cd crawlers
  python insert_erasmus_mundus.py --dry-run       # plan only
  python insert_erasmus_mundus.py --limit 5       # test on 5
  python insert_erasmus_mundus.py                 # full run
"""

import argparse
import hashlib
import json
import os
import re
import sys
import time
from typing import Optional
from urllib.parse import urljoin

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import httpx
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

from crawler_logger import CrawlerRun
from ai.extract import extract_json, BudgetExceeded, SchemaInvalid

SB_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SB_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
HEADERS = {
    "apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}",
    "Content-Type": "application/json", "Prefer": "return=minimal",
}

CATALOGUE_URL = "https://www.eacea.ec.europa.eu/scholarships/erasmus-mundus-catalogue_en"
UA = "Mozilla/5.0 (compatible; ScholarAssistBot/1.0; +https://scholars.ahsansuny.com)"
REQ_HEADERS = {"User-Agent": UA, "Accept": "text/html"}

# Standard EMJM stipend (since 2022) — €1,400/month for ~24 months
EMJM_STIPEND_EUR = 33600  # 1400 * 24

# Fingerprint format matches the rest of the catalog
def fp(program_name: str, country: str) -> str:
    raw = f"{program_name.lower().strip()}|{country.lower()}|master"
    return hashlib.sha256(raw.encode()).hexdigest()


# ── HTML helpers ─────────────────────────────────────────────
def fetch(url: str) -> Optional[str]:
    try:
        r = httpx.get(url, headers=REQ_HEADERS, timeout=20, follow_redirects=True)
        if r.status_code != 200 or "text/html" not in r.headers.get("content-type", ""):
            return None
        return r.text
    except Exception as e:
        print(f"  fetch error {url}: {e}", flush=True)
        return None


def strip_html(html: str) -> str:
    html = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I)
    html = re.sub(r"<style[\s\S]*?</style>",   " ", html, flags=re.I)
    html = re.sub(r"<(nav|header|footer|aside|form|svg)\b[\s\S]*?</\1>", " ", html, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", html)
    text = (text.replace("&nbsp;", " ").replace("&amp;", "&")
                .replace("&lt;", "<").replace("&gt;", ">"))
    return re.sub(r"\s+", " ", text).strip()


# ── Stage 1: extract program list from catalogue ─────────────
PROGRAM_LINK_RX = re.compile(
    r'href="([^"]*(?:erasmus-mundus|emjm|joint-master)[^"]*?)"[^>]*>([^<]{5,200})</a>',
    re.IGNORECASE,
)


def extract_programs_from_catalogue(html: str, run: CrawlerRun) -> list[dict]:
    """Try regex first; fall back to Haiku if nothing found."""
    out = []
    seen_urls = set()
    for m in PROGRAM_LINK_RX.finditer(html):
        url = m.group(1).strip()
        title = m.group(2).strip()
        if not url.startswith(("http", "/")):
            continue
        full = urljoin(CATALOGUE_URL, url)
        if full in seen_urls or "catalogue" in full.lower():
            continue
        seen_urls.add(full)
        out.append({"url": full, "title": title})

    if out:
        print(f"  regex found {len(out)} candidate links", flush=True)
        return out

    # Fallback: Haiku
    print("  regex found nothing — falling back to Haiku extraction", flush=True)
    text = strip_html(html)[:25000]
    prompt = f"""Extract every Erasmus Mundus Joint Masters program listed on this catalogue page. Reply with ONLY valid JSON:

{{
  "programs": [
    {{"title": "Program name", "url": "Detail page URL (absolute https://...)"}}
  ]
}}

Skip navigation, filters, headers. Include only links to specific program detail pages.

Page text:
{text}"""
    try:
        data = extract_json(
            prompt=prompt, run_id=run.run_id,
            max_usd_per_run=2.0, provider="anthropic",
            expected_keys=("programs",), estimated_cost=0.02,
        )
        return [p for p in data.get("programs", []) if p.get("url", "").startswith("http")]
    except (BudgetExceeded, SchemaInvalid) as e:
        print(f"  Haiku extraction failed: {e}", flush=True)
        return []


# ── Stage 2: structured detail (LLM-knowledge mode, no fetch) ─
# EACEA's catalogue is JS-rendered, so the "detail" URLs we extract in
# stage 1 just point back to the catalogue. Instead of trying to scrape
# the detail page, we ask Haiku to recall structured info about the
# program by name — its training data covers the EMJM catalogue well.
def extract_program_detail(url: str, title_hint: str, run: CrawlerRun) -> Optional[dict]:
    if not title_hint or len(title_hint) < 5:
        return None

    prompt = f"""You are an expert on the Erasmus Mundus Joint Masters (EMJM) programme catalogue. Given a program title, fill in structured data using your knowledge. Reply with ONLY valid JSON, no prose:

{{
  "program_name":           "<full official name>",
  "description":            "<1-3 sentences explaining the program focus>",
  "consortium_universities": ["University 1", "University 2", "..."],
  "consortium_countries":    ["Germany", "Italy", "..."],
  "field_of_study":          ["broad field"],
  "duration_years":          2,
  "ielts_min":               null,
  "intake":                  "Annual (Sep)",
  "deadline":                null,
  "emjm_application_window": null,
  "emjm_code":               null,
  "apply_url":               "<consortium homepage URL or program-specific URL if you know it; otherwise the EACEA catalogue link>"
}}

CRITICAL: Only return data if you genuinely recognise this Erasmus Mundus Joint Masters program. If unsure, return {{"program_name": ""}} and we'll skip it. Do NOT invent universities or countries — leaving consortium_universities empty is better than guessing wrong.

Program title: {title_hint}
EACEA catalogue URL: {url}"""
    try:
        data = extract_json(
            prompt=prompt, run_id=run.run_id,
            max_usd_per_run=2.0, provider="anthropic",
            expected_keys=("program_name",), estimated_cost=0.005,
        )
        if not data.get("program_name") or not data.get("consortium_universities"):
            return None
        data["source_url"] = url
        return data
    except (BudgetExceeded, SchemaInvalid) as e:
        print(f"  extract failed for {title_hint[:60]}: {e}", flush=True)
        return None


# ── DB upsert ────────────────────────────────────────────────
def build_record(d: dict) -> dict:
    countries = d.get("consortium_countries") or []
    # Primary country: first in consortium, or "Europe" as fallback
    primary = countries[0] if countries else "Europe"
    return {
        "university":      ", ".join((d.get("consortium_universities") or [])[:3]) or "Erasmus Mundus Consortium",
        "program_name":    d["program_name"][:300],
        "country":         primary,
        "city":            "Multiple",
        "category":        "international",
        "level":           "master",
        "source_name":     "erasmus_mundus_catalogue",
        "source_url":      d.get("source_url"),
        "apply_url":       d.get("apply_url") or d.get("source_url"),
        "duration_years":  d.get("duration_years") or 2,
        "tuition_usd_year": 0,
        "language":        "English",
        "ielts_min":       d.get("ielts_min"),
        "gre_required":    False,
        "gpa_min":         None,
        "gpa_scale":       4.0,
        "intake":          d.get("intake") or "Annual (Sep)",
        "deadline":        d.get("deadline"),
        "scholarship_available": True,
        "description":     (d.get("description") or "")[:1000] or f"Erasmus Mundus Joint Masters: {d['program_name']}",
        "requirements":    ["EU + non-EU students eligible", "Bachelor's degree", "English proficiency"],
        "field_of_study":  d.get("field_of_study") or [],
        "qs_ranking":      None,
        "is_active":       True,
        # EMJM-specific
        "program_type":              "erasmus_mundus_joint",
        "consortium_universities":   d.get("consortium_universities") or [],
        "consortium_countries":      countries,
        "emjm_code":                 d.get("emjm_code"),
        "emjm_scholarship_eur":      EMJM_STIPEND_EUR,
        "emjm_intake_starts":        d.get("deadline"),
        "emjm_application_window":   d.get("emjm_application_window"),
        "fingerprint":               fp(d["program_name"], primary),
    }


def fetch_existing_fingerprints() -> set[str]:
    headers = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"}
    out: set[str] = set()
    offset = 0
    while True:
        r = httpx.get(
            f"{SB_URL}/rest/v1/masters_programs",
            headers=headers,
            params={"select": "fingerprint", "limit": "1000", "offset": str(offset)},
            timeout=30,
        )
        if r.status_code != 200: break
        batch = r.json() or []
        for row in batch:
            if row.get("fingerprint"):
                out.add(row["fingerprint"])
        if len(batch) < 1000: break
        offset += 1000
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    params = {k: v for k, v in vars(args).items() if v is not None}

    with CrawlerRun("program_ingester_emjm", params=params) as run:
        print(f"Fetching EACEA catalogue: {CATALOGUE_URL}", flush=True)
        html = fetch(CATALOGUE_URL)
        if not html:
            print("FAILED to fetch catalogue", flush=True)
            run.summary = {"error": "catalogue fetch failed"}
            return

        programs = extract_programs_from_catalogue(html, run)
        print(f"Catalogue contains {len(programs)} programs", flush=True)
        if args.limit:
            programs = programs[: args.limit]
        run.set_total(len(programs))

        existing = fetch_existing_fingerprints() if not args.dry_run else set()
        records: list[dict] = []
        for i, p in enumerate(programs, 1):
            print(f"[{i}/{len(programs)}] {p.get('title','')[:60]}", flush=True)
            detail = extract_program_detail(p["url"], p.get("title", ""), run)
            if not detail:
                run.failed(target_url=p["url"], message="detail extraction failed")
                continue
            rec = build_record(detail)
            if rec["fingerprint"] in existing:
                print(f"  SKIP (already in catalog): {rec['program_name']}", flush=True)
                run.skipped()
                continue
            records.append(rec)
            existing.add(rec["fingerprint"])
            time.sleep(0.5)

        print(f"\n{len(records)} new EMJM records to insert", flush=True)
        if args.dry_run:
            for r in records[:8]:
                print(f"  DRY RUN: {r['program_name']} — {', '.join(r['consortium_countries'][:4])}")
            run.skipped(len(records))
            run.summary = {"would_insert": len(records), "dry_run": True}
            return

        inserted = 0
        for i in range(0, len(records), 50):
            batch = records[i:i + 50]
            r = httpx.post(
                f"{SB_URL}/rest/v1/masters_programs",
                headers=HEADERS, json=batch, timeout=60,
            )
            if r.status_code in (200, 201, 204):
                inserted += len(batch)
                run.ok(len(batch))
                print(f"  Batch {i // 50 + 1}: +{len(batch)}", flush=True)
            else:
                run.failed(len(batch), message=f"insert {r.status_code}: {r.text[:300]}")
                print(f"  INSERT FAILED: {r.status_code} {r.text[:300]}", flush=True)
        run.summary = {"catalogue_total": len(programs), "inserted": inserted}
        print(f"\nDONE: inserted {inserted} EMJM programs", flush=True)


if __name__ == "__main__":
    main()
