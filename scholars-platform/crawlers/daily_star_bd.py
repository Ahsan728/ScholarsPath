"""
Crawler: The Daily Star Bangladesh — Scholarship Section
URL: https://www.thedailystar.net/tags/scholarship

The Daily Star regularly publishes scholarship announcements
with BD-specific context. Good for local + international opps
targeting BD nationals.
"""

from base import BaseCrawler, RawOpportunity

SEARCH_URLS = [
    "https://www.thedailystar.net/tags/scholarship",
    "https://www.thedailystar.net/tags/fellowships",
    "https://www.thedailystar.net/tags/phd-positions",
    "https://www.thedailystar.net/campus/news/scholarship",
]


class DailyStarBdCrawler(BaseCrawler):
    SOURCE_NAME = "The Daily Star BD"
    BASE_URL = "https://www.thedailystar.net"
    CRAWL_DELAY = 2.0

    def fetch(self) -> list[RawOpportunity]:
        items: list[RawOpportunity] = []
        seen_urls: set[str] = set()

        for url in SEARCH_URLS:
            try:
                resp = self.get(url)
                soup = self.soup(resp.text)

                # Daily Star article cards
                articles = soup.select(
                    "article, .article-item, .card, "
                    "[class*='article'], [class*='news-item'], "
                    ".views-row, .node"
                )

                self.logger.info(f"{url}: found {len(articles)} articles")

                for article in articles:
                    item = self._parse_article(article)
                    if item and item.source_url not in seen_urls:
                        seen_urls.add(item.source_url)
                        items.append(item)

            except Exception as e:
                self.logger.warning(f"Failed {url}: {e}")

        # Fetch full content for each article
        enriched = []
        for item in items[:30]:  # limit to 30 per crawl
            enriched.append(self._enrich_article(item))

        return enriched

    def _parse_article(self, article) -> RawOpportunity | None:
        # Title
        title_el = article.select_one(
            "h2 a, h3 a, h4 a, .title a, [class*='title'] a, a[href*='/news/']"
        )
        if not title_el:
            return None

        title = title_el.get_text(strip=True)
        href = title_el.get("href", "")
        if not title or not href:
            return None

        url = href if href.startswith("http") else f"{self.BASE_URL}{href}"

        # Skip non-scholarship articles
        title_lower = title.lower()
        keywords = [
            "scholarship", "fellowship", "grant", "phd", "postdoc",
            "stipend", "funding", "bursary", "award", "fully funded"
        ]
        if not any(k in title_lower for k in keywords):
            return None

        # Date
        date_el = article.select_one("time, .date, [class*='date'], [class*='time']")
        pub_date = date_el.get_text(strip=True) if date_el else ""

        # Excerpt
        excerpt_el = article.select_one("p, .summary, .excerpt, [class*='summary']")
        excerpt = excerpt_el.get_text(strip=True)[:300] if excerpt_el else ""

        return RawOpportunity(
            title=title,
            source_url=url,
            source_name=self.SOURCE_NAME,
            apply_url=url,
            raw_text=f"Title: {title}\nPublished: {pub_date}\nSource: The Daily Star Bangladesh\n{excerpt}",
            deadline_raw=pub_date,
            type_hint=self._infer_type(title),
            eligible_nations=["BD"],  # Daily Star = BD-centric content
            description=excerpt,
        )

    def _enrich_article(self, item: RawOpportunity) -> RawOpportunity:
        """Fetch full article content to get deadline and more details."""
        try:
            resp = self.get(item.source_url)
            soup = self.soup(resp.text)

            content_el = soup.select_one(
                ".field-items, .article-content, .entry-content, "
                "article .body, .story-content"
            )
            if content_el:
                full_text = content_el.get_text(separator="\n", strip=True)
                item.raw_text = (
                    f"Title: {item.title}\n"
                    f"Source: {self.SOURCE_NAME}\n"
                    f"URL: {item.source_url}\n\n"
                    f"{full_text}"
                )
                item.description = full_text[:500]

                # Try extract deadline from article body
                from opportunitydesk import OpportunityDeskCrawler
                deadline = OpportunityDeskCrawler._extract_deadline_from_text(
                    self, full_text
                )
                if deadline:
                    item.deadline = deadline

        except Exception as e:
            self.logger.debug(f"Could not enrich {item.source_url}: {e}")

        return item

    def _infer_type(self, title: str) -> str:
        t = title.lower()
        if "phd" in t or "doctoral" in t:
            return "phd"
        if "postdoc" in t:
            return "postdoc"
        if "fellowship" in t:
            return "fellowship"
        if "grant" in t:
            return "grant"
        if "intern" in t:
            return "internship"
        if "exchange" in t:
            return "exchange"
        return "scholarship"


if __name__ == "__main__":
    crawler = DailyStarBdCrawler()
    results = crawler.run()
    print(f"\n✓ {len(results)} opportunities from {crawler.SOURCE_NAME}")
    for r in results[:5]:
        print(f"  - {r.title[:80]}")
