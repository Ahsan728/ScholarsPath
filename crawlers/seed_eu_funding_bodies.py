#!/usr/bin/env python3
"""
Seed opportunity_sources with the official call-index pages of the
major European research-funding bodies.

These are the agencies that fund PhD/postdoc/research grants across
Europe; their websites publish open calls that the Discoverer can
extract on its weekly sweep. Hardcoded list because:
- They change rarely (national agencies stable across years)
- Curated index URLs beat probing generic "/scholarships" paths
- Each funder has distinct call types (DFG = research groups, FCT =
  PhD studentships, NWO = Talent grants Veni/Vidi/Vici, etc.) so the
  per-source notes guide the Discoverer's extraction prompt.

After running, validate URLs via validate_opportunity_urls.py — but
since these are official funder portals, expected pass rate is high.

Run:
  python crawlers/seed_eu_funding_bodies.py --dry-run
  python crawlers/seed_eu_funding_bodies.py
"""

import argparse
import os
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import httpx
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

from crawler_logger import CrawlerRun
from aggregator_hosts import is_aggregator_host

SB_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SB_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
SB_H   = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}",
          "Content-Type": "application/json", "Prefer": "return=minimal"}
SB_R   = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"}


# Each entry: country, funder acronym, full name, call-index URL,
# typical call types. The Discoverer reads `notes` as hints into its
# extraction prompt so the funder's vocabulary lines up.
SOURCES = [
    # ── Germany ────────────────────────────────────────────────────
    {"country": "Germany",   "funder": "DFG", "fullname": "Deutsche Forschungsgemeinschaft",
     "url": "https://www.dfg.de/en/research_funding/announcements_proposals/index.jsp",
     "notes": "DFG calls index — research training groups (Graduiertenkollegs), priority programmes, individual grants."},
    {"country": "Germany",   "funder": "DAAD", "fullname": "German Academic Exchange Service",
     "url": "https://www.daad.de/en/study-and-research-in-germany/scholarships/",
     "notes": "DAAD scholarship database for international students and researchers."},
    {"country": "Germany",   "funder": "Helmholtz", "fullname": "Helmholtz Association",
     "url": "https://www.helmholtz.de/en/careers/jobs/",
     "notes": "Helmholtz doctoral researcher and postdoc positions across 18 research centres."},
    {"country": "Germany",   "funder": "Max Planck", "fullname": "Max Planck Society",
     "url": "https://www.mpg.de/jobboard",
     "notes": "Max Planck PhD and postdoc positions across ~86 institutes."},

    # ── France ─────────────────────────────────────────────────────
    {"country": "France",    "funder": "CNRS", "fullname": "Centre National de la Recherche Scientifique",
     "url": "https://emploi.cnrs.fr/Offres/Default.aspx",
     "notes": "CNRS national job board — PhD, postdoc, researcher and engineer positions."},
    {"country": "France",    "funder": "ANR", "fullname": "Agence Nationale de la Recherche",
     "url": "https://anr.fr/en/anrs-role-in-research/calls/calls-for-projects/",
     "notes": "ANR research-project calls; PhD/postdoc positions live in the funded labs."},
    {"country": "France",    "funder": "Campus France Eiffel", "fullname": "Eiffel Excellence Scholarship",
     "url": "https://www.campusfrance.org/en/eiffel-scholarship-program-of-excellence",
     "notes": "Flagship French government scholarship for international Master and PhD students."},

    # ── Netherlands ────────────────────────────────────────────────
    {"country": "Netherlands", "funder": "NWO", "fullname": "Dutch Research Council",
     "url": "https://www.nwo.nl/en/calls",
     "notes": "NWO calls index — Talent Programme (Veni/Vidi/Vici), open competitions, sector grants."},
    {"country": "Netherlands", "funder": "AcademicTransfer", "fullname": "AcademicTransfer (Dutch academic job board)",
     "url": "https://www.academictransfer.com/en/jobs/",
     "notes": "Official Dutch academic vacancy board — PhDs are paid positions."},

    # ── Portugal ───────────────────────────────────────────────────
    {"country": "Portugal",  "funder": "FCT", "fullname": "Fundação para a Ciência e a Tecnologia",
     "url": "https://www.fct.pt/en/funding/calls/",
     "notes": "FCT calls index — annual PhD studentships, postdoc and CEEC programs."},

    # ── Austria ────────────────────────────────────────────────────
    {"country": "Austria",   "funder": "FWF", "fullname": "Austrian Science Fund",
     "url": "https://www.fwf.ac.at/en/funding/funding-portfolio",
     "notes": "FWF funding portfolio — DOC doctoral programmes, ESPRIT and Lise Meitner postdocs."},
    {"country": "Austria",   "funder": "OeAD", "fullname": "Austria's Agency for Education and Internationalisation",
     "url": "https://oead.at/en/to-austria/scholarships",
     "notes": "OeAD scholarship database for international students and researchers."},

    # ── Switzerland ────────────────────────────────────────────────
    {"country": "Switzerland", "funder": "SNSF", "fullname": "Swiss National Science Foundation",
     "url": "https://www.snf.ch/en/funding/overview",
     "notes": "SNSF (FNS / SNF) funding overview — doctoral and postdoctoral fellowships."},
    {"country": "Switzerland", "funder": "Swiss Government Excellence", "fullname": "Swiss Government Excellence Scholarships",
     "url": "https://www.sbfi.admin.ch/sbfi/en/home/education/scholarships-and-grants/swiss-government-excellence-scholarships.html",
     "notes": "Swiss federal scholarships for foreign researchers and PhD students."},

    # ── Belgium ────────────────────────────────────────────────────
    {"country": "Belgium",   "funder": "FWO", "fullname": "Research Foundation - Flanders",
     "url": "https://www.fwo.be/en/fellowships-funding/",
     "notes": "FWO fellowships and funding — PhD and postdoctoral mandates (Flemish region)."},
    {"country": "Belgium",   "funder": "FRS-FNRS", "fullname": "Fonds de la Recherche Scientifique",
     "url": "https://www.frs-fnrs.be/en/financements",
     "notes": "FRS-FNRS funding — Aspirant, Chargé de recherches and postdoctoral fellowships (French-speaking region)."},

    # ── Italy ──────────────────────────────────────────────────────
    {"country": "Italy",     "funder": "MUR", "fullname": "Ministero dell'Università e della Ricerca",
     "url": "https://www.mur.gov.it/it/atti-e-normativa/bandi",
     "notes": "MUR call index — PRIN and FIS calls fund PhD/postdoc positions in Italian universities."},
    {"country": "Italy",     "funder": "MAECI", "fullname": "Italian Government Scholarships (Farnesina)",
     "url": "https://studyinitaly.esteri.it/ListaBandi",
     "notes": "MAECI Italian government scholarship for foreign students and researchers."},

    # ── Spain ──────────────────────────────────────────────────────
    {"country": "Spain",     "funder": "AEI", "fullname": "Agencia Estatal de Investigación",
     "url": "https://www.aei.gob.es/convocatorias/buscador-convocatorias",
     "notes": "AEI calls finder — FPI/FPU PhD studentships, Ramón y Cajal postdoc."},
    {"country": "Spain",     "funder": "AECID", "fullname": "Agencia Española de Cooperación Internacional",
     "url": "https://www.aecid.es/en/becas-y-lectorados",
     "notes": "AECID scholarships for international students from Latin America, Africa, Mediterranean and Asia."},
    {"country": "Spain",     "funder": "La Caixa", "fullname": "Fundación 'la Caixa'",
     "url": "https://fundacionlacaixa.org/en/scholarships",
     "notes": "La Caixa INPhINIT, Junior Leader and other competitive doctoral and postdoctoral fellowships."},

    # ── Sweden ─────────────────────────────────────────────────────
    {"country": "Sweden",    "funder": "Vetenskapsrådet", "fullname": "Swedish Research Council",
     "url": "https://www.vr.se/english/applying-for-funding/calls.html",
     "notes": "Swedish Research Council calls — Starting Grants, Project grants."},
    {"country": "Sweden",    "funder": "Swedish Institute", "fullname": "Swedish Institute Scholarships",
     "url": "https://si.se/en/apply/scholarships/",
     "notes": "Swedish Institute Scholarships for Global Professionals (SISGP) and Visby Programme."},

    # ── Denmark ────────────────────────────────────────────────────
    {"country": "Denmark",   "funder": "DFF", "fullname": "Danmarks Frie Forskningsfond",
     "url": "https://dff.dk/en/calls",
     "notes": "Independent Research Fund Denmark calls — Sapere Aude and Inge Lehmann."},
    {"country": "Denmark",   "funder": "Carlsberg Foundation", "fullname": "Carlsberg Foundation",
     "url": "https://www.carlsbergfondet.dk/en/research-funding",
     "notes": "Carlsberg Foundation grants — Distinguished Fellowships and Internationalisation Fellowships."},

    # ── Norway ─────────────────────────────────────────────────────
    {"country": "Norway",    "funder": "RCN", "fullname": "Research Council of Norway",
     "url": "https://www.forskningsradet.no/en/call-for-proposals/",
     "notes": "Research Council of Norway calls — researcher project, FRIPRO, doctoral funding."},

    # ── Finland ────────────────────────────────────────────────────
    {"country": "Finland",   "funder": "Research Council of Finland", "fullname": "Research Council of Finland (Suomen Akatemia)",
     "url": "https://www.aka.fi/en/research-funding/apply-for-funding/calls-for-applications/",
     "notes": "Academy of Finland (now Research Council of Finland) calls — academy projects, postdoc grants."},

    # ── Ireland ────────────────────────────────────────────────────
    {"country": "Ireland",   "funder": "IRC", "fullname": "Irish Research Council",
     "url": "https://research.ie/funding/",
     "notes": "Irish Research Council funding — Government of Ireland postgraduate and postdoctoral schemes."},
    {"country": "Ireland",   "funder": "SFI", "fullname": "Science Foundation Ireland",
     "url": "https://www.sfi.ie/funding/funding-calls/",
     "notes": "Science Foundation Ireland funding calls — Centres for Research Training."},

    # ── Hungary ────────────────────────────────────────────────────
    {"country": "Hungary",   "funder": "Stipendium Hungaricum", "fullname": "Stipendium Hungaricum",
     "url": "https://stipendiumhungaricum.hu/",
     "notes": "Hungarian Government scholarship for foreign students at all levels."},
    {"country": "Hungary",   "funder": "NKFIH", "fullname": "National Research, Development and Innovation Office",
     "url": "https://nkfih.gov.hu/funding/funding-schemes",
     "notes": "NKFIH funding schemes — Bolyai János and OTKA postdoctoral grants."},

    # ── Czech Republic / Poland ────────────────────────────────────
    {"country": "Czech Republic", "funder": "GAČR", "fullname": "Czech Science Foundation",
     "url": "https://gacr.cz/en/calls/",
     "notes": "Czech Science Foundation calls — standard, junior and lead-research grants."},
    {"country": "Poland",    "funder": "NCN", "fullname": "Polish National Science Centre",
     "url": "https://www.ncn.gov.pl/en/finansowanie-nauki/konkursy",
     "notes": "NCN calls — Preludium PhD, Polonez postdoc, Opus and Sonata research grants."},
    {"country": "Poland",    "funder": "NAWA", "fullname": "Polish National Agency for Academic Exchange",
     "url": "https://nawa.gov.pl/en/students",
     "notes": "NAWA scholarships for foreign students and researchers — Ulam, Bekker, Solidarity."},

    # ── Pan-European ───────────────────────────────────────────────
    {"country": "Europe",    "funder": "ERC", "fullname": "European Research Council",
     "url": "https://erc.europa.eu/apply-grant/funding-opportunities",
     "notes": "ERC funding opportunities — Starting / Consolidator / Advanced grants fund PhD/postdoc positions in awarded labs."},
    {"country": "Europe",    "funder": "MSCA", "fullname": "Marie Skłodowska-Curie Actions",
     "url": "https://marie-sklodowska-curie-actions.ec.europa.eu/funding",
     "notes": "MSCA funding overview — Doctoral Networks, Postdoctoral Fellowships, COFUND."},
    {"country": "Europe",    "funder": "EURAXESS", "fullname": "EURAXESS Researchers in Motion",
     "url": "https://euraxess.ec.europa.eu/jobs/search",
     "notes": "EURAXESS pan-European researcher vacancy portal — PhD, postdoc, all disciplines."},
]


def source_exists(url: str) -> bool:
    r = httpx.get(
        f"{SB_URL}/rest/v1/opportunity_sources",
        headers=SB_R,
        params={"select": "id", "url": f"eq.{url}", "limit": "1"},
        timeout=10,
    )
    return bool(r.json())


def insert(s: dict, dry_run: bool) -> bool:
    url = s["url"].strip()
    if is_aggregator_host(url):
        return False
    if source_exists(url):
        return False
    if dry_run:
        return True
    record = {
        "url":     url,
        "country": s["country"],
        "scope":   "funding_body",
        "title":   f"{s['funder']} — {s['fullname']} ({s['country']})"[:300],
        "added_by": "eu_funding_bodies_v1",
        "notes":   f"{s['notes']} Source: hardcoded curated EU funding body list.",
    }
    r = httpx.post(f"{SB_URL}/rest/v1/opportunity_sources",
                   headers=SB_H, json=record, timeout=15)
    return r.status_code in (200, 201, 204)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    with CrawlerRun("eu_funding_bodies_seed",
                    params={"dry_run": args.dry_run}) as run:
        run.set_total(len(SOURCES))
        added = skipped = 0
        for s in SOURCES:
            if insert(s, args.dry_run):
                added += 1
                run.ok()
                print(f"  + [{s['country']:13s}] {s['funder']:32s} {s['url'][:60]}",
                      flush=True)
            else:
                skipped += 1
                run.skipped()
        run.summary = {"total": len(SOURCES), "added": added, "skipped": skipped}
        print(f"\nDONE: +{added} sources (skipped {skipped} dupes/aggregators)",
              flush=True)


if __name__ == "__main__":
    main()
