#!/usr/bin/env python3
"""
Parse Mastersportal CS & IT pages 6-95 from text file and bulk-insert into Supabase.
Deduplicates by fingerprint (program_name + country + 'master').
"""
import os, sys, re, hashlib, httpx
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

SB_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SB_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
HEADERS = {
    "apikey": SB_KEY,
    "Authorization": f"Bearer {SB_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=ignore-duplicates,return=minimal",
}

SOURCE_URL = "https://www.mastersportal.eu/disciplines/34/computer-science-it.html"
INPUT_FILE = os.path.join(os.path.dirname(__file__), "..", "Documents",
                          "1.9k Master's degrees in CS IT Page 6 to 95.txt")


def fp(program_name: str, country: str) -> str:
    raw = f"{program_name.lower().strip()}|{country.lower()}|master"
    return hashlib.sha256(raw.encode()).hexdigest()


def parse_duration_tuition(s: str):
    """Parse 'X year€Y/yr' / 'X yearsFree' / 'X months€Y/full' / etc."""
    s = s.replace('½', '.5')
    duration_years = None
    tuition = None

    # Try "N year, M months"
    m = re.search(r'(\d+)\s*year,\s*(\d+)\s*months?', s)
    if m:
        duration_years = int(m.group(1)) + int(m.group(2)) / 12.0
    else:
        m = re.search(r'(\d+\.?\d*)\s*year', s)
        if m:
            duration_years = float(m.group(1))
        else:
            m = re.search(r'(\d+\.?\d*)\s*month', s)
            if m:
                duration_years = float(m.group(1)) / 12.0
            elif s.startswith('.5'):
                duration_years = 0.5

    if 'Free' in s:
        tuition = None
    elif 'Tuition not available' in s:
        tuition = None
    else:
        # Find € amount (handle mojibake of €)
        m = re.search(r'€\s*([\d,]+)', s)
        if m:
            try:
                tuition = int(m.group(1).replace(',', ''))
            except ValueError:
                tuition = None

    return duration_years, tuition


def parse_chunk(chunk: str):
    """Parse a single program chunk (text between two 'View Programme Information' lines)."""
    lines = [l.strip() for l in chunk.split('\n')]
    nonempty = [l for l in lines if l]

    cyf_indices = [i for i, l in enumerate(nonempty) if l == "Check Your Fit"]
    if not cyf_indices:
        return None
    cyf_idx = cyf_indices[-1]
    block = nonempty[cyf_idx + 1:]

    if len(block) < 4:
        return None

    idx = 0

    # Skip "Logo of X"
    if block[idx].startswith("Logo of "):
        idx += 1

    if idx >= len(block):
        return None
    university = block[idx]
    idx += 1

    # Skip rating "X,X" (e.g., "4,3" or "5,0")
    if idx < len(block) and re.match(r'^\d[,.]\d$', block[idx]):
        idx += 1
        # Skip review count "(NN)"
        if idx < len(block) and re.match(r'^\(\d+\)$', block[idx]):
            idx += 1

    if idx >= len(block):
        return None

    # Location: "City, Country" or "Online"
    location = block[idx]
    idx += 1

    if location.lower() == "online":
        city, country = "Online", "Online"
    elif "," in location:
        parts = location.split(",", 1)
        city = parts[0].strip()
        country = re.sub(r'\s*\+\d+\s*$', '', parts[1]).strip()
    else:
        # Some entries have just country, like "Online"
        city = ""
        country = location.strip()

    # Skip "Top X% in Worldwide"
    if idx < len(block) and "Top" in block[idx] and "Worldwide" in block[idx]:
        idx += 1

    if idx >= len(block):
        return None
    program_name = block[idx]
    idx += 1

    # Gather description until we hit duration/tuition line
    description_lines = []
    duration_tuition = None

    while idx < len(block):
        line = block[idx]
        if line == "Featured":
            idx += 1
            continue

        # Duration/tuition line patterns
        if re.match(r'^(\d+\.?\d*\s*year|\d+\s*month|\d+Â½|Â½\s*year)', line):
            duration_tuition = line
            break

        # Lone tuition line like "€10,000/yr" preceding the duration line
        if line.startswith("€") and idx + 1 < len(block):
            next_line = block[idx + 1]
            if re.match(r'^\d', next_line) and ('year' in next_line or 'month' in next_line):
                duration_tuition = next_line
                break

        description_lines.append(line)
        idx += 1

    description = ' '.join(description_lines).strip()[:400]

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


# Field-of-study keyword detection
FIELD_KEYWORDS = [
    ("Artificial Intelligence", ["artificial intelligence", "ai ", " ai", "machine learning", "ml ", "deep learning"]),
    ("Data Science", ["data science", "data analytics", "data analysis", "big data", "analytics"]),
    ("Cybersecurity", ["cyber", "security", "cryptograph", "forensic"]),
    ("Software Engineering", ["software", "programming", "development"]),
    ("Computer Science", ["computer science", "computing", "informatics", "computer engineering"]),
    ("Information Systems", ["information system", "information management", "information technology"]),
    ("Networks", ["network", "communication", "wireless", "telecommunication"]),
    ("HCI", ["interaction", "user experience", "ux", "hci"]),
    ("GIS", ["geographic", "geomatics", "geoinformat", "remote sensing", "spatial"]),
    ("Game Design", ["game", "gaming"]),
    ("Business Analytics", ["business analytic", "business intelligence", "marketing analytic"]),
    ("Robotics", ["robotic", "automation"]),
    ("Bioinformatics", ["bioinformat", "computational biolog"]),
    ("Blockchain", ["blockchain", "distributed ledger"]),
    ("Cloud Computing", ["cloud"]),
    ("Quantum Computing", ["quantum"]),
    ("Computer Vision", ["computer vision", "image processing"]),
    ("NLP", ["nlp", "natural language", "language technolog", "linguistic"]),
    ("Finance and Tech", ["fintech", "financial technolog"]),
]


def infer_fields(program_name: str, description: str):
    text = (program_name + " " + description).lower()
    fields = []
    for label, keywords in FIELD_KEYWORDS:
        if any(k in text for k in keywords):
            fields.append(label)
    if not fields:
        fields = ["Computer Science"]
    return fields[:4]  # Cap at 4 tags


def build_record(p: dict) -> dict:
    description = p["description"] or f"MSc programme in {p['program_name']} at {p['university']}."
    return {
        "university": p["university"],
        "program_name": p["program_name"],
        "country": p["country"],
        "city": p.get("city") or None,
        "category": "computer-science-it",
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


def main():
    print(f"Reading {INPUT_FILE}...")
    with open(INPUT_FILE, 'r', encoding='utf-8', errors='replace') as f:
        text = f.read()

    chunks = text.split("View Programme Information")
    print(f"Found {len(chunks)} chunks.")

    parsed = []
    skipped = 0
    for chunk in chunks:
        p = parse_chunk(chunk)
        if p and p["university"] and p["program_name"] and p["country"]:
            parsed.append(p)
        else:
            skipped += 1
    print(f"Parsed: {len(parsed)} programs. Skipped chunks: {skipped}")

    # Deduplicate by fingerprint
    seen = {}
    for p in parsed:
        key = fp(p["program_name"], p["country"])
        if key not in seen:
            seen[key] = p
    unique = list(seen.values())
    print(f"After fingerprint dedup: {len(unique)} unique programs.")

    # Filter out countries that are not real (None, empty, etc.)
    unique = [p for p in unique if p["country"] and len(p["country"]) > 1]
    print(f"After country filter: {len(unique)} programs.")

    # Build records
    records = [build_record(p) for p in unique]

    # Fetch existing fingerprints from DB to filter out duplicates client-side
    print("Fetching existing fingerprints from DB...")
    existing = set()
    h2 = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"}
    offset = 0
    while True:
        r = httpx.get(f"{SB_URL}/rest/v1/masters_programs", headers=h2,
                      params={"select": "fingerprint", "limit": "1000", "offset": str(offset)},
                      timeout=30)
        chunk = r.json()
        if not isinstance(chunk, list) or not chunk:
            break
        for row in chunk:
            if row.get("fingerprint"):
                existing.add(row["fingerprint"])
        if len(chunk) < 1000:
            break
        offset += 1000
    print(f"Existing fingerprints in DB: {len(existing)}")

    new_records = [r for r in records if r["fingerprint"] not in existing]
    print(f"New records to insert: {len(new_records)} (skipping {len(records) - len(new_records)} duplicates)")

    records = new_records

    # Bulk insert in chunks of 100
    inserted = 0
    errors = 0
    for i in range(0, len(records), 100):
        batch = records[i:i + 100]
        try:
            r = httpx.post(
                f"{SB_URL}/rest/v1/masters_programs",
                headers=HEADERS,
                json=batch,
                timeout=60,
            )
            if r.status_code in (200, 201):
                inserted += len(batch)
                print(f"  Batch {i//100 + 1}: inserted {len(batch)} (status {r.status_code})")
            else:
                print(f"  Batch {i//100 + 1}: ERROR {r.status_code}: {r.text[:300]}")
                errors += 1
        except Exception as e:
            print(f"  Batch {i//100 + 1}: EXCEPTION {e}")
            errors += 1

    print(f"\nDone. Sent: {inserted} records. Batch errors: {errors}")

    # Final count
    h2 = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}", "Prefer": "count=exact"}
    r = httpx.get(f"{SB_URL}/rest/v1/masters_programs", headers=h2,
                  params={"source_name": "eq.mastersportal", "category": "eq.computer-science-it",
                          "select": "id", "limit": "1"}, timeout=15)
    total_cs = int(r.headers.get("content-range", "0/0").split("/")[-1])

    r2 = httpx.get(f"{SB_URL}/rest/v1/masters_programs", headers=h2,
                   params={"select": "id", "limit": "1"}, timeout=15)
    grand_total = int(r2.headers.get("content-range", "0/0").split("/")[-1])

    print(f"CS/IT mastersportal programs in DB now: {total_cs}")
    print(f"Total programs in DB: {grand_total}")


if __name__ == "__main__":
    main()
