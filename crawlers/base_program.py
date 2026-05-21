"""
Base class for all program crawlers (Track 2 — Programs pipeline).
No Claude, no Pinecone — programs come from structured public APIs.
"""

import hashlib
import logging
import os
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional

import httpx
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

_sb_url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
_sb_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
_sb_headers = {
    "apikey": _sb_key,
    "Authorization": f"Bearer {_sb_key}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}


@dataclass
class RawProgram:
    program_name: str
    university: str
    country: str
    city: str
    level: str                              # 'bachelor' | 'master' | 'language'
    source_name: str
    source_url: str = ""
    apply_url: str = ""
    category: str = "cs_ai"
    field_of_study: list = field(default_factory=list)
    duration_years: float = 2.0
    tuition_usd_year: Optional[float] = None  # None = free / not specified
    language: str = "English"
    ielts_min: Optional[float] = None
    gre_required: bool = False
    gpa_min: Optional[float] = None
    gpa_scale: float = 4.0
    intake: str = "Annual"
    deadline: Optional[str] = None
    scholarship_available: bool = False
    description: str = ""
    requirements: list = field(default_factory=list)
    qs_ranking: Optional[int] = None


class BaseProgramCrawler(ABC):
    SOURCE_NAME: str = "unknown"
    CRAWL_DELAY: float = 0.5   # seconds between upserts

    def __init__(self):
        self.logger = logging.getLogger(self.__class__.__name__)

    @abstractmethod
    def fetch(self) -> list[RawProgram]:
        """Fetch raw programs from the source. Must be implemented by subclasses."""
        ...

    def run(self) -> tuple[int, int]:
        """
        Fetch and upsert all programs.
        Returns (new_count, updated_count).
        """
        items = self.fetch()
        self.logger.info(f"{self.SOURCE_NAME}: fetched {len(items)} programs")
        new_count = 0
        updated_count = 0
        for prog in items:
            result = self._upsert(prog)
            if result == "inserted":
                new_count += 1
            elif result == "updated":
                updated_count += 1
            time.sleep(self.CRAWL_DELAY)
        self.logger.info(
            f"{self.SOURCE_NAME}: {new_count} new, {updated_count} updated"
        )
        return new_count, updated_count

    @staticmethod
    def make_fingerprint(program_name: str, country: str, level: str) -> str:
        key = f"{program_name.lower().strip()}|{country.lower().strip()}|{level}"
        return hashlib.sha256(key.encode()).hexdigest()

    def _upsert(self, prog: RawProgram) -> str:
        """
        Upsert a program by fingerprint.
        Returns 'inserted', 'updated', or 'skipped' on error.
        """
        fp = self.make_fingerprint(prog.program_name, prog.country, prog.level)

        # Check if fingerprint already exists
        try:
            check = httpx.get(
                f"{_sb_url}/rest/v1/masters_programs",
                headers=_sb_headers,
                params={"select": "id", "fingerprint": f"eq.{fp}"},
                timeout=10,
            )
            existing = check.json()
        except Exception as e:
            self.logger.warning(f"Check failed for '{prog.program_name}': {e}")
            return "skipped"

        if existing and isinstance(existing, list) and len(existing) > 0:
            # Update only volatile fields — never overwrite curated descriptions
            patch_data: dict = {"updated_at": "now()"}
            if prog.tuition_usd_year is not None:
                patch_data["tuition_usd_year"] = prog.tuition_usd_year
            if prog.deadline:
                patch_data["deadline"] = prog.deadline
            if prog.apply_url:
                patch_data["apply_url"] = prog.apply_url
            try:
                httpx.patch(
                    f"{_sb_url}/rest/v1/masters_programs",
                    headers=_sb_headers,
                    params={"fingerprint": f"eq.{fp}"},
                    json=patch_data,
                    timeout=10,
                )
            except Exception as e:
                self.logger.warning(f"Patch failed for '{prog.program_name}': {e}")
            return "updated"

        # Insert new row
        record = {
            "program_name": prog.program_name,
            "university": prog.university,
            "country": prog.country,
            "city": prog.city,
            "level": prog.level,
            "source_name": prog.source_name,
            "source_url": prog.source_url,
            "apply_url": prog.apply_url,
            "category": prog.category,
            "field_of_study": prog.field_of_study,
            "duration_years": prog.duration_years,
            "tuition_usd_year": prog.tuition_usd_year,
            "language": prog.language,
            "ielts_min": prog.ielts_min,
            "gre_required": prog.gre_required,
            "gpa_min": prog.gpa_min,
            "gpa_scale": prog.gpa_scale,
            "intake": prog.intake,
            "deadline": prog.deadline,
            "scholarship_available": prog.scholarship_available,
            "description": prog.description,
            "requirements": prog.requirements,
            "qs_ranking": prog.qs_ranking,
            "fingerprint": fp,
            "is_active": True,
        }
        try:
            resp = httpx.post(
                f"{_sb_url}/rest/v1/masters_programs",
                headers=_sb_headers,
                json=record,
                timeout=10,
            )
            if resp.status_code in (200, 201):
                self.logger.debug(f"Inserted: {prog.university} — {prog.program_name}")
                return "inserted"
            else:
                self.logger.warning(
                    f"Insert failed ({resp.status_code}) for '{prog.program_name}': {resp.text[:200]}"
                )
                return "skipped"
        except Exception as e:
            self.logger.warning(f"Insert exception for '{prog.program_name}': {e}")
            return "skipped"
