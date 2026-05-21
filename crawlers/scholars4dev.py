"""
Crawler: Scholars4Dev
URL: https://www.scholars4dev.com

Scholars4Dev specifically focuses on scholarships for students
from developing countries — highly BD-relevant. Has RSS feeds
and clean category pages.
"""

from base import BaseCrawler, RawOpportunity

RSS_URL = "https://www.scholars4dev.com/feed/"
CAT_URLS = [
    ("https://www.scholars4dev.com/category/scholarships-by-level/masters-scholarships/", "scholarship"),
    ("https://www.scholars4dev.com/category/scholarships-by-level/phd-scholarships/", "phd"),
    ("https://www.scholars4dev.com/category/scholarships-by-level/undergraduate-scholarships/", "scholarship"),
    ("https://www.scholars4dev.com/category/fellowships-and-grants/", "fellowship"),
    ("https://www.scholars4dev.com/category/scholarships-for-bangladeshis/", "scholarship"),
]


class Scholars4DevCrawler(BaseCrawler):
    SOURCE_NAME = "scholars4dev"
    BASE_URL = "https://www.scholars4dev.com"
    CRAWL_DELAY = 1.5

    def fetch(self) -> list[RawOpportunity]:
        items: list[RawOpportunity] = []
        seen_urls: set[str] = set()

        # RSS first
        try:
            import xml.etree.ElementTree as ET
            resp = self.get(RSS_URL)
            root = ET.fromstring(resp.text)
            channel = root.find("channel")
            entries = channel.findall("item") if channel else []
            self.logger.info(f"RSS: {len(entries)} entries")

            for entry in entries[:50]:
                title = (entry.findtext("title") or "").strip()
                link = (entry.findtext("link") or "").strip()
                pub_date = (entry.findtext("pubDate") or "").strip()

                from bs4 import BeautifulSoup as BS4
                raw_desc = entry.findtext("description") or ""
                desc = BS4(raw_desc, "lxml").get_text(strip=True)

                cats = [c.text for c in entry.findall("category") if c.text]
                type_hint = self._cats_to_type(cats, title)

                if not title or not link or link in seen_urls:
                    continue
                seen_urls.add(link)

                # Fetch full article
                full_text = desc
                deadline = None
                try:
                    post = self.get(link)
                    soup = self.soup(post.text)
                    content = soup.select_one(".entry-content, .post-content, article")
                    if content:
                        full_text = content.get_text(separator="\n", strip=True)
                    deadline = self._extract_deadline(full_text)
                except Exception:
                    pass

                items.append(
                    RawOpportunity(
                        title=title,
                        source_url=link,
                        source_name=self.SOURCE_NAME,
                        apply_url=link,
                        raw_text=f"Title: {title}\nPublished: {pub_date}\nSource: scholars4dev\n\n{full_text}",
                        deadline=deadline,
                        deadline_raw=pub_date,
                        type_hint=type_hint,
                        eligible_nations=["DEVELOPING"],  # scholars4dev = developing countries
                        description=full_text[:500],
                    )
                )

        except Exception as e:
            self.logger.warning(f"RSS failed: {e}, trying HTML")
            # HTML fallback
            for url, type_hint in CAT_URLS:
                items += self._scrape_html(url, type_hint, seen_urls)

        return items

    def _scrape_html(self, url: str, type_hint: str, seen: set) -> list[RawOpportunity]:
        items = []
        try:
            resp = self.get(url)
            soup = self.soup(resp.text)
            posts = soup.select("article, .post")
            for post in posts[:15]:
                title_el = post.select_one("h2 a, h3 a, .entry-title a")
                if not title_el:
                    continue
                title = title_el.get_text(strip=True)
                link = title_el.get("href", "")
                if not title or not link or link in seen:
                    continue
                seen.add(link)
                items.append(
                    RawOpportunity(
                        title=title,
                        source_url=link,
                        source_name=self.SOURCE_NAME,
                        apply_url=link,
                        raw_text=f"Title: {title}\nSource: scholars4dev",
                        type_hint=type_hint,
                        eligible_nations=["DEVELOPING"],
                    )
                )
        except Exception as e:
            self.logger.warning(f"HTML scrape failed {url}: {e}")
        return items

    def _cats_to_type(self, cats: list, title: str) -> str:
        joined = (" ".join(cats) + " " + title).lower()
        if "phd" in joined or "doctoral" in joined:
            return "phd"
        if "postdoc" in joined:
            return "postdoc"
        if "fellowship" in joined or "grant" in joined:
            return "fellowship"
        if "intern" in joined:
            return "internship"
        return "scholarship"

    def _extract_deadline(self, text: str):
        import re
        from dateutil import parser as dp
        patterns = [
            r"(?:deadline|apply by|applications?\s+close)\s*[:\-]?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})",
            r"(?:deadline|apply by)\s*[:\-]?\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})",
            r"(?:deadline)\s*[:\-]?\s*(\d{4}-\d{2}-\d{2})",
        ]
        for pat in patterns:
            m = re.search(pat, text, re.I)
            if m:
                try:
                    return dp.parse(m.group(1)).date().isoformat()
                except Exception:
                    pass
        return None


if __name__ == "__main__":
    crawler = Scholars4DevCrawler()
    results = crawler.run()
    print(f"\n✓ {len(results)} from {crawler.SOURCE_NAME}")
    for r in results[:3]:
        print(f"  - {r.title[:80]} | {r.deadline}")
