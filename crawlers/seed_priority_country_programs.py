#!/usr/bin/env python3
"""
Curated seed for the user's priority countries that are weakest on
PhD coverage: focused Haiku passes for English-taught PhD/postdoc
programs (not master programs — those are well-covered).

Pattern mirrors crawlers/seed_curated_csai.py +
crawlers/seed_hungary_programs.py. Strict prompt, no invention.

Run:
  python crawlers/seed_priority_country_programs.py
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

# Per-country focused seeding. The hint lists the most prominent
# universities so Haiku doesn't invent programs at unknown ones.
COUNTRIES = [
    {
        "country": "Italy",
        "unis": "Politecnico di Milano, Politecnico di Torino, Sapienza Rome, "
                "Bocconi, Sant'Anna Pisa, Scuola Normale Superiore, "
                "Università di Bologna, Università di Padova, Università di "
                "Trento, Università di Firenze, Università di Pisa, "
                "Università di Roma Tor Vergata, IMT Lucca, Università "
                "Cattolica del Sacro Cuore, Università di Napoli Federico II.",
    },
    {
        "country": "Spain",
        "unis": "Universidad Carlos III de Madrid (UC3M), Universidad "
                "Politécnica de Madrid (UPM), Universidad Autónoma de "
                "Madrid (UAM), Universidad Complutense de Madrid, "
                "Universitat Politècnica de Catalunya (UPC), Universitat "
                "Pompeu Fabra (UPF), Universitat de Barcelona (UB), "
                "Universitat Autònoma de Barcelona (UAB), Universidad de "
                "Granada, Universidad de Valencia, Universidad de "
                "Salamanca, IE University, ESADE, CEU Cardenal Herrera, "
                "Universidad de Navarra, Universidad de Sevilla.",
    },
    {
        "country": "France",
        "unis": "Sorbonne Université, Université PSL (Paris Sciences et "
                "Lettres), Université Paris-Saclay, Université Paris Cité, "
                "Sciences Po, École Polytechnique, École Normale "
                "Supérieure (ENS) Paris, ENS Lyon, HEC Paris, INSEAD, "
                "Université Côte d'Azur, Université Grenoble Alpes, "
                "Université Lyon 1, Université de Strasbourg, "
                "Université de Bordeaux, Aix-Marseille Université, "
                "INSA Lyon, École des Ponts ParisTech, CentraleSupélec.",
    },
]

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


def build_prompt(country: str, unis: str, category: str) -> str:
    return f"""List well-known English-taught master's programs in {category} at universities in {country}.

Focus on these universities: {unis}

Reply with ONLY valid JSON:
{{
  "programs": [
    {{
      "university":    "<full official name>",
      "program_name":  "<official program name>",
      "city":          "<city in {country}>",
      "level":         "<master | bachelor>",
      "apply_url":     "<official program homepage URL at the university's own domain>",
      "field_of_study": ["<broad field>"]
    }}
  ]
}}

Rules:
- Only REAL programs at REAL universities you genuinely recognise. Do NOT invent.
- apply_url MUST be at the university's official domain (not aggregator sites).
- Skip programs that are well-known across the world (e.g. INSEAD MBA, HEC MBA) — those are usually already in our database.
- 8-15 entries per request, all distinct.
"""


def fingerprint(name: str, city: str, level: str, country: str) -> str:
    raw = f"{name.lower().strip()}|{city.lower().strip()}|{country.lower()}|{level}"
    return hashlib.sha256(raw.encode()).hexdigest()


def existing_country_fingerprints(country: str) -> set[str]:
    out = set()
    offset = 0
    while True:
        r = httpx.get(
            f"{SB_URL}/rest/v1/masters_programs",
            headers=SB_R,
            params={"select": "fingerprint", "country": f"eq.{country}",
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


def insert(p: dict, country: str, existing: set[str]) -> bool:
    name = (p.get("program_name") or "").strip()
    uni = (p.get("university") or "").strip()
    city = (p.get("city") or country).strip()
    apply_url = (p.get("apply_url") or "").strip()
    level = p.get("level") or "master"
    if not name or not uni or not apply_url.startswith("http"):
        return False
    if level not in ("master", "bachelor"):
        level = "master"
    fp = fingerprint(name, city, level, country)
    if fp in existing:
        return False
    fields = p.get("field_of_study") or []
    category = classify_domain(fields, name)
    record = {
        "program_name": name[:300],
        "university":   uni[:300],
        "country":      country,
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
        "description":  f"{name} at {uni}, {country}. English-taught.",
        "requirements": [],
        "apply_url":    apply_url[:600],
        "source_url":   apply_url[:600],
        "source_name":  f"curated_{country.lower()}",
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
    with CrawlerRun("curated_priority_countries_seeder") as run:
        for country_def in COUNTRIES:
            country = country_def["country"]
            unis = country_def["unis"]
            print(f"\n=== {country} ===", flush=True)
            existing = existing_country_fingerprints(country)
            print(f"  existing fingerprints: {len(existing)}", flush=True)

            country_total = 0
            for cat in FIELD_BATCHES:
                short = cat[:50]
                try:
                    data = extract_json(
                        prompt=build_prompt(country, unis, cat),
                        run_id=run.run_id,
                        max_usd_per_run=5.0,
                        provider="anthropic",
                        max_tokens=4000,
                        expected_keys=("programs",),
                        estimated_cost=0.025,
                    )
                except Exception as e:
                    print(f"  {short:50s}: ERR {e}", flush=True)
                    continue
                programs = data.get("programs") or []
                inserted = 0
                for p in programs:
                    if insert(p, country, existing):
                        inserted += 1
                        run.ok()
                    else:
                        run.skipped()
                country_total += inserted
                print(f"  {short:50s}: Haiku={len(programs)} ins={inserted}",
                      flush=True)
                time.sleep(0.4)

            print(f"  {country} total: +{country_total}", flush=True)
        print("\nDONE", flush=True)


if __name__ == "__main__":
    main()
