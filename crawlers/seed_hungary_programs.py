#!/usr/bin/env python3
"""
Curated Hungary masters/bachelor seeding via Haiku knowledge.

Hungary is the user's weakest priority country (~70 programs vs Germany's
2,200+). Hungarian universities (ELTE, BME, CEU, Szeged, Debrecen,
Corvinus, Semmelweis, Pécs) all have well-known English-taught programs
that Haiku recognizes by name. Pattern mirrors crawlers/seed_curated_csai.py.

Strict prompt: 'do NOT invent — only well-known programs'. All inserts
go through Phase 0 gates afterwards.

Run:
  python crawlers/seed_hungary_programs.py
"""

import os
import sys
import time
import hashlib

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

# Field batches — broad enough that Haiku finds many; narrow enough to
# keep one Haiku call per call ($0.03 cost cap).
BATCHES = [
    "Engineering, Computer Science, AI, Software, Cybersecurity, Data Science",
    "Business, Management, Finance, Economics, MBA, Marketing",
    "Medicine, Health Sciences, Pharmacy, Nursing, Public Health",
    "Sciences (Physics, Chemistry, Biology, Mathematics, Biotechnology)",
    "Architecture, Urban Design, Civil Engineering",
    "Arts, Humanities, Languages, Social Sciences, Law, Political Science",
    "Environmental Sciences, Sustainability, Energy",
]

# Well-known Hungarian universities to focus the prompt
UNIS_HINT = (
    "Eötvös Loránd University (ELTE), Budapest University of Technology and "
    "Economics (BME), Central European University (CEU), University of Szeged, "
    "University of Debrecen, Corvinus University of Budapest, Semmelweis "
    "University, University of Pécs, University of Miskolc, Óbuda University, "
    "Pannon University, Pázmány Péter Catholic University, Hungarian "
    "University of Agriculture and Life Sciences (MATE), Andrássy University, "
    "Moholy-Nagy University of Art and Design (MOME)."
)


def build_prompt(category: str) -> str:
    return f"""List well-known English-taught master's or bachelor's programs in {category} at Hungarian universities.

Universities to consider: {UNIS_HINT}

Reply with ONLY valid JSON:
{{
  "programs": [
    {{
      "university": "<full official name>",
      "program_name": "<official program name>",
      "city": "<Budapest, Szeged, Debrecen, Pécs, etc.>",
      "level": "<master | bachelor>",
      "apply_url": "<official program homepage URL>",
      "field_of_study": ["<broad field>", "..."]
    }}
  ]
}}

Rules:
- Only REAL programs at REAL Hungarian universities. Do NOT invent.
- Each program must have an official apply_url at the university's own
  domain (e.g. elte.hu, bme.hu, ceu.edu).
- 10-15 entries per request, all distinct.
"""


def fingerprint(name: str, city: str, level: str) -> str:
    raw = f"{name.lower().strip()}|{city.lower().strip()}|hungary|{level}"
    return hashlib.sha256(raw.encode()).hexdigest()


def existing_fingerprints() -> set[str]:
    out = set()
    offset = 0
    while True:
        r = httpx.get(
            f"{SB_URL}/rest/v1/masters_programs",
            headers=SB_R,
            params={"select": "fingerprint", "country": "eq.Hungary",
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


def insert(p: dict, existing: set[str]) -> bool:
    name = (p.get("program_name") or "").strip()
    uni = (p.get("university") or "").strip()
    city = (p.get("city") or "Budapest").strip()
    apply_url = (p.get("apply_url") or "").strip()
    level = p.get("level") or "master"
    if not name or not uni or not apply_url.startswith("http"):
        return False
    if level not in ("master", "bachelor"):
        level = "master"
    fp = fingerprint(name, city, level)
    if fp in existing:
        return False
    fields = p.get("field_of_study") or []
    category = classify_domain(fields, name)
    record = {
        "program_name": name[:300],
        "university":   uni[:300],
        "country":      "Hungary",
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
        "description":  f"{name} at {uni}, Hungary. English-taught.",
        "requirements": [],
        "apply_url":    apply_url[:600],
        "source_url":   apply_url[:600],
        "source_name":  "curated_hungary",
        "is_active":    True,
        "fingerprint":  fp,
    }
    r = httpx.post(f"{SB_URL}/rest/v1/masters_programs",
                   headers=SB_W, json=record, timeout=15)
    if r.status_code in (200, 201, 204):
        existing.add(fp)
        return True
    return False


def main():
    with CrawlerRun("curated_hungary_seeder") as run:
        existing = existing_fingerprints()
        print(f"Existing HU fingerprints: {len(existing)}", flush=True)
        total = 0
        for cat in BATCHES:
            print(f"\n=== {cat[:60]}... ===", flush=True)
            try:
                data = extract_json(
                    prompt=build_prompt(cat),
                    run_id=run.run_id,
                    max_usd_per_run=2.0,
                    provider="anthropic",
                    max_tokens=4000,
                    expected_keys=("programs",),
                    estimated_cost=0.03,
                )
            except Exception as e:
                print(f"  ERR {e}", flush=True)
                continue
            programs = data.get("programs") or []
            inserted = 0
            for p in programs:
                if insert(p, existing):
                    inserted += 1
                    run.ok()
                else:
                    run.skipped()
            print(f"  Haiku returned {len(programs)}, inserted {inserted}", flush=True)
            total += inserted
            time.sleep(0.5)
        run.summary = {"total": total, "batches": len(BATCHES)}
        print(f"\nDONE: {total} new Hungary programs inserted", flush=True)


if __name__ == "__main__":
    main()
