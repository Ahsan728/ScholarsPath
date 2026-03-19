"""
Crawler: DAAD (German Academic Exchange Service)
URL: https://www.daad.de/en/study-and-research-in-germany/scholarships/

DAAD has a search API we can use to get scholarships.
"""

import re
from base import BaseCrawler, RawOpportunity

DAAD_API = "https://www.daad.de/en/study-and-research-in-germany/scholarships/"
DAAD_SEARCH_API = "https://api.daad.de/api/scholarships"


class DaadCrawler(BaseCrawler):
    SOURCE_NAME = "DAAD"
    BASE_URL = "https://www.daad.de"
    CRAWL_DELAY = 2.0

    # DAAD scholarship IDs for key BD-eligible programs
    BD_RELEVANT_PROGRAMS = [
        "50015295",  # DAAD Scholarships for Development-Related Postgraduate Courses
        "50076218",  # Research Grants - Doctoral Programmes in Germany
        "50076219",  # Research Grants - Short-Term Grants
        "50015283",  # Helmut-Schmidt-Programme
        "50015440",  # EPOS - Development-Related Postgraduate Courses
    ]

    def fetch(self) -> list[RawOpportunity]:
        items: list[RawOpportunity] = []

        # Try DAAD scholarship search page with different filters
        search_urls = [
            "https://www.daad.de/en/study-and-research-in-germany/scholarships/?origin=101&subjectGrpId=&stipeGrpId=2&countryCandidateId=101",
            "https://www.daad.de/en/study-and-research-in-germany/scholarships/?origin=101",
            "https://www.daad.de/en/find-funding/",
        ]

        for url in search_urls:
            try:
                resp = self.get(url)
                soup = self.soup(resp.text)

                # Look for scholarship cards/items
                cards = soup.select(
                    ".scholarship-item, .funding-item, .c-result-item, "
                    "[class*='scholarship'], [class*='funding'], .views-row"
                )

                if not cards:
                    # Try generic article/section selectors
                    cards = soup.select("article, .card, .item")

                self.logger.info(f"Found {len(cards)} items on {url}")

                for card in cards:
                    item = self._parse_card(card, url)
                    if item:
                        items.append(item)

                if items:
                    break

            except Exception as e:
                self.logger.warning(f"Failed to scrape {url}: {e}")
                continue

        # If HTML scraping fails, use known scholarship pages
        if not items:
            items = self._scrape_known_programs()

        return items

    def _parse_card(self, card, base_url: str):
        title_el = card.select_one("h2, h3, h4, .title, [class*='title']")
        if not title_el:
            return None
        title = title_el.get_text(strip=True)
        if not title or len(title) < 5:
            return None

        link_el = card.select_one("a[href]")
        detail_url = ""
        if link_el:
            href = link_el.get("href", "")
            if href.startswith("/"):
                detail_url = f"https://www.daad.de{href}"
            elif href.startswith("http"):
                detail_url = href

        deadline_el = card.select_one("[class*='deadline'], [class*='date'], time")
        deadline_raw = deadline_el.get_text(strip=True) if deadline_el else ""
        deadline = self.parse_deadline(deadline_raw)

        raw_text = card.get_text(separator="\n", strip=True)

        return RawOpportunity(
            title=title,
            source_url=detail_url or base_url,
            source_name=self.SOURCE_NAME,
            apply_url=detail_url or base_url,
            raw_text=f"Source: DAAD Germany\n{raw_text}",
            deadline=deadline,
            deadline_raw=deadline_raw,
            host_country=["DE"],
            type_hint=self._infer_type(title),
            eligible_nations=["ALL"],  # DAAD is generally open, AI will refine
        )

    def _scrape_known_programs(self) -> list[RawOpportunity]:
        """Scrape a curated list of DAAD scholarship landing pages."""
        known_pages = [
            (
                "https://www.daad.de/en/study-and-research-in-germany/scholarships/helmut-schmidt-programme/",
                "Helmut-Schmidt-Programme – Public Policy and Good Governance",
                "masters",
            ),
            (
                "https://www.daad.de/en/study-and-research-in-germany/scholarships/epos/",
                "EPOS – Development-Related Postgraduate Courses",
                "masters",
            ),
            (
                "https://www.daad.de/en/find-funding/undergraduate-opportunities/",
                "DAAD Undergraduate Scholarships",
                "scholarship",
            ),
            (
                "https://www.daad.de/en/study-and-research-in-germany/scholarships/research-grants/",
                "DAAD Research Grants",
                "grant",
            ),
        ]

        items = []
        for url, title, type_hint in known_pages:
            try:
                resp = self.get(url)
                soup = self.soup(resp.text)
                description = ""
                content = soup.select_one("main, .page-content, article")
                if content:
                    description = content.get_text(separator="\n", strip=True)[:500]

                items.append(
                    RawOpportunity(
                        title=title,
                        source_url=url,
                        source_name=self.SOURCE_NAME,
                        apply_url=url,
                        raw_text=f"Title: {title}\nSource: DAAD Germany\nCountry: Germany\n{description}",
                        host_country=["DE"],
                        type_hint=type_hint,
                        eligible_nations=["ALL"],
                        description=description,
                    )
                )
            except Exception as e:
                self.logger.warning(f"Failed to fetch {url}: {e}")

        return items

    def _infer_type(self, title: str) -> str:
        t = title.lower()
        if "phd" in t or "doctoral" in t:
            return "phd"
        if "postdoc" in t or "research grant" in t:
            return "grant"
        if "fellowship" in t:
            return "fellowship"
        if "master" in t or "postgraduate" in t:
            return "scholarship"
        return "scholarship"


if __name__ == "__main__":
    crawler = DaadCrawler()
    results = crawler.run()
    print(f"\n✓ {len(results)} opportunities from {crawler.SOURCE_NAME}")
    for r in results[:3]:
        print(f"  - {r.title[:80]}")
