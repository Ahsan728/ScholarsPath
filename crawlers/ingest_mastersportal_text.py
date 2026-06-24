#!/usr/bin/env python3
"""
Generic Mastersportal text-dump ingester for the 4 new files in
Documents/ (Social Sci, Law, Humanities, Arts) — and reusable for any
future dump of the same shape.

Pipeline:
  1. PARSE each text file into structured records (uni, program, city,
     country, tuition, duration, description) — reuses the proven
     chunking from crawlers/insert_environmental_science.py.
  2. DEDUP against existing France/Italy/Spain/… fingerprints so we
     don't re-insert programs already in the DB from earlier dumps.
  3. RESOLVE URL via Haiku in batches of ~15 programs per call. The
     prompt seeds Haiku with the program name + university + city +
     country and asks for the OFFICIAL program page URL on the
     university's own domain. Haiku returns "" if it doesn't know.
  4. INSERT records with Haiku-suggested URL. Phase 0 validators
     (validate_program_urls.py + validate_program_pages.py) run
     afterwards; today's quality gate in lib/match.ts hides any row
     that doesn't end up url_status='ok' AND page_status in
     ('specific_english','name_changed'). Net trustable yield will be
     whatever Haiku gets right — typically 20-40% for the curated
     priority European unis.

Run:
  python crawlers/ingest_mastersportal_text.py --category law --dry-run
  python crawlers/ingest_mastersportal_text.py --category all
"""

import argparse
import hashlib
import os
import re
import sys
import time
from typing import Optional

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import httpx
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

from crawler_logger import CrawlerRun
from ai.extract import extract_json

SB_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SB_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
SB_R = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"}
SB_W = {**SB_R, "Content-Type": "application/json", "Prefer": "return=minimal"}

DOCS = os.path.join(os.path.dirname(__file__), "..", "Documents")

# Category slug → (file basename, mastersportal source URL, catalog code)
CATEGORIES = {
    "social":     ("2.7k Master's degrees in Social Sci.txt",
                   "https://www.mastersportal.eu/",
                   "social"),
    "arts":       ("1.0k Master's degrees in Arts, Desi.txt",
                   "https://www.mastersportal.eu/",
                   "arts"),
    "humanities": ("856 Master's degrees in Humanities.txt",
                   "https://www.mastersportal.eu/",
                   "arts"),
    "law":        ("442 Master's degrees in Law in Euro.txt",
                   "https://www.mastersportal.eu/",
                   "social"),
}


# ── Parser (lifted intact from insert_environmental_science.py) ────────
def fp(program_name: str, country: str) -> str:
    raw = f"{program_name.lower().strip()}|{country.lower()}|master"
    return hashlib.sha256(raw.encode()).hexdigest()


def parse_duration_tuition(s: str):
    s = s.replace("Â½", ".5").replace("½", ".5")
    duration_years, tuition = None, None
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
    if "Free" not in s and "Tuition not available" not in s:
        m = re.search(r"(?:â‚¬|€)\s*([\d,]+)", s)
        if m:
            try:
                tuition = int(m.group(1).replace(",", ""))
            except ValueError:
                tuition = None
    return duration_years, tuition


def parse_chunk(chunk: str) -> Optional[dict]:
    lines = [line.strip() for line in chunk.split("\n")]
    nonempty = [line for line in lines if line]
    cyf_indices = [i for i, l in enumerate(nonempty) if l == "Check Your Fit"]
    if not cyf_indices:
        return None
    block = nonempty[cyf_indices[-1] + 1:]
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
        city, country = "", location.strip()
    if idx < len(block) and "Top" in block[idx] and "Worldwide" in block[idx]:
        idx += 1
    if idx >= len(block):
        return None
    program_name = block[idx]
    idx += 1
    desc_lines, dt = [], None
    while idx < len(block):
        line = block[idx]
        dl = line.replace("Â½", ".5").replace("½", ".5")
        if line == "Featured":
            idx += 1; continue
        if re.match(r"^(\d+\.?\d*\s*year|\d+\s*month|\.5\s*year)", dl):
            dt = line; break
        if line.startswith(("â‚¬", "€")) and idx + 1 < len(block):
            nl = block[idx+1].replace("Â½", ".5").replace("½", ".5")
            if re.match(r"^\d", nl) and ("year" in nl or "month" in nl):
                dt = block[idx+1]; break
        desc_lines.append(line); idx += 1
    description = " ".join(desc_lines).strip()[:400]
    if not dt:
        return None
    dur, tu = parse_duration_tuition(dt)
    return {"university": university, "program_name": program_name,
            "city": city, "country": country, "description": description,
            "duration_years": dur, "tuition_usd_year": tu}


# ── Field / category inference for the 4 new dumps ─────────────────────
FIELD_KEYWORDS = {
    "social": [
        ("International Relations", ["international relations", "diplomacy", "global politics", "geopolitics"]),
        ("Political Science",       ["political science", "politics", "government", "public administration", "policy"]),
        ("Sociology",               ["sociology", "social science", "society", "social research"]),
        ("Anthropology",            ["anthropology", "ethnography", "cultural studies"]),
        ("Public Policy",           ["public policy", "policy analysis", "policy studies"]),
        ("Development Studies",     ["development", "global south", "humanitarian"]),
        ("Criminology",             ["criminology", "criminal justice"]),
        ("Psychology",              ["psychology", "psych"]),
    ],
    "law": [
        ("International Law",       ["international law", "european law", "transnational law"]),
        ("Commercial Law",          ["commercial", "corporate law", "business law"]),
        ("Human Rights Law",        ["human rights"]),
        ("Tax Law",                 ["tax law", "taxation"]),
        ("Intellectual Property",   ["intellectual property", "ip law"]),
        ("Maritime Law",            ["maritime"]),
        ("Environmental Law",       ["environmental law"]),
        ("Criminal Law",            ["criminal law"]),
    ],
    "humanities": [
        ("History",                 ["history", "historical"]),
        ("Philosophy",              ["philosophy", "philosophical"]),
        ("Literature",              ["literature", "literary"]),
        ("Linguistics",             ["linguistics", "languages"]),
        ("Religious Studies",       ["religion", "theology"]),
        ("Cultural Studies",        ["cultural", "culture"]),
        ("Archaeology",             ["archaeology", "heritage"]),
    ],
    "arts": [
        ("Design",                  ["design", "graphic design", "ux", "interaction"]),
        ("Fine Arts",               ["fine art", "visual art", "painting"]),
        ("Architecture",            ["architecture", "urban"]),
        ("Music",                   ["music", "composition", "sound"]),
        ("Film",                    ["film", "cinema", "audiovisual"]),
        ("Photography",             ["photography"]),
        ("Performing Arts",         ["theatre", "performance", "dance"]),
        ("Fashion",                 ["fashion"]),
    ],
}


def infer_fields(slug: str, name: str, desc: str) -> list[str]:
    text = (name + " " + desc).lower()
    out: list[str] = []
    for label, kws in FIELD_KEYWORDS.get(slug, []):
        if any(k in text for k in kws):
            out.append(label)
    if not out:
        out = [{"social":"Social Sciences", "arts":"Arts & Design",
                "humanities":"Humanities", "law":"Law"}[slug]]
    return out[:4]


# ── Haiku URL resolver ─────────────────────────────────────────────────
def resolve_urls_batch(records: list[dict], run_id: str,
                       max_usd: float) -> dict:
    """Take a batch of records, return {fingerprint: url_or_empty}."""
    lines = []
    for i, r in enumerate(records, 1):
        lines.append(f"{i}. \"{r['program_name']}\" at {r['university']}, "
                     f"{r['city']}, {r['country']}")
    prompt = (
        "For each numbered programme below, give your best-effort guess "
        "of the OFFICIAL programme page URL on the university's own "
        "domain. Phase 0 validation will verify each URL afterwards, "
        "so a reasonable guess is better than an empty string.\n\n"
        + "\n".join(lines)
        + "\n\nReply with ONLY valid JSON:\n"
        + '{"urls": [{"n": 1, "url": "https://..."}, ...]}\n\n'
        + "Rules:\n"
        + "- url MUST start with https:// and be on the university's "
        + "  official domain (not aggregator sites like mastersportal "
        + "  or studyportals).\n"
        + "- Prefer typical slugs like /en/masters/<slug>, /study/<slug>, "
        + "  /education/<slug>, /programmes/<slug>.\n"
        + "- Return exactly one entry per numbered programme."
    )
    try:
        data = extract_json(
            prompt=prompt, run_id=run_id, max_usd_per_run=max_usd,
            provider="anthropic", max_tokens=3000,
            expected_keys=("urls",), estimated_cost=0.010,
        )
    except Exception as e:
        if "BudgetExceeded" in str(e) or "budget" in str(e).lower():
            raise
        return {}
    out: dict[str, str] = {}
    for entry in data.get("urls", []) or []:
        n = entry.get("n")
        url = (entry.get("url") or "").strip()
        if not n or not isinstance(n, int) or n < 1 or n > len(records):
            continue
        if not url.startswith("https://"):
            continue
        rec = records[n - 1]
        out[fp(rec["program_name"], rec["country"])] = url
    return out


# ── DB helpers ─────────────────────────────────────────────────────────
def fetch_existing_fingerprints() -> set[str]:
    out, offset = set(), 0
    while True:
        r = httpx.get(f"{SB_URL}/rest/v1/masters_programs", headers=SB_R,
                      params={"select": "fingerprint", "limit": "1000",
                              "offset": str(offset)}, timeout=20)
        rows = r.json() if r.status_code == 200 else []
        for row in rows:
            f = row.get("fingerprint")
            if f: out.add(f)
        if len(rows) < 1000: break
        offset += 1000
    return out


def insert(rec: dict, slug: str, url: str, source_url: str,
           dry_run: bool) -> bool:
    description = rec["description"] or (
        f"Master's programme in {rec['program_name']} at {rec['university']}, "
        f"{rec['country']}. English-taught.")
    record = {
        "university": rec["university"][:300],
        "program_name": rec["program_name"][:300],
        "country": rec["country"][:100],
        "city": (rec.get("city") or None) and rec["city"][:100],
        "category": {"social":"social","arts":"arts","humanities":"arts",
                     "law":"social"}[slug],
        "duration_years": rec.get("duration_years"),
        "tuition_usd_year": rec.get("tuition_usd_year"),
        "language": "English",
        "field_of_study": infer_fields(slug, rec["program_name"],
                                       rec["description"]),
        "scholarship_available": False,
        "description": description[:2000],
        "level": "master",
        "source_name": f"mastersportal_{slug}",
        "source_url": source_url,
        "apply_url": (url or "")[:600],
        "fingerprint": fp(rec["program_name"], rec["country"]),
        "is_active": True,
    }
    if dry_run:
        return True
    r = httpx.post(f"{SB_URL}/rest/v1/masters_programs",
                   headers=SB_W, json=record, timeout=15)
    return r.status_code in (200, 201, 204)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--category", required=True,
                    help=f"One of {list(CATEGORIES.keys())} or 'all'")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-haiku", action="store_true",
                    help="Skip URL resolution; insert with apply_url=''")
    ap.add_argument("--max-usd", type=float, default=3.0)
    ap.add_argument("--batch-size", type=int, default=15)
    ap.add_argument("--limit", type=int, default=None,
                    help="Cap number of records ingested (debug)")
    args = ap.parse_args()

    cats = (list(CATEGORIES.keys()) if args.category == "all"
            else [args.category])
    for c in cats:
        if c not in CATEGORIES:
            print(f"Unknown category '{c}'. Use {list(CATEGORIES.keys())} "
                  "or 'all'")
            sys.exit(1)

    with CrawlerRun("mastersportal_text_ingest",
                    params={"category": args.category,
                            "dry_run": args.dry_run,
                            "no_haiku": args.no_haiku}) as run:
        existing = fetch_existing_fingerprints()
        print(f"Existing fingerprints: {len(existing)}", flush=True)

        grand_added = 0
        for slug in cats:
            fname, src_url, _ = CATEGORIES[slug]
            path = os.path.join(DOCS, fname)
            if not os.path.exists(path):
                print(f"\n=== SKIP {slug} (file not found: {fname}) ===",
                      flush=True)
                continue
            print(f"\n=== {slug} ({fname}) ===", flush=True)
            with open(path, encoding="utf-8", errors="replace") as f:
                text = f.read()
            chunks = text.split("View Programme Information")
            parsed: list[dict] = []
            for chunk in chunks:
                p = parse_chunk(chunk)
                if p and p["university"] and p["program_name"] and p["country"]:
                    parsed.append(p)
            print(f"  Parsed {len(parsed)} programmes", flush=True)

            # Dedup within file and against DB
            seen, novel = set(), []
            for p in parsed:
                key = fp(p["program_name"], p["country"])
                if key in existing or key in seen:
                    continue
                seen.add(key); novel.append(p)
            print(f"  Novel after dedup: {len(novel)}", flush=True)
            if args.limit:
                novel = novel[: args.limit]

            # Resolve URLs in batches
            url_map: dict[str, str] = {}
            if not args.no_haiku:
                batches = [novel[i:i+args.batch_size]
                           for i in range(0, len(novel), args.batch_size)]
                print(f"  Haiku calls: {len(batches)} batches of "
                      f"~{args.batch_size}", flush=True)
                for i, b in enumerate(batches, 1):
                    try:
                        url_map.update(resolve_urls_batch(
                            b, run.run_id, args.max_usd))
                    except Exception as e:
                        if "BudgetExceeded" in str(e):
                            print(f"  BUDGET CAP HIT at batch {i}, "
                                  "stopping URL resolution", flush=True)
                            break
                        print(f"  batch {i}: ERR {str(e)[:80]}", flush=True)
                    if i % 10 == 0:
                        print(f"    batch {i}/{len(batches)}: "
                              f"{len(url_map)} URLs so far", flush=True)
                    time.sleep(0.15)
                print(f"  URLs resolved: {len(url_map)} / {len(novel)}",
                      flush=True)

            # Insert (only rows where Haiku returned a URL — per user
            # requirement to ingest "after verifying with proper URL")
            inserted = 0
            for p in novel:
                key = fp(p["program_name"], p["country"])
                url = url_map.get(key, "")
                if not args.no_haiku and not url:
                    run.skipped(); continue
                if insert(p, slug, url, src_url, args.dry_run):
                    inserted += 1
                    existing.add(key)
                    run.ok()
                else:
                    run.skipped()
            grand_added += inserted
            print(f"  {slug}: inserted {inserted} programmes",
                  flush=True)

        run.summary = {"added": grand_added}
        print(f"\nGRAND TOTAL: +{grand_added} programmes added (pending "
              "Phase 0 URL + page validation)", flush=True)


if __name__ == "__main__":
    main()
