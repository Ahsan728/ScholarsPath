#!/usr/bin/env python3
"""
Parse Mastersportal Natural Sciences & Mathematics listings and bulk-insert.
Same approach as insert_engineering_tech.py / insert_cs_it_pages_6_95.py.
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

SOURCE_URL = "https://www.mastersportal.eu/disciplines/77/natural-sciences-mathematics.html"
CATEGORY = "natural-science-math"
INPUT_FILE = os.path.join(os.path.dirname(__file__), "..", "Documents",
                          "2.0k Master's degrees in Natural Science & Math.txt")


def fp(program_name: str, country: str) -> str:
    raw = f"{program_name.lower().strip()}|{country.lower()}|master"
    return hashlib.sha256(raw.encode()).hexdigest()


def parse_duration_tuition(s: str):
    s = s.replace('½', '.5')
    duration_years = None
    tuition = None

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
        m = re.search(r'€\s*([\d,]+)', s)
        if m:
            try:
                tuition = int(m.group(1).replace(',', ''))
            except ValueError:
                tuition = None

    return duration_years, tuition


def parse_chunk(chunk: str):
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
    if block[idx].startswith("Logo of "):
        idx += 1

    if idx >= len(block):
        return None
    university = block[idx]
    idx += 1

    if idx < len(block) and re.match(r'^\d[,.]\d$', block[idx]):
        idx += 1
        if idx < len(block) and re.match(r'^\(\d+\)$', block[idx]):
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
        country = re.sub(r'\s*\+\d+\s*$', '', parts[1]).strip()
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
        if line == "Featured":
            idx += 1
            continue
        if re.match(r'^(\d+\.?\d*\s*year|\d+\s*month|\d+½|½\s*year)', line):
            duration_tuition = line
            break
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


FIELD_KEYWORDS = [
    ("Biology", ["biolog","life science","ecolog","botan","zoolog","molecular"]),
    ("Chemistry", ["chemistry","chemical","biochem","organic","inorganic"]),
    ("Physics", ["physics","astrophysic","astronom","quantum","particle"]),
    ("Mathematics", ["mathemat","statistic","actuar","algebra","analytic"]),
    ("Marine Science", ["marine","ocean","aquatic","maritime","seafloor"]),
    ("Environmental Science", ["environment","sustainab","climate","ecosystem","conservation"]),
    ("Earth Science", ["geolog","geophys","earth","seismolog","volcano","mining"]),
    ("Biotechnology", ["biotech","genetic","bioinformat","biomed"]),
    ("Computational Science", ["computational","simulation","modelling","modeling","data"]),
    ("Neuroscience", ["neuro","brain","cognitive"]),
    ("Microbiology", ["microbiolog","virolog","immunolog","bacter"]),
    ("Pharmacology", ["pharmaco","pharmaceut","drug","medicin"]),
    ("Astronomy", ["astronom","astrophys","cosmolog","planet"]),
    ("Forensic Science", ["forensic","criminolog"]),
    ("Food Science", ["food","nutrit"]),
    ("Materials Science", ["material","nanotechnolog","polymer","composite"]),
    ("Geography", ["geograph","spatial","cartograph"]),
    ("Plant Science", ["plant","agronom","botan","horticulture"]),
    ("Animal Science", ["animal","veterinar","wildlife","zoo"]),
    ("Water Sciences", ["water","hydrolog","limnolog"]),
]


def infer_fields(program_name: str, description: str):
    text = (program_name + " " + description).lower()
    fields = []
    for label, keywords in FIELD_KEYWORDS:
        if any(k in text for k in keywords):
            fields.append(label)
    if not fields:
        fields = ["Natural Sciences"]
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


def main():
    print(f"Reading {INPUT_FILE}...")
    with open(INPUT_FILE, 'r', encoding='utf-8', errors='replace') as f:
        text = f.read()

    chunks = text.split("View Programme Information")
    print(f"Chunks: {len(chunks)}")

    parsed = []
    for chunk in chunks:
        p = parse_chunk(chunk)
        if p and p["university"] and p["program_name"] and p["country"]:
            parsed.append(p)
    print(f"Parsed: {len(parsed)}")

    seen = {}
    for p in parsed:
        seen.setdefault(fp(p["program_name"], p["country"]), p)
    unique = [p for p in seen.values() if p["country"] and len(p["country"]) > 1]
    print(f"Unique after dedup: {len(unique)}")

    records = [build_record(p) for p in unique]

    print("Fetching existing fingerprints from DB...")
    existing = set()
    h2 = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"}
    offset = 0
    while True:
        r = httpx.get(f"{SB_URL}/rest/v1/masters_programs", headers=h2,
                      params={"select": "fingerprint", "limit": "1000", "offset": str(offset)},
                      timeout=30)
        d = r.json()
        if not isinstance(d, list) or not d:
            break
        for row in d:
            if row.get("fingerprint"):
                existing.add(row["fingerprint"])
        if len(d) < 1000:
            break
        offset += 1000
    print(f"Existing in DB: {len(existing)}")

    new_records = [r for r in records if r["fingerprint"] not in existing]
    print(f"New to insert: {len(new_records)} (skipping {len(records) - len(new_records)})")

    inserted = 0
    for i in range(0, len(new_records), 100):
        batch = new_records[i:i + 100]
        r = httpx.post(f"{SB_URL}/rest/v1/masters_programs",
                       headers=HEADERS, json=batch, timeout=60)
        if r.status_code in (200, 201):
            inserted += len(batch)
            print(f"  Batch {i//100 + 1}: +{len(batch)}")
        else:
            print(f"  Batch {i//100 + 1}: ERROR {r.status_code}: {r.text[:200]}")

    print(f"\nInserted: {inserted}")

    h3 = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}", "Prefer": "count=exact"}
    r = httpx.get(f"{SB_URL}/rest/v1/masters_programs", headers=h3,
                  params={"category": f"eq.{CATEGORY}", "select": "id", "limit": "1"}, timeout=15)
    n_cat = int(r.headers["content-range"].split("/")[-1])
    r2 = httpx.get(f"{SB_URL}/rest/v1/masters_programs", headers=h3,
                   params={"select": "id", "limit": "1"}, timeout=15)
    n_total = int(r2.headers["content-range"].split("/")[-1])
    print(f"{CATEGORY} in DB: {n_cat}")
    print(f"Total programs in DB: {n_total}")


if __name__ == "__main__":
    main()
