"""
Crawler: SHED MoEdu Bangladesh
URL: https://shed.gov.bd/pages/moedu-scholarships

Structure:
  - Table with 60 entries (10/page), paginated
  - Columns: number, title, file (PDF), link (view), publication date
  - Detail page: /pages/moedu-scholarships/<slug>
  - Content in Bengali + English
  - All opportunities are for Bangladeshi nationals going abroad
"""

import re
from typing import Optional

from base import BaseCrawler, RawOpportunity

BASE = "https://shed.gov.bd"
LIST_URL = f"{BASE}/pages/moedu-scholarships"


class ShedGovBdCrawler(BaseCrawler):
    SOURCE_NAME = "SHED MoEdu BD"
    BASE_URL = LIST_URL
    CRAWL_DELAY = 2.0

    def fetch(self) -> list[RawOpportunity]:
        items: list[RawOpportunity] = []

        # Fetch all pages (default shows 10, we request 100 to get all)
        url = f"{LIST_URL}?per_page=100"
        resp = self.get(url)
        soup = self.soup(resp.text)

        rows = soup.select("table tbody tr")
        self.logger.info(f"Found {len(rows)} rows in table")

        for row in rows:
            cols = row.find_all("td")
            if len(cols) < 3:
                continue

            title_col = cols[1] if len(cols) > 1 else cols[0]
            title = title_col.get_text(strip=True)
            if not title:
                continue

            # View link (detail page)
            view_link = row.find("a", string=re.compile(r"দেখুন|View|view", re.I))
            detail_url = ""
            if view_link and view_link.get("href"):
                href = view_link["href"]
                detail_url = href if href.startswith("http") else f"{BASE}{href}"

            # PDF file link
            pdf_link = row.find("a", href=re.compile(r"\.pdf", re.I))
            apply_url = ""
            if pdf_link and pdf_link.get("href"):
                href = pdf_link["href"]
                apply_url = href if href.startswith("http") else f"{BASE}{href}"

            # Publication date (last column)
            pub_date = cols[-1].get_text(strip=True) if cols else ""

            # Fetch detail page for more info
            detail_text = ""
            if detail_url:
                try:
                    detail_resp = self.get(detail_url)
                    detail_soup = self.soup(detail_resp.text)
                    # Main content area
                    content = detail_soup.select_one(
                        ".content-area, .page-content, main, article, .entry-content"
                    )
                    if content:
                        detail_text = content.get_text(separator="\n", strip=True)
                except Exception as e:
                    self.logger.warning(f"Could not fetch detail for {title}: {e}")

            raw_text = f"Title: {title}\nSource: SHED MoEdu Bangladesh\nPublication Date: {pub_date}\n{detail_text}"

            items.append(
                RawOpportunity(
                    title=title,
                    source_url=detail_url or LIST_URL,
                    source_name=self.SOURCE_NAME,
                    apply_url=apply_url,
                    raw_text=raw_text,
                    deadline_raw=pub_date,
                    type_hint="scholarship",
                    eligible_nations=["BD"],  # SHED = for BD nationals only
                    description=detail_text[:500] if detail_text else title,
                )
            )

        return items


if __name__ == "__main__":
    crawler = ShedGovBdCrawler()
    results = crawler.run()
    print(f"\n✓ Scraped {len(results)} opportunities from {crawler.SOURCE_NAME}")
    for r in results[:3]:
        print(f"  - {r.title[:80]}")
        print(f"    URL: {r.source_url}")
        print(f"    Apply: {r.apply_url}")
