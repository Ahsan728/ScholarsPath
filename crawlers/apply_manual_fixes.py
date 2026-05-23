#!/usr/bin/env python3
"""
Apply manual URL fixes for programs where web search returns aggregators.
Reads from scripts/fix_program_urls_manual.sql and applies via Supabase REST.
"""

import os
import httpx
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

SB_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SB_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
SB_HEADERS = {
    "apikey": SB_KEY,
    "Authorization": f"Bearer {SB_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

MANUAL_FIXES = [
    # NMBU Norway
    {"apply_url": "https://www.nmbu.no/en/studies/master-2-year/animal-science",
     "source_url": "https://www.nmbu.no/en/studies/master-2-year/animal-science",
     "program_name": "animal science", "country": "norway", "source_name": "mastersportal"},

    {"apply_url": "https://www.nmbu.no/en/studies/master-2-year/plant-sciences",
     "source_url": "https://www.nmbu.no/en/studies/master-2-year/plant-sciences",
     "program_name": "plant sciences", "country": "norway", "source_name": "mastersportal"},

    {"apply_url": "https://www.nmbu.no/en/studies/master-2-year/aquaculture",
     "source_url": "https://www.nmbu.no/en/studies/master-2-year/aquaculture",
     "program_name": "aquaculture", "country": "norway", "source_name": "mastersportal"},

    # ETH Zurich
    {"apply_url": "https://ethz.ch/en/studies/master/degree-programmes/agriculture-and-food/agricultural-sciences.html",
     "source_url": "https://ethz.ch/en/studies/master/degree-programmes/agriculture-and-food/agricultural-sciences.html",
     "program_name": "agricultural sciences", "university_like": "eth zurich"},

    # Wageningen
    {"apply_url": "https://www.wur.nl/en/education/master/masters-resilient-farming-food-systems.htm",
     "source_url": "https://www.wur.nl/en/education/master/masters-resilient-farming-food-systems.htm",
     "program_name_like": "resilient farming", "country": "netherlands"},

    {"apply_url": "https://www.wur.nl/en/education/master/masters-animal-sciences",
     "source_url": "https://www.wur.nl/en/education/master/masters-animal-sciences",
     "program_name": "animal sciences", "university_like": "wageningen"},

    # University of Algarve
    {"apply_url": "https://www.ualg.pt/en/content/food-technology-0",
     "source_url": "https://www.ualg.pt/en/content/food-technology-0",
     "program_name": "food technology", "country": "portugal", "university_like": "algarve"},

    # UCD Ireland
    {"apply_url": "https://www.ucd.ie/courses/digital-technology-for-sustainable-agriculture-msc",
     "source_url": "https://www.ucd.ie/courses/digital-technology-for-sustainable-agriculture-msc",
     "program_name_like": "digital technology for sustainable agriculture", "country": "ireland"},

    {"apply_url": "https://www.ucd.ie/courses/biosystems-and-food-engineering-mengsc",
     "source_url": "https://www.ucd.ie/courses/biosystems-and-food-engineering-mengsc",
     "program_name_like": "biosystems and food engineering", "country": "ireland"},

    # University of Hamburg
    {"apply_url": "https://www.uni-hamburg.de/en/pomor.html",
     "source_url": "https://www.uni-hamburg.de/en/pomor.html",
     "program_name_like": "polar and marine sciences", "country": "germany"},

    # University of Kiel
    {"apply_url": "https://www.uni-kiel.de/en/studies/master/dairy-science",
     "source_url": "https://www.uni-kiel.de/en/studies/master/dairy-science",
     "program_name": "dairy science", "country": "germany"},

    # BOKU Vienna
    {"apply_url": "https://www.boku.ac.at/en/studium/studienarten/masterstudien/horticultural-sciences",
     "source_url": "https://www.boku.ac.at/en/studium/studienarten/masterstudien/horticultural-sciences",
     "program_name": "horticultural sciences", "university_like": "natural resources%vienna"},

    {"apply_url": "https://www.boku.ac.at/en/studium/studienarten/masterstudien/mountain-forestry",
     "source_url": "https://www.boku.ac.at/en/studium/studienarten/masterstudien/mountain-forestry",
     "program_name": "mountain forestry", "country": "austria"},

    {"apply_url": "https://www.boku.ac.at/en/studium/studienarten/masterstudien/limnology-and-wetland-management",
     "source_url": "https://www.boku.ac.at/en/studium/studienarten/masterstudien/limnology-and-wetland-management",
     "program_name": "limnology and wetland management", "country": "austria"},

    {"apply_url": "https://www.boku.ac.at/en/studium/studienarten/masterstudien/plant-breeding",
     "source_url": "https://www.boku.ac.at/en/studium/studienarten/masterstudien/plant-breeding",
     "program_name_like": "plant breeding", "country": "austria"},

    {"apply_url": "https://www.boku.ac.at/en/studium/studienarten/masterstudien/organic-agricultural-systems-and-agroecology",
     "source_url": "https://www.boku.ac.at/en/studium/studienarten/masterstudien/organic-agricultural-systems-and-agroecology",
     "program_name_like": "organic agricultural systems%agroecology", "country": "austria"},

    # Tomas Bata Zlin
    {"apply_url": "https://www.utb.cz/en/studying-at-tbu/programmes-and-courses/",
     "source_url": "https://www.utb.cz/en/studying-at-tbu/programmes-and-courses/",
     "program_name": "food technology", "university_like": "tomas bata"},

    # Universita Cattolica
    {"apply_url": "https://international.unicatt.it/ucscinternational-sustainable-viticulture-and-enology",
     "source_url": "https://international.unicatt.it/ucscinternational-sustainable-viticulture-and-enology",
     "program_name_like": "sustainable viticulture", "university_like": "cattolica"},

    # University of Lorraine
    {"apply_url": "https://formations.univ-lorraine.fr/en/degree-programs/bac4-bac5/master-s-degree/2141-master-in-forestry.html",
     "source_url": "https://formations.univ-lorraine.fr/en/degree-programs/bac4-bac5/master-s-degree/2141-master-in-forestry.html",
     "program_name": "forestry", "university_like": "lorraine"},

    # Polytechnic Institute Braganca
    {"apply_url": "https://ipb.pt/en/curso/management-of-forest-resources",
     "source_url": "https://ipb.pt/en/curso/management-of-forest-resources",
     "program_name_like": "management of forest resources"},

    # Poznan
    {"apply_url": "https://www.puls.edu.pl/en/study-offer/master-degree",
     "source_url": "https://www.puls.edu.pl/en/study-offer/master-degree",
     "program_name_like": "horticulture%seed", "university_like": "poznan"},

    # Wroclaw
    {"apply_url": "https://www.upwr.edu.pl/en/study/study_offer/master_studies.html",
     "source_url": "https://www.upwr.edu.pl/en/study/study_offer/master_studies.html",
     "program_name": "food technology", "university_like": "wroclaw"},

    # University of Iceland
    {"apply_url": "https://www.hi.is/english/biology_and_fisheries",
     "source_url": "https://www.hi.is/english/biology_and_fisheries",
     "program_name_like": "aquatic biology and fisheries", "country": "iceland"},

    # University of Perugia
    {"apply_url": "https://www.unipg.it/en/studying-at-unipg/degree-programmes/agricultural-and-environmental-biotechnology",
     "source_url": "https://www.unipg.it/en/studying-at-unipg/degree-programmes/agricultural-and-environmental-biotechnology",
     "program_name_like": "agricultural and environmental biotechnology"},

    # University of Agriculture Krakow
    {"apply_url": "https://urk.edu.pl/en/study/study-in-english/master-studies",
     "source_url": "https://urk.edu.pl/en/study/study-in-english/master-studies",
     "program_name": "horticultural science", "university_like": "krakow"},

    # AgroParisTech
    {"apply_url": "https://www.agroparistech.fr/en/formations/masters/masters-jointly-run-other-institutions/forest-nature-and-society-international-management-geeft",
     "source_url": "https://www.agroparistech.fr/en/formations/masters/masters-jointly-run-other-institutions/forest-nature-and-society-international-management-geeft",
     "program_name_like": "forest, nature and society", "university_like": "agroparistech"},

    # University of Gottingen - Integrated Plant and Animal Breeding
    {"apply_url": "https://www.uni-goettingen.de/en/568499.html",
     "source_url": "https://www.uni-goettingen.de/en/568499.html",
     "program_name_like": "integrated plant and animal breeding"},

    # Warsaw University
    {"apply_url": "https://www.sggw.edu.pl/en/academic-offer/studies-in-english/masters-studies/",
     "source_url": "https://www.sggw.edu.pl/en/academic-offer/studies-in-english/masters-studies/",
     "program_name": "sustainable horticulture", "university_like": "warsaw"},

    # University of Warmia
    {"apply_url": "https://uwm.edu.pl/wnz/en/study-english/food-engineering-general-information",
     "source_url": "https://uwm.edu.pl/wnz/en/study-english/food-engineering-general-information",
     "program_name": "food engineering", "university_like": "warmia"},

    # SLU Animal Science
    {"apply_url": "https://www.slu.se/en/study/programmes-courses/masters-programmes/animal-science/",
     "source_url": "https://www.slu.se/en/study/programmes-courses/masters-programmes/animal-science/",
     "program_name": "animal science", "university_like": "swedish university of agricultural"},

    # NMBU Aquatic Food Production
    {"apply_url": "https://www.nmbu.no/en/studies/master-2-year/aquatic-food-production-safety-and-quality",
     "source_url": "https://www.nmbu.no/en/studies/master-2-year/aquatic-food-production-safety-and-quality",
     "program_name_like": "aquatic food production", "country": "norway"},
]


def fetch_programs_to_fix(fix: dict) -> list[dict]:
    params = {"select": "id,program_name,university,country,apply_url"}

    if "program_name" in fix:
        params["program_name"] = f"ilike.{fix['program_name']}"
    elif "program_name_like" in fix:
        params["program_name"] = f"ilike.*{fix['program_name_like']}*"

    if "country" in fix:
        params["country"] = f"ilike.{fix['country']}"

    if "university_like" in fix:
        params["university"] = f"ilike.*{fix['university_like']}*"

    if "source_name" in fix:
        params["source_name"] = f"eq.{fix['source_name']}"

    r = httpx.get(f"{SB_URL}/rest/v1/masters_programs",
                  headers=SB_HEADERS, params=params, timeout=30)
    r.raise_for_status()
    return r.json()


def apply_fix(program_id: int, apply_url: str, source_url: str):
    r = httpx.patch(
        f"{SB_URL}/rest/v1/masters_programs",
        headers={**SB_HEADERS, "Prefer": "return=minimal"},
        params={"id": f"eq.{program_id}"},
        json={"apply_url": apply_url, "source_url": source_url},
        timeout=15,
    )
    r.raise_for_status()


def main():
    total_updated = 0
    for fix in MANUAL_FIXES:
        apply_url = fix["apply_url"]
        source_url = fix["source_url"]

        try:
            programs = fetch_programs_to_fix(fix)
        except Exception as e:
            print(f"  ERROR fetching for {apply_url}: {e}")
            continue

        if not programs:
            print(f"  NO MATCH: {apply_url}")
            continue

        for prog in programs:
            try:
                apply_fix(prog["id"], apply_url, source_url)
                print(f"  FIXED [{prog['id']}] {prog['university']} -- {prog['program_name']} -> {apply_url}")
                total_updated += 1
            except Exception as e:
                print(f"  ERROR updating [{prog['id']}]: {e}")

    print(f"\nDone. Total updated: {total_updated}")


if __name__ == "__main__":
    main()
