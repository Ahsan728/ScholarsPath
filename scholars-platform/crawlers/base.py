"""
Base crawler class — all scrapers inherit from this.
"""

import hashlib
import logging
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Optional

import requests
from bs4 import BeautifulSoup
from fake_useragent import UserAgent
from tenacity import retry, stop_after_attempt, wait_exponential

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s — %(message)s",
)


@dataclass
class RawOpportunity:
    """Intermediate data structure before AI extraction."""

    title: str
    source_url: str
    source_name: str
    apply_url: str = ""
    raw_text: str = ""
    raw_html: str = ""
    deadline_raw: str = ""
    host_country_raw: str = ""
    type_hint: str = "scholarship"  # hint for AI extraction

    # Optional pre-parsed fields (if the page has structured data)
    deadline: Optional[str] = None           # ISO YYYY-MM-DD
    host_country: list = field(default_factory=list)
    eligible_nations: list = field(default_factory=lambda: ["ALL"])
    description: str = ""
    amount_raw: str = ""


class BaseCrawler(ABC):
    """
    Abstract base crawler.

    Subclasses must implement:
      - fetch() → list[RawOpportunity]

    Optionally override:
      - parse_deadline(raw) → str | None
      - post_fetch_hook(items) → list[RawOpportunity]
    """

    SOURCE_NAME: str = "Unknown"
    BASE_URL: str = ""
    CRAWL_DELAY: float = 1.5  # seconds between requests

    def __init__(self):
        self.logger = logging.getLogger(self.__class__.__name__)
        self.ua = UserAgent()
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": self.ua.random})

    # ----------------------------------------------------------
    # Public interface
    # ----------------------------------------------------------

    def run(self) -> list[RawOpportunity]:
        """Fetch, validate, and return cleaned raw opportunities."""
        self.logger.info(f"Starting crawl: {self.SOURCE_NAME}")
        start = time.time()

        try:
            items = self.fetch()
        except Exception as e:
            self.logger.error(f"fetch() failed: {e}")
            return []

        items = self.post_fetch_hook(items)
        items = [i for i in items if self._is_valid(i)]

        elapsed = time.time() - start
        self.logger.info(
            f"Crawl complete: {len(items)} items in {elapsed:.1f}s"
        )
        return items

    # ----------------------------------------------------------
    # Abstract — must implement
    # ----------------------------------------------------------

    @abstractmethod
    def fetch(self) -> list[RawOpportunity]:
        """Scrape the source and return raw opportunities."""
        ...

    # ----------------------------------------------------------
    # Hooks — override as needed
    # ----------------------------------------------------------

    def post_fetch_hook(self, items: list[RawOpportunity]) -> list[RawOpportunity]:
        return items

    # ----------------------------------------------------------
    # Helpers
    # ----------------------------------------------------------

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10))
    def get(self, url: str, **kwargs) -> requests.Response:
        self.session.headers["User-Agent"] = self.ua.random
        resp = self.session.get(url, timeout=30, **kwargs)
        resp.raise_for_status()
        time.sleep(self.CRAWL_DELAY)
        return resp

    def soup(self, html: str) -> BeautifulSoup:
        return BeautifulSoup(html, "lxml")

    def parse_deadline(self, raw: str) -> Optional[str]:
        """
        Try to parse a raw deadline string to ISO YYYY-MM-DD.
        Override in subclass for source-specific formats.
        """
        if not raw:
            return None
        from dateutil import parser as dp

        try:
            return dp.parse(raw, dayfirst=False).date().isoformat()
        except Exception:
            return None

    @staticmethod
    def fingerprint(title: str, host_country: list, deadline: Optional[str]) -> str:
        """
        SHA256-based deduplication key.
        Same title + host + deadline = same opportunity.
        """
        key = f"{title.lower().strip()}|{''.join(sorted(host_country))}|{deadline or ''}"
        return hashlib.sha256(key.encode()).hexdigest()

    @staticmethod
    def _is_valid(item: RawOpportunity) -> bool:
        return bool(item.title and item.source_url)
