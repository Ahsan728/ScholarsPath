#!/usr/bin/env python3
"""
Curated opportunity seed (scholarships / fellowships / grants / postdocs
/ exchanges) via Haiku knowledge, targeting the user's weak country and
type intersections.

Strongest gaps in the catalog right now:
- Country: Hungary (17), Portugal (17), Switzerland (16), Denmark (1),
  Norway (2), Finland (15)
- Type: fellowship (67), grant (69), postdoc (30), internship (11),
  exchange (12)

Mirrors crawlers/seed_priority_country_programs.py exactly: strict
"do NOT invent" prompt, fingerprint dedup, Phase 0 gates afterwards.

Run:
  python crawlers/seed_priority_opportunities.py --dry-run
  python crawlers/seed_priority_opportunities.py
"""

import argparse
import hashlib
import os
import sys
import time
from datetime import datetime, timezone

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import httpx
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

from crawler_logger import CrawlerRun
from ai.extract import extract_json
from aggregator_hosts import is_aggregator_host
from domain_classifier import classify as classify_domain

SB_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SB_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
SB_R = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"}
SB_W = {**SB_R, "Content-Type": "application/json", "Prefer": "return=minimal"}

# Country list — emphasis on weak ones but also re-touches priority five
# in case Haiku knows scholarships missing from our existing DB.
COUNTRIES = [
    {"name": "Hungary",     "hint": "Stipendium Hungaricum (Tempus Public Foundation), CEEPUS, government scholarships, Erasmus Mundus joint masters hosted in Hungary, university merit scholarships at ELTE/BME/CEU/Szeged/Debrecen/Corvinus/Semmelweis."},
    {"name": "Portugal",    "hint": "FCT PhD/Postdoc grants, Calouste Gulbenkian Foundation, Erasmus Mundus joint masters hosted in Portugal, Camões Institute, university grants at Lisbon (UL/NOVA/ULisboa)/Porto/Coimbra/Aveiro/Minho."},
    {"name": "Switzerland", "hint": "Swiss Government Excellence Scholarships, ETH Zurich Excellence Scholarships, EPFL Excellence Fellowships, IBM Fellowship, university merit grants at UZH/UniBE/Geneva/Lausanne/St Gallen/USI."},
    {"name": "Denmark",     "hint": "Danish Government Scholarships, Carlsberg Foundation, Lundbeck Foundation, university PhD scholarships at KU (Copenhagen)/AU (Aarhus)/SDU/DTU/CBS/AAU."},
    {"name": "Norway",      "hint": "Quota Scheme (historical), NORPART, Research Council of Norway (NFR/RCN) doctoral fellowships, university PhD positions at UiO/NTNU/UiB/UiT/NMBU."},
    {"name": "Finland",     "hint": "Finland Government Scholarships, Edufi Fellowships, Academy of Finland, Aalto/Helsinki/Tampere/Turku/Oulu/Jyväskylä university scholarships."},
    {"name": "Italy",       "hint": "MAECI Italian Government Scholarships, Bocconi merit awards, Sant'Anna Pisa PhD scholarships, Politecnico Milano/Torino scholarships, Invest Your Talent in Italy, Edisu Piemonte regional grants."},
    {"name": "Spain",       "hint": "AECID scholarships, La Caixa Foundation INPhINIT/Junior Leader, Severo Ochoa / Maria de Maeztu predoc, Ramón y Cajal postdoc, Spanish FPI/FPU PhD, Carolina Foundation, Botín Foundation, Beca MAEC-AECID."},
    {"name": "France",      "hint": "Eiffel Excellence Scholarship, France Excellence (Campus France), MOPGA Make Our Planet Great Again, CIFRE industrial PhD, Sorbonne / Sciences Po / Polytechnique merit awards, Île-de-France iLumens, ANR funded PhD."},
    {"name": "Germany",     "hint": "DAAD scholarships, Helmholtz Doctoral Researchers, Max Planck PhDs, Konrad Adenauer / Heinrich Böll / Friedrich Ebert / Friedrich Naumann Foundations, DFG Research Training Groups, Studienstiftung."},
    {"name": "Netherlands", "hint": "Holland Scholarship, Orange Tulip Scholarship, Erasmus University Scholarships, Leiden / Delft / Utrecht / Wageningen / Amsterdam (UvA / VU) merit grants, NWO Talent Programme (Veni/Vidi/Vici)."},
    {"name": "Sweden",      "hint": "Swedish Institute Scholarships (SISGP), Visby Programme, Wallenberg Foundation, KTH / Lund / Uppsala / Stockholm / Chalmers / Gothenburg merit scholarships."},
    {"name": "Belgium",     "hint": "VLIR-UOS, ARES-CCD, FWO predoctoral/postdoctoral, FNRS, KU Leuven / Ghent / ULB / UCLouvain / VUB merit awards."},
]

ALLOWED_TYPES = ("scholarship", "fellowship", "grant", "postdoc",
                 "internship", "exchange", "phd")


def build_prompt(country: str, hint: str) -> str:
    return f"""List well-known funding opportunities available to international students in {country}, across ALL relevant types — scholarships, fellowships, research grants, PhD positions, postdoc positions, internships, and exchange programmes.

Focus on these schemes: {hint}

Reply with ONLY valid JSON:
{{
  "opportunities": [
    {{
      "type":           "<one of: scholarship, fellowship, grant, postdoc, internship, exchange, phd>",
      "title":          "<official scheme / program name>",
      "host":           "<funding body, foundation, university, or ministry>",
      "city":           "<city in {country}, or null if national>",
      "description":    "<one-sentence summary of what it funds>",
      "amount_text":    "<funding amount or 'tuition + stipend' style summary>",
      "deadline_text":  "<typical deadline window, e.g. 'January', 'rolling', 'November'>",
      "field_of_study": ["<broad field, or 'All' if general>"],
      "apply_url":      "<official scheme homepage URL on the funder's own domain>"
    }}
  ]
}}

Rules:
- Only REAL schemes you genuinely recognise. Do NOT invent.
- apply_url MUST be on the funder's official domain (.gov, .edu, .org,
  .eu, or the national funder's own TLD) — NOT aggregator sites.
- 15-25 DISTINCT entries per request, no duplicates. Mix types — at
  least 3 of each (scholarship, fellowship, grant, postdoc).
- The scheme must currently or recently fund international students
  (no expired-and-never-renewed schemes).
"""


def fingerprint(title: str, host: str, country: str) -> str:
    """Type-agnostic. Haiku tends to return the same well-known scheme
    under every type bucket — we want the first classification to win,
    not 6 duplicates with different types."""
    raw = f"{title.lower().strip()}|{host.lower().strip()}|{country.lower()}"
    return hashlib.sha256(raw.encode()).hexdigest()


def existing_country_fingerprints(country: str) -> set[str]:
    """Build a fingerprint set from existing opportunities in this
    country, type-agnostic so we dedup across the type buckets too."""
    out, offset = set(), 0
    while True:
        r = httpx.get(
            f"{SB_URL}/rest/v1/discovered_opportunities",
            headers=SB_R,
            params={"select": "title,university", "country": f"eq.{country}",
                    "limit": "1000", "offset": str(offset)},
            timeout=20,
        )
        rows = r.json() if r.status_code == 200 else []
        for row in rows:
            t = (row.get("title") or "").strip()
            h = (row.get("university") or "").strip()
            if not t: continue
            out.add(fingerprint(t, h, country))
        if len(rows) < 1000: break
        offset += 1000
    return out


def insert(opp: dict, country: str, existing: set[str],
           dry_run: bool) -> bool:
    title = (opp.get("title") or "").strip()
    host = (opp.get("host") or "").strip()
    opp_type = (opp.get("type") or "").strip().lower()
    if opp_type not in ALLOWED_TYPES:
        return False
    city = (opp.get("city") or country).strip() if opp.get("city") else country
    apply_url = (opp.get("apply_url") or "").strip()
    desc = (opp.get("description") or "").strip()
    amount = (opp.get("amount_text") or "").strip() or None
    deadline = (opp.get("deadline_text") or "").strip() or None
    fields = opp.get("field_of_study") or []
    if not title or not host or not apply_url.startswith("http"):
        return False
    if is_aggregator_host(apply_url):
        return False
    fp = fingerprint(title, host, country)
    if fp in existing:
        return False
    category = classify_domain(fields, title)
    degree_level = ("phd"      if opp_type in ("phd", "postdoc")
                    else "master")
    record = {
        "source_url":     apply_url[:600],
        "prompt_version": "haiku-priority-opps-v1",
        "content_hash":   fp,
        "type":           opp_type,
        "title":          title[:300],
        "description":    desc[:2000] or f"{title} ({opp_type}) for international students in {country}.",
        "university":     host[:300],
        "country":        country,
        "degree_level":   degree_level,
        "field_of_study": fields,
        "category":       category,
        "amount_text":    amount,
        "funding_type":   None,
        "eligibility_text": None,
        "eligible_nations": ["ALL"],
        "ineligible_nations": [],
        "deadline":       None,
        "deadline_text":  deadline,
        "intake":         None,
        "apply_url":      apply_url[:600],
        "is_active":      True,
        "last_seen_at":   datetime.now(timezone.utc).isoformat(),
    }
    if dry_run:
        print(f"    WOULD INSERT [{opp_type:11s}] {title[:55]} ({host[:35]})",
              flush=True)
        existing.add(fp)
        return True
    r = httpx.post(f"{SB_URL}/rest/v1/discovered_opportunities",
                   headers=SB_W, json=record, timeout=15)
    if r.status_code in (200, 201, 204):
        existing.add(fp)
        return True
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--max-usd", type=float, default=3.0,
                    help="Anthropic budget cap")
    ap.add_argument("--countries", type=int, default=None,
                    help="Limit to first N countries (debug)")
    args = ap.parse_args()

    countries = COUNTRIES[: args.countries] if args.countries else COUNTRIES
    est_cost = len(countries) * 0.015
    print(f"{len(countries)} Haiku calls, est ~${est_cost:.2f}",
          flush=True)

    with CrawlerRun("priority_opportunities_seeder",
                    params={"dry_run": args.dry_run,
                            "countries": len(countries)}) as run:
        grand_total = 0
        for c in countries:
            country = c["name"]
            existing = existing_country_fingerprints(country)
            print(f"\n=== {country} (existing fingerprints: {len(existing)}) ===",
                  flush=True)
            try:
                data = extract_json(
                    prompt=build_prompt(country, c["hint"]),
                    run_id=run.run_id,
                    max_usd_per_run=args.max_usd,
                    provider="anthropic",
                    max_tokens=6000,
                    expected_keys=("opportunities",),
                    estimated_cost=0.020,
                )
            except Exception as e:
                err = str(e)[:80]
                print(f"  ERR {err}", flush=True)
                if "BudgetExceeded" in str(e) or "budget" in str(e).lower():
                    print("BUDGET CAP HIT — stopping run", flush=True)
                    run.summary = {"inserted": grand_total,
                                   "reason": "budget_cap"}
                    return
                continue
            opps = data.get("opportunities") or []
            inserted = 0
            by_type: dict[str, int] = {}
            for o in opps:
                if insert(o, country, existing, args.dry_run):
                    inserted += 1
                    by_type[o.get("type") or "?"] = by_type.get(
                        o.get("type") or "?", 0) + 1
                    run.ok()
                else:
                    run.skipped()
            grand_total += inserted
            type_str = ", ".join(f"{k}={v}" for k, v in sorted(by_type.items()))
            print(f"  Haiku={len(opps):2d} ins={inserted:2d} ({type_str})",
                  flush=True)
            time.sleep(0.4)

        run.summary = {"inserted": grand_total, "countries": len(countries)}
        print(f"\nDONE: +{grand_total} opportunities added", flush=True)


if __name__ == "__main__":
    main()
