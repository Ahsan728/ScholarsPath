#!/usr/bin/env python3
"""
Phase 2: detect programs whose apply_url host has no meaningful relation
to the listed university. Pure offline check — no HTTP, no AI.

Writes domain_match_status to masters_programs:
  match       — host shares tokens with university name (or no uni listed)
  mismatch    — definite mismatch (most likely wrong listing)
  aggregator  — apply_url points to a known aggregator domain
  no_url      — apply_url empty or invalid

Run:
  cd crawlers
  python detect_domain_mismatch.py                  # all programs
  python detect_domain_mismatch.py --limit 500      # test
  python detect_domain_mismatch.py --country Germany
  python detect_domain_mismatch.py --refresh        # ignore prior checks
"""

import argparse
import os
import re
import sys
import time
from datetime import datetime, timezone
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

# Common aggregator hosts — match against URL host (substring check)
AGGREGATORS = [
    "mastersportal", "bachelorsportal", "phdportal", "studyportals",
    "findamasters", "topuniversities", "study.eu", "studyeu",
    "educations.com", "shiksha", "hotcourses", "idp.com",
    "ambitio", "weuni", "unischolars", "studyanywhere", "stuudy",
    "aeccglobal", "applyboard", "gradireland", "studyabroad",
    "find-masters", "mim-guide", "best-masters", "master-and-more",
    "edurank", "expatrio", "go.study", "gostudyin",
    "qs.com", "timeshighereducation", "usnews.com", "niche.com",
    "phdmap", "studymatch", "studyqa", "edmun.do",
    "studentum", "courses.ie", "find-phd", "scholarshipportal",
    "phdstudies", "masterstudies", "academiccourses",
]

STOP_WORDS = {
    "the", "of", "and", "in", "at", "for", "an", "le", "la", "de",
    "des", "du", "il", "der", "die", "das", "el", "los",
    "university", "universite", "universita", "universidad",
    "universitat", "universidade", "universiteit", "uniwersytet",
    "egyetem", "polytechnic", "polytechnique", "institute",
    "school", "college", "technische", "hochschule", "fakultet",
    "fakultas", "facultad", "faculty", "department", "national",
    "international", "applied", "sciences", "science", "research",
}

# host TLDs / generic tokens we never want to use for matching
HOST_NOISE = {
    "www", "com", "org", "net", "edu", "ac", "uk", "eu", "de", "fr",
    "it", "es", "nl", "be", "se", "no", "fi", "dk", "pl", "hu", "cz",
    "pt", "ie", "ch", "at", "gov", "info", "co", "io",
}


def host_of(url: str) -> str:
    try:
        h = urlparse(url).hostname
        if not h:
            return ""
        return h.lower().lstrip(".").removeprefix("www.")
    except Exception:
        return ""


def uni_tokens(name: str) -> set[str]:
    """Significant tokens from a university name."""
    if not name:
        return set()
    toks = re.findall(r"[a-z0-9]+", name.lower())
    return {t for t in toks if len(t) > 2 and t not in STOP_WORDS}


def host_tokens(host: str) -> set[str]:
    return {t for t in re.findall(r"[a-z0-9]+", host) if t not in HOST_NOISE}


def is_aggregator(host: str) -> bool:
    return any(agg in host for agg in AGGREGATORS)


def classify(apply_url: str, university: str) -> tuple[str, str]:
    """Returns (status, host). status ∈ {match, mismatch, aggregator, no_url}."""
    if not apply_url or not apply_url.startswith(("http://", "https://")):
        return ("no_url", "")
    host = host_of(apply_url)
    if not host:
        return ("no_url", "")
    if is_aggregator(host):
        return ("aggregator", host)

    uni_tok = uni_tokens(university)
    if not uni_tok:
        # No university listed → can't judge → call it a match (don't flag)
        return ("match", host)
    host_tok = host_tokens(host)
    if not host_tok:
        return ("mismatch", host)

    # An institutional acronym in the host (e.g. "tum.de" for "Technische
    # Universität München") is a valid match even if no full token overlaps.
    # We pick this up by checking 2–4 letter substrings of the host against
    # the first letters of significant university tokens.
    big_uni_toks = [t for t in uni_tok if len(t) >= 4]
    for t in big_uni_toks:
        for h in host_tok:
            if t == h or (len(t) >= 5 and t in h) or (len(h) >= 5 and h in t):
                return ("match", host)

    # Acronym fallback (e.g. "tum" ⊂ "tum.de", "kth" ⊂ "kth.se")
    acronym = "".join(t[0] for t in sorted(uni_tok) if t not in HOST_NOISE)
    if len(acronym) >= 2:
        for h in host_tok:
            if 2 <= len(h) <= 6 and h in acronym:
                return ("match", host)

    return ("mismatch", host)


def fetch_programs(args) -> list[dict]:
    """Page through masters_programs with optional filters."""
    select = "id,apply_url,university,country,domain_match_status,domain_match_checked_at"
    base = f"{SB_URL}/rest/v1/masters_programs?select={select}"
    filters = []
    if args.country:
        filters.append(f"country=eq.{args.country}")
    if not args.refresh:
        filters.append("domain_match_status=is.null")

    rows: list[dict] = []
    page_size = 1000
    offset = 0
    while True:
        url = base + ("&" + "&".join(filters) if filters else "")
        url += f"&order=id.asc&limit={page_size}&offset={offset}"
        r = httpx.get(url, headers=SB_HEADERS, timeout=60)
        if r.status_code != 200:
            print(f"fetch error: {r.status_code} {r.text[:200]}", flush=True)
            break
        batch = r.json()
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
        if args.limit and len(rows) >= args.limit:
            rows = rows[: args.limit]
            break
    return rows


def update_program(program_id: str, status: str, host: str) -> bool:
    body = {
        "domain_match_status": status,
        "domain_match_host": host or None,
        "domain_match_checked_at": datetime.now(timezone.utc).isoformat(),
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
                    help="re-classify all programs, ignoring prior domain_match_status")
    args = ap.parse_args()

    params = {k: v for k, v in vars(args).items() if v is not None}

    with CrawlerRun("domain_mismatch_detector", params=params) as run:
        programs = fetch_programs(args)
        run.set_total(len(programs))
        print(f"classifying {len(programs)} programs...", flush=True)

        counts = {"match": 0, "mismatch": 0, "aggregator": 0, "no_url": 0}
        for i, p in enumerate(programs, 1):
            status, host = classify(p.get("apply_url") or "", p.get("university") or "")
            ok = update_program(p["id"], status, host)
            if ok:
                if status == "match":
                    run.ok()
                else:
                    # Not a failure per se — just a flagged item. Still log it
                    # so admin can see examples in /admin/crawlers events.
                    run.failed(
                        target_id=p["id"],
                        target_url=p.get("apply_url"),
                        message=f"{status}: host='{host}' vs university='{p.get('university')}'",
                    )
            else:
                run.failed(target_id=p["id"], message="DB update failed")

            counts[status] = counts.get(status, 0) + 1
            if i % 200 == 0 or i == len(programs):
                print(f"  [{i}/{len(programs)}] {counts}", flush=True)

        run.summary = counts
        print(f"\nDONE: {counts}", flush=True)


if __name__ == "__main__":
    main()
