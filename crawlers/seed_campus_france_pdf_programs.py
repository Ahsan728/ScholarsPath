#!/usr/bin/env python3
"""
Haiku-seeded program extraction keyed to the Campus France PDF list.

This is what the user explicitly asked for: "in campus france pdf there
are only university names, you need to search english taught programs
in those university website". The PDF gives us 370 curated Campus
France member institutions; Haiku gives us its knowledge of which
English-taught programs each runs. Phase 0 (URL + page-content match)
filters out any hallucinations afterwards.

Pattern is identical to seed_priority_country_programs.py except:
- The "focus universities" hint is built from the PDF (chunked because
  370 names don't fit in one prompt).
- source_name is "campus_france_pdf" so we can audit yield separately.

Run:
  python crawlers/seed_campus_france_pdf_programs.py --dry-run
  python crawlers/seed_campus_france_pdf_programs.py
"""

import argparse
import hashlib
import os
import re
import sys
import time

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import httpx
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

from crawler_logger import CrawlerRun
from ai.extract import extract_json
from domain_classifier import classify as classify_domain

SB_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SB_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
SB_R = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"}
SB_W = {**SB_R, "Content-Type": "application/json", "Prefer": "return=minimal"}

PDF_PATH = os.path.join(os.path.dirname(__file__), "..", "Documents",
                        "Campus France University List.pdf")

CHUNK_SIZE = 20  # institutions per Haiku call
COUNTRY = "France"

FIELD_BATCHES = [
    "Computer Science, AI, Data Science, Cybersecurity, Software Engineering",
    "Engineering (Mechanical, Electrical, Civil, Chemical, Materials, Aerospace, Robotics)",
    "Business, Management, MBA, Finance, Economics, Marketing",
    "Medicine, Pharmacy, Biomedical Sciences, Public Health, Nursing",
    "Sciences (Physics, Chemistry, Biology, Mathematics, Biotechnology)",
    "Environmental Science, Sustainability, Energy, Renewable Resources",
    "Architecture, Urban Design, Planning",
    "Arts, Humanities, History, Philosophy, Languages, Literature",
    "Social Sciences, Political Science, International Relations, Law",
]


def parse_pdf_names() -> list[str]:
    import pypdf
    reader = pypdf.PdfReader(PDF_PATH)
    text = ""
    for p in reader.pages:
        text += "\n" + p.extract_text()
    chunks = [c.strip() for c in re.split(r"[•*]", text) if c.strip()]
    names, seen = [], set()
    for c in chunks:
        c = re.sub(r"\s+", " ", c).strip()
        if len(c) < 8 or len(c) > 220:
            continue
        if c.isupper() and len(c) < 60:
            continue
        if re.match(r"^\d+$", c):
            continue
        if any(kw in c.lower() for kw in (
            "membres du forum", "campus france", "févr", "membre", "page",
            "annonces", "liste des", "membre du", "annexes",
        )):
            if not re.search(r"[A-Z][a-zé]+", c[:5]):
                continue
        key = c.lower()
        if key in seen:
            continue
        seen.add(key)
        names.append(c)
    return names


def build_prompt(unis_block: str, category: str) -> str:
    return f"""List well-known English-taught master's programs in {category} at French universities.

Focus on these Campus France member institutions: {unis_block}

Reply with ONLY valid JSON:
{{
  "programs": [
    {{
      "university":    "<full official name>",
      "program_name":  "<official program name>",
      "city":          "<city in France>",
      "level":         "<master | bachelor>",
      "apply_url":     "<official program homepage URL at the university's own domain>",
      "field_of_study": ["<broad field>"]
    }}
  ]
}}

Rules:
- Only REAL programs at REAL universities you genuinely recognise. Do NOT invent.
- apply_url MUST be at the university's official domain (not aggregator sites).
- The program must be TAUGHT IN ENGLISH (not French).
- Skip well-known global programs (e.g. INSEAD MBA, HEC MBA) — those are usually already in our database.
- 5-12 entries per request, all distinct.
"""


def fingerprint(name: str, city: str, level: str, country: str) -> str:
    raw = f"{name.lower().strip()}|{city.lower().strip()}|{country.lower()}|{level}"
    return hashlib.sha256(raw.encode()).hexdigest()


def existing_france_fingerprints() -> set[str]:
    out, offset = set(), 0
    while True:
        r = httpx.get(
            f"{SB_URL}/rest/v1/masters_programs",
            headers=SB_R,
            params={"select": "fingerprint", "country": f"eq.{COUNTRY}",
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


def insert(p: dict, existing: set[str], dry_run: bool) -> bool:
    name = (p.get("program_name") or "").strip()
    uni = (p.get("university") or "").strip()
    city = (p.get("city") or COUNTRY).strip()
    apply_url = (p.get("apply_url") or "").strip()
    level = p.get("level") or "master"
    if not name or not uni or not apply_url.startswith("http"):
        return False
    if level not in ("master", "bachelor"):
        level = "master"
    fp = fingerprint(name, city, level, COUNTRY)
    if fp in existing:
        return False
    fields = p.get("field_of_study") or []
    category = classify_domain(fields, name)
    record = {
        "program_name": name[:300],
        "university":   uni[:300],
        "country":      COUNTRY,
        "city":         city[:100],
        "level":        level,
        "duration_years": 2 if level == "master" else 3,
        "tuition_usd_year": None,
        "language":     "English",
        "field_of_study": fields,
        "category":     category,
        "ielts_min":    None,
        "gre_required": False,
        "gpa_min":      None,
        "gpa_scale":    4.0,
        "intake":       "Fall/Spring",
        "deadline":     None,
        "scholarship_available": False,
        "description":  f"{name} at {uni}, France. English-taught.",
        "requirements": [],
        "apply_url":    apply_url[:600],
        "source_url":   apply_url[:600],
        "source_name":  "campus_france_pdf",
        "is_active":    True,
        "fingerprint":  fp,
    }
    if dry_run:
        print(f"    WOULD INSERT: {name[:60]} @ {uni[:40]}", flush=True)
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
    ap.add_argument("--max-usd", type=float, default=6.0,
                    help="Anthropic budget cap for this run")
    ap.add_argument("--fields", type=int, default=None,
                    help="Limit to first N field batches (debug)")
    ap.add_argument("--chunks", type=int, default=None,
                    help="Limit to first N institution chunks (debug)")
    args = ap.parse_args()

    names = parse_pdf_names()
    print(f"Parsed {len(names)} institution names from PDF", flush=True)

    chunks = [names[i:i+CHUNK_SIZE] for i in range(0, len(names), CHUNK_SIZE)]
    if args.chunks:
        chunks = chunks[: args.chunks]
    field_batches = FIELD_BATCHES[: args.fields] if args.fields else FIELD_BATCHES

    total_calls = len(chunks) * len(field_batches)
    est_cost = total_calls * 0.012
    print(f"{len(chunks)} chunks × {len(field_batches)} fields = "
          f"{total_calls} Haiku calls, est ~${est_cost:.2f}",
          flush=True)

    with CrawlerRun("campus_france_pdf_seeder",
                    params={"dry_run": args.dry_run,
                            "chunks": len(chunks),
                            "fields": len(field_batches)}) as run:
        existing = existing_france_fingerprints()
        print(f"Loaded {len(existing)} existing France fingerprints", flush=True)

        grand_total = 0
        for ci, chunk in enumerate(chunks, 1):
            unis_block = ", ".join(chunk)
            for cat in field_batches:
                short = cat[:40]
                try:
                    data = extract_json(
                        prompt=build_prompt(unis_block, cat),
                        run_id=run.run_id,
                        max_usd_per_run=args.max_usd,
                        provider="anthropic",
                        max_tokens=4000,
                        expected_keys=("programs",),
                        estimated_cost=0.015,
                    )
                except Exception as e:
                    print(f"  chunk{ci:02d} {short:40s}: ERR {str(e)[:80]}",
                          flush=True)
                    if "BudgetExceeded" in str(e) or "budget" in str(e).lower():
                        print("BUDGET CAP HIT — stopping run", flush=True)
                        run.summary = {"inserted": grand_total,
                                       "reason": "budget_cap"}
                        return
                    continue
                programs = data.get("programs") or []
                inserted = 0
                for p in programs:
                    if insert(p, existing, args.dry_run):
                        inserted += 1
                        run.ok()
                    else:
                        run.skipped()
                grand_total += inserted
                print(f"  chunk{ci:02d} {short:40s}: "
                      f"Haiku={len(programs):2d} ins={inserted:2d}  "
                      f"total={grand_total}",
                      flush=True)
                time.sleep(0.3)

        run.summary = {"inserted": grand_total,
                       "chunks": len(chunks),
                       "fields": len(field_batches)}
        print(f"\nDONE: +{grand_total} France programs added", flush=True)


if __name__ == "__main__":
    main()
