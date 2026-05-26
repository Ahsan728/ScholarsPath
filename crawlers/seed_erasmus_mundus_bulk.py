#!/usr/bin/env python3
"""
Seed EMJM programs using Haiku's training knowledge of the cohort
2024-2025 catalogue. One bulk LLM call → JSON array → insert.

The previous EACEA scraper was blocked by JS rendering (20 of ~150 titles
extracted, 4 of those validated). This is the fallback: ask Haiku for a
comprehensive list of programs it confidently recognises, with strict
guardrails to prevent hallucination.

Output is spot-checked, so duplicates / wrong entries can be manually
deleted from /admin/programs/issues afterwards.

Run:
  python seed_erasmus_mundus_bulk.py --dry-run
  python seed_erasmus_mundus_bulk.py            # ~$0.05
"""

import argparse
import hashlib
import os
import sys

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
EMJM_STIPEND_EUR = 33600  # €1,400/month × 24 months


def fp(name: str, country: str) -> str:
    raw = f"{name.lower().strip()}|{country.lower()}|master"
    return hashlib.sha256(raw.encode()).hexdigest()


PROMPT = """You are an expert on the Erasmus Mundus Joint Masters (EMJM) catalogue published by the EACEA (European Education and Culture Executive Agency). The current selection of EMJM programmes was published for cohort 2024-2025 and 2025-2026.

Output a JSON array of EMJM programmes you GENUINELY recognise. Do NOT invent programmes — better to return fewer than to hallucinate.

For each program, provide:
{
  "name":               "<full official name as on the EACEA catalogue>",
  "field_cluster":      "<one of: engineering, business, health, humanities, social_science, natural_science, environment, arts, law, computer_science>",
  "consortium_universities": ["University 1 (Country)", "University 2 (Country)", "..."],
  "consortium_countries":    ["Country 1", "Country 2", "..."],
  "description":        "<1-2 sentences about the program focus>",
  "consortium_homepage": "<canonical consortium website URL, e.g. https://emjm-example.eu/>"
}

Hard rules:
- Only programs from the 2024-2025 or 2025-2026 cohort that are currently accepting applications
- Use full English country names (Germany, not DE)
- Consortium universities: include at least 2; up to 6
- consortium_homepage: only include if you know the actual consortium URL; otherwise use null (do NOT guess)
- Skip programmes you only know by name without consortium details

Reply with ONLY this JSON shape, no markdown:
{
  "programs": [ ... ]
}

Aim for 30-60 programmes you can verify."""


def build_record(p: dict) -> dict:
    countries = p.get("consortium_countries") or []
    primary = countries[0] if countries else "Europe"
    # Strip country suffixes from university names if present
    unis = [u.split("(")[0].strip(" ,") for u in (p.get("consortium_universities") or [])]
    return {
        "university":      ", ".join(unis[:3]) or "Erasmus Mundus Consortium",
        "program_name":    p["name"][:300],
        "country":         primary,
        "city":            "Multiple",
        "category":        p.get("field_cluster") or "international",
        "level":           "master",
        "source_name":     "erasmus_mundus_haiku_seed",
        "source_url":      p.get("consortium_homepage") or "https://www.eacea.ec.europa.eu/scholarships/erasmus-mundus-catalogue_en",
        "apply_url":       p.get("consortium_homepage") or "https://www.eacea.ec.europa.eu/scholarships/erasmus-mundus-catalogue_en",
        "duration_years":  2,
        "tuition_usd_year": 0,
        "language":        "English",
        "ielts_min":       None,
        "gre_required":    False,
        "gpa_min":         None,
        "gpa_scale":       4.0,
        "intake":          "Annual (Sep)",
        "deadline":        None,
        "scholarship_available": True,
        "description":     (p.get("description") or f"Erasmus Mundus Joint Masters: {p['name']}")[:1000],
        "requirements":    ["EU + non-EU students eligible", "Bachelor's degree", "English proficiency"],
        "field_of_study":  [p["field_cluster"]] if p.get("field_cluster") else [],
        "qs_ranking":      None,
        "is_active":       True,
        "program_type":              "erasmus_mundus_joint",
        "consortium_universities":   unis,
        "consortium_countries":      countries,
        "emjm_scholarship_eur":      EMJM_STIPEND_EUR,
        "fingerprint":               fp(p["name"], primary),
    }


def fetch_existing_fingerprints() -> set[str]:
    out: set[str] = set()
    offset = 0
    while True:
        r = httpx.get(
            f"{SB_URL}/rest/v1/masters_programs",
            headers={"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"},
            params={"select": "fingerprint", "limit": "1000", "offset": str(offset)},
            timeout=30,
        )
        if r.status_code != 200: break
        batch = r.json() or []
        for row in batch:
            if row.get("fingerprint"): out.add(row["fingerprint"])
        if len(batch) < 1000: break
        offset += 1000
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    with CrawlerRun("emjm_haiku_seeder", params={"dry_run": args.dry_run}) as run:
        try:
            data = extract_json(
                prompt=PROMPT, run_id=run.run_id,
                max_usd_per_run=0.50, provider="anthropic",
                max_tokens=8000,
                expected_keys=("programs",), estimated_cost=0.05,
            )
        except (BudgetExceeded, SchemaInvalid) as e:
            print(f"Haiku extraction failed: {e}", flush=True)
            run.summary = {"error": str(e)}
            return

        programs = data.get("programs") or []
        # Filter out entries missing consortium data
        valid = [p for p in programs
                 if p.get("name") and p.get("consortium_universities") and p.get("consortium_countries")]
        print(f"Haiku returned {len(programs)} entries; {len(valid)} usable", flush=True)
        run.set_total(len(valid))

        existing = fetch_existing_fingerprints() if not args.dry_run else set()
        records = []
        for p in valid:
            rec = build_record(p)
            if rec["fingerprint"] in existing:
                run.skipped()
                continue
            records.append(rec)
            existing.add(rec["fingerprint"])

        if args.dry_run:
            for r in records[:8]:
                print(f"  WOULD INSERT: {r['program_name']} — {', '.join(r['consortium_countries'][:4])}")
            print(f"  ... {len(records)} total")
            run.summary = {"would_insert": len(records), "dry_run": True}
            return

        inserted = 0
        for i in range(0, len(records), 50):
            batch = records[i:i+50]
            r = httpx.post(f"{SB_URL}/rest/v1/masters_programs", headers=HEADERS, json=batch, timeout=60)
            if r.status_code in (200, 201, 204):
                inserted += len(batch); run.ok(len(batch))
                print(f"  Batch {i//50+1}: +{len(batch)}")
            else:
                run.failed(len(batch), message=f"insert {r.status_code}: {r.text[:300]}")
                print(f"  INSERT FAILED: {r.status_code} {r.text[:300]}")

        run.summary = {"haiku_returned": len(programs), "valid": len(valid), "inserted": inserted}
        print(f"\nDONE: inserted {inserted} EMJM programs")


if __name__ == "__main__":
    main()
