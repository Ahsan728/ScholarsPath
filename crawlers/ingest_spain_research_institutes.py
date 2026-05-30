#!/usr/bin/env python3
"""
Ingest the Spain Research Institutes Directory from
Documents/spain_research_institutes.xlsx.

These are high-quality PhD/postdoc opportunity sources:
- BIST + CERCA centres (Catalonia)
- BERC (Basque Country)
- IMDEA (Madrid)
- CSIC institutes
- Severo Ochoa / Maria de Maeztu units of excellence

For each institute with a website, we either:
1. Insert directly as a high-trust 'phd' opportunity row in
   discovered_opportunities (one entry per institute representing
   their open PhD/postdoc positions) — this gives users immediate
   visibility into who hires.
2. AND insert as a source in opportunity_sources so the Discoverer
   can pull specific open positions during its weekly sweep.

Both approaches; insert path is gated by Phase 0 validators afterwards.

Run:
  python crawlers/ingest_spain_research_institutes.py --dry-run
  python crawlers/ingest_spain_research_institutes.py
"""

import argparse
import hashlib
import os
import sys
from datetime import datetime, timezone

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import httpx
import openpyxl
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

from crawler_logger import CrawlerRun
from aggregator_hosts import is_aggregator_host
from domain_classifier import classify as classify_domain

SB_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SB_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
SB_H   = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}",
          "Content-Type": "application/json", "Prefer": "return=minimal"}
SB_R   = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"}

XLSX = os.path.join(os.path.dirname(__file__), "..", "Documents",
                    "spain_research_institutes.xlsx")


def load_institutes() -> list[dict]:
    """Parse the Excel into a list of normalized dicts."""
    wb = openpyxl.load_workbook(XLSX, read_only=True)
    ws = wb["Research Institutes"]
    headers = None
    out = []
    for row in ws.iter_rows(values_only=True):
        if headers is None:
            # Find the header row (has "Domain" as first cell)
            if row[0] == "Domain":
                headers = list(row)
            continue
        if not row or not row[0]:
            continue
        rec = dict(zip(headers, row))
        # Skip rows that look like sub-headers or notes
        if not rec.get("Acronym") or not rec.get("Full Name"):
            continue
        out.append({
            "domain":   str(rec.get("Domain") or "").strip(),
            "acronym":  str(rec.get("Acronym") or "").strip(),
            "name":     str(rec.get("Full Name") or "").strip(),
            "city":     str(rec.get("City") or "").strip(),
            "region":   str(rec.get("Region") or "").strip(),
            "network":  str(rec.get("Network") or "").strip(),
            "excellence": str(rec.get("Excellence Accreditation") or "").strip(),
            "website":  str(rec.get("Website") or "").strip(),
        })
    wb.close()
    return out


def url_with_scheme(domain: str) -> str | None:
    domain = (domain or "").strip().lower()
    if not domain or domain in ("none", "n/a", "-"):
        return None
    # Strip protocol if already present
    if domain.startswith("http://") or domain.startswith("https://"):
        return domain
    return f"https://{domain}"


def insert_opportunity(inst: dict, dry_run: bool) -> bool:
    """One discovered_opportunities row per institute representing the
    research positions they offer. The apply_url is the institute's
    careers / vacancies page, falling back to their homepage."""
    url = url_with_scheme(inst["website"])
    if not url:
        return False
    if is_aggregator_host(url):
        return False

    title = f"PhD / Postdoc positions at {inst['acronym']} — {inst['name']}"
    description_parts = [
        f"{inst['acronym']} ({inst['name']}) is a Spanish research institute"
    ]
    if inst["network"]:
        description_parts.append(f"in the {inst['network']} network")
    if inst["city"]:
        description_parts.append(f"based in {inst['city']}")
    if inst["region"]:
        description_parts.append(f"({inst['region']})")
    if inst["excellence"] and inst["excellence"].lower() != "none":
        description_parts.append(
            f"holding the {inst['excellence']} excellence accreditation"
        )
    description = (
        ", ".join(description_parts).rstrip(",")
        + ". Hires PhD researchers and postdoctoral fellows on open calls."
    )

    content_hash = hashlib.sha256(
        f"spain-ri|{inst['acronym']}|{inst['name']}".encode()
    ).hexdigest()
    category = classify_domain([inst["domain"], inst["name"]], title)

    record = {
        "source_url":     "Documents/spain_research_institutes.xlsx",
        "prompt_version": "spain-research-institutes-v1",
        "content_hash":   content_hash,
        "type":           "phd",
        "title":          title[:300],
        "description":    description[:2000],
        "university":     inst["name"][:300],
        "country":        "Spain",
        "degree_level":   "phd",
        "field_of_study": [inst["domain"]] if inst["domain"] else [],
        "category":       category,
        "amount_text":    None,
        "funding_type":   None,
        "eligibility_text": None,
        "eligible_nations": ["ALL"],
        "ineligible_nations": [],
        "deadline":       None,
        "deadline_text":  "Rolling / per-call",
        "intake":         None,
        "apply_url":      url,
        "is_active":      True,
        "last_seen_at":   datetime.now(timezone.utc).isoformat(),
    }

    if dry_run:
        print(f"  WOULD INSERT: {title[:80]}", flush=True)
        return True

    # Dedup by content_hash
    ex = httpx.get(
        f"{SB_URL}/rest/v1/discovered_opportunities",
        headers=SB_R,
        params={"select": "id", "content_hash": f"eq.{content_hash}", "limit": "1"},
        timeout=10,
    )
    if ex.status_code == 200 and ex.json():
        return False
    r = httpx.post(f"{SB_URL}/rest/v1/discovered_opportunities",
                   headers=SB_H, json=record, timeout=15)
    return r.status_code in (200, 201, 204)


def insert_source(inst: dict, dry_run: bool) -> bool:
    """Add the institute's website to opportunity_sources so the
    Discoverer crawls it during regular sweeps."""
    url = url_with_scheme(inst["website"])
    if not url or is_aggregator_host(url):
        return False

    if dry_run:
        return True

    # Dedup by URL
    ex = httpx.get(
        f"{SB_URL}/rest/v1/opportunity_sources",
        headers=SB_R,
        params={"select": "id", "url": f"eq.{url}", "limit": "1"},
        timeout=10,
    )
    if ex.status_code == 200 and ex.json():
        return False

    record = {
        "url":     url,
        "country": "Spain",
        "scope":   "funding_body",
        "title":   f"{inst['acronym']} — {inst['name']} (Spain research institute)"[:300],
        "added_by": "spain_research_institutes_v1",
        "notes":   f"Domain: {inst['domain']}. Network: {inst['network']}. "
                   f"Excellence: {inst['excellence']}. Source: "
                   f"Documents/spain_research_institutes.xlsx",
    }
    r = httpx.post(f"{SB_URL}/rest/v1/opportunity_sources",
                   headers=SB_H, json=record, timeout=15)
    return r.status_code in (200, 201, 204)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--skip-source", action="store_true",
                    help="Only insert opportunity rows, not crawler sources")
    ap.add_argument("--skip-opp", action="store_true",
                    help="Only insert sources, not opportunity rows")
    args = ap.parse_args()

    institutes = load_institutes()
    print(f"Loaded {len(institutes)} institutes from spreadsheet", flush=True)

    with CrawlerRun("spain_research_institutes_ingest",
                    params={"dry_run": args.dry_run,
                            "skip_source": args.skip_source,
                            "skip_opp": args.skip_opp}) as run:
        run.set_total(len(institutes))
        opps_written = 0
        srcs_written = 0
        skipped = 0
        for inst in institutes:
            if not inst["website"]:
                skipped += 1
                run.skipped()
                continue

            opp_ok = src_ok = False
            if not args.skip_opp:
                opp_ok = insert_opportunity(inst, args.dry_run)
                if opp_ok: opps_written += 1
            if not args.skip_source:
                src_ok = insert_source(inst, args.dry_run)
                if src_ok: srcs_written += 1

            if opp_ok or src_ok:
                run.ok()
                if args.dry_run:
                    pass  # already printed inside insert_opportunity
                else:
                    print(f"  + {inst['acronym']:8s} {inst['name'][:50]}", flush=True)
            else:
                run.skipped()
                skipped += 1

        run.summary = {
            "institutes_total": len(institutes),
            "opportunities_written": opps_written,
            "sources_written": srcs_written,
            "skipped": skipped,
        }
        print(f"\nDONE: opportunities={opps_written}, sources={srcs_written}, "
              f"skipped={skipped} (of {len(institutes)} institutes)",
              flush=True)


if __name__ == "__main__":
    main()
