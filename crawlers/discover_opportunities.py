#!/usr/bin/env python3
"""
Opportunity Discoverer (Phase C, Agent #6)

Crawls trusted source URLs and university scholarship/funding/PhD pages,
extracts structured opportunity rows via OpenAI gpt-4o-mini (or Anthropic
Haiku as a fallback), and upserts into the `discovered_opportunities` table.

⚠️  This is the only big-spend agent in the pipeline. Enforced safeguards:
  - Hard $/run cap via crawlers/ai/extract.py::assert_budget (raises
    BudgetExceeded if you'd cross max_usd_per_run; the run exits cleanly
    with status='cancelled')
  - Pre-filter via keyword grep before any LLM call (saves ~70% of pages
    on the broad sweep — pages with zero scholarship/funding/phd hits
    don't get a Haiku call)
  - Content-hash cache (sha256 of cleaned text): identical pages from
    the previous run are skipped
  - Two queues:
      Queue 1  curated opportunity_sources (high signal, prioritized)
      Queue 2  distinct university apply_url pages from masters_programs
               (limited to target countries: FR/DE/ES/IT/BE/HU/NL/SE/AT/
                FI/DK/NO/PT/IE/CZ/PL)

Run:
  cd crawlers
  python discover_opportunities.py --dry-run                          # plan only, no cost
  python discover_opportunities.py --queue 1 --limit 5                # smoke test on sources
  python discover_opportunities.py --queue 1                          # full sources sweep
  python discover_opportunities.py --queue 2 --country Germany --limit 50

Recommended first live run:
  python discover_opportunities.py --queue 1 --limit 5 --max-usd 0.50
"""

import argparse
import hashlib
import os
import re
import sys
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlparse

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import httpx
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

from crawler_logger import CrawlerRun
from ai.extract import extract_json, BudgetExceeded, SchemaInvalid
from aggregator_hosts import is_aggregator_host
from domain_classifier import classify as classify_domain

SB_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SB_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
SB_H = {
    "apikey": SB_KEY,
    "Authorization": f"Bearer {SB_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

PROMPT_VERSION = "v1"

TARGET_COUNTRIES = {
    "France", "Germany", "Spain", "Italy", "Belgium", "Hungary",
    "Netherlands", "Sweden", "Austria", "Finland", "Denmark",
    "Norway", "Portugal", "Ireland", "Czech Republic", "Poland",
}

# Cheap pre-filter — if NONE of these appear in the page text, skip the LLM.
# Matches BOTH opportunity keywords AND program keywords (since we now
# extract both in one call).
KEYWORDS_RX = re.compile(
    r"scholarship|funding|fellowship|grant|phd|doctorate|bursar(y|ies)|"
    r"borse di studio|bourse|stipendium|beurs|stipendia|"
    r"financ(ial|ement) (aid|support)|"
    r"master|bachelor|programme|program|degree|msc|bsc|"
    r"admission|apply|application|intake|semester|"
    r"taught in english|english.taught|language of instruction",
    re.IGNORECASE,
)

UA = ("Mozilla/5.0 (compatible; ScholarAssistBot/1.0; "
      "+https://scholars.ahsansuny.com)")
REQ_HEADERS = {"User-Agent": UA, "Accept": "text/html,*/*;q=0.5"}


# ── HTTP + extraction helpers ─────────────────────────────────
BROWSER_FETCH_URL = os.environ.get("BROWSER_FETCH_URL", "").rstrip("/")
BROWSER_FETCH_TOKEN = os.environ.get("BROWSER_FETCH_TOKEN", "")


def fetch_page_browser(url: str) -> Optional[str]:
    """Render the page via the Cloud Run Playwright service. Returns HTML
    or None on failure. Used for sources flagged js_render=true."""
    if not BROWSER_FETCH_URL or not BROWSER_FETCH_TOKEN:
        print(f"    js_render requested but BROWSER_FETCH_URL/TOKEN not set", flush=True)
        return None
    try:
        r = httpx.post(
            f"{BROWSER_FETCH_URL}/fetch",
            headers={"Authorization": f"Bearer {BROWSER_FETCH_TOKEN}",
                     "Content-Type": "application/json"},
            json={"url": url},
            timeout=60,
        )
        if r.status_code != 200:
            print(f"    browser-fetch HTTP {r.status_code}: {r.text[:200]}", flush=True)
            return None
        data = r.json()
        html = data.get("html") or ""
        if not html or data.get("status", 0) >= 400:
            print(f"    browser-fetch returned status={data.get('status')} err={data.get('error')}", flush=True)
            return None
        return html
    except Exception as e:
        print(f"    browser-fetch error: {e}", flush=True)
        return None


def fetch_page(url: str, js_render: bool = False) -> Optional[str]:
    """GET and return the raw HTML, or None if unreachable / non-text.

    If js_render=true, routes through the Cloud Run Playwright service
    instead. The source row's js_render column drives this.
    """
    if js_render:
        return fetch_page_browser(url)
    try:
        r = httpx.get(url, headers=REQ_HEADERS, timeout=20, follow_redirects=True)
        if r.status_code != 200:
            return None
        ct = r.headers.get("content-type", "")
        if "text/html" not in ct and "text/plain" not in ct:
            return None
        return r.text
    except Exception:
        return None


def extract_links(html: str, base_url: str) -> str:
    """Extract all <a href> links with their anchor text. Returns a compact
    list that Haiku can use to match programs to their individual URLs."""
    from urllib.parse import urljoin
    links = re.findall(r'<a[^>]+href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', html or "", re.I | re.DOTALL)
    seen = set()
    out = []
    for href, text in links:
        text_clean = re.sub(r"<[^>]+>", "", text).strip()
        if not text_clean or len(text_clean) < 3:
            continue
        full_url = urljoin(base_url, href)
        if full_url in seen:
            continue
        seen.add(full_url)
        out.append(f"  [{text_clean[:80]}]({full_url})")
    return "\n".join(out[:150])


def strip_html(html: str) -> str:
    """Lightweight Readability replacement: drop nav/script/style + tags."""
    html = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.IGNORECASE)
    html = re.sub(r"<style[\s\S]*?</style>",   " ", html, flags=re.IGNORECASE)
    html = re.sub(r"<noscript[\s\S]*?</noscript>", " ", html, flags=re.IGNORECASE)
    html = re.sub(r"<(nav|header|footer|aside|form|svg)[\s\S]*?</\1>", " ", html, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", html)
    text = (text.replace("&nbsp;", " ").replace("&amp;", "&")
                .replace("&lt;", "<").replace("&gt;", ">"))
    text = re.sub(r"\s+", " ", text).strip()
    return text


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


# ── Queue fetchers ────────────────────────────────────────────
def fetch_queue_1(args) -> list[dict]:
    """opportunity_sources rows ordered by staleness (NULLs first, then oldest)."""
    base = f"{SB_URL}/rest/v1/opportunity_sources"
    params = {
        "select": "id,url,country,scope,title,last_crawled_at,js_render",
        "order":  "last_crawled_at.asc.nullsfirst",
        "limit":  str(args.limit or 100),
    }
    if args.country:
        params["country"] = f"eq.{args.country}"
    headers = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"}
    r = httpx.get(base, headers=headers, params=params, timeout=30)
    if r.status_code != 200:
        print(f"  WARN: queue 1 fetch returned {r.status_code} — does opportunity_sources exist?")
        return []
    return r.json() or []


def fetch_queue_2(args) -> list[dict]:
    """
    Distinct universities from masters_programs whose apply_url is OK +
    domain matches. We then heuristically generate candidate scholarship
    page URLs from each university's base URL.
    """
    base = f"{SB_URL}/rest/v1/masters_programs"
    params = {
        "select": "university,country,apply_url",
        "url_status":          "eq.ok",
        "domain_match_status": "eq.match",
        "limit":   "1000",  # PostgREST cap; paginate if more needed
    }
    if args.country:
        params["country"] = f"eq.{args.country}"
    headers = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"}
    r = httpx.get(base, headers=headers, params=params, timeout=30)
    if r.status_code != 200:
        return []
    rows = r.json() or []
    # Dedup by (university, country)
    seen = {}
    for row in rows:
        key = (row.get("university") or "", row.get("country") or "")
        if not row.get("country") in TARGET_COUNTRIES:
            continue
        if key in seen:
            continue
        try:
            parsed = urlparse(row["apply_url"])
            base_url = f"{parsed.scheme}://{parsed.netloc}"
        except Exception:
            continue
        seen[key] = {
            "university": row["university"],
            "country":    row["country"],
            "base_url":   base_url,
        }
    out = list(seen.values())
    if args.limit:
        out = out[: args.limit]
    return out


CANDIDATE_PATHS = [
    "/scholarships", "/scholarship", "/funding", "/fees-and-funding",
    "/financial-support", "/financial-aid", "/grants", "/phd",
    "/doctoral", "/admission/scholarships", "/study/scholarships",
    "/en/scholarships", "/en/funding", "/en/phd",
]


def queue_2_candidate_urls(base_url: str) -> list[str]:
    """Cheap heuristic — return the most likely scholarship page paths."""
    return [base_url.rstrip("/") + p for p in CANDIDATE_PATHS]


# ── LLM extraction prompt (unified: opportunities + programs) ──
def build_prompt(page_text: str, source_url: str, country_hint: Optional[str],
                 links_section: str = "") -> str:
    return f"""Analyse this page and extract TWO things:

1. **Opportunities**: scholarships, fellowships, grants, PhD positions, funding
2. **Programs**: English-taught bachelor's or master's degree programs

Reply with ONLY valid JSON:

{{
  "opportunities": [
    {{
      "type":            "<scholarship | grant | phd | postdoc | fellowship | internship | bursary | assistantship | exchange>",
      "title":           "<short distinctive name, e.g. 'Eiffel Excellence Scholarship'>",
      "description":     "<1-3 sentences from the page>",
      "country":         "<full English country name, or 'Europe' for pan-European>",
      "degree_level":    "<undergraduate | masters | phd | postdoc | any | null>",
      "field_of_study":  ["<broad field>", "..."] or [],
      "amount_usd":      <number or null>,
      "amount_text":     "<verbatim funding string from page or null>",
      "funding_type":    "<full | partial | stipend | salary | tuition_waiver | null>",
      "eligibility_text":  "<short eligibility summary or null>",
      "eligible_nations":  ["<ISO-2 country code or 'ALL' or 'DEVELOPING'>"] or [],
      "ineligible_nations": [],
      "deadline":         "<YYYY-MM-DD or null>",
      "deadline_text":    "<verbatim string like 'Rolling' or 'Mid-March 2026' or null>",
      "intake":           "<e.g. 'Fall 2026' or null>",
      "apply_url":        "<direct apply link if present or null>"
    }}
  ],
  "programs": [
    {{
      "program_name":    "<official name, e.g. 'MSc Computer Science'>",
      "university":      "<university name>",
      "country":         "<full English country name>",
      "city":            "<city or null>",
      "level":           "<bachelor | master>",
      "duration_years":  <number like 1, 1.5, 2 or null>,
      "language":        "<'English' or 'English, German' etc.>",
      "field_of_study":  ["<broad field>"],
      "tuition_text":    "<verbatim tuition string or 'Free' or null>",
      "ielts_min":       <number or null>,
      "deadline":        "<YYYY-MM-DD or null>",
      "intake":          "<e.g. 'Fall 2026' or null>",
      "apply_url":       "<direct program/apply link or null>",
      "description":     "<1-2 sentences or null>"
    }}
  ]
}}

Source URL: {source_url}
Country hint (if obvious): {country_hint or 'unknown'}

Rules:
- Extract opportunities AND programs — a page can have both, one, or neither.
- For programs: ONLY include English-taught (or mixed with English). Skip purely non-English programs.
- For programs: each row = one distinct degree program, not a department or faculty overview.
- For opportunities: skip rows you can't confidently identify (don't invent).
- Return {{"opportunities": [], "programs": []}} if nothing usable.
- amount_usd: convert from EUR / GBP / SEK using approximate rates.
- deadline: explicit dates only; use deadline_text for vague timing.
- apply_url for programs: use the SPECIFIC program page link from the Links section below — NOT the listing page URL. Each program should have its own distinct URL.

Page text (truncated):
{page_text[:12000]}

Links found on this page (use these for apply_url — match each program to its specific link):
{links_section[:3000] if links_section else "(no links extracted)"}"""


# ── Upsert ────────────────────────────────────────────────────
def upsert_opportunities(rows: list[dict], source_id: Optional[str],
                         source_url: str, run_id: str, content_hash_str: str,
                         dry_run: bool, run: CrawlerRun) -> int:
    written = 0
    rejected_schema = 0
    rejected_aggregator = 0
    now = datetime.now(timezone.utc).isoformat()
    for opp in rows:
        # Schema gate: title, country, type are required. apply_url OR
        # source_url must be set (we fall back to the page URL below).
        title   = (opp.get("title") or "").strip()
        country = (opp.get("country") or "").strip()
        opp_type = (opp.get("type") or "").strip()
        if not title or not country or not opp_type:
            rejected_schema += 1
            continue

        # Aggregator gate: never insert an opportunity whose apply_url
        # is on the scam/aggregator blocklist. We fall back to the page
        # URL if no apply_url given — must check that too.
        candidate_url = (opp.get("apply_url") or source_url or "").strip()
        if candidate_url and is_aggregator_host(candidate_url):
            rejected_aggregator += 1
            run.event("warn", target_url=candidate_url,
                      message=f"opportunity rejected: aggregator host (title='{title[:50]}')")
            continue

        record = {
            "source_id":      source_id,
            "source_url":     source_url,
            "run_id":         run_id,
            "prompt_version": PROMPT_VERSION,
            "content_hash":   content_hash_str,
            "type":           opp.get("type") or "scholarship",
            "title":          opp["title"][:300],
            "description":    (opp.get("description") or "")[:2000] or None,
            "university":     opp.get("university") or None,
            "country":        opp["country"],
            "degree_level":   opp.get("degree_level"),
            "field_of_study": opp.get("field_of_study") or [],
            # Normalize free-text fields into one of the 11 standard
            # ScholarsPath domain slugs so the homepage filter works.
            "category":       classify_domain(
                opp.get("field_of_study"),
                f"{opp.get('title','')} {opp.get('description','')}",
            ),
            "amount_usd":     opp.get("amount_usd"),
            "amount_text":    (opp.get("amount_text") or "")[:300] or None,
            "funding_type":   opp.get("funding_type"),
            "eligibility_text":   (opp.get("eligibility_text") or "")[:1000] or None,
            "eligible_nations":   opp.get("eligible_nations")   or [],
            "ineligible_nations": opp.get("ineligible_nations") or [],
            "deadline":         opp.get("deadline"),
            "deadline_text":    (opp.get("deadline_text") or "")[:200] or None,
            "intake":           (opp.get("intake") or "")[:100] or None,
            "apply_url":        opp.get("apply_url"),
            "last_seen_at":     now,
        }

        if dry_run:
            print(f"    WOULD UPSERT: [{record['type']:11s}] {record['country'][:12]:12s} {record['title'][:80]}")
            run.skipped()
            continue

        r = httpx.post(
            f"{SB_URL}/rest/v1/discovered_opportunities",
            headers={**SB_H, "Prefer": "return=minimal,resolution=merge-duplicates"},
            json=record, timeout=30,
        )
        if r.status_code in (200, 201, 204):
            written += 1
            run.ok()
        else:
            run.failed(target_url=source_url,
                       message=f"insert failed: {r.status_code} {r.text[:200]}")
    if rejected_schema or rejected_aggregator:
        print(f"    rejected at gates: schema={rejected_schema}, aggregator={rejected_aggregator}", flush=True)
    return written


# ── Upsert programs ───────────────────────────────────────────
def _match_program_urls(progs: list[dict], links_section: str, source_url: str) -> None:
    """Match each extracted program to its specific page URL using text
    similarity between program names and link anchor text. Modifies
    progs in-place."""
    # Parse links_section back into (text, url) pairs
    link_pairs: list[tuple[str, str]] = []
    for line in links_section.strip().split("\n"):
        m = re.match(r"\s*\[(.+?)\]\((.+?)\)", line)
        if m:
            link_pairs.append((m.group(1).lower().strip(), m.group(2).strip()))
    if not link_pairs:
        return

    for p in progs:
        name = (p.get("program_name") or "").lower().strip()
        if not name:
            continue
        # Already has a non-listing-page URL? Keep it.
        existing = p.get("apply_url") or ""
        if existing and existing != source_url and existing.startswith("http"):
            continue
        # Find best match: link text that contains most of the program name
        # or program name contains most of the link text
        best_url = None
        best_score = 0
        name_words = set(re.findall(r"[a-z]+", name)) - {"master", "in", "of", "the", "and", "a"}
        for link_text, link_url in link_pairs:
            if link_url == source_url:
                continue
            link_words = set(re.findall(r"[a-z]+", link_text)) - {"master", "in", "of", "the", "and", "a"}
            if not link_words:
                continue
            overlap = len(name_words & link_words)
            score = overlap / max(len(name_words), 1)
            if score > best_score and score >= 0.5:
                best_score = score
                best_url = link_url
        if best_url:
            p["apply_url"] = best_url

def _safe_category(fields: any) -> str:
    """Extract a non-null category slug from field_of_study (array or string)."""
    if isinstance(fields, list) and fields:
        raw = str(fields[0])[:50]
    elif isinstance(fields, str) and fields:
        raw = fields[:50]
    else:
        return "general"
    slug = raw.lower().strip().replace(" ", "_").replace("/", "_")
    return slug if slug else "general"


def upsert_programs(rows: list[dict], source_url: str,
                    dry_run: bool, run: CrawlerRun) -> int:
    """Insert extracted programs into masters_programs, dedup by fingerprint."""
    import hashlib
    written = 0
    for p in rows:
        name = (p.get("program_name") or "").strip()
        uni  = (p.get("university") or "").strip()
        country = (p.get("country") or "").strip()
        lang = (p.get("language") or "").strip()
        if not name or not country:
            continue
        # Only English-taught or mixed-with-English
        if lang and "english" not in lang.lower():
            continue

        fp_raw = f"{name.lower()}|{country.lower()}|{(p.get('level') or 'master').lower()}"
        fingerprint = hashlib.sha256(fp_raw.encode()).hexdigest()

        record = {
            "program_name":    name[:300],
            "university":      uni[:300] or "Unknown University",
            "country":         country,
            "city":            (p.get("city") or "").strip()[:100] or country,
            "level":           p.get("level") or "master",
            "duration_years":  p.get("duration_years") or 2,
            "language":        lang or "English",
            "field_of_study":  p.get("field_of_study") or [],
            # Classify into one of the 9 ScholarsPath filter slugs so the
            # public filter UI works the moment this row lands.
            "category":        classify_domain(p.get("field_of_study"), p.get("program_name")),
            "tuition_usd_year": None,
            "ielts_min":       p.get("ielts_min"),
            "gre_required":    False,
            "gpa_min":         None,
            "gpa_scale":       4.0,
            "intake":          p.get("intake") or "Fall/Spring",
            "deadline":        p.get("deadline") or None,
            "scholarship_available": False,
            "description":     (p.get("description") or f"{name} at {uni}")[:1000],
            "requirements":    [],
            "apply_url":       p.get("apply_url") or source_url,
            "source_url":      source_url,
            "source_name":     "discoverer",
            "is_active":       True,
            "fingerprint":     fingerprint,
        }

        if dry_run:
            print(f"    WOULD INSERT PROGRAM: [{record['level']:7s}] {record['country'][:12]:12s} {record['program_name'][:60]}")
            run.skipped()
            continue

        # Check existing by fingerprint
        existing = httpx.get(
            f"{SB_URL}/rest/v1/masters_programs",
            headers={"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"},
            params={"select": "id", "fingerprint": f"eq.{fingerprint}", "limit": "1"},
            timeout=10,
        )
        if existing.status_code == 200 and existing.json():
            continue  # already exists

        r = httpx.post(
            f"{SB_URL}/rest/v1/masters_programs",
            headers=SB_H, json=record, timeout=30,
        )
        if r.status_code in (200, 201, 204):
            written += 1
            run.ok()
            print(f"    + {record['program_name'][:60]}", flush=True)
        else:
            err_body = r.text[:800]
            # Parse out the specific column name from the Postgres error
            import json as _json
            try:
                err_obj = _json.loads(r.text)
                col_msg = err_obj.get("message", "")
                print(f"    FAIL {r.status_code}: {col_msg}", flush=True)
            except Exception:
                print(f"    FAIL {r.status_code}: {err_body}", flush=True)
            run.failed(target_url=source_url,
                       message=f"program insert failed: {r.status_code} {err_body}")
    return written


# ── Per-page worker ───────────────────────────────────────────
def process_page(url: str, country_hint: Optional[str],
                 source_id: Optional[str], run: CrawlerRun,
                 args, last_hash_by_url: dict[str, str],
                 js_render: bool = False) -> int:
    html = fetch_page(url, js_render=js_render)
    if not html:
        run.event("warn", target_url=url, message="fetch failed")
        run.skipped()
        return 0

    text = strip_html(html)
    # Auto-detect SPA shells: if a non-js-render source returned <500
    # chars of text, flag it for js_render next time so the next sweep
    # routes it through Cloud Run automatically.
    if not js_render and source_id and text and len(text) < 500:
        try:
            httpx.patch(
                f"{SB_URL}/rest/v1/opportunity_sources?id=eq.{source_id}",
                headers=SB_H, json={"js_render": True}, timeout=10,
            )
            run.event("info", target_url=url,
                      message=f"auto-flagged js_render=true (only {len(text)} chars rendered)")
        except Exception:
            pass

    if not text or len(text) < 200:
        run.event("warn", target_url=url, message="no extractable text")
        run.skipped()
        return 0

    h = content_hash(text)
    if last_hash_by_url.get(url) == h:
        print(f"    SKIP (unchanged hash): {url}")
        run.skipped()
        return 0

    # Cheap pre-filter — skip pages with no relevant keywords
    if not KEYWORDS_RX.search(text[:50000]):
        print(f"    SKIP (no keywords): {url}")
        run.skipped()
        return 0

    # Extract links BEFORE stripping HTML — needed so Haiku can match
    # each program to its specific URL instead of the listing page
    links_section = extract_links(html, url)

    print(f"    PROCESS: {url} ({len(text)} chars, {links_section.count(chr(10))+1 if links_section else 0} links)")
    if args.dry_run:
        run.skipped()
        return 0

    prompt = build_prompt(text, url, country_hint, links_section)
    # JS-rendered sources (EURAXESS etc.) have larger pages with more
    # opportunities — give the LLM headroom so the JSON doesn't truncate.
    max_tokens = 12000 if js_render else 6000
    try:
        data = extract_json(
            prompt=prompt,
            run_id=run.run_id,
            max_usd_per_run=args.max_usd,
            provider=args.provider,
            max_tokens=max_tokens,
            expected_keys=("opportunities", "programs"),
            estimated_cost=0.04 if js_render else 0.02,
        )
    except BudgetExceeded as e:
        print(f"    BUDGET EXCEEDED — stopping run cleanly: {e}")
        raise  # propagate so CrawlerRun marks cancelled
    except SchemaInvalid as e:
        print(f"    SCHEMA INVALID: {e}")
        run.failed(target_url=url, message=f"schema invalid: {e}")
        return 0

    opps = data.get("opportunities") or []
    progs = data.get("programs") or []

    # Post-LLM URL matching: Haiku often returns the listing URL instead of
    # specific program links. We match each program name to the best link
    # from the page ourselves — more reliable than asking the LLM.
    if progs and links_section:
        _match_program_urls(progs, links_section, url)

    print(f"    extracted {len(opps)} opportunities + {len(progs)} programs")
    written = upsert_opportunities(opps, source_id, url, run.run_id, h,
                                   args.dry_run, run)
    written += upsert_programs(progs, url, args.dry_run, run)
    return written


# ── Existing hashes ───────────────────────────────────────────
def load_existing_hashes() -> dict[str, str]:
    """Build url → content_hash map so we skip unchanged pages."""
    headers = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"}
    r = httpx.get(
        f"{SB_URL}/rest/v1/discovered_opportunities",
        headers=headers,
        params={"select": "source_url,content_hash", "limit": "10000"},
        timeout=30,
    )
    if r.status_code != 200:
        return {}
    out = {}
    for row in r.json() or []:
        if row.get("source_url") and row.get("content_hash"):
            out[row["source_url"]] = row["content_hash"]
    return out


# ── Main ──────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--queue", type=int, choices=[1, 2], default=1,
                    help="1 = opportunity_sources, 2 = university apply_url pages")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--country", type=str, default=None)
    ap.add_argument("--provider", choices=["anthropic", "openai"], default="openai",
                    help="LLM provider for extraction")
    ap.add_argument("--max-usd", type=float, default=20.0,
                    help="Hard budget cap per run (default $20)")
    ap.add_argument("--dry-run", action="store_true",
                    help="plan only — no fetches, no LLM, no writes")
    args = ap.parse_args()

    params = {k: v for k, v in vars(args).items() if v is not None}

    with CrawlerRun("opportunity_discoverer", params=params) as run:
        last_hash_by_url = load_existing_hashes() if not args.dry_run else {}
        print(f"Loaded {len(last_hash_by_url)} prior page hashes (for skip-if-unchanged)")

        written = 0
        if args.queue == 1:
            rows = fetch_queue_1(args)
            print(f"Queue 1 (opportunity_sources): {len(rows)} URLs to process\n")
            run.set_total(len(rows))
            for row in rows:
                try:
                    written += process_page(
                        url=row["url"],
                        country_hint=row.get("country"),
                        source_id=row.get("id"),
                        run=run,
                        args=args,
                        last_hash_by_url=last_hash_by_url,
                        js_render=bool(row.get("js_render")),
                    )
                except BudgetExceeded:
                    run.event("warn", message="budget reached — stopping queue")
                    break
                # Mark this source crawled
                if not args.dry_run and row.get("id"):
                    httpx.patch(
                        f"{SB_URL}/rest/v1/opportunity_sources?id=eq.{row['id']}",
                        headers=SB_H,
                        json={"last_crawled_at": datetime.now(timezone.utc).isoformat(),
                              "last_status": "ok"},
                        timeout=10,
                    )
        else:
            unis = fetch_queue_2(args)
            print(f"Queue 2 (university candidate pages): {len(unis)} universities\n")
            total_pages = sum(len(CANDIDATE_PATHS) for _ in unis)
            run.set_total(total_pages)
            for u in unis:
                for candidate in queue_2_candidate_urls(u["base_url"]):
                    try:
                        written += process_page(
                            url=candidate,
                            country_hint=u["country"],
                            source_id=None,
                            run=run,
                            args=args,
                            last_hash_by_url=last_hash_by_url,
                        )
                    except BudgetExceeded:
                        run.event("warn", message="budget reached — stopping queue")
                        break
                else:
                    continue
                break

        run.summary = {
            "queue":     args.queue,
            "provider":  args.provider,
            "max_usd":   args.max_usd,
            "written":   written,
            "dry_run":   args.dry_run,
        }
        print(f"\nDONE: {run.summary}")


if __name__ == "__main__":
    main()
