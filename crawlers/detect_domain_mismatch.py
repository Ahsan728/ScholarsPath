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
import json
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


# ── Curated alias map (uni name substring → list of host tokens) ──
def _load_aliases() -> list[dict]:
    path = os.path.join(os.path.dirname(__file__), "uni_aliases.json")
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        out = []
        for entry in data.get("aliases", []):
            uc = (entry.get("uni_contains") or "").lower().strip()
            hosts = [h.lower() for h in (entry.get("hosts") or []) if h]
            if uc and hosts:
                out.append({"uc": uc, "hosts": hosts})
        return out
    except FileNotFoundError:
        return []
    except Exception as e:
        print(f"  WARN failed to load uni_aliases.json: {e}", flush=True)
        return []


ALIASES = _load_aliases()


def alias_match(host: str, university: str) -> bool:
    """True if the curated map links this university to this host."""
    uni_low = (university or "").lower()
    host_low = (host or "").lower()
    for a in ALIASES:
        if a["uc"] in uni_low:
            for h in a["hosts"]:
                # match as full token or substring of the host
                if h == host_low or h in host_low.split(".") or h in host_low:
                    return True
    return False


def initialism_match(host_tok: set[str], uni_full_tok: list[str],
                     uni_sig_tok: list[str]) -> bool:
    """
    Build initialism candidates from the university name and check if any
    host token matches. Tries:
      - Significant tokens only (e.g. "Ludwig-Maximilians-Universität München"
        sig-only → "LMM" — won't help)
      - Significant + "u" suffix for "X University" pattern (Lund → LU)
      - FULL tokens including stop words ("Aalborg University" → "AU";
        "Wageningen University Research" → "WUR")
      - First letter doubled for single-word names + "u" ("Aalborg University"
        → "AAU" — Danish convention)
      - First two letters of significant token + "u" ("Aalborg" → "AAU"
        as another route)

    Catches: AAU (Aalborg University), AU (Aarhus University),
    LU (Lund University), UU (Uppsala University), TU + city, WUR
    (Wageningen University & Research), CBS (Copenhagen Business School),
    BME (Budapest University of Technology and Economics), etc.
    """
    candidates: set[str] = set()

    if uni_sig_tok:
        # 1. Just significant tokens
        candidates.add("".join(t[0] for t in uni_sig_tok))
        candidates.add("".join(t[0] for t in sorted(uni_sig_tok)))
        # 2. Significant tokens + "u" (the University)
        candidates.add("".join(t[0] for t in uni_sig_tok) + "u")
        # 3. Single-word + duplicated first letter + "u"  (Aalborg → AAU)
        if len(uni_sig_tok) == 1 and len(uni_sig_tok[0]) >= 2:
            candidates.add(uni_sig_tok[0][0] * 2 + "u")
            candidates.add(uni_sig_tok[0][:2] + "u")

    if uni_full_tok:
        # 4. Initialism from the full name (including stop words like "of",
        #    "and", "university") — this covers the most natural patterns
        candidates.add("".join(t[0] for t in uni_full_tok))
        # 5. Same, dropping leading "the"
        if uni_full_tok and uni_full_tok[0] == "the":
            candidates.add("".join(t[0] for t in uni_full_tok[1:]))

    candidates = {c for c in candidates if 2 <= len(c) <= 6}
    if not candidates:
        return False

    for h in host_tok:
        if h in candidates:
            return True
        # Allow host to be a candidate with extra suffix/prefix glyphs
        # ("aau" matches host "aaudk" or "aau1") and the reverse for
        # hosts that wrap the acronym ("unimi" contains "uni").
        for c in candidates:
            if len(c) >= 2:
                if h == c or (len(h) >= len(c) and (h.startswith(c) or h.endswith(c))):
                    return True
    return False


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

    # Curated alias map first — fastest, highest precision.
    if alias_match(host, university):
        return ("match", host)

    uni_tok_set = uni_tokens(university)
    if not uni_tok_set:
        # No university listed → can't judge → call it a match (don't flag)
        return ("match", host)
    host_tok = host_tokens(host)
    if not host_tok:
        return ("mismatch", host)

    # Direct token overlap (e.g. "wageningen" appears in "wageningenur.nl").
    big_uni_toks = [t for t in uni_tok_set if len(t) >= 4]
    for t in big_uni_toks:
        for h in host_tok:
            if t == h or (len(t) >= 5 and t in h) or (len(h) >= 5 and h in t):
                return ("match", host)

    # Initialism fallback — needs the ORIGINAL order, not the set, so rebuild
    # from the lowercased name in insertion order. We pass BOTH the full
    # token list (incl. stop words) and the significant-only list, so the
    # initialism builder can try "Aalborg University" → "AU" using the full
    # tokens, and "Wageningen University Research" → "WUR" using either.
    lower_name = (university or "").lower()
    uni_full_ordered = [t for t in re.findall(r"[a-z0-9]+", lower_name) if len(t) > 1]
    uni_sig_ordered  = [t for t in uni_full_ordered if len(t) > 2 and t not in STOP_WORDS]
    if initialism_match(host_tok, uni_full_ordered, uni_sig_ordered):
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
