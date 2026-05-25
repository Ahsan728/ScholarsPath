#!/usr/bin/env python3
"""
Parse Mastersportal Business & Management listings and bulk-insert.

The source file is gitignored and expected to exist locally at:
  Documents/3.8k Master's degrees in Business & Management.txt

Run examples:
  python crawlers/insert_business_management.py --dry-run --limit 20
  python crawlers/insert_business_management.py --limit 100
  python crawlers/insert_business_management.py --country Germany --dry-run
"""
import argparse
import hashlib
import os
import re
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import httpx
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

from crawler_logger import CrawlerRun

SB_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SB_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
HEADERS = {
    "apikey": SB_KEY,
    "Authorization": f"Bearer {SB_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

SOURCE_URL = "https://www.mastersportal.eu/disciplines/24/business-management.html"
CATEGORY = "business"
INPUT_FILE = os.path.join(
    os.path.dirname(__file__),
    "..",
    "Documents",
    "3.8k Master's degrees in Business & Management.txt",
)


def fp(program_name: str, country: str) -> str:
    raw = f"{program_name.lower().strip()}|{country.lower()}|master"
    return hashlib.sha256(raw.encode()).hexdigest()


def parse_duration_tuition(s: str):
    s = s.replace("Â½", ".5").replace("½", ".5")
    duration_years = None
    tuition = None

    m = re.search(r"(\d+)\s*year,\s*(\d+)\s*months?", s)
    if m:
        duration_years = int(m.group(1)) + int(m.group(2)) / 12.0
    else:
        m = re.search(r"(\d+\.?\d*)\s*year", s)
        if m:
            duration_years = float(m.group(1))
        else:
            m = re.search(r"(\d+\.?\d*)\s*month", s)
            if m:
                duration_years = float(m.group(1)) / 12.0
            elif s.startswith(".5"):
                duration_years = 0.5

    if "Free" in s:
        tuition = None
    elif "Tuition not available" in s:
        tuition = None
    else:
        m = re.search(r"(?:â‚¬|€)\s*([\d,]+)", s)
        if m:
            try:
                tuition = int(m.group(1).replace(",", ""))
            except ValueError:
                tuition = None

    return duration_years, tuition


def parse_chunk(chunk: str):
    lines = [line.strip() for line in chunk.split("\n")]
    nonempty = [line for line in lines if line]

    cyf_indices = [i for i, line in enumerate(nonempty) if line == "Check Your Fit"]
    if not cyf_indices:
        return None
    cyf_idx = cyf_indices[-1]
    block = nonempty[cyf_idx + 1:]

    if len(block) < 4:
        return None

    idx = 0
    if block[idx].startswith("Logo of "):
        idx += 1

    if idx >= len(block):
        return None
    university = block[idx]
    idx += 1

    if idx < len(block) and re.match(r"^\d[,.]\d$", block[idx]):
        idx += 1
        if idx < len(block) and re.match(r"^\(\d+\)$", block[idx]):
            idx += 1

    if idx >= len(block):
        return None
    location = block[idx]
    idx += 1

    if location.lower() == "online":
        city, country = "Online", "Online"
    elif "," in location:
        parts = location.split(",", 1)
        city = parts[0].strip()
        country = re.sub(r"\s*\+\d+\s*$", "", parts[1]).strip()
    else:
        city = ""
        country = location.strip()

    if idx < len(block) and "Top" in block[idx] and "Worldwide" in block[idx]:
        idx += 1

    if idx >= len(block):
        return None
    program_name = block[idx]
    idx += 1

    description_lines = []
    duration_tuition = None

    while idx < len(block):
        line = block[idx]
        duration_line = line.replace("Â½", ".5").replace("½", ".5")
        if line == "Featured":
            idx += 1
            continue
        if re.match(r"^(\d+\.?\d*\s*year|\d+\s*month|\.5\s*year)", duration_line):
            duration_tuition = line
            break
        if line.startswith(("â‚¬", "€")) and idx + 1 < len(block):
            next_line = block[idx + 1]
            next_duration_line = next_line.replace("Â½", ".5").replace("½", ".5")
            if re.match(r"^\d", next_duration_line) and (
                "year" in next_duration_line or "month" in next_duration_line
            ):
                duration_tuition = next_line
                break
        description_lines.append(line)
        idx += 1

    description = " ".join(description_lines).strip()[:400]
    if not duration_tuition:
        return None

    duration_years, tuition = parse_duration_tuition(duration_tuition)

    return {
        "university": university,
        "program_name": program_name,
        "city": city,
        "country": country,
        "description": description,
        "duration_years": duration_years,
        "tuition_usd_year": tuition,
    }


FIELD_KEYWORDS = [
    ("Business Administration", ["business administration", "mba", "executive business"]),
    ("Management", ["management", "managerial", "leadership", "organisation", "organization"]),
    ("Finance", ["finance", "financial", "investment", "banking", "asset management"]),
    ("Accounting", ["accounting", "audit", "taxation", "controlling"]),
    ("Marketing", ["marketing", "brand", "consumer", "advertising", "sales"]),
    ("International Business", ["international business", "global business", "trade", "export"]),
    ("Entrepreneurship", ["entrepreneur", "startup", "venture", "innovation"]),
    ("Economics", ["economics", "econometric", "economic policy", "macroeconomic"]),
    ("Business Analytics", ["business analytics", "data analytics", "business intelligence", "analytics"]),
    ("Supply Chain Management", ["supply chain", "logistics", "procurement", "operations"]),
    ("Project Management", ["project management", "programme management", "program management"]),
    ("Human Resource Management", ["human resource", "hr management", "people management"]),
    ("Hospitality Management", ["hospitality", "hotel", "tourism", "event management"]),
    ("Strategic Management", ["strategy", "strategic", "corporate development"]),
    ("Sustainability Management", ["sustainability", "sustainable", "responsible management", "esg"]),
    ("Public Administration", ["public administration", "public management", "governance"]),
    ("Risk Management", ["risk", "insurance", "compliance"]),
    ("Digital Business", ["digital business", "e-commerce", "digital transformation", "fintech"]),
]


def infer_fields(program_name: str, description: str):
    text = (program_name + " " + description).lower()
    fields = []
    for label, keywords in FIELD_KEYWORDS:
        if any(keyword in text for keyword in keywords):
            fields.append(label)
    if not fields:
        fields = ["Business & Management"]
    return fields[:4]


def build_record(p: dict) -> dict:
    description = p["description"] or f"MSc programme in {p['program_name']} at {p['university']}."
    return {
        "university": p["university"],
        "program_name": p["program_name"],
        "country": p["country"],
        "city": p.get("city") or None,
        "category": CATEGORY,
        "duration_years": p.get("duration_years"),
        "tuition_usd_year": p.get("tuition_usd_year"),
        "language": "English",
        "field_of_study": infer_fields(p["program_name"], description),
        "scholarship_available": False,
        "description": description,
        "level": "master",
        "source_name": "mastersportal",
        "source_url": SOURCE_URL,
        "apply_url": "",
        "fingerprint": fp(p["program_name"], p["country"]),
    }


def fetch_existing_fingerprints() -> set[str]:
    print("Fetching existing fingerprints from DB...")
    existing = set()
    headers = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"}
    offset = 0
    while True:
        r = httpx.get(
            f"{SB_URL}/rest/v1/masters_programs",
            headers=headers,
            params={"select": "fingerprint", "limit": "1000", "offset": str(offset)},
            timeout=30,
        )
        if r.status_code != 200:
            raise RuntimeError(f"fingerprint fetch failed: {r.status_code} {r.text[:200]}")
        data = r.json()
        if not isinstance(data, list) or not data:
            break
        for row in data:
            if row.get("fingerprint"):
                existing.add(row["fingerprint"])
        if len(data) < 1000:
            break
        offset += 1000
    print(f"Existing fingerprints in DB: {len(existing)}")
    return existing


def count_programs(params: dict) -> int:
    headers = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}", "Prefer": "count=exact"}
    r = httpx.get(
        f"{SB_URL}/rest/v1/masters_programs",
        headers=headers,
        params={**params, "select": "id", "limit": "1"},
        timeout=15,
    )
    r.raise_for_status()
    return int(r.headers["content-range"].split("/")[-1])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--country", type=str, default=None)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    params = {k: v for k, v in vars(args).items() if v is not None}

    with CrawlerRun("program_ingester_business", params=params) as run:
        print(f"Reading {INPUT_FILE}...")
        with open(INPUT_FILE, "r", encoding="utf-8", errors="replace") as f:
            text = f.read()

        chunks = text.split("View Programme Information")
        print(f"Chunks: {len(chunks)}")

        parsed = []
        parse_failed = 0
        for chunk in chunks:
            p = parse_chunk(chunk)
            if p and p["university"] and p["program_name"] and p["country"]:
                parsed.append(p)
            elif chunk.strip():
                parse_failed += 1
        print(f"Parsed: {len(parsed)}")

        seen = {}
        for p in parsed:
            seen.setdefault(fp(p["program_name"], p["country"]), p)
        unique = [p for p in seen.values() if p["country"] and len(p["country"]) > 1]
        print(f"Unique after local dedup: {len(unique)}")

        if args.country:
            unique = [p for p in unique if p["country"].lower() == args.country.lower()]
            print(f"After country filter ({args.country}): {len(unique)}")

        records = [build_record(p) for p in unique]
        existing = fetch_existing_fingerprints()

        duplicates = [r for r in records if r["fingerprint"] in existing]
        new_records = [r for r in records if r["fingerprint"] not in existing]
        total_new_before_limit = len(new_records)
        if args.limit is not None:
            new_records = new_records[: args.limit]

        limited_out = total_new_before_limit - len(new_records)
        print(
            f"New to insert: {len(new_records)} "
            f"(skipping {len(duplicates)} DB duplicates, {limited_out} over limit)"
        )

        run.set_total(len(records))
        if duplicates:
            run.skipped(len(duplicates))
        if limited_out:
            run.skipped(limited_out)

        if args.dry_run:
            for record in new_records[:5]:
                print(f"  DRY RUN would insert: {record['program_name']} | {record['country']}")
            if len(new_records) > 5:
                print(f"  DRY RUN would insert {len(new_records) - 5} more rows")
            run.skipped(len(new_records))
            inserted = 0
        else:
            inserted = 0
            for i in range(0, len(new_records), 100):
                batch = new_records[i:i + 100]
                r = httpx.post(
                    f"{SB_URL}/rest/v1/masters_programs",
                    headers=HEADERS,
                    json=batch,
                    timeout=60,
                )
                if r.status_code in (200, 201, 204):
                    inserted += len(batch)
                    run.ok(len(batch))
                    print(f"  Batch {i // 100 + 1}: +{len(batch)}")
                else:
                    run.failed(len(batch), message=f"insert failed: {r.status_code} {r.text[:500]}")
                    print(f"  Batch {i // 100 + 1}: ERROR {r.status_code}: {r.text[:200]}")

        summary = {
            "chunks": len(chunks),
            "parsed": len(parsed),
            "parse_failed": parse_failed,
            "unique": len(unique),
            "db_duplicates": len(duplicates),
            "new_before_limit": total_new_before_limit,
            "limited_out": limited_out,
            "inserted": inserted,
            "dry_run": args.dry_run,
        }

        if not args.dry_run:
            summary["category_count"] = count_programs(
                {"source_name": "eq.mastersportal", "category": f"eq.{CATEGORY}"}
            )
            summary["total_programs"] = count_programs({})
            print(f"{CATEGORY} mastersportal programs in DB: {summary['category_count']}")
            print(f"Total programs in DB: {summary['total_programs']}")

        run.summary = summary
        print(f"\nSummary: {summary}")


if __name__ == "__main__":
    main()
