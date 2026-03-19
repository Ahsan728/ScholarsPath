"""
Crawler: OpportunityDesk
URL: https://opportunitydesk.org

OpportunityDesk has a clean blog-style listing with:
  - Category pages (/category/scholarships/, /category/fellowships/, etc.)
  - RSS feeds available
  - Individual post pages with structured content
  - Often tags BD-eligible opportunities
"""

from base import BaseCrawler, RawOpportunity

CATEGORIES = [
    ("https://opportunitydesk.org/category/scholarships/", "scholarship"),
    ("https://opportunitydesk.org/category/fellowships/", "fellowship"),
    ("https://opportunitydesk.org/category/grants/", "grant"),
    ("https://opportunitydesk.org/category/internships/", "internship"),
    ("https://opportunitydesk.org/category/exchange-programs/", "exchange"),
]

RSS_FEEDS = [
    "https://opportunitydesk.org/category/scholarships/feed/",
    "https://opportunitydesk.org/category/fellowships/feed/",
    "https://opportunitydesk.org/feed/",
]


class OpportunityDeskCrawler(BaseCrawler):
    SOURCE_NAME = "OpportunityDesk"
    BASE_URL = "https://opportunitydesk.org"
    CRAWL_DELAY = 1.5

    def fetch(self) -> list[RawOpportunity]:
        items: list[RawOpportunity] = []
        seen_urls: set[str] = set()

        # Primary: RSS feeds (faster, structured)
        for feed_url in RSS_FEEDS:
            feed_items = self._parse_rss(feed_url)
            for item in feed_items:
                if item.source_url not in seen_urls:
                    seen_urls.add(item.source_url)
                    items.append(item)

        # Fallback: HTML category pages if RSS is thin
        if len(items) < 20:
            for cat_url, type_hint in CATEGORIES:
                cat_items = self._scrape_category(cat_url, type_hint)
                for item in cat_items:
                    if item.source_url not in seen_urls:
                        seen_urls.add(item.source_url)
                        items.append(item)

        self.logger.info(f"Total items collected: {len(items)}")
        return items

    def _parse_rss(self, feed_url: str) -> list[RawOpportunity]:
        """Parse RSS feed — much faster than HTML scraping."""
        import xml.etree.ElementTree as ET

        items = []
        try:
            resp = self.get(feed_url)
            root = ET.fromstring(resp.text)
            channel = root.find("channel")
            if channel is None:
                return []

            entries = channel.findall("item")
            self.logger.info(f"RSS {feed_url}: {len(entries)} entries")

            for entry in entries[:30]:  # limit per feed
                title = (entry.findtext("title") or "").strip()
                link = (entry.findtext("link") or "").strip()
                pub_date = (entry.findtext("pubDate") or "").strip()
                description = (entry.findtext("description") or "").strip()
                # Remove HTML tags from description
                from bs4 import BeautifulSoup
                desc_text = BeautifulSoup(description, "lxml").get_text(strip=True)

                if not title or not link:
                    continue

                # Determine type from categories
                cats = [c.text for c in entry.findall("category") if c.text]
                type_hint = self._cats_to_type(cats)

                # Fetch full post for more detail
                full_text = desc_text
                deadline = None
                try:
                    post_resp = self.get(link)
                    post_soup = self.soup(post_resp.text)
                    content_el = post_soup.select_one(
                        ".entry-content, .post-content, article"
                    )
                    if content_el:
                        full_text = content_el.get_text(separator="\n", strip=True)

                    # Look for deadline in post
                    deadline = self._extract_deadline_from_text(full_text)
                except Exception:
                    pass

                items.append(
                    RawOpportunity(
                        title=title,
                        source_url=link,
                        source_name=self.SOURCE_NAME,
                        apply_url=link,
                        raw_text=f"Title: {title}\nPublished: {pub_date}\n\n{full_text}",
                        deadline=deadline,
                        deadline_raw=pub_date,
                        type_hint=type_hint,
                        eligible_nations=["ALL"],
                        description=full_text[:500],
                    )
                )

        except Exception as e:
            self.logger.warning(f"RSS parse failed for {feed_url}: {e}")

        return items

    def _scrape_category(self, cat_url: str, type_hint: str) -> list[RawOpportunity]:
        """HTML scrape category listing page."""
        items = []
        try:
            resp = self.get(cat_url)
            soup = self.soup(resp.text)

            posts = soup.select("article, .post, .entry")
            self.logger.info(f"HTML {cat_url}: {len(posts)} posts")

            for post in posts[:20]:
                title_el = post.select_one("h2 a, h3 a, .entry-title a")
                if not title_el:
                    continue
                title = title_el.get_text(strip=True)
                link = title_el.get("href", "")
                if not title or not link:
                    continue

                excerpt_el = post.select_one(".entry-summary, .excerpt, p")
                excerpt = excerpt_el.get_text(strip=True)[:300] if excerpt_el else ""

                items.append(
                    RawOpportunity(
                        title=title,
                        source_url=link,
                        source_name=self.SOURCE_NAME,
                        apply_url=link,
                        raw_text=f"Title: {title}\nSource: OpportunityDesk\n{excerpt}",
                        type_hint=type_hint,
                        eligible_nations=["ALL"],
                        description=excerpt,
                    )
                )
        except Exception as e:
            self.logger.warning(f"HTML scrape failed for {cat_url}: {e}")

        return items

    def _cats_to_type(self, cats: list[str]) -> str:
        joined = " ".join(cats).lower()
        if "fellowship" in joined:
            return "fellowship"
        if "grant" in joined:
            return "grant"
        if "internship" in joined:
            return "internship"
        if "exchange" in joined:
            return "exchange"
        return "scholarship"

    def _extract_deadline_from_text(self, text: str) -> str | None:
        """Try to pull a deadline date from post content."""
        import re
        from dateutil import parser as dp

        patterns = [
            r"(?:deadline|apply by|applications?\s+(?:due|close))\s*[:\-]?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})",
            r"(?:deadline|apply by)\s*[:\-]?\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})",
            r"(?:deadline|apply by)\s*[:\-]?\s*(\d{1,2}/\d{1,2}/\d{4})",
            r"(?:deadline|apply by)\s*[:\-]?\s*(\d{4}-\d{2}-\d{2})",
        ]

        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                try:
                    return dp.parse(match.group(1)).date().isoformat()
                except Exception:
                    continue
        return None


if __name__ == "__main__":
    crawler = OpportunityDeskCrawler()
    results = crawler.run()
    print(f"\n✓ {len(results)} opportunities from {crawler.SOURCE_NAME}")
    for r in results[:3]:
        print(f"  - {r.title[:80]}")
        print(f"    Type: {r.type_hint} | Deadline: {r.deadline}")
