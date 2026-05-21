"""
Programs Pipeline (Track 2)
============================
Fetches bachelor, master, and language programs from all sources
and upserts them into the masters_programs Supabase table.

Zero Claude API cost — all sources use free structured public APIs.

Usage:
  python programs_pipeline.py                      # run all crawlers
  python programs_pipeline.py --source daad        # single source
  python programs_pipeline.py --source erasmus     # Erasmus Mundus only
  python programs_pipeline.py --level language     # DAAD language programs only
  python programs_pipeline.py --dry-run            # fetch, count, don't save
"""

import argparse
import logging
import os
import sys
import time

from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [programs_pipeline] %(levelname)s — %(message)s",
)
logger = logging.getLogger("programs_pipeline")

# ── Crawler registry ──────────────────────────────────────────

CRAWLER_REGISTRY = {
    "daad":           ("daad_programs",    "DaadProgramsCrawler"),
    "erasmus":        ("erasmus_mundus",   "ErasmusMundusCrawler"),
    "universitaly":   ("universitaly",     "UniversitalyCrawler"),
    "study_eu":       ("study_eu",         "StudyEuCrawler"),
    "campus_france":  ("campus_france",    "CampusFranceCrawler"),
    "masters_portal":  ("masters_portal",   "MastersPortalCrawler"),
    "bachelors_portal":("bachelors_portal","BachelorsPortalCrawler"),
    "local_docs":      ("local_docs_crawler", "LocalDocsCrawler"),
}


def load_crawler(name: str):
    module_name, class_name = CRAWLER_REGISTRY[name]
    try:
        mod = __import__(module_name)
        cls = getattr(mod, class_name)
        return cls()
    except Exception as e:
        logger.warning(f"Could not load crawler '{name}': {e}")
        return None


def run_pipeline(
    source_filter: str | None = None,
    dry_run: bool = False,
    level_filter: str | None = None,
) -> dict:
    names = list(CRAWLER_REGISTRY.keys())
    if source_filter:
        names = [n for n in names if source_filter.lower() in n]
        if not names:
            logger.error(f"No crawler matches --source '{source_filter}'")
            logger.error(f"Available: {', '.join(CRAWLER_REGISTRY)}")
            sys.exit(1)

    stats = {
        "crawlers_run": 0,
        "total_fetched": 0,
        "total_new": 0,
        "total_updated": 0,
        "errors": 0,
    }

    for name in names:
        logger.info(f"{'[DRY RUN] ' if dry_run else ''}Running crawler: {name}")
        crawler = load_crawler(name)
        if crawler is None:
            stats["errors"] += 1
            continue

        try:
            items = crawler.fetch()
            stats["crawlers_run"] += 1

            # Apply level filter if requested (only relevant for daad)
            if level_filter:
                items = [p for p in items if p.level == level_filter]
                logger.info(f"  Level filter '{level_filter}': {len(items)} programs")

            stats["total_fetched"] += len(items)

            if dry_run:
                by_level: dict[str, int] = {}
                for p in items:
                    by_level[p.level] = by_level.get(p.level, 0) + 1
                logger.info(f"  Would process {len(items)} programs: {by_level}")
            else:
                new_count, updated_count = crawler.run() if not level_filter else _upsert_filtered(crawler, items)
                stats["total_new"] += new_count
                stats["total_updated"] += updated_count

        except Exception as e:
            logger.error(f"Crawler '{name}' failed: {e}", exc_info=True)
            stats["errors"] += 1

        time.sleep(2)  # courtesy pause between crawlers

    logger.info(
        f"\n{'='*55}\n"
        f"Programs Pipeline {'(DRY RUN) ' if dry_run else ''}Complete\n"
        f"  Crawlers run  : {stats['crawlers_run']}\n"
        f"  Total fetched : {stats['total_fetched']}\n"
        f"  New programs  : {stats['total_new']}\n"
        f"  Updated       : {stats['total_updated']}\n"
        f"  Errors        : {stats['errors']}\n"
        f"{'='*55}"
    )
    return stats


def _upsert_filtered(crawler, items) -> tuple[int, int]:
    """Upsert a pre-filtered list of items using the crawler's _upsert method."""
    new_count = 0
    updated_count = 0
    for prog in items:
        result = crawler._upsert(prog)
        if result == "inserted":
            new_count += 1
        elif result == "updated":
            updated_count += 1
    return new_count, updated_count


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Programs Pipeline — fetch academic programs from multiple sources"
    )
    parser.add_argument(
        "--source", type=str,
        help=f"Run a single source: {', '.join(CRAWLER_REGISTRY)}"
    )
    parser.add_argument(
        "--level", type=str, choices=["bachelor", "master", "language"],
        help="Filter by program level (mainly useful with --source daad)"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Fetch and count programs but do not save to database"
    )
    args = parser.parse_args()

    run_pipeline(
        source_filter=args.source,
        dry_run=args.dry_run,
        level_filter=args.level,
    )
