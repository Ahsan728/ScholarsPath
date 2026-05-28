#!/usr/bin/env python3
"""Seed real PhD / postdoc / fellowship / internship / grant opportunities
across Europe using Haiku knowledge. Goes into discovered_opportunities.

Strict prompt: don't invent. Only well-known programs."""

import os, sys, time, hashlib, httpx
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from dotenv import load_dotenv
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

from crawler_logger import CrawlerRun
from ai.extract import extract_json

SB_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SB_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
SB_H   = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}",
          "Content-Type": "application/json", "Prefer": "return=minimal"}

BATCHES = [
    ("phd",        "PhD positions / doctoral scholarships in Europe (DAAD, MSCA-DN, IMPRS, FWO, ÖAW, GSSI, etc.)"),
    ("postdoc",    "Postdoctoral fellowships in Europe (MSCA postdoc, Humboldt, EMBO, Newton, Marie Curie, Branco Weiss, HFSP, Walter Benjamin)"),
    ("fellowship", "Research fellowships in Europe (Schwarzman, Rhodes, Fulbright, Chevening, Carlo Schmid, Erasmus Mundus, ERC)"),
    ("internship", "Internships in Europe (CERN summer student, Max Planck internships, ECMWF, EMBL, EPFL, JRC, IBS, ESA internships)"),
    ("grant",      "Research grants in Europe (ERC Starting/Consolidator/Advanced, Volkswagen Foundation, Wellcome, AXA Research Fund)"),
]

def build_prompt(category: str, description: str) -> str:
    return f"""List well-known {description}. Each entry must be a REAL program you genuinely recognise.

Reply with ONLY valid JSON:
{{
  "opportunities": [
    {{
      "type": "{category}",
      "title": "<distinctive name, e.g. 'DAAD Research Grant for Doctoral Candidates'>",
      "description": "<1-2 sentences, what it covers + who it's for>",
      "country": "<country name or 'Europe' for pan-EU>",
      "degree_level": "<undergraduate | masters | phd | postdoc | any>",
      "field_of_study": ["<broad field or 'All Fields'>"],
      "amount_text": "<verbatim funding string, e.g. '€2,300/month stipend'>",
      "funding_type": "<full | partial | stipend | salary>",
      "eligibility_text": "<short eligibility>",
      "apply_url": "<official URL>"
    }}
  ]
}}

Rules:
- 15-25 entries, all REAL programs you recognise.
- Do NOT invent — better to return fewer than to hallucinate.
- apply_url must be the official program homepage."""


def main():
    with CrawlerRun("opportunity_haiku_seeder") as run:
        total = 0
        for cat, desc in BATCHES:
            print(f"\n=== {cat.upper()} ===")
            try:
                data = extract_json(
                    prompt=build_prompt(cat, desc),
                    run_id=run.run_id,
                    max_usd_per_run=1.0,
                    provider="anthropic",
                    max_tokens=6000,
                    expected_keys=("opportunities",),
                    estimated_cost=0.03,
                )
            except Exception as e:
                print(f"  ERROR: {e}")
                continue

            opps = data.get("opportunities") or []
            print(f"  Haiku returned {len(opps)} {cat}s")
            inserted = 0
            for o in opps:
                title = (o.get("title") or "").strip()
                country = (o.get("country") or "Europe").strip()
                if not title:
                    continue

                # Dedup check
                ex = httpx.get(
                    f"{SB_URL}/rest/v1/discovered_opportunities",
                    headers={"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"},
                    params={"select": "id", "title": f"ilike.{title[:60]}%",
                            "country": f"eq.{country}", "limit": "1"},
                    timeout=10,
                )
                if ex.json():
                    continue

                ch = hashlib.sha256(f"{title}|{country}|{cat}".encode()).hexdigest()
                record = {
                    "source_id": None,
                    "source_url": o.get("apply_url") or "",
                    "run_id": run.run_id,
                    "prompt_version": "haiku-seed-v1",
                    "content_hash": ch,
                    "type": cat,
                    "title": title[:300],
                    "description": (o.get("description") or "")[:2000] or None,
                    "country": country,
                    "degree_level": o.get("degree_level") or "any",
                    "field_of_study": o.get("field_of_study") or [],
                    "amount_text": (o.get("amount_text") or "")[:300] or None,
                    "funding_type": o.get("funding_type") or None,
                    "eligibility_text": (o.get("eligibility_text") or "")[:1000] or None,
                    "apply_url": o.get("apply_url") or "",
                }
                r = httpx.post(
                    f"{SB_URL}/rest/v1/discovered_opportunities",
                    headers=SB_H, json=record, timeout=15,
                )
                if r.status_code in (200, 201, 204):
                    inserted += 1
                    run.ok()
                else:
                    print(f"  FAIL {r.status_code}: {r.text[:150]}")

            print(f"  Inserted: {inserted}")
            total += inserted
            time.sleep(0.5)

        run.summary = {"total": total, "categories": [b[0] for b in BATCHES]}
        print(f"\nDONE: {total} opportunities seeded across {len(BATCHES)} categories")


if __name__ == "__main__":
    main()
