"""
AI Extraction Pipeline
======================
Orchestrates the full flow:
  RawOpportunity → Claude Haiku (extract) → HuggingFace (embed) → Pinecone + Supabase

Usage:
  python pipeline.py                  # Run all crawlers
  python pipeline.py --source shed    # Run specific crawler
  python pipeline.py --dry-run        # Extract only, don't save
"""

import argparse
import hashlib
import json
import logging
import os
import sys
import time
from dataclasses import asdict
from datetime import datetime
from typing import Optional

import anthropic
import httpx
import requests
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s — %(message)s",
)
logger = logging.getLogger("pipeline")

# ============================================================
# CLIENTS
# ============================================================

anthropic_client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

_sb_url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
_sb_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
_sb_headers = {
    "apikey": _sb_key,
    "Authorization": f"Bearer {_sb_key}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

PINECONE_API_KEY = os.environ.get("PINECONE_API_KEY", "")
PINECONE_INDEX   = os.environ.get("PINECONE_INDEX_NAME", "scholars-opportunities")
HF_TOKEN         = os.environ.get("HUGGINGFACE_API_TOKEN", "")

# ============================================================
# CRAWLER REGISTRY
# ============================================================

def get_crawlers():
    """Import and return all crawler instances."""
    sys.path.insert(0, os.path.dirname(__file__))

    crawlers = {}

    try:
        from shed_gov_bd import ShedGovBdCrawler
        crawlers["shed"] = ShedGovBdCrawler()
    except Exception as e:
        logger.warning(f"SHED crawler unavailable: {e}")

    try:
        from euraxess import EuraxessCrawler
        crawlers["euraxess"] = EuraxessCrawler()
    except Exception as e:
        logger.warning(f"EURAXESS crawler unavailable: {e}")

    try:
        from daad import DaadCrawler
        crawlers["daad"] = DaadCrawler()
    except Exception as e:
        logger.warning(f"DAAD crawler unavailable: {e}")

    try:
        from opportunitydesk import OpportunityDeskCrawler
        crawlers["opportunitydesk"] = OpportunityDeskCrawler()
    except Exception as e:
        logger.warning(f"OpportunityDesk crawler unavailable: {e}")

    try:
        from daily_star_bd import DailyStarBdCrawler
        crawlers["dailystar"] = DailyStarBdCrawler()
    except Exception as e:
        logger.warning(f"Daily Star crawler unavailable: {e}")

    try:
        from scholars4dev import Scholars4DevCrawler
        crawlers["scholars4dev"] = Scholars4DevCrawler()
    except Exception as e:
        logger.warning(f"scholars4dev crawler unavailable: {e}")

    try:
        from campus_france_bd import CampusFranceBdCrawler
        crawlers["campus_france_bd"] = CampusFranceBdCrawler()
    except Exception as e:
        logger.warning(f"Campus France BD crawler unavailable: {e}")

    return crawlers

# ============================================================
# STEP 1: AI EXTRACTION (Claude Haiku)
# ============================================================

EXTRACTION_PROMPT = """Extract structured scholarship/opportunity data from the text below.
Return ONLY valid JSON (no markdown, no explanation).

Required JSON structure:
{
  "title": "Full official title",
  "type": "scholarship|grant|phd|postdoc|fellowship|internship|bursary|exchange",
  "host_country": ["ISO-2 codes of host/destination country, e.g. DE, GB, JP"],
  "eligible_nations": ["ALL"] or ["BD","PK","NG"] or ["DEVELOPING"] or ["COMMONWEALTH"],
  "ineligible_nations": ["ISO-2 codes of excluded nationalities"],
  "field_of_study": ["Computer Science","Engineering","etc"] or [],
  "degree_level": "undergraduate|masters|phd|postdoc|any",
  "funding_type": "full|partial|stipend|salary|null",
  "amount_usd": numeric_or_null,
  "currency": "USD|EUR|GBP|etc or null",
  "deadline": "YYYY-MM-DD or null",
  "description": "2-3 sentence summary in English",
  "eligibility_text": "Key eligibility requirements",
  "requirements": ["requirement 1", "requirement 2"],
  "apply_url": "direct application URL or empty string",
  "is_scam": false
}

Rules:
- eligible_nations: ["ALL"] if open to everyone, ["DEVELOPING"] for developing countries,
  specific ISO-2 codes if restricted, e.g. ["BD"] means Bangladesh only
- For SHED MoEdu BD opportunities: eligible_nations must be ["BD"]
- Deadline must be in YYYY-MM-DD format. If only month/year given, use last day of month.
- is_scam: true only if text has money requests, suspicious links, or no official source
- Keep description factual, concise, in English

Text to extract:
"""


def extract_with_claude(raw_text: str, type_hint: str = "scholarship") -> dict:
    """Use Claude Haiku to extract structured data from raw scraped text."""
    try:
        user_content = raw_text[:3000]
        if type_hint != "scholarship":
            user_content += f"\n\nHint: This appears to be a {type_hint}."

        response = anthropic_client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=2048,
            system=[{"type": "text", "text": EXTRACTION_PROMPT,
                     "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": user_content}],
        )

        usage = response.usage
        logger.debug(
            f"Claude usage — input: {usage.input_tokens}, "
            f"output: {usage.output_tokens}, "
            f"cache_created: {getattr(usage, 'cache_creation_input_tokens', 0)}, "
            f"cache_read: {getattr(usage, 'cache_read_input_tokens', 0)}"
        )

        text = response.content[0].text.strip()

        # Strip markdown code blocks if present
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        text = text.strip()

        return json.loads(text)

    except json.JSONDecodeError as e:
        logger.warning(f"JSON parse error: {e}")
        return {}
    except Exception as e:
        logger.error(f"Claude extraction failed: {e}")
        return {}

# ============================================================
# STEP 2: EMBEDDING (HuggingFace free tier)
# ============================================================

_st_model = None

def _get_st_model():
    global _st_model
    if _st_model is None:
        from sentence_transformers import SentenceTransformer
        logger.info("Loading sentence-transformers model (first run may download ~90MB)...")
        _st_model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
    return _st_model


def embed_text(text: str) -> list[float]:
    """Generate embedding vector using local sentence-transformers model."""
    try:
        model = _get_st_model()
        vector = model.encode(text[:512], normalize_embeddings=True)
        return vector.tolist()
    except Exception as e:
        logger.warning(f"Embedding failed: {e}")
        return []

# ============================================================
# STEP 3: UPSERT TO PINECONE
# ============================================================

def upsert_to_pinecone(opp_id: str, vector: list[float], metadata: dict) -> bool:
    """Upsert a single vector to Pinecone."""
    if not vector or not PINECONE_API_KEY:
        return False

    try:
        from pinecone import Pinecone
        pc = Pinecone(api_key=PINECONE_API_KEY)
        index = pc.Index(PINECONE_INDEX)

        # Pinecone metadata: flatten arrays to strings where needed
        safe_meta = {
            "title": str(metadata.get("title", ""))[:500],
            "type": str(metadata.get("type", "scholarship")),
            "host_country": metadata.get("host_country", []),
            "eligible_nations": metadata.get("eligible_nations", ["ALL"]),
            "field_of_study": metadata.get("field_of_study", []),
            "degree_level": str(metadata.get("degree_level", "any")),
            "deadline": str(metadata.get("deadline") or ""),
            "source_name": str(metadata.get("source_name", ""))[:100],
            "status": str(metadata.get("status", "open")),
        }

        index.upsert(vectors=[{"id": opp_id, "values": vector, "metadata": safe_meta}])
        return True

    except Exception as e:
        logger.error(f"Pinecone upsert failed for {opp_id}: {e}")
        return False

# ============================================================
# STEP 4: UPSERT TO SUPABASE
# ============================================================

def make_fingerprint(title: str, host_country: list, deadline: Optional[str]) -> str:
    key = f"{title.lower().strip()}|{''.join(sorted(host_country))}|{deadline or ''}"
    return hashlib.sha256(key.encode()).hexdigest()


def upsert_to_supabase(extracted: dict, raw: "RawOpportunity", embedding_id: str = "") -> Optional[str]:
    """
    Upsert opportunity to Supabase via direct REST API (bypasses supabase-py auth quirks).
    Returns the opportunity UUID or None on failure.
    """
    title = extracted.get("title") or raw.title
    if not title:
        return None

    host_country = extracted.get("host_country") or raw.host_country or []
    deadline = extracted.get("deadline") or raw.deadline
    fingerprint = make_fingerprint(title, host_country, deadline)

    rest = f"{_sb_url}/rest/v1"

    # Check if already exists
    try:
        resp = httpx.get(
            f"{rest}/opportunities",
            headers=_sb_headers,
            params={"select": "id", "fingerprint": f"eq.{fingerprint}"},
            timeout=15,
        )
        resp.raise_for_status()
        existing = resp.json()
    except Exception as e:
        logger.error(f"Supabase check failed for '{title[:60]}': {e}")
        return None

    record = {
        "title": title,
        "type": extracted.get("type", raw.type_hint or "scholarship"),
        "host_country": host_country,
        "eligible_nations": extracted.get("eligible_nations") or raw.eligible_nations or ["ALL"],
        "ineligible_nations": extracted.get("ineligible_nations", []),
        "field_of_study": extracted.get("field_of_study", []),
        "degree_level": extracted.get("degree_level", "any"),
        "funding_type": extracted.get("funding_type"),
        "amount_usd": extracted.get("amount_usd"),
        "currency": extracted.get("currency"),
        "deadline": deadline,
        "status": "closed" if _is_past_deadline(deadline) else "open",
        "description": extracted.get("description") or raw.description or title,
        "eligibility_text": extracted.get("eligibility_text"),
        "requirements": extracted.get("requirements", []),
        "apply_url": extracted.get("apply_url") or raw.apply_url or raw.source_url,
        "source_url": raw.source_url,
        "source_name": raw.source_name,
        "scam_score": 0.9 if extracted.get("is_scam") else 0.0,
        "fingerprint": fingerprint,
        "embedding_id": embedding_id,
        "is_verified": False,
        "is_featured": False,
    }

    try:
        if existing:
            opp_id = existing[0]["id"]
            httpx.patch(
                f"{rest}/opportunities",
                headers=_sb_headers,
                params={"id": f"eq.{opp_id}"},
                json=record,
                timeout=15,
            ).raise_for_status()
            logger.debug(f"Updated: {title[:60]}")
            return opp_id
        else:
            resp = httpx.post(
                f"{rest}/opportunities",
                headers=_sb_headers,
                json=record,
                timeout=15,
            )
            resp.raise_for_status()
            opp_id = resp.json()[0]["id"]
            logger.info(f"Inserted: {title[:60]}")
            return opp_id

    except Exception as e:
        logger.error(f"Supabase upsert failed for '{title[:60]}': {e}")
        return None


def _is_past_deadline(deadline: Optional[str]) -> bool:
    if not deadline:
        return False
    try:
        return datetime.strptime(deadline, "%Y-%m-%d").date() < datetime.now().date()
    except Exception:
        return False


def upsert_direct_to_supabase(record: dict, embedding_id: str = "") -> Optional[str]:
    """Upsert a pre-structured opportunity dict directly to Supabase (no Claude)."""
    title = record.get("title", "")
    fingerprint = record.get("fingerprint") or make_fingerprint(
        title, record.get("host_country", []), record.get("deadline")
    )
    rest = f"{_sb_url}/rest/v1"

    try:
        resp = httpx.get(
            f"{rest}/opportunities",
            headers=_sb_headers,
            params={"select": "id", "fingerprint": f"eq.{fingerprint}"},
            timeout=15,
        )
        resp.raise_for_status()
        existing = resp.json()
    except Exception as e:
        logger.error(f"Supabase check failed for '{title[:60]}': {e}")
        return None

    db_record = {
        "title": title,
        "type": record.get("type", "scholarship"),
        "host_country": record.get("host_country", []),
        "eligible_nations": record.get("eligible_nations", ["ALL"]),
        "ineligible_nations": record.get("ineligible_nations", []),
        "field_of_study": record.get("field_of_study", []),
        "degree_level": record.get("degree_level", "any"),
        "funding_type": record.get("funding_type"),
        "amount_usd": record.get("amount_usd"),
        "currency": record.get("currency"),
        "deadline": record.get("deadline"),
        "status": record.get("status", "open"),
        "description": record.get("description", title),
        "eligibility_text": record.get("eligibility_text"),
        "requirements": record.get("requirements", []),
        "apply_url": record.get("apply_url", ""),
        "source_url": record.get("source_url", ""),
        "source_name": record.get("source_name", ""),
        "scam_score": record.get("scam_score", 0),
        "fingerprint": fingerprint,
        "embedding_id": embedding_id,
        "is_verified": record.get("is_verified", False),
        "is_featured": record.get("is_featured", False),
    }

    try:
        if existing:
            opp_id = existing[0]["id"]
            httpx.patch(
                f"{rest}/opportunities",
                headers=_sb_headers,
                params={"id": f"eq.{opp_id}"},
                json=db_record,
                timeout=15,
            ).raise_for_status()
            logger.debug(f"Updated: {title[:60]}")
            return opp_id
        else:
            resp = httpx.post(
                f"{rest}/opportunities",
                headers=_sb_headers,
                json=db_record,
                timeout=15,
            )
            resp.raise_for_status()
            opp_id = resp.json()[0]["id"]
            logger.info(f"Inserted: {title[:60]}")
            return opp_id
    except Exception as e:
        logger.error(f"Supabase upsert failed for '{title[:60]}': {e}")
        return None


def process_direct_opportunity(record: dict, dry_run: bool = False) -> dict:
    """Handle pre-structured opportunity dicts (no Claude extraction needed)."""
    title = record.get("title", "")
    if not title:
        return {"title": "", "status": "skipped"}

    if dry_run:
        return {"title": title, "status": "dry_run", "extracted": record}

    embed_input = (
        f"{title} "
        f"{record.get('description', '')} "
        f"{' '.join(record.get('field_of_study', []))} "
        f"{' '.join(record.get('host_country', []))} "
        f"{record.get('degree_level', '')}"
    )
    vector = embed_text(embed_input)

    fingerprint = record.get("fingerprint", "")
    opp_id = upsert_direct_to_supabase(record, embedding_id=fingerprint)
    if not opp_id:
        return {"title": title, "status": "db_error"}

    if vector:
        pinecone_ok = upsert_to_pinecone(opp_id, vector, {
            "title": title,
            "type": record.get("type", "scholarship"),
            "host_country": record.get("host_country", []),
            "eligible_nations": record.get("eligible_nations", ["ALL"]),
            "field_of_study": record.get("field_of_study", []),
            "degree_level": record.get("degree_level", "any"),
            "deadline": record.get("deadline"),
            "source_name": record.get("source_name", ""),
            "status": "open",
        })
        if pinecone_ok:
            httpx.patch(
                f"{_sb_url}/rest/v1/opportunities",
                headers=_sb_headers,
                params={"id": f"eq.{opp_id}"},
                json={"embedding_id": opp_id},
                timeout=15,
            )

    return {"title": title, "status": "ok", "id": opp_id}

# ============================================================
# MAIN PIPELINE
# ============================================================

def process_opportunity(raw, dry_run: bool = False) -> dict:
    """Full pipeline for a single RawOpportunity."""
    result = {"title": raw.title, "status": "skipped", "is_new": False}

    # 1. AI extraction
    extracted = extract_with_claude(raw.raw_text, raw.type_hint)
    if not extracted or isinstance(extracted, list):
        logger.warning(f"Extraction failed for: {raw.title[:60]}")
        result["status"] = "extraction_failed"
        return result

    # Skip scam opportunities
    if extracted.get("is_scam"):
        logger.info(f"Scam detected: {raw.title[:60]}")
        result["status"] = "scam"
        return result

    if dry_run:
        result["status"] = "dry_run"
        result["extracted"] = extracted
        return result

    # 2. Build embedding text
    embed_text_input = (
        f"{extracted.get('title', raw.title)} "
        f"{extracted.get('description', '')} "
        f"{' '.join(extracted.get('field_of_study', []))} "
        f"{' '.join(extracted.get('host_country', []))} "
        f"{extracted.get('degree_level', '')}"
    )

    # 3. Generate embedding
    vector = embed_text(embed_text_input)

    # 4. Save to Supabase first to get UUID
    title = extracted.get("title", raw.title)
    host_country = extracted.get("host_country", raw.host_country or [])
    deadline = extracted.get("deadline") or raw.deadline
    fingerprint = make_fingerprint(title, host_country, deadline)

    opp_id = upsert_to_supabase(extracted, raw, embedding_id=fingerprint)
    if not opp_id:
        result["status"] = "db_error"
        return result

    # 5. Upsert to Pinecone
    if vector:
        pinecone_ok = upsert_to_pinecone(opp_id, vector, {
            "title": title,
            "type": extracted.get("type", "scholarship"),
            "host_country": host_country,
            "eligible_nations": extracted.get("eligible_nations", ["ALL"]),
            "field_of_study": extracted.get("field_of_study", []),
            "degree_level": extracted.get("degree_level", "any"),
            "deadline": deadline,
            "source_name": raw.source_name,
            "status": "open",
        })
        if pinecone_ok:
            httpx.patch(
                f"{_sb_url}/rest/v1/opportunities",
                headers=_sb_headers,
                params={"id": f"eq.{opp_id}"},
                json={"embedding_id": opp_id},
                timeout=15,
            )

    result["status"] = "ok"
    result["id"] = opp_id
    return result


def run_pipeline(source_filter: Optional[str] = None, dry_run: bool = False):
    """Run all crawlers and process results."""
    crawlers = get_crawlers()

    if source_filter:
        crawlers = {k: v for k, v in crawlers.items() if source_filter in k}
        if not crawlers:
            logger.error(f"No crawler found for: {source_filter}")
            return

    stats = {"total": 0, "ok": 0, "skipped": 0, "failed": 0, "scam": 0}

    for name, crawler in crawlers.items():
        logger.info(f"\n{'='*50}")
        logger.info(f"Running crawler: {name}")
        logger.info(f"{'='*50}")

        raw_items = crawler.run()
        logger.info(f"Crawler returned {len(raw_items)} items")

        for raw in raw_items:
            stats["total"] += 1
            try:
                if isinstance(raw, dict):
                    result = process_direct_opportunity(raw, dry_run=dry_run)
                else:
                    result = process_opportunity(raw, dry_run=dry_run)
                if result["status"] == "ok":
                    stats["ok"] += 1
                elif result["status"] == "scam":
                    stats["scam"] += 1
                elif result["status"] in ("extraction_failed", "db_error"):
                    stats["failed"] += 1
                else:
                    stats["skipped"] += 1

                # Rate limit: avoid hammering APIs
                time.sleep(0.5)

            except Exception as e:
                logger.error(f"Pipeline error for '{raw.title[:60]}': {e}")
                stats["failed"] += 1

        logger.info(f"Crawler {name} done.")

    logger.info("\n" + "="*50)
    logger.info("PIPELINE COMPLETE")
    logger.info(f"  Total processed : {stats['total']}")
    logger.info(f"  Successfully saved : {stats['ok']}")
    logger.info(f"  Scam filtered : {stats['scam']}")
    logger.info(f"  Failed : {stats['failed']}")
    logger.info(f"  Skipped : {stats['skipped']}")
    logger.info("="*50)

    return stats


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="scholars.ahsansuny.com data pipeline")
    parser.add_argument("--source", type=str, help="Run specific crawler (shed, euraxess, daad, ...)")
    parser.add_argument("--dry-run", action="store_true", help="Extract only, do not save")
    args = parser.parse_args()

    run_pipeline(source_filter=args.source, dry_run=args.dry_run)
