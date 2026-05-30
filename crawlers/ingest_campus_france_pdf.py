#!/usr/bin/env python3
"""
Parse Documents/Campus France University List.pdf and process each
institution.

The PDF is a flat list of ~373 French universities, écoles, and research
institutes — NAMES only. For each name we need a website. Approach:

1. Extract all institution names from the PDF.
2. Cross-reference against existing masters_programs (apply_url hosts).
   Many big-name unis (Sorbonne, Polytechnique, ENS, Centrale*) are
   already in our DB with a known apply_url.
3. For each matched institution, probe common English-programs paths
   under the known domain root (re-using the Phase 1A pattern).
4. The first 2xx response with >500 chars goes into opportunity_sources
   so the Discoverer can extract programs from it next sweep.

Run:
  python crawlers/ingest_campus_france_pdf.py --dry-run
  python crawlers/ingest_campus_france_pdf.py
"""

import argparse
import os
import re
import sys
import time
from urllib.parse import urlparse

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import httpx
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

from crawler_logger import CrawlerRun
from aggregator_hosts import is_aggregator_host

SB_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SB_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
SB_H   = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}",
          "Content-Type": "application/json", "Prefer": "return=minimal"}
SB_R   = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"}

PDF_PATH = os.path.join(os.path.dirname(__file__), "..", "Documents",
                        "Campus France University List.pdf")

UA = "Mozilla/5.0 (compatible; ScholarAssistBot/1.0)"
HEADERS = {"User-Agent": UA, "Accept": "text/html"}

# English-taught program probe paths (richer set than Phase 1A — French
# universities label international/English pages with specific terms).
PROBE_PATHS = [
    "/en/programs",
    "/en/programmes",
    "/en/study/programmes",
    "/en/courses",
    "/en/study",
    "/en/international",
    "/en/international-students",
    "/international/english-taught",
    "/international/programs",
    "/international/programmes",
    "/en/study-at",
    "/en/admission",
    "/en/admissions",
    "/en/masters",
    "/en/master-programs",
    "/etudes/international",
    "/en",
    "/english",
]


def parse_pdf_names() -> list[str]:
    import pypdf
    reader = pypdf.PdfReader(PDF_PATH)
    text = ""
    for p in reader.pages:
        text += "\n" + p.extract_text()

    # Each institution starts with a bullet (• or *) — split on those.
    # Each name often spans 1-2 lines until the next bullet.
    # Strategy: replace bullets with markers, normalise whitespace.
    text = text.replace("•", "•")
    # Split into chunks on bullet markers
    chunks = [c.strip() for c in re.split(r"[•*]", text) if c.strip()]
    names = []
    seen = set()
    for c in chunks:
        # Collapse internal newlines and double spaces
        c = re.sub(r"\s+", " ", c).strip()
        # Skip headers and metadata
        if len(c) < 8 or len(c) > 220:
            continue
        if any(kw in c.lower() for kw in (
            "membres du forum", "campus france", "févr", "membre", "page",
            "annonces", "liste des", "membre du", "annexes",
        )):
            # but allow if this looks like a real name (most don't have these)
            if not re.search(r"[A-Z][a-zé]+", c[:5]):
                continue
        # Strip trailing labels like "- Paris" if too long
        # Keep the institution name + (maybe) city
        # Skip pure section headings (ALL CAPS short strings)
        if c.isupper() and len(c) < 60:
            continue
        # Skip standalone numbers / years
        if re.match(r"^\d+$", c):
            continue
        key = c.lower()
        if key in seen:
            continue
        seen.add(key)
        names.append(c)
    return names


_FR_OK_TLDS = (".fr", ".eu", ".org", ".com", ".net", ".paris", ".bzh")


def load_existing_apply_hosts() -> dict[str, str]:
    """Build {normalized_uni_name: domain_root} from existing
    masters_programs, restricted to France. We drop apply_urls whose
    host clearly isn't a French/European institutional domain (e.g.
    .cn, .ru, .in) — those are data-entry errors in the DB and would
    poison the match."""
    out: dict[str, str] = {}
    offset = 0
    while True:
        r = httpx.get(
            f"{SB_URL}/rest/v1/masters_programs",
            headers=SB_R,
            params={"select": "university,apply_url",
                    "country": "eq.France",
                    "is_active": "eq.true",
                    "url_status": "eq.ok",
                    "limit": "1000", "offset": str(offset)},
            timeout=20,
        )
        rows = r.json() if r.status_code == 200 else []
        for row in rows:
            uni = (row.get("university") or "").lower()
            url = (row.get("apply_url") or "").strip()
            if not uni or not url.startswith("http"):
                continue
            try:
                p = urlparse(url)
                host = p.netloc.lower()
                if not any(host.endswith(t) for t in _FR_OK_TLDS):
                    continue  # drop foreign-TLD anomalies
                root = f"{p.scheme}://{p.netloc}"
                key = re.sub(r"\(.*?\)", "", uni)
                key = re.sub(r"[-,]", " ", key)
                key = re.sub(r"\s+", " ", key).strip()
                if key and key not in out:
                    out[key] = root
            except Exception:
                continue
        if len(rows) < 1000: break
        offset += 1000
    return out


_STOP = {"université", "universite", "university", "school", "of", "the", "de",
         "et", "des", "and", "la", "le", "en", "ecole", "école", "supérieure",
         "national", "nationale", "institut", "institute", "paris"}


def _host_anchors_name(host: str, name_toks: set[str]) -> bool:
    """The matched host should contain at least one distinctive token
    from the institution name (e.g. for 'Centrale Lille' the host
    should mention 'centrale' or 'lille'). This catches DB anomalies
    where masters_programs.apply_url was scraped against the wrong
    institution."""
    host = host.lower()
    for tok in name_toks:
        # Strip accents-ish for simple substring check
        norm = (tok.replace("é","e").replace("è","e").replace("ê","e")
                  .replace("à","a").replace("â","a").replace("ô","o")
                  .replace("î","i").replace("ç","c").replace("ù","u"))
        if len(norm) >= 4 and norm in host:
            return True
    return False


def match_uni(name: str, host_map: dict[str, str]) -> str | None:
    """Find domain root for a Campus France institution name by fuzzy
    overlap with known apply_url hosts, then verify the host actually
    anchors a name token (guards against poisoned DB rows)."""
    key = name.lower()
    key = re.sub(r"\(.*?\)", "", key)
    key = re.sub(r"[-,]", " ", key)
    key = re.sub(r"\s+", " ", key).strip()
    if not key:
        return None
    name_toks = {t for t in key.split() if t and t not in _STOP and len(t) > 3}
    if not name_toks:
        return None
    if key in host_map:
        host = urlparse(host_map[key]).netloc
        if _host_anchors_name(host, name_toks):
            return host_map[key]
    best = None
    best_score = 0.0
    for stored, root in host_map.items():
        stored_toks = {t for t in stored.split()
                       if t and t not in _STOP and len(t) > 3}
        if not stored_toks:
            continue
        overlap = name_toks & stored_toks
        union = name_toks | stored_toks
        if len(overlap) < 2 or not union:
            continue
        jaccard = len(overlap) / len(union)
        if jaccard < 0.5:
            continue
        if jaccard > best_score:
            host = urlparse(root).netloc
            if not _host_anchors_name(host, name_toks):
                continue
            best_score = jaccard
            best = root
    return best


def probe_paths(host_root: str) -> tuple[str, int] | None:
    """Returns (best_url, text_len) for the first 2xx + > 500 chars."""
    for path in PROBE_PATHS:
        url = host_root + path
        try:
            r = httpx.get(url, headers=HEADERS, timeout=12, follow_redirects=True)
            if r.status_code != 200:
                continue
            # Cheap rendered-text approximation
            body = r.text
            body = re.sub(r"<(script|style)[\s\S]*?</\1>", " ", body, flags=re.I)
            body = re.sub(r"<[^>]+>", " ", body)
            text = re.sub(r"\s+", " ", body).strip()
            if len(text) >= 500:
                return (str(r.url), len(text))
        except Exception:
            continue
        time.sleep(0.1)
    return None


def source_exists(url: str) -> bool:
    r = httpx.get(
        f"{SB_URL}/rest/v1/opportunity_sources",
        headers=SB_R,
        params={"select": "id", "url": f"eq.{url}", "limit": "1"},
        timeout=10,
    )
    return bool(r.json())


def insert_source(url: str, institute_name: str, dry_run: bool) -> bool:
    if is_aggregator_host(url):
        return False
    if source_exists(url):
        return False
    if dry_run:
        return True
    record = {
        "url":     url,
        "country": "France",
        "scope":   "university",
        "title":   f"Campus France member: {institute_name[:200]} — English-taught programs page",
        "added_by": "campus_france_pdf_v1",
        "notes":   "Probed via Phase 1A pattern; source of Campus France official list.",
    }
    r = httpx.post(f"{SB_URL}/rest/v1/opportunity_sources",
                   headers=SB_H, json=record, timeout=15)
    return r.status_code in (200, 201, 204)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=None,
                    help="Only process the first N institutions for testing")
    args = ap.parse_args()

    if not os.path.exists(PDF_PATH):
        print(f"PDF not found: {PDF_PATH}", flush=True)
        return

    names = parse_pdf_names()
    print(f"Parsed {len(names)} institution names from PDF", flush=True)
    if args.limit:
        names = names[: args.limit]
        print(f"Limiting to first {args.limit}", flush=True)

    with CrawlerRun("campus_france_pdf_ingest",
                    params={"dry_run": args.dry_run, "limit": args.limit}) as run:
        run.set_total(len(names))

        host_map = load_existing_apply_hosts()
        print(f"Loaded {len(host_map)} known France uni hosts from DB",
              flush=True)

        matched = added = no_host = no_page = 0
        for name in names:
            host = match_uni(name, host_map)
            if not host:
                no_host += 1
                run.skipped()
                continue
            matched += 1
            probe = probe_paths(host)
            if not probe:
                no_page += 1
                run.skipped()
                continue
            url, text_len = probe
            if insert_source(url, name, args.dry_run):
                added += 1
                run.ok()
                print(f"  + {name[:55]:55s} -> {url[:90]} ({text_len} chars)",
                      flush=True)
            else:
                run.skipped()

        run.summary = {
            "names_parsed": len(names),
            "matched_host": matched,
            "sources_added": added,
            "no_host_match": no_host,
            "no_english_page": no_page,
        }
        print(f"\nDONE: {len(names)} parsed, {matched} matched-host, "
              f"{added} sources added, {no_host} no-host, {no_page} no-page",
              flush=True)


if __name__ == "__main__":
    main()
