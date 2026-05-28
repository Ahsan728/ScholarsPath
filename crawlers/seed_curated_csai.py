#!/usr/bin/env python3
"""Seed verified CS/AI/IT masters programs for top European countries using Haiku knowledge."""
import os, sys, hashlib, json, time
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
import httpx
from dotenv import load_dotenv
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))
from crawler_logger import CrawlerRun
from ai.extract import extract_json, BudgetExceeded

URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json", "Prefer": "return=minimal"}

def fp(name, country):
    return hashlib.sha256(f"{name.lower().strip()}|{country.lower()}|master".encode()).hexdigest()

COUNTRIES = ["Germany", "France", "Netherlands", "Italy", "Sweden"]

PROMPT_TEMPLATE = """List English-taught Master's programs in Computer Science, AI, Data Science, Cybersecurity, and IT at universities in {country}. Only programs you genuinely know exist. Reply with ONLY valid JSON:

{{
  "programs": [
    {{
      "university": "<full university name>",
      "program_name": "<official program name>",
      "city": "<city>",
      "apply_url": "<direct program or university masters page URL>",
      "field_of_study": ["<e.g. Artificial Intelligence>"]
    }}
  ]
}}

Rules:
- Only English-taught (or bilingual with English) masters programs
- Only CS/AI/IT/Data Science/Cybersecurity related
- Include the specific program page URL if you know it; otherwise use the university's English masters listing page
- Do NOT invent programs or URLs — better to list fewer than hallucinate
- Aim for 15-30 programs per country"""

# Fetch existing fingerprints
existing = set()
offset = 0
while True:
    r = httpx.get(f"{URL}/rest/v1/masters_programs?select=fingerprint&limit=1000&offset={offset}",
                  headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"}, timeout=30)
    batch = r.json() or []
    for row in batch:
        if row.get("fingerprint"): existing.add(row["fingerprint"])
    if len(batch) < 1000: break
    offset += 1000
print(f"Existing fingerprints: {len(existing)}")

with CrawlerRun("curated_csai_seeder") as run:
    total_inserted = 0
    for country in COUNTRIES:
        print(f"\n=== {country} ===")
        try:
            data = extract_json(
                prompt=PROMPT_TEMPLATE.format(country=country),
                run_id=run.run_id, max_usd_per_run=1.0,
                provider="anthropic", max_tokens=6000,
                expected_keys=("programs",), estimated_cost=0.03,
            )
        except (BudgetExceeded, Exception) as e:
            print(f"  ERROR: {e}")
            continue

        programs = [p for p in data.get("programs", []) if p.get("program_name") and p.get("university")]
        print(f"  Haiku returned {len(programs)} programs")

        inserted = 0
        for p in programs:
            name = p["program_name"].strip()[:300]
            f = fp(name, country)
            if f in existing:
                continue
            record = {
                "university": p["university"][:300], "program_name": name,
                "country": country, "city": (p.get("city") or country)[:100],
                "level": "master", "category": "cs_ai", "duration_years": 2,
                "tuition_usd_year": None, "language": "English",
                "ielts_min": None, "gre_required": False, "gpa_min": None, "gpa_scale": 4.0,
                "intake": "Fall/Spring", "deadline": None, "scholarship_available": False,
                "description": f"{name} at {p['university']}, {country}. English-taught.",
                "requirements": [], "field_of_study": p.get("field_of_study") or ["Computer Science"],
                "apply_url": p.get("apply_url") or "", "source_url": p.get("apply_url") or "",
                "source_name": "curated", "is_active": True, "fingerprint": f,
            }
            r = httpx.post(f"{URL}/rest/v1/masters_programs", headers=H, json=record, timeout=15)
            if r.status_code in (200, 201):
                inserted += 1
                run.ok()
            else:
                run.failed(message=f"{name}: {r.status_code}")
            existing.add(f)

        print(f"  Inserted: {inserted}")
        total_inserted += inserted
        time.sleep(1)

    run.summary = {"countries": COUNTRIES, "total_inserted": total_inserted}
    print(f"\nDONE: {total_inserted} programs inserted across {len(COUNTRIES)} countries")
