"""
Crawler: EURAXESS
URL: https://euraxess.ec.europa.eu/jobs/search

EURAXESS has a REST API endpoint we can query directly.
Falls back to HTML scraping if API changes.
"""

import re
from typing import Optional

from base import BaseCrawler, RawOpportunity

API_URL = "https://euraxess.ec.europa.eu/api/search/jobs"
SEARCH_URL = "https://euraxess.ec.europa.eu/jobs/search"


class EuraxessCrawler(BaseCrawler):
    SOURCE_NAME = "EURAXESS"
    BASE_URL = SEARCH_URL
    CRAWL_DELAY = 1.0

    def fetch(self) -> list[RawOpportunity]:
        items: list[RawOpportunity] = []

        # EURAXESS JSON API — fetch up to 100 latest opportunities
        params = {
            "keywords": "",
            "page": 1,
            "per_page": 100,
            "sort_by": "date",
            "sort_order": "DESC",
        }

        try:
            resp = self.get(API_URL, params=params)
            data = resp.json()
            jobs = data.get("results", data.get("jobs", []))
            self.logger.info(f"API returned {len(jobs)} jobs")

            for job in jobs:
                item = self._parse_api_job(job)
                if item:
                    items.append(item)

        except Exception as e:
            self.logger.warning(f"API failed ({e}), falling back to HTML scrape")
            items = self._scrape_html()

        return items

    def _parse_api_job(self, job: dict) -> Optional[RawOpportunity]:
        title = job.get("title") or job.get("job_title", "")
        if not title:
            return None

        job_id = job.get("id") or job.get("job_id", "")
        detail_url = f"https://euraxess.ec.europa.eu/jobs/{job_id}" if job_id else SEARCH_URL

        deadline_raw = (
            job.get("application_deadline")
            or job.get("deadline")
            or job.get("closing_date", "")
        )
        deadline = self.parse_deadline(str(deadline_raw)) if deadline_raw else None

        country_raw = (
            job.get("organisation_country")
            or job.get("country")
            or job.get("location_country", "")
        )
        host_country = [country_raw[:2].upper()] if country_raw else []

        job_type_raw = job.get("type") or job.get("job_type", "")
        type_hint = self._map_type(str(job_type_raw))

        description = (
            job.get("summary") or job.get("description") or job.get("abstract", "")
        )

        raw_text = (
            f"Title: {title}\n"
            f"Type: {job_type_raw}\n"
            f"Country: {country_raw}\n"
            f"Deadline: {deadline_raw}\n"
            f"Description: {description}\n"
            f"Organisation: {job.get('organisation_name', '')}\n"
            f"Field: {job.get('research_field', '')}"
        )

        return RawOpportunity(
            title=title,
            source_url=detail_url,
            source_name=self.SOURCE_NAME,
            apply_url=job.get("apply_url") or detail_url,
            raw_text=raw_text,
            deadline=deadline,
            deadline_raw=str(deadline_raw),
            host_country=host_country,
            type_hint=type_hint,
            description=str(description)[:500],
        )

    def _scrape_html(self) -> list[RawOpportunity]:
        """HTML fallback scraper."""
        items: list[RawOpportunity] = []
        page = 0
        max_pages = 5

        while page < max_pages:
            url = f"{SEARCH_URL}?page={page}"
            resp = self.get(url)
            soup = self.soup(resp.text)

            cards = soup.select(".job-item, .views-row, article.node--job")
            if not cards:
                break

            for card in cards:
                title_el = card.select_one("h2, h3, .job-title, .field-title")
                title = title_el.get_text(strip=True) if title_el else ""
                if not title:
                    continue

                link_el = card.select_one("a[href*='/jobs/']")
                detail_url = ""
                if link_el:
                    href = link_el.get("href", "")
                    detail_url = href if href.startswith("http") else f"https://euraxess.ec.europa.eu{href}"

                deadline_el = card.select_one(".deadline, .date, [class*='deadline']")
                deadline_raw = deadline_el.get_text(strip=True) if deadline_el else ""
                deadline = self.parse_deadline(deadline_raw)

                raw_text = card.get_text(separator="\n", strip=True)

                items.append(
                    RawOpportunity(
                        title=title,
                        source_url=detail_url or SEARCH_URL,
                        source_name=self.SOURCE_NAME,
                        apply_url=detail_url,
                        raw_text=raw_text,
                        deadline=deadline,
                        deadline_raw=deadline_raw,
                        type_hint="phd",
                    )
                )

            page += 1

        return items

    def _map_type(self, raw: str) -> str:
        raw = raw.lower()
        if "phd" in raw or "doctoral" in raw:
            return "phd"
        if "postdoc" in raw or "post-doc" in raw:
            return "postdoc"
        if "fellowship" in raw:
            return "fellowship"
        if "grant" in raw:
            return "grant"
        if "intern" in raw:
            return "internship"
        return "scholarship"


if __name__ == "__main__":
    crawler = EuraxessCrawler()
    results = crawler.run()
    print(f"\n✓ {len(results)} opportunities from {crawler.SOURCE_NAME}")
    for r in results[:3]:
        print(f"  - {r.title[:80]}")
