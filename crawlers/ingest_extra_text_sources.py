#!/usr/bin/env python3
"""
Bulk-ingest URL lists from two text documents the user provided:

1. Documents/Italy Regional and University based Scholarship.txt
   A flat list of ~27 URLs to Italian regional study-grant agencies
   (DSU, ADISU, ER-GO, Aliseo, ERSU, etc.) and university scholarship
   pages. Every URL is Italy-scoped.

2. Documents/directory of the official PhD, Funding, Scholarship Europe.txt
   Narrative directory of ~30 official European portals (EURAXESS,
   MSCA, DAAD, Campus France, Nuffic, Swedish Institute, Swiss
   Government, FCT, FWO, etc.). URLs are embedded as bare domains
   after the portal name; surrounding text gives context and an
   implicit country attribution from each grouping header.

Both files end up as rows in opportunity_sources so the Discoverer
crawls them on its next sweep. We pull the line preceding each URL to
use as a description for the source.

Run:
  python crawlers/ingest_extra_text_sources.py --dry-run
  python crawlers/ingest_extra_text_sources.py
"""

import argparse
import os
import re
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

DOCS = os.path.join(os.path.dirname(__file__), "..", "Documents")

ITALY_FILE = os.path.join(DOCS, "Italy Regional and University based Scholarship.txt")
EUROPE_FILE = os.path.join(DOCS,
    "directory of the official PhD, Funding, Scholarship Europe.txt")

# Map textual headers in the Europe directory to the country / scope we
# tag rows under. The directory groups portals under exactly these
# section labels.
EUROPE_SECTION_MAP = {
    "Pan-European":  ("Europe",        "funding_body"),
    "Germany":       ("Germany",       "funding_body"),
    "France":        ("France",        "funding_body"),
    "Netherlands":   ("Netherlands",   "funding_body"),
    "Sweden":        ("Sweden",        "funding_body"),
    "Switzerland":   ("Switzerland",   "funding_body"),
    "Norway":        ("Norway",        "funding_body"),
    "Denmark":       ("Denmark",       "funding_body"),
    "Finland":       ("Finland",       "funding_body"),
    "Italy":         ("Italy",         "funding_body"),
    "Spain":         ("Spain",         "funding_body"),
    "Belgium":       ("Belgium",       "funding_body"),
    "Ireland":       ("Ireland",       "funding_body"),
    "Portugal":      ("Portugal",      "funding_body"),
    "Austria":       ("Austria",       "funding_body"),
    "Czech Republic":("Czech Republic","funding_body"),
    "Hungary":       ("Hungary",       "funding_body"),
    "Poland":        ("Poland",        "funding_body"),
}

URL_RE = re.compile(r'https?://[^\s)>"]+', re.I)
BARE_DOMAIN_RE = re.compile(
    r'\b([a-z0-9][a-z0-9-]*\.(?:[a-z0-9-]+\.)*[a-z]{2,})\b', re.I
)


def normalize(url: str) -> str:
    url = url.rstrip(".,;:)]>!")
    if not url.startswith("http"):
        url = "https://" + url
    return url


def source_exists(url: str) -> bool:
    r = httpx.get(
        f"{SB_URL}/rest/v1/opportunity_sources",
        headers=SB_R,
        params={"select": "id", "url": f"eq.{url}", "limit": "1"},
        timeout=10,
    )
    return bool(r.json())


def insert_source(url: str, country: str, scope: str, title: str,
                  notes: str, added_by: str, dry_run: bool) -> bool:
    if is_aggregator_host(url):
        return False
    if source_exists(url):
        return False
    if dry_run:
        return True
    record = {
        "url":     url,
        "country": country,
        "scope":   scope,
        "title":   title[:300],
        "added_by": added_by,
        "notes":   notes[:1000],
    }
    r = httpx.post(f"{SB_URL}/rest/v1/opportunity_sources",
                   headers=SB_H, json=record, timeout=15)
    return r.status_code in (200, 201, 204)


def parse_italy(dry_run: bool, run) -> int:
    """27 URLs, all Italy. Title from the path slug + host."""
    if not os.path.exists(ITALY_FILE):
        print(f"  SKIP: {ITALY_FILE} not found", flush=True)
        return 0
    with open(ITALY_FILE, encoding="utf-8") as f:
        text = f.read()
    urls = {normalize(u) for u in URL_RE.findall(text)}
    print(f"\n=== Italy Regional ({len(urls)} URLs) ===", flush=True)
    added = 0
    for url in sorted(urls):
        host = re.sub(r"^https?://", "", url).split("/")[0]
        title = (f"Italian regional/university scholarship: "
                 f"{host}")[:300]
        notes = ("Italy regional study-grant agency or university "
                 "scholarship page. Source: "
                 "Documents/Italy Regional and University based Scholarship.txt")
        if insert_source(url, "Italy", "regional_funder", title,
                         notes, "italy_regional_scholarships_v1", dry_run):
            added += 1
            run.ok()
            print(f"  + {host[:55]:55s}  {url[:60]}", flush=True)
        else:
            run.skipped()
    return added


def parse_europe(dry_run: bool, run) -> int:
    """Walk the narrative directory. Track the current section header
    (Pan-European / Germany / France / …). For each line, if it
    contains a URL or a bare domain like 'euraxess.ec.europa.eu',
    insert with the section's country attribution."""
    if not os.path.exists(EUROPE_FILE):
        print(f"  SKIP: {EUROPE_FILE} not found", flush=True)
        return 0
    with open(EUROPE_FILE, encoding="utf-8") as f:
        lines = f.read().splitlines()
    print(f"\n=== Europe Directory ===", flush=True)

    current_country = "Europe"
    current_scope = "funding_body"
    added = 0
    seen: set[str] = set()

    for raw in lines:
        line = raw.strip()
        if not line:
            continue
        # Detect section header — line that starts with a known
        # country name OR contains "Pan-European"
        # Examples: "Pan-European official portals",
        #           "Country-specific official portals",
        #           "Germany — DAAD (daad.de)" (per-portal, not header)
        for key, (country, scope) in EUROPE_SECTION_MAP.items():
            if line.lower().startswith(key.lower()):
                # It might be a section header (short) or a per-portal
                # line (long, contains a URL). Per-portal lines also
                # start with country name so we still set the country.
                current_country = country
                current_scope = scope
                break

        # Find all URLs / bare domains on this line
        candidates: list[str] = []
        for m in URL_RE.findall(line):
            candidates.append(normalize(m))
        # Also pull bare domains that aren't already in URL form
        for m in BARE_DOMAIN_RE.findall(line):
            full = normalize(m)
            if full not in candidates and "." in m and not m.endswith(".") \
                    and any(t in m.lower() for t in (
                        ".eu", ".gov", ".org", ".de", ".fr", ".it", ".es",
                        ".nl", ".se", ".no", ".dk", ".fi", ".ch", ".be",
                        ".ie", ".pt", ".at", ".cz", ".hu", ".pl", ".com",
                        ".int", ".admin", ".info",
                    )):
                candidates.append(full)

        for url in candidates:
            if url in seen:
                continue
            seen.add(url)
            host = re.sub(r"^https?://", "", url).split("/")[0]
            # Title = first ~80 chars of line (context)
            title = re.sub(r"\s+", " ", line)[:200]
            if title.startswith("http"):
                title = host
            notes = (f"Listed under '{current_country}' in the official "
                     "PhD/funding/scholarship Europe directory. Source: "
                     "Documents/directory of the official PhD, Funding, "
                     "Scholarship Europe.txt")
            if insert_source(url, current_country, current_scope,
                             f"Official portal: {title}", notes,
                             "europe_directory_v1", dry_run):
                added += 1
                run.ok()
                print(f"  + [{current_country:14s}] {host[:50]:50s}",
                      flush=True)
            else:
                run.skipped()
    return added


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    with CrawlerRun("extra_text_sources_ingest",
                    params={"dry_run": args.dry_run}) as run:
        it = parse_italy(args.dry_run, run)
        eu = parse_europe(args.dry_run, run)
        run.summary = {"italy_added": it, "europe_added": eu,
                       "total_added": it + eu}
        print(f"\nDONE: Italy +{it}, Europe +{eu}, total +{it+eu}",
              flush=True)


if __name__ == "__main__":
    main()
