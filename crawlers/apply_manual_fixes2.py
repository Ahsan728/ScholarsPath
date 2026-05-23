#!/usr/bin/env python3
"""
Second batch of manual URL fixes for local_docs bachelor programs.
"""
import os, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import httpx
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

SB_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SB_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
SB_HEADERS = {
    "apikey": SB_KEY,
    "Authorization": f"Bearer {SB_KEY}",
    "Content-Type": "application/json",
}

MANUAL_FIXES = [
    # UC3M Spain
    {"apply_url": "https://www.uc3m.es/bachelor-degree/political-science",
     "source_url": "https://www.uc3m.es/bachelor-degree/political-science",
     "program_name_like": "political science%english%", "university_like": "carlos iii"},

    {"apply_url": "https://www.uc3m.es/bachelor-degree/economics",
     "source_url": "https://www.uc3m.es/bachelor-degree/economics",
     "program_name_like": "economics%english%", "university_like": "carlos iii"},

    {"apply_url": "https://www.uc3m.es/bachelor-degree/aerospace-engineering",
     "source_url": "https://www.uc3m.es/bachelor-degree/aerospace-engineering",
     "program_name_like": "aerospace engineering%", "university_like": "carlos iii"},

    {"apply_url": "https://www.uc3m.es/bachelor-degree/international-studies",
     "source_url": "https://www.uc3m.es/bachelor-degree/international-studies",
     "program_name_like": "international studies%", "university_like": "carlos iii"},

    {"apply_url": "https://www.uc3m.es/bachelor-degree/business-administration",
     "source_url": "https://www.uc3m.es/bachelor-degree/business-administration",
     "program_name_like": "business administration%english%", "university_like": "carlos iii"},

    # UAM Spain
    {"apply_url": "https://www.uam.es/uam/en/estudios/grados/grados-ingles/bachelor-international-relations",
     "source_url": "https://www.uam.es/uam/en/estudios/grados/grados-ingles/bachelor-international-relations",
     "program_name_like": "international relations%english%", "university_like": "autonoma de madrid"},

    # UPF Spain
    {"apply_url": "https://www.upf.edu/en/web/grau/grau-internacional-business-economics",
     "source_url": "https://www.upf.edu/en/web/grau/grau-internacional-business-economics",
     "program_name_like": "international business economics%", "university_like": "pompeu fabra"},

    {"apply_url": "https://www.upf.edu/en/web/grau/grau-ciencies-politiques",
     "source_url": "https://www.upf.edu/en/web/grau/grau-ciencies-politiques",
     "program_name_like": "political%administrative sciences%", "university_like": "pompeu fabra"},

    {"apply_url": "https://www.upf.edu/en/web/grau/grau-comunicacio-audiovisual",
     "source_url": "https://www.upf.edu/en/web/grau/grau-comunicacio-audiovisual",
     "program_name_like": "audiovisual communication%", "university_like": "pompeu fabra"},

    # UPC Spain
    {"apply_url": "https://www.upc.edu/en/bachelors/bioinformatics-barcelona",
     "source_url": "https://www.upc.edu/en/bachelors/bioinformatics-barcelona",
     "program_name_like": "%bioinformatics%", "university_like": "politecnica de catalunya"},

    {"apply_url": "https://www.upc.edu/en/bachelors/data-science-and-engineering-barcelona",
     "source_url": "https://www.upc.edu/en/bachelors/data-science-and-engineering-barcelona",
     "program_name_like": "data science%engineering%", "university_like": "politecnica de catalunya"},

    {"apply_url": "https://www.upc.edu/en/bachelors/industrial-technologies-economic-analysis-barcelona",
     "source_url": "https://www.upc.edu/en/bachelors/industrial-technologies-economic-analysis-barcelona",
     "program_name_like": "industrial technologies%", "university_like": "politecnica de catalunya"},

    # French business schools
    {"apply_url": "https://www.edhec.edu/en/programs/bachelor-in-business-administration",
     "source_url": "https://www.edhec.edu/en/programs/bachelor-in-business-administration",
     "program_name_like": "%global business%", "university_like": "edhec"},

    {"apply_url": "https://en.em-normandie.com/bachelor-management/bachelor-international-management",
     "source_url": "https://en.em-normandie.com/bachelor-management/bachelor-international-management",
     "program_name_like": "bachelor in international management%", "university_like": "normandie"},

    {"apply_url": "https://www.essca.fr/en/programs/bachelor/",
     "source_url": "https://www.essca.fr/en/programs/bachelor/",
     "program_name_like": "bachelor in international management", "university_like": "essca"},

    {"apply_url": "https://www.montpellier-bs.com/bachelor-international-business-administration",
     "source_url": "https://www.montpellier-bs.com/bachelor-international-business-administration",
     "program_name_like": "bachelor in international business administration", "university_like": "montpellier"},

    {"apply_url": "https://www.neoma-bs.com/en/programmes/bachelor/bachelor-in-international-business/",
     "source_url": "https://www.neoma-bs.com/en/programmes/bachelor/bachelor-in-international-business/",
     "program_name_like": "bachelor in international business", "university_like": "neoma"},

    {"apply_url": "https://kedge.edu/en/programmes/bachelor/bba/",
     "source_url": "https://kedge.edu/en/programmes/bachelor/bba/",
     "program_name_like": "bba in global management", "university_like": "kedge"},

    {"apply_url": "https://tbs-education.com/programs/bachelor-of-management/",
     "source_url": "https://tbs-education.com/programs/bachelor-of-management/",
     "program_name_like": "bachelor in management", "university_like": "toulouse business"},

    {"apply_url": "https://www.psb-paris.fr/en/programs/bachelor/bachelor-in-business-administration/",
     "source_url": "https://www.psb-paris.fr/en/programs/bachelor/bachelor-in-business-administration/",
     "program_name_like": "bachelor in business administration", "university_like": "paris school"},

    {"apply_url": "https://www.ferrandi-paris.com/en/hospitality-management-program",
     "source_url": "https://www.ferrandi-paris.com/en/hospitality-management-program",
     "program_name_like": "hotel%restaurant management", "university_like": "ferrandi"},

    {"apply_url": "https://www.excelia-group.com/programs/bachelor/bachelor-in-tourism-hospitality-management",
     "source_url": "https://www.excelia-group.com/programs/bachelor/bachelor-in-tourism-hospitality-management",
     "program_name_like": "%tourism%hospitality management", "university_like": "excelia"},

    {"apply_url": "https://www.savignac.fr/en/bachelor-hospitality-tourism-management",
     "source_url": "https://www.savignac.fr/en/bachelor-hospitality-tourism-management",
     "program_name_like": "%hospitality%tourism management", "university_like": "savignac"},

    {"apply_url": "https://www.utc.fr/en/study/degrees-and-programs/technology-bachelor/",
     "source_url": "https://www.utc.fr/en/study/degrees-and-programs/technology-bachelor/",
     "program_name_like": "bachelor in science and technology", "university_like": "compiegne"},

    {"apply_url": "https://www.vatel.fr/en/bachelor-international-hotel-management/",
     "source_url": "https://www.vatel.fr/en/bachelor-international-hotel-management/",
     "program_name_like": "bachelor in international hotel management", "university_like": "vatel"},

    {"apply_url": "https://www.ecole-ducasse.com/en/programs/bachelor-culinary-arts/",
     "source_url": "https://www.ecole-ducasse.com/en/programs/bachelor-culinary-arts/",
     "program_name_like": "bachelor in culinary arts%", "university_like": "ducasse"},

    {"apply_url": "https://www.ehl.edu/en/study/bachelor-degree-in-hospitality",
     "source_url": "https://www.ehl.edu/en/study/bachelor-degree-in-hospitality",
     "program_name_like": "bachelor in international hospitality management", "university_like": "ehl"},

    {"apply_url": "https://www.eiml-paris.com/en/programs/bachelor/",
     "source_url": "https://www.eiml-paris.com/en/programs/bachelor/",
     "program_name_like": "bachelor in luxury brand management%", "university_like": "eiml"},

    # CMH Academy
    {"apply_url": "https://cmh.fr/en/bachelor-in-luxury-hospitality-event-management/",
     "source_url": "https://cmh.fr/en/bachelor-in-luxury-hospitality-event-management/",
     "program_name_like": "bachelor in luxury hospitality%", "university_like": "cmh"},
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
    data = r.json()
    if isinstance(data, str):
        print(f"  ERROR: {data}")
        return []
    return data


def apply_fix(program_id: str, apply_url: str, source_url: str):
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
                print(f"  FIXED [{prog['id'][:8]}] {prog['university']} -- {prog['program_name']} -> {apply_url}")
                total_updated += 1
            except Exception as e:
                print(f"  ERROR updating [{prog['id']}]: {e}")

    print(f"\nDone. Total updated: {total_updated}")


if __name__ == "__main__":
    main()
