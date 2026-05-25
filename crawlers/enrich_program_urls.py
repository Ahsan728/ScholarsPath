#!/usr/bin/env python3
"""
Enrich masters_programs with official university program page URLs.

For each program sourced from mastersportal, searches DuckDuckGo for the
specific program page on the university's own website and writes it to apply_url.

Run:
  cd crawlers
  python enrich_program_urls.py               # all mastersportal programs
  python enrich_program_urls.py --limit 20    # first 20 only (test)
  python enrich_program_urls.py --country Germany
  python enrich_program_urls.py --refill      # re-try programs marked 'not_found'
"""

import argparse
import os
import sys
import time
import urllib.parse
from typing import Optional

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import httpx
from ddgs import DDGS
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

SB_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SB_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
SB_HEADERS = {
    "apikey": SB_KEY,
    "Authorization": f"Bearer {SB_KEY}",
    "Content-Type": "application/json",
}

# Aggregator / non-university domains to skip
SKIP_DOMAINS = {
    "mastersportal.eu", "mastersportal.com",
    "bachelorsportal.eu", "phdportal.eu",
    "studyportals.com", "hotcourses.com", "findamasters.com",
    "topuniversities.com", "timeshighereducation.com", "qs.com",
    "usnews.com", "niche.com", "educations.com", "mba.com",
    "study.eu", "studyeu.org", "eunicas.eu",
    "beyondthestates.com", "mygermanuniversity.com",
    "mastersavenue.com", "academiccourses.com", "postgraduatesearch.com",
    "mastersscout.com", "findcourse.com", "brive.com", "standyou.com",
    "invest4edu.com", "studylink.com", "gyanberry.com", "grokipedia.com",
    "soboly.com", "studyabroadhungary.com", "studyinnorway.no",
    "studyinternational.com", "masterstudies.co.uk", "masterstudies.com",
    "studyinpoland.pl", "studyabroad.com", "coursera.org", "edx.org",
    "shiksha.com", "jeduka.com", "goabroad.com", "gotouniversity.com",
    "erudera.com", "opportunitiescircle.com", "thestudyabroadportal.com",
    "phdportal.com", "shortcoursesportal.com", "smarta.vn", "cinturs.pt",
    "study.iceland.is", "studies-in-poland.pl", "studyfinder", "tempus.tpf",
    "conservation-careers.com", "masterin.it", "studyabroadcourses.org",
    "applyaz.com", "admissiontestportal.com", "study-in-ireland.com",
    "iufro.org", "island.is", "courses.aber.ac.uk", "portalold.ipb.pt",
    "oferta.edmun.do", "myguide.de", "euroleague-study.org",
    "reddit.com", "facebook.com", "linkedin.com", "twitter.com",
    "instagram.com", "youtube.com", "wikipedia.org",
    "researchgate.net", "academia.edu",
    # Study-abroad / aggregator portals (expanded)
    "upgrad.com", "gogoespana.com", "studyclap.com", "hrcacademy.com",
    "englishtestportal.com", "studyeurope.in", "plantlink.se",
    "study-in-hungary.com", "studyinhungary.hu", "euroapply.eu",
    "internazionalelingue.uniparthenope.it", "si.se", "edmun.do",
    "study-in-europe.org", "studying-in-europe.org", "studyingeurope.eu",
    "studyabroad.shiksha.com", "afterschoolafrica.com", "opportunitydesk.org",
    "scholars4dev.com", "fulbright.org", "scholarshipdb.net",
    "scholarshipportal.com", "phdstudies.com", "postdocjobs.com",
    "natureindex.com", "jobs.ac.uk", "euraxess.ec.europa.eu",
    "daad.de/assets", "ask.shiksha.com",
    # More aggregators found in CS/IT enrichment pass
    "unimymasters.com", "canamgroup.com", "ambitio.club", "stuudy.com",
    "czechuniversities.com", "globaladmissions.com", "studyin.lt",
    "euroeducation.net", "weuni.com", "gradireland.com", "applyboard.com",
    "educatly.com", "designschool.com", "postgrad.com", "prospects.ac.uk",
    "distancelearningportal.com", "universitairemasters.nl", "studyqa.com",
    "postgrad.com", "postgraduatesearch.com", "masterscompass.com",
    "mastersavenue.com", "acrosstheglobe.com", "globalstudentforum.com",
    "mastersportal.com", "phdmap.com", "studymatch.me",
    # Round 3 — pages 6-95 enrichment cleanup
    "bachelorsportal.com", "qualifax.ie", "studyinnl.org", "collegedunia.com",
    "tiktok.com", "goingto.university", "thinkmile.in", "unipage.net",
    "oncampus.global", "search.studyinturkiye.com", "studyinestonia.ee",
    "free-apply.com", "o4af.com", "studiekeuze123.nl", "studentum.fr",
    "libertify.com", "afrismo.org", "heac.gov.om", "accessmasterstour.com",
    "mim-guide.com", "smarco.eu", "eduopinions.com", "stuhit.com",
    "europe.education", "epitech-experience.com", "study-vivendi.com",
    "onlineuniversities.com", "smarta.vn", "jeduka.com",
    # Round 4 cleanup
    "t24global.com", "ibn.idsi.md", "animationcareerreview.com", "ehef-japan.org",
    "oia.ugm.ac.id", "kuroshhusseini.com", "thehighereducationreview.com",
    "courses.laimoon.com", "techtitute.com", "essayforum.com", "sciencesprings.wordpress.com",
    "youapply.com", "for9a.com", "best-masters.co.uk", "gradualin.com", "wireservice.ca",
    "uniscopio.com", "blcspain.com", "edyouabroad.com", "portugalpolytechnicuniversities.com",
    "ivyoverseas.com", "ku.ac.ae", "seedglobaleducation.com", "t.me", "nikshala.com",
    "gostudyin.com", "newwayuk.com.ng", "quora.com", "careeroppotunities.com",
    "smartadmits.com", "studentenkamer.org", "learn4good.com", "intechopen.com",
    "academiajobs.com", "rentmasters.com", "academyfocus.com", "globalstudent.com",
    "postgraduatesearch.co.uk", "thecareerstop.com", "overseasstudy.ng",
    "euroleague-study.org",
    # Round 5 cleanup
    "studyinprague.cz", "rocapply.com", "careersportal.ie", "inkabroad.com",
    "kadamboverseas.com", "summerschoolsineurope.eu", "go.study",
    "schoolandcollegelistings.com", "polandstudy.com", "mastertube.com",
    "schoolfinder.com", "courses.ie", "studyinholland.co.uk",
    "digital-skills-jobs.europa.eu", "findmy.study", "universitaire.bachelors.nl",
    "ucc-ie-public.courseleaf.com",
    # Round 6 - engineering programs cleanup
    "thinkpoland.org", "educations.es", "pof.ues.rs.ba", "docplayer.net",
    "studyfits.com", "studies-in-english.pl", "studyindenmark.dk", "wahresume.com",
    "expatrio.com", "shakiledu.com", "best-masters.com", "u-bordeaux.com",
    "studies-in-europe.eu", "scribd.com", "masters.docsity.com",
    "alluniversity.info", "edumapple.com", "edunation.co", "build-shift.com",
    # Round 7 - second engineering pass
    "admissionsdirect.com", "aliconsultancyeurope.com", "studyingreece.edu.gr",
    "studyinfocus.com", "studyindenmark.eu", "studyadvisor.lk",
    "italystudycentre.com", "studyingreece.gr", "studyzone.com.br",
    "eduniversal-ranking.com",
    # Round 8 - third engineering pass
    "edurank.org", "studyinginswitzerland.com", "medcollege.edu.gr",
    "studyinslovakia.eu", "master-maestrias.com", "study-in-germany.com",
    "studylib.net",
    # Round 9 - Natural Science & Math cleanup
    "idp.com", "master-and-more.eu", "studyportugal.pt",
    "studyanywhere.com",
    "unischolars.com", "studentworldonline.com", "alfabetaglobal.com",
    "aeccglobal.com", "search.aeccglobal.com",
}

# URL path keywords that suggest a specific program page (not a homepage)
PROGRAM_KEYWORDS = [
    "programme", "program", "master", "msc", "course",
    "studies", "study", "education", "degree",
    "postgraduate", "graduate", "faculty", "school",
]


def is_official(url: str) -> bool:
    try:
        host = urllib.parse.urlparse(url).netloc.lower().lstrip("www.")
        return not any(skip in host for skip in SKIP_DOMAINS)
    except Exception:
        return False


def looks_like_program_page(url: str) -> bool:
    path = urllib.parse.urlparse(url).path.lower()
    return any(k in path for k in PROGRAM_KEYWORDS)


# ── Supabase helpers ──────────────────────────────────────────────────────────

def get_programs(country: Optional[str], limit: int, refill: bool,
                 source: Optional[str] = None,
                 only_mismatches: bool = False) -> list[dict]:
    params = {
        "select": "id,university,program_name,country,source_name",
        "limit": str(limit),
        "order": "id.asc",
    }
    if only_mismatches:
        # Re-search URLs for programs flagged by detect_domain_mismatch.py
        # or validate_program_urls.py.
        params["or"] = (
            "(domain_match_status.in.(mismatch,aggregator),"
            "url_status.in.(dead,wrong_domain))"
        )
    elif refill:
        params["or"] = "(apply_url.eq.not_found,apply_url.eq.)"
    else:
        params["apply_url"] = "eq."
    if source:
        params["source_name"] = f"eq.{source}"
    elif not only_mismatches:
        # All non-DAAD sources (DAAD URLs are fixed separately).
        # When --only-mismatches is set, include everything (DAAD can be wrong too).
        params["source_name"] = "neq.daad"
    if country:
        params["country"] = f"eq.{country}"
    r = httpx.get(f"{SB_URL}/rest/v1/masters_programs", headers=SB_HEADERS,
                  params=params, timeout=30)
    r.raise_for_status()
    return r.json()


def update_program(program_id: int, apply_url: str, source_url: str):
    # Reset validation flags so the next pass of validate_program_urls.py and
    # detect_domain_mismatch.py re-classifies the new URL.
    httpx.patch(
        f"{SB_URL}/rest/v1/masters_programs",
        headers=SB_HEADERS,
        params={"id": f"eq.{program_id}"},
        json={
            "apply_url": apply_url, "source_url": source_url,
            "url_status": None, "url_http_code": None, "url_final_url": None,
            "url_checked_at": None, "url_check_error": None,
            "domain_match_status": None, "domain_match_host": None,
            "domain_match_checked_at": None,
        },
        timeout=15,
    ).raise_for_status()


# ── Search ────────────────────────────────────────────────────────────────────

def find_program_url(ddgs: DDGS, university: str, program_name: str, country: str) -> Optional[str]:
    """
    Search DuckDuckGo for the specific program page on the university's website.
    Tries increasingly broad queries until a program-specific URL is found.
    """
    queries = [
        f'"{university}" "{program_name}" master programme',
        f'{university} "{program_name}" MSc programme',
        f'{university} {program_name} master {country}',
    ]

    all_results = []
    for query in queries:
        try:
            results = list(ddgs.text(query, max_results=8))
            urls = [r["href"] for r in results]
            all_results.extend(urls)

            # Prefer URLs that look like specific program pages
            program_urls = [u for u in urls if is_official(u) and looks_like_program_page(u)]
            if program_urls:
                return program_urls[0]

            time.sleep(0.8)
        except Exception as e:
            print(f"    search error: {e}")
            time.sleep(2)

    # Fallback: any official result from any query
    official = [u for u in all_results if is_official(u)]
    return official[0] if official else None


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit",   type=int, default=2000)
    parser.add_argument("--country", type=str, default=None)
    parser.add_argument("--source",  type=str, default=None,
                        help="Filter by source_name (e.g. mastersportal, local_docs)")
    parser.add_argument("--refill",  action="store_true",
                        help="Re-try programs previously marked not_found")
    parser.add_argument("--only-mismatches", action="store_true",
                        help="Re-search ONLY programs flagged as domain mismatch / aggregator / dead URL")
    args = parser.parse_args()

    programs = get_programs(args.country, args.limit, args.refill, args.source,
                            only_mismatches=args.only_mismatches)
    print(f"Enriching {len(programs)} programs...\n")

    found = 0
    not_found = 0

    with DDGS() as ddgs:
        for i, prog in enumerate(programs):
            uni  = prog["university"]
            name = prog["program_name"]
            ctry = prog["country"]
            pid  = prog["id"]

            print(f"[{i+1}/{len(programs)}] {uni} -- {name} ({ctry})")

            url = find_program_url(ddgs, uni, name, ctry)

            if url:
                print(f"  OK {url}")
                update_program(pid, apply_url=url, source_url=url)
                found += 1
            else:
                print(f"  -- not found")
                update_program(pid, apply_url="not_found", source_url="")
                not_found += 1

            # Polite delay between programs
            time.sleep(2)

    print(f"\nDone. Found: {found}  Not found: {not_found}")


if __name__ == "__main__":
    main()
