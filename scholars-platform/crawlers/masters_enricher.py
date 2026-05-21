"""
Masters Program Enricher
========================
Fetches German master's programs (English-taught) from DAAD's public API
and upserts them into the masters_programs Supabase table.

Usage:
  python masters_enricher.py              # fetch DAAD programs
  python masters_enricher.py --dry-run    # print fetched data, don't save

Schedule via cron weekly to keep deadlines and tuition updated.
"""

import argparse
import json
import logging
import os
import sys
import time

import httpx
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [masters_enricher] %(levelname)s — %(message)s",
)
logger = logging.getLogger("masters_enricher")

# ── Supabase ──────────────────────────────────────────────────
_sb_url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
_sb_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
_sb_headers = {
    "apikey": _sb_key,
    "Authorization": f"Bearer {_sb_key}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates,return=representation",
}

# ── DAAD API ──────────────────────────────────────────────────
DAAD_API = (
    "https://www2.daad.de/deutschland/studienangebote/international-programmes"
    "/api/solr/en/search.json"
)

CATEGORY_MAP = {
    "computer science": "cs_ai",
    "information": "cs_ai",
    "software": "cs_ai",
    "data science": "cs_ai",
    "artificial intelligence": "cs_ai",
    "cybersecurity": "cs_ai",
    "electrical": "engineering",
    "mechanical": "engineering",
    "civil": "engineering",
    "chemical": "engineering",
    "environmental engineering": "engineering",
    "finance": "business",
    "economics": "business",
    "management": "business",
    "business": "business",
    "physics": "science",
    "chemistry": "science",
    "biology": "science",
    "biochemistry": "science",
    "materials": "science",
}

FIELD_MAP = {
    "cs_ai": ["Computer Science", "Artificial Intelligence", "Data Science", "Software Engineering"],
    "engineering": ["Engineering"],
    "business": ["Business", "Finance", "Economics", "Management"],
    "science": ["Natural Sciences"],
}


def infer_category(subject_name: str) -> str:
    name_lower = subject_name.lower()
    for keyword, cat in CATEGORY_MAP.items():
        if keyword in name_lower:
            return cat
    return "cs_ai"  # default


def fetch_daad_programs(rows: int = 200) -> list[dict]:
    """Fetch English-taught master's programs from DAAD."""
    params = {
        "q": "",
        "fq[]": ["lvls:master", "language_en:true"],
        "rows": rows,
        "start": 0,
        "sort": "score desc",
    }
    try:
        resp = httpx.get(DAAD_API, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        docs = data.get("response", {}).get("docs", [])
        logger.info(f"DAAD returned {len(docs)} programs")
        return docs
    except Exception as e:
        logger.error(f"DAAD fetch failed: {e}")
        return []


def parse_daad_program(doc: dict) -> dict | None:
    """Convert a DAAD API doc into our masters_programs schema."""
    try:
        name = doc.get("name_en", "") or doc.get("name", "")
        uni = doc.get("institution_en", "") or doc.get("institution", "")
        city = doc.get("city_en", "") or doc.get("city", "Germany")
        subject = doc.get("subject_en", "") or doc.get("subject", "")
        duration_raw = doc.get("duration", 4)  # semesters
        tuition = doc.get("tuition_fees_semester", None)
        deadline = doc.get("deadline", None)
        ielts = doc.get("ielts", None)
        gpa_min = doc.get("gpa", None)
        apply_url = doc.get("url", "") or doc.get("link", "")
        qs_ranking = None  # DAAD doesn't expose QS rank

        if not name or not uni:
            return None

        category = infer_category(subject)
        fields = FIELD_MAP.get(category, [subject]) if subject else FIELD_MAP.get(category, [])

        # Duration: DAAD gives semesters, we want years
        duration_years = round((duration_raw or 4) / 2, 1)

        # Tuition: DAAD gives per-semester in EUR, convert to USD/year (approx 1 EUR = 1.09 USD)
        tuition_usd_year = None
        if tuition and float(tuition) > 50:  # ignore semester fees < €50 (those are admin fees)
            tuition_usd_year = round(float(tuition) * 2 * 1.09)

        return {
            "university": uni,
            "program_name": name,
            "country": "Germany",
            "city": city,
            "category": category,
            "field_of_study": fields if fields else [subject],
            "duration_years": duration_years,
            "tuition_usd_year": tuition_usd_year,
            "language": "English",
            "ielts_min": float(ielts) if ielts else 6.5,
            "gre_required": False,
            "gpa_min": float(gpa_min) if gpa_min else None,
            "gpa_scale": 4.0,
            "intake": "Winter/Summer",
            "deadline": deadline,
            "scholarship_available": False,
            "description": f"English-taught Master's program at {uni}, Germany. Source: DAAD International Programmes database.",
            "requirements": [
                "Bachelor's degree in relevant field",
                "English proficiency (IELTS 6.5 or TOEFL equivalent)",
                "Motivation letter",
            ],
            "apply_url": apply_url,
            "qs_ranking": qs_ranking,
            "is_active": True,
        }
    except Exception as e:
        logger.warning(f"Parse error for doc {doc.get('id', '?')}: {e}")
        return None


def upsert_program(program: dict) -> bool:
    """Upsert a program into Supabase by (university, program_name) uniqueness."""
    # Check if it already exists
    check = httpx.get(
        f"{_sb_url}/rest/v1/masters_programs",
        headers=_sb_headers,
        params={
            "university": f"eq.{program['university']}",
            "program_name": f"eq.{program['program_name']}",
            "select": "id",
        },
        timeout=10,
    )
    existing = check.json()

    if existing and len(existing) > 0:
        # Update tuition and deadline only (don't overwrite curated data)
        prog_id = existing[0]["id"]
        patch_data = {}
        if program.get("tuition_usd_year") is not None:
            patch_data["tuition_usd_year"] = program["tuition_usd_year"]
        if program.get("deadline"):
            patch_data["deadline"] = program["deadline"]
        if patch_data:
            httpx.patch(
                f"{_sb_url}/rest/v1/masters_programs",
                headers=_sb_headers,
                params={"id": f"eq.{prog_id}"},
                json=patch_data,
                timeout=10,
            )
            logger.info(f"  Updated: {program['university']} — {program['program_name']}")
        return False  # not new
    else:
        # Insert
        resp = httpx.post(
            f"{_sb_url}/rest/v1/masters_programs",
            headers=_sb_headers,
            json=program,
            timeout=10,
        )
        if resp.status_code in (200, 201):
            logger.info(f"  Inserted: {program['university']} — {program['program_name']}")
            return True
        else:
            logger.warning(f"  Insert failed ({resp.status_code}): {resp.text[:200]}")
            return False


def main(dry_run: bool = False):
    logger.info("=== Masters Enricher starting ===")

    # 1. DAAD: German English-taught masters
    logger.info("Fetching from DAAD International Programmes…")
    daad_docs = fetch_daad_programs(rows=200)

    parsed = [parse_daad_program(d) for d in daad_docs]
    programs = [p for p in parsed if p is not None]
    logger.info(f"Parsed {len(programs)} valid programs from DAAD")

    if dry_run:
        print(json.dumps(programs[:5], indent=2, default=str))
        logger.info("Dry run — not saving to database")
        return

    new_count = 0
    for i, prog in enumerate(programs, 1):
        is_new = upsert_program(prog)
        if is_new:
            new_count += 1
        if i % 20 == 0:
            time.sleep(0.5)  # rate limit courtesy pause

    logger.info(f"=== Done: {new_count} new programs added, {len(programs) - new_count} updated ===")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Enrich masters_programs from DAAD")
    parser.add_argument("--dry-run", action="store_true", help="Fetch and parse but don't save")
    args = parser.parse_args()
    main(dry_run=args.dry_run)
