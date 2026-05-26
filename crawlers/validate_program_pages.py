#!/usr/bin/env python3
"""
Phase D: validate each program's actual page content.

For every program with url_status='ok', fetches the page and computes:

  page_status:
    specific_english     — page is about this program, in English, name matches
    name_changed         — page is about a single specific program but the
                           name differs from our DB; suggested_new_name set
    generic_page         — page is a generic listing / landing, not specific
    closed               — page indicates the program is discontinued
    specific_non_english — page is about this program but not English-taught
    unreachable          — fetch failed

  language_status:
    english_only           — program taught in English only
    mixed_with_english     — multi-language including English (kept, lower priority)
    non_english            — no English at all
    unknown                — couldn't determine

Free (no LLM). Reads the literal "language of instruction" line in any of
~13 European languages plus title/h1 matching for name change detection.

Run:
  cd crawlers
  python validate_program_pages.py                  # all url_status=ok programs
  python validate_program_pages.py --limit 100      # smoke test
  python validate_program_pages.py --country Germany
  python validate_program_pages.py --refresh        # ignore page_checked_at
"""

import argparse
import os
import re
import sys
import time
from datetime import datetime, timezone
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
    "apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}",
    "Content-Type": "application/json", "Prefer": "return=minimal",
}

UA = "Mozilla/5.0 (compatible; ScholarAssistBot/1.0; +https://scholars.ahsansuny.com)"
REQ_HEADERS = {"User-Agent": UA, "Accept": "text/html,*/*;q=0.5",
               "Accept-Language": "en,*;q=0.5"}
TIMEOUT = 15


# ── Closed-program markers (in many languages) ─────────────────
CLOSED_PATTERNS = re.compile(
    r"(?:no longer (?:offered|accepting|admitting|available)|"
    r"discontinued|phased out|programme (?:has been )?withdrawn|"
    r"closed for (?:applications|admissions)|"
    r"this (?:programme|program|course) (?:has been|is) (?:closed|cancelled|suspended|archived)|"
    r"nicht mehr angeboten|wurde eingestellt|"
    r"plus offert|n'est plus disponible|"
    r"non più (?:offerto|attivo)|"
    r"ya no se ofrece|"
    r"niet meer aangeboden|"
    r"nedlagt|avvecklet)",
    re.IGNORECASE,
)


# ── "Language of instruction" patterns (regex captures the value) ──
LANG_PATTERNS = [
    # English
    r"(?:language\s+of\s+instruction|instruction\s+language|programme\s+language|"
    r"teaching\s+language|language\s+of\s+teaching|language\s+of\s+the\s+programme|"
    r"taught\s+(?:in|language))\s*[:\-—]?\s*([^.<\n\r;|]{1,80})",
    r"this\s+(?:programme|program|course|degree)\s+is\s+taught\s+in\s+([^.<\n\r;|]{1,80})",
    r"\bcourses?\s+(?:are\s+)?(?:taught\s+|delivered\s+)?in\s+([a-zà-ÿ ,/&]{1,40}?)\s*(?:and|$|\.)",
    # German
    r"(?:unterrichtssprache|lehrsprache|sprache\s+des\s+studiums|studiensprache)\s*[:\-—]?\s*([^.<\n\r;|]{1,80})",
    # French
    r"langue\s+d['']enseignement\s*[:\-—]?\s*([^.<\n\r;|]{1,80})",
    r"(?:enseigné|enseignement)\s+en\s+([^.<\n\r;|]{1,80})",
    # Italian
    r"lingua\s+(?:di\s+insegnamento|d['']insegnamento|del\s+corso)\s*[:\-—]?\s*([^.<\n\r;|]{1,80})",
    r"insegnato\s+in\s+([^.<\n\r;|]{1,80})",
    r"\blingua\s*[:\-—]\s*([^.<\n\r;|]{1,80})",
    # Spanish
    r"idioma\s+de\s+(?:instrucción|enseñanza|impartición)\s*[:\-—]?\s*([^.<\n\r;|]{1,80})",
    r"impartido\s+en\s+([^.<\n\r;|]{1,80})",
    # Dutch
    r"(?:voertaal|onderwijstaal|instructietaal)\s*[:\-—]?\s*([^.<\n\r;|]{1,80})",
    # Swedish / Norwegian / Danish
    r"undervisningsspr[åa]k\s*[:\-—]?\s*([^.<\n\r;|]{1,80})",
    r"undervisningssprog\s*[:\-—]?\s*([^.<\n\r;|]{1,80})",
    # Polish / Hungarian / Czech / Portuguese
    r"j[ęe]zyk\s+wyk[lł]adowy\s*[:\-—]?\s*([^.<\n\r;|]{1,80})",
    r"oktatás\s+nyelve\s*[:\-—]?\s*([^.<\n\r;|]{1,80})",
    r"vyu[čc]ovac[ií]\s+jazyk\s*[:\-—]?\s*([^.<\n\r;|]{1,80})",
    r"l[ií]ngua\s+de\s+ensino\s*[:\-—]?\s*([^.<\n\r;|]{1,80})",
]
LANG_PATTERN_RX = [re.compile(p, re.IGNORECASE) for p in LANG_PATTERNS]

# Words meaning "English" in many languages
ENGLISH_MARKERS = re.compile(
    r"\b(?:english|englisch|anglais|inglese|inglés|engels|engelska|engelsk|"
    r"angielski|angol|anglick|inglês|englanti|anglų|engelsk)",
    re.IGNORECASE,
)
# Words for other major European languages (we treat their presence alongside
# English as "mixed_with_english"; alone as "non_english")
OTHER_LANG_MARKERS = re.compile(
    r"\b(?:german|deutsch|allemand|tedesco|alemán|duits|tysk|niemiecki|"
    r"french|français|französisch|francese|francés|frans|franska|francuski|"
    r"italian|italiano|italienisch|italien|italiaans|italienska|włoski|"
    r"spanish|español|spanisch|spagnolo|espagnol|spaans|spanska|hiszpański|"
    r"dutch|nederlands|niederländisch|néerlandais|olandese|holandés|holländska|"
    r"portuguese|português|portugais|portoghese|portugués|portugees|portugisiska|"
    r"swedish|svenska|schwedisch|suédois|svedese|sueco|"
    r"danish|dansk|dänisch|danois|danese|danés|"
    r"norwegian|norsk|norwegisch|norvégien|norvegese|noruego|"
    r"finnish|suomi|finnisch|finnois|finlandese|finlandés|"
    r"polish|polski|polnisch|polonais|polacco|polaco|pools|polska|"
    r"czech|čeština|tschechisch|tchèque|ceco|checo|tjeckiska|"
    r"hungarian|magyar|ungarisch|hongrois|ungherese|húngaro|ungerska)",
    re.IGNORECASE,
)


# ── HTML extraction ──────────────────────────────────────────
TITLE_RX = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)
H1_RX    = re.compile(r"<h1[^>]*>(.*?)</h1>",     re.IGNORECASE | re.DOTALL)
LANG_ATTR_RX = re.compile(r"<html[^>]*\blang\s*=\s*['\"]([a-zA-Z\-]+)", re.IGNORECASE)


def fetch(url: str) -> Optional[str]:
    try:
        r = httpx.get(url, headers=REQ_HEADERS, timeout=TIMEOUT, follow_redirects=True)
        if r.status_code != 200:
            return None
        ct = r.headers.get("content-type", "")
        if "text/html" not in ct and "text/plain" not in ct:
            return None
        return r.text
    except Exception:
        return None


def strip_html(html: str) -> str:
    html = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.IGNORECASE)
    html = re.sub(r"<style[\s\S]*?</style>",   " ", html, flags=re.IGNORECASE)
    html = re.sub(r"<noscript[\s\S]*?</noscript>", " ", html, flags=re.IGNORECASE)
    html = re.sub(r"<(nav|header|footer|aside|form|svg)\b[\s\S]*?</\1>", " ",
                  html, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", html)
    text = (text.replace("&nbsp;", " ").replace("&amp;", "&")
                .replace("&lt;", "<").replace("&gt;", ">")
                .replace("&#39;", "'").replace("&quot;", '"'))
    text = re.sub(r"\s+", " ", text).strip()
    return text


def extract_meta(html: str) -> tuple[str, str, str]:
    title_m = TITLE_RX.search(html or "")
    title = strip_html(title_m.group(1)) if title_m else ""
    h1_m = H1_RX.search(html or "")
    h1 = strip_html(h1_m.group(1)) if h1_m else ""
    lang_m = LANG_ATTR_RX.search(html or "")
    lang_attr = (lang_m.group(1) or "").lower() if lang_m else ""
    return title[:300], h1[:300], lang_attr


# ── Name match (fuzzy) ───────────────────────────────────────
STOP = {"the","of","and","in","at","for","an","a","la","le","de","des",
        "msc","mphil","ma","bsc","ba","master","masters","master's","programme","program",
        "course","degree","studies","study"}

def name_tokens(name: str) -> set[str]:
    return {t for t in re.findall(r"[a-zà-ÿ0-9]+", (name or "").lower()) if len(t) > 2 and t not in STOP}

def name_match_ratio(prog_name: str, page_text: str) -> float:
    """Fraction of program-name significant tokens that appear in the page text."""
    toks = name_tokens(prog_name)
    if not toks: return 1.0
    haystack = (page_text or "").lower()
    hits = sum(1 for t in toks if t in haystack)
    return hits / len(toks)


# ── Language classification ──────────────────────────────────
def classify_language(text: str, lang_attr: str) -> tuple[str, list[str]]:
    """Return (language_status, detected_languages_list)."""
    detected = set()

    # 1. Search "language of instruction" patterns
    for rx in LANG_PATTERN_RX:
        for m in rx.finditer(text):
            value = m.group(1)[:120]
            has_eng = bool(ENGLISH_MARKERS.search(value))
            others  = [o.group(0).lower() for o in OTHER_LANG_MARKERS.finditer(value)]
            if has_eng:
                detected.add("English")
            for o in others:
                detected.add(o.title())
            if has_eng or others:
                # We found a usable line — stop after first hit for cheap classification
                break
        if detected:
            break

    if "English" in detected and any(d for d in detected if d != "English"):
        return ("mixed_with_english", sorted(detected))
    if "English" in detected:
        return ("english_only", sorted(detected))
    if detected:
        return ("non_english", sorted(detected))

    # 2. Fallback: html lang attribute
    if lang_attr.startswith("en"):
        # Page is in English but the explicit "language of instruction" line
        # wasn't found. This often happens on English-medium European unis
        # where every program page is in English.
        return ("english_only", ["English"])

    return ("unknown", [])


def is_closed(text: str) -> bool:
    return bool(CLOSED_PATTERNS.search(text))


# ── Top-level classifier ─────────────────────────────────────
def classify_page(prog: dict, html: str) -> dict:
    """Compute all the page_* columns for one program."""
    out = {
        "page_status": None, "language_status": None,
        "page_title": None, "page_lang_attr": None,
        "suggested_new_name": None, "detected_languages": [],
    }
    if not html:
        out["page_status"] = "unreachable"
        return out

    title, h1, lang_attr = extract_meta(html)
    text = strip_html(html)[:50000]
    out["page_title"]      = title or None
    out["page_lang_attr"]  = lang_attr or None

    # Closed?
    if is_closed(text):
        out["page_status"] = "closed"
        return out

    # Name match
    prog_name = prog.get("program_name") or ""
    title_h1  = f"{title} {h1}"
    title_match  = name_match_ratio(prog_name, title_h1)
    body_match   = name_match_ratio(prog_name, text[:3000])
    overall_match = max(title_match, body_match)

    # Language
    lang_status, detected = classify_language(text, lang_attr)
    out["language_status"]      = lang_status
    out["detected_languages"]   = detected

    # Final page_status verdict
    if lang_status == "non_english":
        out["page_status"] = "specific_non_english" if overall_match >= 0.4 else "generic_page"
        return out

    if overall_match >= 0.6:
        out["page_status"] = "specific_english"
    elif overall_match >= 0.3:
        # Page mentions some but not most of the program name → possible name
        # change candidate. Use page title as the suggestion.
        out["page_status"] = "name_changed"
        out["suggested_new_name"] = (h1 or title)[:300] or None
    else:
        out["page_status"] = "generic_page"
    return out


# ── Supabase paging ──────────────────────────────────────────
def fetch_programs(args) -> list[dict]:
    base = f"{SB_URL}/rest/v1/masters_programs"
    select = "id,program_name,university,country,apply_url,page_status,page_checked_at"
    filters = ["url_status=eq.ok"]
    if args.country:
        filters.append(f"country=eq.{args.country}")
    if not args.refresh:
        filters.append("page_status=is.null")

    rows: list[dict] = []
    page_size = 1000
    offset = 0
    while True:
        url = f"{base}?select={select}&" + "&".join(filters)
        url += f"&order=id.asc&limit={page_size}&offset={offset}"
        r = httpx.get(url, headers={"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"},
                      timeout=60)
        if r.status_code != 200:
            print(f"fetch error: {r.status_code} {r.text[:200]}", flush=True)
            break
        batch = r.json()
        if not batch: break
        rows.extend(batch)
        if len(batch) < page_size: break
        offset += page_size
        if args.limit and len(rows) >= args.limit:
            rows = rows[: args.limit]; break
    return rows


def update_program(program_id: str, result: dict) -> bool:
    body = {**result, "page_checked_at": datetime.now(timezone.utc).isoformat()}
    r = httpx.patch(f"{SB_URL}/rest/v1/masters_programs?id=eq.{program_id}",
                    headers=SB_HEADERS, json=body, timeout=30)
    return r.status_code in (200, 204)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit",   type=int, default=None)
    ap.add_argument("--country", type=str, default=None)
    ap.add_argument("--refresh", action="store_true",
                    help="re-validate everything; ignore page_checked_at")
    args = ap.parse_args()

    params = {k: v for k, v in vars(args).items() if v is not None}

    with CrawlerRun("page_validator", params=params) as run:
        programs = fetch_programs(args)
        run.set_total(len(programs))
        print(f"Validating {len(programs)} program pages...", flush=True)

        counts: dict = {}
        for i, p in enumerate(programs, 1):
            html = fetch(p["apply_url"])
            result = classify_page(p, html or "")
            if update_program(p["id"], result):
                status = result["page_status"]
                counts[status] = counts.get(status, 0) + 1
                if status in ("specific_english", "name_changed"):
                    run.ok()
                else:
                    run.failed(target_id=p["id"], target_url=p["apply_url"],
                               message=f"{status}: {result.get('language_status') or ''}")
            else:
                run.failed(target_id=p["id"], message="DB update failed")

            if i % 50 == 0 or i == len(programs):
                print(f"  [{i}/{len(programs)}] {counts}", flush=True)
            time.sleep(0.1)  # be polite to source sites

        run.summary = counts
        print(f"\nDONE: {counts}", flush=True)


if __name__ == "__main__":
    main()
