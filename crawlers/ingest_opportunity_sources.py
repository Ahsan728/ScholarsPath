#!/usr/bin/env python3
"""
Source Ingester (Phase A, Agent #2)

Reads curated lists of opportunity-source URLs from `Documents/sources/*.txt`
(and falls back to `Documents/*.txt` for any matching files) and upserts them
into the `opportunity_sources` table. The Discoverer (Phase C) reads this
registry first when extracting scholarships/funding/PhD opportunities.

Two parser modes — auto-detected per file:

  1. URL-list mode  — dense list of URLs, one or several per line.
                      Used for files like the Italy regional scholarship list.
                      Pure regex. No AI cost.

  2. Rich-doc mode  — prose with embedded URLs and surrounding context.
                      Used for files like the PhD/Funding directory.
                      Calls Haiku once per file (~$0.02) to extract a
                      structured list of {url, country, scope, title, notes}.

Detection heuristic: if the file has >= 1 URL per 200 chars on average, it's
URL-list; otherwise it's rich-doc.

Run:
  cd crawlers
  python ingest_opportunity_sources.py --dry-run         # print what would upsert
  python ingest_opportunity_sources.py                   # real upsert
  python ingest_opportunity_sources.py --file "Documents/sources/Italy Regional and University based Scholarship.txt"
"""

import argparse
import glob
import json
import os
import re
import sys
from typing import Optional
from urllib.parse import urlparse

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import httpx
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

from crawler_logger import CrawlerRun

SB_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SB_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
SB_HEADERS = {
    "apikey": SB_KEY,
    "Authorization": f"Bearer {SB_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation,resolution=merge-duplicates",
}
ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY")

# Where to look for source files (in order)
SEARCH_DIRS = [
    os.path.join(os.path.dirname(__file__), "..", "Documents", "sources"),
    os.path.join(os.path.dirname(__file__), "..", "Documents"),
]

# ---------- inference helpers ------------------------------------------------

COUNTRY_PATTERNS = {
    "Italy":         re.compile(r"\bital(y|ian|ia|ie)\b", re.I),
    "France":        re.compile(r"\bfran(ce|cais)\b|\bcampus france\b", re.I),
    "Germany":       re.compile(r"\bgerman(y|ia|ie)\b|\bdaad\b", re.I),
    "Spain":         re.compile(r"\bspain\b|\bespagn|\bespan", re.I),
    "Netherlands":   re.compile(r"\bnetherlands\b|\bdutch\b|\bnuffic\b", re.I),
    "Belgium":       re.compile(r"\bbelgi(um|que|e)\b", re.I),
    "Sweden":        re.compile(r"\bsweden\b|\bswedish\b", re.I),
    "Denmark":       re.compile(r"\bdenmark\b|\bdanish\b", re.I),
    "Norway":        re.compile(r"\bnorway\b|\bnorwegian\b", re.I),
    "Finland":       re.compile(r"\bfinland\b|\bfinnish\b", re.I),
    "Switzerland":   re.compile(r"\bswitzer|\bswiss\b", re.I),
    "Ireland":       re.compile(r"\bireland\b|\birish\b", re.I),
    "Portugal":      re.compile(r"\bportug(al|uese|aise)\b", re.I),
    "Austria":       re.compile(r"\baustria\b", re.I),
    "Hungary":       re.compile(r"\bhungar(y|ian)\b|\bstipendium\b", re.I),
    "Czech Republic": re.compile(r"\bczech\b", re.I),
    "Poland":        re.compile(r"\bpoland\b|\bpolish\b|\bnawa\b", re.I),
    "United Kingdom": re.compile(r"\buk\b|\bunited kingdom\b|\bbritish\b", re.I),
}

# URL-pattern → scope. Earlier patterns win.
SCOPE_PATTERNS = [
    (re.compile(r"euraxess|erasmus-plus|ec\.europa\.eu|marie-sklodowska|erc\.europa\.eu"), "pan_european"),
    (re.compile(r"campusfrance|daad\.de|studyinnl|studyinsweden|nuffic|sbfi|esteri|stipendiumhungaricum|nawa\.gov"), "national_portal"),
    (re.compile(r"laziodisco|esu\.|er-go|adsu|adisu|ersu|erdis|operauni|aliseo|dsu\.|ersucagliari"), "regional"),
    (re.compile(r"\b(unimi|polimi|unive|univr|uninsubria|unimib|tum|kth|ethz|uva|tudelft|sorbonne|cam|ox)\b"), "university"),
    (re.compile(r"fundacionlacaixa|fwo\.be|frs-fnrs|fwf\.ac|research\.ie|fct\.pt"), "funding_body"),
    (re.compile(r"findaphd|mastersportal|studyportals|topuniversities|qs\.com"), "aggregator"),
]


def infer_country(text: str, filename: str) -> Optional[str]:
    """Try to detect country from URL/title text, then fall back to filename."""
    haystack = (text or "") + " " + (filename or "")
    for country, rx in COUNTRY_PATTERNS.items():
        if rx.search(haystack):
            return country
    return None


def infer_scope(url: str) -> str:
    """Classify URL by scope. Defaults to 'university' if uncertain."""
    if not url:
        return "university"
    lowered = url.lower()
    for rx, scope in SCOPE_PATTERNS:
        if rx.search(lowered):
            return scope
    # Generic .gov / national domain → national_portal
    host = urlparse(lowered).hostname or ""
    if host.endswith(".gov") or ".gov." in host:
        return "national_portal"
    return "university"


# ---------- parsers ----------------------------------------------------------

URL_RX = re.compile(r"https?://[^\s\)\]\>\<\"\'\,]+", re.I)


def looks_like_url_list(text: str) -> bool:
    """Return True if the file is mostly URLs vs. prose."""
    urls = URL_RX.findall(text)
    if not urls:
        return False
    # >=1 URL per 200 chars on average → URL list
    return (len(text) / max(len(urls), 1)) <= 300


def parse_url_list(text: str, source_doc: str) -> list[dict]:
    """Extract URLs + per-URL line context."""
    out = []
    # Per-line scan so we can use the line itself as inferred-title context
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        for url in URL_RX.findall(line):
            url = url.rstrip(".,);:!?]>")
            # Use surrounding line as title if it has anything besides the URL
            title = line.replace(url, "").strip(" -·•|") or None
            out.append({
                "url":     url,
                "country": infer_country(url + " " + (title or ""), source_doc),
                "scope":   infer_scope(url),
                "title":   title[:200] if title else None,
                "notes":   None,
                "source_doc": source_doc,
                "added_by":   "source_ingester",
            })
    return out


def parse_rich_doc(text: str, source_doc: str, dry_run: bool) -> list[dict]:
    """Call Haiku once to extract structured rows from prose-heavy file."""
    if not ANTHROPIC_KEY:
        print(f"  WARN: ANTHROPIC_API_KEY not set — skipping rich-doc {source_doc}")
        return []
    try:
        from anthropic import Anthropic
    except ImportError:
        print(f"  WARN: anthropic SDK not installed — skipping rich-doc {source_doc}")
        return []

    prompt = f"""Extract every official scholarship / funding / PhD portal mentioned in this document. Reply with ONLY valid JSON (no prose, no markdown fences):

{{
  "sources": [
    {{
      "url":     "<the URL exactly as it should be visited>",
      "country": "<full English country name, or 'Europe' for pan-European, or null>",
      "scope":   "<one of: pan_european, national_portal, regional, university, funding_body, aggregator>",
      "title":   "<short label, e.g. 'EURAXESS' or 'DAAD scholarship database'>",
      "notes":   "<1-2 sentences of context from the document, max 300 chars>"
    }}
  ]
}}

Rules:
- Include only URLs that point to actual opportunity portals (skip incidental links).
- If the document gives a host without protocol (e.g. 'euraxess.ec.europa.eu'), prefix https://.
- Skip clearly-commercial aggregators unless they're explicitly recommended.
- One row per distinct URL. Do not invent URLs not present in the text.

Document:
{text[:30000]}"""

    print(f"  Calling Haiku on {source_doc} ({len(text)} chars)...")
    if dry_run:
        print(f"  DRY RUN: would call Haiku — skipping actual API call")
        return []

    client = Anthropic(api_key=ANTHROPIC_KEY)
    response = client.messages.create(
        model="claude-haiku-4-5",
        max_tokens=4000,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = response.content[0].text if response.content else "{}"

    m = re.search(r"\{[\s\S]*\}", raw)
    if not m:
        print(f"  WARN: Haiku output had no JSON object")
        return []
    try:
        data = json.loads(m.group(0))
    except json.JSONDecodeError as e:
        print(f"  WARN: Haiku JSON parse failed: {e}")
        return []

    out = []
    for s in data.get("sources", []):
        url = (s.get("url") or "").strip()
        if not url:
            continue
        if not url.startswith(("http://", "https://")):
            url = "https://" + url
        scope = s.get("scope") or infer_scope(url)
        out.append({
            "url":     url,
            "country": s.get("country") or infer_country(url + " " + (s.get("title") or ""), source_doc),
            "scope":   scope if scope in {"pan_european", "national_portal", "regional", "university", "funding_body", "aggregator"} else "national_portal",
            "title":   (s.get("title") or "")[:200] or None,
            "notes":   (s.get("notes") or "")[:500] or None,
            "source_doc": source_doc,
            "added_by":   "source_ingester",
        })

    in_tok  = response.usage.input_tokens  if response.usage else 0
    out_tok = response.usage.output_tokens if response.usage else 0
    print(f"  Haiku: {in_tok} in / {out_tok} out, extracted {len(out)} sources")
    return out


# ---------- upsert -----------------------------------------------------------

def upsert(rows: list[dict], dry_run: bool, run: CrawlerRun) -> int:
    """Upsert by lower(url) — relies on the unique index in the migration."""
    # Dedup within the batch first (Haiku sometimes duplicates)
    seen = {}
    for r in rows:
        seen[r["url"].lower()] = r
    deduped = list(seen.values())

    if dry_run:
        for r in deduped[:8]:
            print(f"    WOULD UPSERT: [{r['scope']:14s}] {r['country'] or '-':16s} {r['url']}")
        if len(deduped) > 8:
            print(f"    ... and {len(deduped) - 8} more")
        run.skipped(len(deduped))
        return len(deduped)

    written = 0
    for i in range(0, len(deduped), 100):
        batch = deduped[i:i + 100]
        # PostgREST on_conflict requires the column name (we created a UNIQUE
        # INDEX on lower(url), not a column constraint, so on_conflict won't
        # accept the expression form). Easiest portable path: check existence
        # client-side and INSERT only the new ones.
        urls_lower = [r["url"].lower() for r in batch]
        # Fetch existing
        existing = httpx.post(
            f"{SB_URL}/rest/v1/rpc/find_existing_source_urls",
            headers=SB_HEADERS,
            json={"urls": urls_lower},
            timeout=20,
        )
        # If the RPC doesn't exist yet, fall back to a SELECT
        if existing.status_code == 404:
            sel = httpx.get(
                f"{SB_URL}/rest/v1/opportunity_sources",
                headers={"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"},
                params={"select": "url", "url": f"in.({','.join(repr(u) for u in urls_lower)})"},
                timeout=20,
            )
            already = {row["url"].lower() for row in (sel.json() or [])}
        else:
            already = set(existing.json() or [])

        to_insert = [r for r in batch if r["url"].lower() not in already]
        if not to_insert:
            run.skipped(len(batch))
            continue

        r = httpx.post(
            f"{SB_URL}/rest/v1/opportunity_sources",
            headers=SB_HEADERS, json=to_insert, timeout=30,
        )
        if r.status_code in (200, 201):
            written += len(to_insert)
            run.ok(len(to_insert))
            run.skipped(len(batch) - len(to_insert))
        else:
            run.failed(len(to_insert), message=f"insert failed: {r.status_code} {r.text[:300]}")
            print(f"    INSERT FAILED: {r.status_code} {r.text[:300]}")
    return written


# ---------- main -------------------------------------------------------------

def find_source_files(explicit: Optional[str]) -> list[str]:
    if explicit:
        return [os.path.abspath(explicit)] if os.path.exists(explicit) else []
    files: list[str] = []
    for d in SEARCH_DIRS:
        if not os.path.isdir(d):
            continue
        for path in glob.glob(os.path.join(d, "*.txt")):
            name = os.path.basename(path).lower()
            # Heuristic: only pull in files that look source-ish, not the
            # Mastersportal program dumps (those are huge and unrelated).
            if any(kw in name for kw in ("scholarship", "phd", "funding", "directory", "source", "opportunit")):
                files.append(path)
    return sorted(set(files))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", type=str, default=None,
                    help="Process a single file instead of auto-discovering")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    params = {k: v for k, v in vars(args).items() if v}
    with CrawlerRun("source_ingester", params=params) as run:
        files = find_source_files(args.file)
        if not files:
            print("No source files found. Drop curated .txt files in "
                  "Documents/sources/ (filenames containing 'scholarship', "
                  "'phd', 'funding', 'directory', 'source' or 'opportunit'.")
            run.summary = {"files": 0}
            return

        print(f"Found {len(files)} source file(s):")
        for f in files:
            print(f"  - {f}")

        all_rows = []
        for path in files:
            with open(path, encoding="utf-8", errors="replace") as fh:
                text = fh.read()
            mode = "url_list" if looks_like_url_list(text) else "rich_doc"
            print(f"\n[{mode}] {os.path.basename(path)} ({len(text)} chars)")
            rows = (parse_url_list(text, os.path.basename(path)) if mode == "url_list"
                    else parse_rich_doc(text, os.path.basename(path), args.dry_run))
            print(f"  parsed {len(rows)} candidate sources")
            all_rows.extend(rows)

        run.set_total(len(all_rows))
        written = upsert(all_rows, args.dry_run, run)
        run.summary = {
            "files_processed": len(files),
            "candidates":      len(all_rows),
            "written":         written,
            "dry_run":         args.dry_run,
        }
        print(f"\nDONE: {run.summary}")


if __name__ == "__main__":
    main()
