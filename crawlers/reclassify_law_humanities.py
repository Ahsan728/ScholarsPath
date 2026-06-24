#!/usr/bin/env python3
"""
One-shot reclassification: re-run domain_classifier.classify() on every
masters_programs and discovered_opportunities row whose current category
is 'social' or 'arts'. Rows whose new classification is 'law' or
'humanities' get UPDATED; everything else is left alone.

Triggered after splitting Law and Humanities out as their own filter
chips — before this script runs, all law programs sit under 'social'
and all humanities programs under 'arts', so neither chip would surface
anything new.

Run:
  python crawlers/reclassify_law_humanities.py --dry-run
  python crawlers/reclassify_law_humanities.py
"""

import argparse
import os
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import httpx
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

from domain_classifier import classify as classify_domain

SB_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SB_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
SB_R = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"}
SB_W = {**SB_R, "Content-Type": "application/json", "Prefer": "return=minimal"}


def reclassify_table(table: str, name_field: str, dry_run: bool) -> dict:
    counts = {"checked": 0, "to_law": 0, "to_humanities": 0,
              "unchanged": 0, "updated": 0, "errors": 0}
    offset = 0
    while True:
        r = httpx.get(f"{SB_URL}/rest/v1/{table}",
                      headers=SB_R,
                      params={"select": f"id,{name_field},field_of_study,category",
                              "category": "in.(social,arts)",
                              "limit": "1000", "offset": str(offset)},
                      timeout=20)
        rows = r.json() if r.status_code == 200 else []
        if not rows:
            break
        for row in rows:
            counts["checked"] += 1
            current = row.get("category")
            fields = row.get("field_of_study") or []
            name = row.get(name_field) or ""
            new = classify_domain(fields, name)
            if new == current:
                counts["unchanged"] += 1
                continue
            if new not in ("law", "humanities"):
                # Edge case: row's text matches a different rule entirely
                # now (e.g. cs_ai keyword in the name). Skip — that's
                # outside the scope of this targeted reclassification.
                counts["unchanged"] += 1
                continue
            counts[f"to_{new}"] += 1
            if dry_run:
                continue
            u = httpx.patch(f"{SB_URL}/rest/v1/{table}",
                            headers=SB_W,
                            params={"id": f"eq.{row['id']}"},
                            json={"category": new}, timeout=15)
            if u.status_code in (200, 201, 204):
                counts["updated"] += 1
            else:
                counts["errors"] += 1
        if len(rows) < 1000:
            break
        offset += 1000
    return counts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    print(f"\n=== masters_programs (program_name, social/arts → law/humanities) ===")
    p = reclassify_table("masters_programs", "program_name", args.dry_run)
    print(p)

    print(f"\n=== discovered_opportunities (title, social/arts → law/humanities) ===")
    o = reclassify_table("discovered_opportunities", "title", args.dry_run)
    print(o)

    print(f"\nDONE")


if __name__ == "__main__":
    main()
