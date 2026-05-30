#!/usr/bin/env python3
"""
Curated seed for the user's secondary-tier European countries that
have weak program coverage. Same pattern as
seed_priority_country_programs.py (strict 'do NOT invent' prompt,
fingerprint dedup, Phase 0 gates afterwards) — just a different
country set:

  Hungary, Portugal, Switzerland, Belgium, Denmark, Norway, Finland

Run:
  python crawlers/seed_secondary_country_programs.py --dry-run
  python crawlers/seed_secondary_country_programs.py
"""

import argparse
import hashlib
import os
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

COUNTRIES = [
    {"name": "Hungary",
     "unis": "Eötvös Loránd University (ELTE), Budapest University of "
             "Technology and Economics (BME), Central European University "
             "(CEU), University of Szeged, University of Debrecen, "
             "Corvinus University of Budapest, Semmelweis University, "
             "University of Pécs, University of Miskolc, Óbuda University, "
             "Pannon University, Pázmány Péter Catholic University, MATE."},
    {"name": "Portugal",
     "unis": "Universidade de Lisboa (ULisboa), Universidade NOVA de "
             "Lisboa (NOVA), Universidade do Porto, Universidade de "
             "Coimbra, Universidade de Aveiro, Universidade do Minho, "
             "Universidade Católica Portuguesa (UCP), ISCTE-IUL, "
             "Instituto Superior Técnico (IST), Universidade Católica do "
             "Porto, Nova SBE, Universidade da Beira Interior."},
    {"name": "Switzerland",
     "unis": "ETH Zürich, EPFL, University of Zurich (UZH), University of "
             "Geneva (UNIGE), University of Bern (UniBE), University of "
             "Basel, University of Lausanne (UNIL), Università della "
             "Svizzera italiana (USI), University of St Gallen (HSG), "
             "Università di Lugano, University of Fribourg, IMD Lausanne, "
             "Graduate Institute Geneva (IHEID), University of Neuchâtel."},
    {"name": "Belgium",
     "unis": "KU Leuven, Ghent University (UGent), Université libre de "
             "Bruxelles (ULB), UCLouvain, Vrije Universiteit Brussel (VUB), "
             "University of Antwerp (UAntwerpen), University of Liège, "
             "Hasselt University, Vlerick Business School, Solvay Brussels "
             "School, KU Leuven Brussels, Université de Namur."},
    {"name": "Denmark",
     "unis": "University of Copenhagen (KU), Aarhus University (AU), "
             "Technical University of Denmark (DTU), University of Southern "
             "Denmark (SDU), Aalborg University (AAU), Roskilde University, "
             "Copenhagen Business School (CBS), IT University of Copenhagen "
             "(ITU), Royal Danish Academy of Fine Arts."},
    {"name": "Norway",
     "unis": "University of Oslo (UiO), Norwegian University of Science and "
             "Technology (NTNU), University of Bergen (UiB), UiT The Arctic "
             "University of Norway, BI Norwegian Business School, NHH "
             "Norwegian School of Economics, NMBU, University of Agder, "
             "Oslo Metropolitan University (OsloMet), University of "
             "Stavanger."},
    {"name": "Finland",
     "unis": "Aalto University, University of Helsinki, University of "
             "Turku, Tampere University, University of Oulu, University of "
             "Jyväskylä, LUT University, Hanken School of Economics, Åbo "
             "Akademi, University of Eastern Finland, University of Vaasa."},
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
- The program must be TAUGHT IN ENGLISH (not the local language).
- 8-15 entries per request, all distinct.
"""


def fingerprint(name: str, city: str, level: str, country: str) -> str:
    raw = f"{name.lower().strip()}|{city.lower().strip()}|{country.lower()}|{level}"
    return hashlib.sha256(raw.encode()).hexdigest()


def existing_country_fingerprints(country: str) -> set[str]:
    out, offset = set(), 0
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


def insert(p: dict, country: str, existing: set[str], dry_run: bool) -> bool:
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
        "source_name":  f"curated_secondary_{country.lower()}",
        "is_active":    True,
        "fingerprint":  fp,
    }
    if dry_run:
        print(f"    WOULD INSERT: {name[:55]} @ {uni[:35]}", flush=True)
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
    ap.add_argument("--max-usd", type=float, default=5.0)
    ap.add_argument("--countries", type=int, default=None,
                    help="Limit to first N countries")
    args = ap.parse_args()

    countries = COUNTRIES[: args.countries] if args.countries else COUNTRIES
    total_calls = len(countries) * len(FIELD_BATCHES)
    est_cost = total_calls * 0.012
    print(f"{len(countries)} countries × {len(FIELD_BATCHES)} fields = "
          f"{total_calls} Haiku calls, est ~${est_cost:.2f}",
          flush=True)

    with CrawlerRun("secondary_country_programs_seeder",
                    params={"dry_run": args.dry_run,
                            "countries": len(countries)}) as run:
        grand_total = 0
        for c in countries:
            country = c["name"]
            existing = existing_country_fingerprints(country)
            print(f"\n=== {country} (existing fingerprints: {len(existing)}) ===",
                  flush=True)
            country_total = 0
            for cat in FIELD_BATCHES:
                short = cat[:42]
                try:
                    data = extract_json(
                        prompt=build_prompt(country, c["unis"], cat),
                        run_id=run.run_id,
                        max_usd_per_run=args.max_usd,
                        provider="anthropic",
                        max_tokens=4000,
                        expected_keys=("programs",),
                        estimated_cost=0.015,
                    )
                except Exception as e:
                    err = str(e)[:80]
                    print(f"  {short:42s}: ERR {err}", flush=True)
                    if "BudgetExceeded" in str(e) or "budget" in str(e).lower():
                        print("BUDGET CAP HIT — stopping run", flush=True)
                        run.summary = {"inserted": grand_total,
                                       "reason": "budget_cap"}
                        return
                    continue
                programs = data.get("programs") or []
                inserted = 0
                for p in programs:
                    if insert(p, country, existing, args.dry_run):
                        inserted += 1
                        run.ok()
                    else:
                        run.skipped()
                country_total += inserted
                grand_total += inserted
                print(f"  {short:42s}: Haiku={len(programs):2d} ins={inserted:2d}",
                      flush=True)
                time.sleep(0.3)
            print(f"  {country} total: +{country_total}", flush=True)

        run.summary = {"inserted": grand_total, "countries": len(countries)}
        print(f"\nDONE: +{grand_total} programs added", flush=True)


if __name__ == "__main__":
    main()
