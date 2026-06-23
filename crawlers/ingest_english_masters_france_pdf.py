#!/usr/bin/env python3
"""
Parse Documents/English_Masters_France_2025_26.pdf — a 17-page curated
student guide listing English-taught master's programs at 18 top French
public universities and Grandes Écoles for 2025–26.

PDF structure (consistent across blocks):

    Université PSL (Paris Sciences & Lettres)
    Public Collegiate University · Paris | QS #28 · ...
    [block of metadata: tuition, IELTS, deadline, etc.]
    Sample English-Taught Master's Programs:
    MSc Data Science (MINES ParisTech) English · Highly competitive
    MSc Artificial Intelligence (ENS) English
    ...
    psl.eu
    [next university...]

We split on the uni name + 'Public/Private/Grande École' header pair,
extract the bulleted programs, and insert each as a France master with
the block's homepage URL as apply_url. Most programs will dedup against
existing France rows; Phase 0 will hide rows where the homepage URL
doesn't actually contain the program name (the expected case for many
of these — the homepage is the only URL the PDF gives us).

Run:
  python crawlers/ingest_english_masters_france_pdf.py --dry-run
  python crawlers/ingest_english_masters_france_pdf.py
"""

import argparse
import hashlib
import os
import re
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import httpx
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

from crawler_logger import CrawlerRun
from domain_classifier import classify as classify_domain

SB_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SB_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
SB_R = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"}
SB_W = {**SB_R, "Content-Type": "application/json", "Prefer": "return=minimal"}

PDF = os.path.join(os.path.dirname(__file__), "..", "Documents",
                   "English_Masters_France_2025_26.pdf")

# Header that immediately follows each uni name — used to anchor the
# split. The PDF uses a small set of phrasings.
HEADER_RE = re.compile(
    r'\n([A-ZÉ][^\n]{2,80})\n'
    r'((?:Public Collegiate[^\n]+|Public Engineering[^\n]+|'
    r'Public Research[^\n]+|Public Grande [^\n]+|Public Grand [^\n]+|'
    r'Private Business[^\n]+|Private Grande [^\n]+|'
    r'Public Grande École[^\n]+|Private Grande École[^\n]+))'
)
# Degree marker at the start of a program line
PROG_RE = re.compile(
    r'^(MSc|MS|MA|LLM|MBA|MEng|MPhil|MPA|MFin|MIM|Master|MASt)\s+'
    r'(.+?)$', re.M
)
# Homepage URL near the end of each block: bare domain.fr / domain.eu
HOMEPAGE_RE = re.compile(
    r'\b([a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*\.(?:fr|eu|com|edu|org|net))\b',
    re.I
)
PROG_SAMPLE_HEADER = "Sample English-Taught Master's Programs"


def parse_pdf() -> list[dict]:
    import pypdf
    reader = pypdf.PdfReader(PDF)
    text = ""
    for p in reader.pages:
        text += "\n" + p.extract_text()

    blocks: list[dict] = []
    matches = list(HEADER_RE.finditer(text))
    for i, m in enumerate(matches):
        name = m.group(1).strip()
        header = m.group(2).strip()
        # Block body = text from end of header to start of next match
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        body = text[start:end]
        # City from header — between "· " and "|"
        city_m = re.search(r"·\s*([^|·]+?)\s*(?:\|)", header)
        city = (city_m.group(1).strip()
                if city_m else "Paris").split(",")[0].split("&")[0].strip()
        # Homepage URL — must contain at least one distinctive token
        # from the uni name (so we don't bind 'EDHEC' to 'em-lyon.com'
        # or 'GEM' to 'service-public.fr'). If no anchored match, leave
        # homepage=None and let the block fail-skip cleanly.
        urls = HOMEPAGE_RE.findall(body)
        urls = [u for u in urls
                if not any(skip in u.lower()
                           for skip in ("erasmus", "diplomatie", "campusfrance",
                                        "france-visas", "ec.europa.eu",
                                        "service-public", "etudiants",
                                        "etudier", "ameli", "interieur"))]
        # Strip accents-ish for token matching, lowercase the name
        norm_name = (name.lower()
                     .replace("é","e").replace("è","e").replace("ê","e")
                     .replace("à","a").replace("â","a").replace("ô","o")
                     .replace("î","i").replace("ç","c").replace("ù","u"))
        name_toks = {t for t in re.findall(r"[a-z0-9]+", norm_name)
                     if len(t) >= 3
                     and t not in ("the", "university", "universite",
                                   "school", "business", "institut",
                                   "ecole", "grande", "grand", "paris",
                                   "and", "for", "des", "les")}
        anchored = None
        for u in urls:
            host = u.lower()
            if any(tok in host for tok in name_toks):
                anchored = u  # last anchored wins (closer to end of block)
        homepage = anchored
        # Programs — only between the "Sample English-Taught Master's
        # Programs" header and the end of block
        prog_block = body
        idx = body.lower().find(PROG_SAMPLE_HEADER.lower())
        if idx >= 0:
            prog_block = body[idx + len(PROG_SAMPLE_HEADER):]
        programs: list[str] = []
        for pm in PROG_RE.finditer(prog_block):
            degree = pm.group(1).strip()
            rest = pm.group(2).strip()
            # Strip trailing qualifier (everything after the last
            # standalone 'English' marker)
            rest = re.split(r"\bEnglish\b", rest, maxsplit=1)[0].strip()
            rest = rest.rstrip(" ·-|")
            if not rest or len(rest) < 3:
                continue
            if len(rest) > 160:
                continue
            # Skip fee/duration metadata lines that happen to start
            # with 'MBA' or 'MSc' but describe COSTS, not the program
            # (e.g. 'MBA €57,000 total · 1 year · Paris campus').
            if any(c in rest for c in ("€", "$", "£")):
                continue
            if re.search(r"\d+[\.,]?\d*\s*(year|years|month|months|campus|"
                         r"semester|hr|hours|total|\/yr)\b",
                         rest, re.I):
                continue
            programs.append(f"{degree} {rest}")
        if not programs:
            continue
        blocks.append({
            "name": name,
            "city": city or "France",
            "homepage": homepage,
            "programs": programs,
        })
    return blocks


def fingerprint(name: str, city: str, level: str, country: str) -> str:
    raw = (f"{name.lower().strip()}|{city.lower().strip()}|"
           f"{country.lower()}|{level}")
    return hashlib.sha256(raw.encode()).hexdigest()


def existing_france_fingerprints() -> set[str]:
    out, offset = set(), 0
    while True:
        r = httpx.get(
            f"{SB_URL}/rest/v1/masters_programs",
            headers=SB_R,
            params={"select": "fingerprint", "country": "eq.France",
                    "limit": "1000", "offset": str(offset)},
            timeout=20,
        )
        rows = r.json() if r.status_code == 200 else []
        for row in rows:
            f = row.get("fingerprint")
            if f: out.add(f)
        if len(rows) < 1000: break
        offset += 1000
    return out


def insert(uni: str, city: str, homepage: str, prog: str,
           existing: set[str], dry_run: bool) -> bool:
    name = prog.strip()
    if not name or len(name) < 4:
        return False
    fp = fingerprint(name, city, "master", "France")
    if fp in existing:
        return False
    apply_url = f"https://www.{homepage}" if homepage else None
    if not apply_url:
        return False
    category = classify_domain([], name)
    record = {
        "program_name": name[:300],
        "university":   uni[:300],
        "country":      "France",
        "city":         city[:100],
        "level":        "master",
        "duration_years": 2,
        "tuition_usd_year": None,
        "language":     "English",
        "field_of_study": [],
        "category":     category,
        "ielts_min":    None,
        "gre_required": False,
        "gpa_min":      None,
        "gpa_scale":    4.0,
        "intake":       "Fall",
        "deadline":     None,
        "scholarship_available": False,
        "description":  f"{name} at {uni}, France. English-taught.",
        "requirements": [],
        "apply_url":    apply_url[:600],
        "source_url":   apply_url[:600],
        "source_name":  "english_masters_france_pdf",
        "is_active":    True,
        "fingerprint":  fp,
    }
    if dry_run:
        print(f"    WOULD INSERT: {name[:55]:55s} @ {uni[:30]}", flush=True)
        existing.add(fp)
        return True
    r = httpx.post(f"{SB_URL}/rest/v1/masters_programs",
                   headers=SB_W, json=record, timeout=15)
    if r.status_code in (200, 201, 204):
        existing.add(fp)
        return True
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    blocks = parse_pdf()
    total_progs = sum(len(b["programs"]) for b in blocks)
    print(f"Parsed {len(blocks)} university blocks, "
          f"{total_progs} program lines",
          flush=True)

    with CrawlerRun("english_masters_france_pdf_ingest",
                    params={"dry_run": args.dry_run}) as run:
        existing = existing_france_fingerprints()
        print(f"Existing France fingerprints: {len(existing)}", flush=True)

        added = 0
        for b in blocks:
            print(f"\n=== {b['name'][:60]} ({len(b['programs'])} progs) "
                  f"→ {b['homepage']} ===", flush=True)
            inserted = 0
            for prog in b["programs"]:
                if insert(b["name"], b["city"], b["homepage"], prog,
                          existing, args.dry_run):
                    inserted += 1
                    run.ok()
                else:
                    run.skipped()
            added += inserted
            print(f"  +{inserted} new (of {len(b['programs'])})", flush=True)

        run.summary = {"blocks": len(blocks), "programs_total": total_progs,
                       "added": added}
        print(f"\nDONE: +{added} programs added from PDF "
              f"(of {total_progs} parsed)", flush=True)


if __name__ == "__main__":
    main()
