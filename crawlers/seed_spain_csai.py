#!/usr/bin/env python3
"""One-off: insert curated CS/AI/IT masters programs in Spain."""
import os, sys, httpx, hashlib
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from dotenv import load_dotenv
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json", "Prefer": "return=minimal"}

def fp(name):
    return hashlib.sha256(f"{name.lower().strip()}|spain|master".encode()).hexdigest()

PROGRAMS = [
    ("Universitat Politecnica de Catalunya", "Master in Artificial Intelligence", "Barcelona", "https://www.upc.edu/en/masters/artificial-intelligence", ["Artificial Intelligence"]),
    ("Universitat Politecnica de Catalunya", "Master in AI for Connected Industries (AI4CI)", "Barcelona", "https://www.upc.edu/en/masters/artificial-intelligence-for-connected-industries-ai4ci", ["Artificial Intelligence"]),
    ("Universitat Politecnica de Catalunya", "Master in Innovation and Research in Informatics", "Barcelona", "https://www.upc.edu/en/masters", ["Computer Science"]),
    ("Universitat Politecnica de Catalunya", "Master in Cybersecurity", "Barcelona", "https://www.upc.edu/en/masters", ["Cybersecurity"]),
    ("Universitat Politecnica de Catalunya", "Master in Data Science", "Barcelona", "https://www.upc.edu/en/masters", ["Data Science"]),
    ("Universitat de Barcelona", "Master in Fundamental Principles of Data Science", "Barcelona", "https://web.ub.edu/en/web/estudis/w/masterdegree-m0k05", ["Data Science"]),
    ("Universitat Autonoma de Barcelona", "Master in Computer Vision", "Barcelona", "https://www.uab.cat/web/study/graduate/master-s-degrees-and-graduate-diplomas-in-english-1345671925069.html", ["Computer Vision"]),
    ("Universitat Autonoma de Barcelona", "Master in Data Science", "Barcelona", "https://www.uab.cat/web/study/graduate/master-s-degrees-and-graduate-diplomas-in-english-1345671925069.html", ["Data Science"]),
    ("Universitat Autonoma de Barcelona", "Master in Health Data Science", "Barcelona", "https://www.uab.cat/web/study/graduate/master-s-degrees-and-graduate-diplomas-in-english-1345671925069.html", ["Data Science", "Health"]),
    ("Universitat Pompeu Fabra", "Master in Intelligent Interactive Systems", "Barcelona", "https://www.upf.edu/en/web/masters", ["Artificial Intelligence"]),
    ("Universitat Pompeu Fabra", "Master in Data Science", "Barcelona", "https://www.upf.edu/en/web/masters", ["Data Science"]),
    ("Universitat Pompeu Fabra", "Master in Cognitive Systems and Interactive Media", "Barcelona", "https://www.upf.edu/en/web/masters", ["Artificial Intelligence"]),
    ("Universidad Politecnica de Madrid", "Master in Artificial Intelligence", "Madrid", "https://muia.dia.fi.upm.es/en/", ["Artificial Intelligence"]),
    ("Universidad Autonoma de Madrid", "Master in Deep Learning for Audio and Video Signal Processing", "Madrid", "https://www.uam.es/uam/en/estudios/posgrado/masteres-oficiales", ["Deep Learning"]),
    ("IE University", "Master in Computer Science and Business Technology", "Madrid", "https://www.ie.edu/school-science-technology/", ["Computer Science"]),
    ("IE University", "Master in Business Analytics and Big Data", "Madrid", "https://www.ie.edu/school-science-technology/", ["Data Science"]),
    ("IE University", "Master in Cybersecurity", "Madrid", "https://www.ie.edu/school-science-technology/", ["Cybersecurity"]),
    ("IE University", "Master in Computer Science and Digital Innovation", "Madrid", "https://www.ie.edu/school-science-technology/", ["Computer Science"]),
    ("Universitat Politecnica de Valencia", "Master in AI, Pattern Recognition and Digital Imaging", "Valencia", "https://www.upv.es/en/studies/master-degrees", ["Artificial Intelligence"]),
    ("Universitat Politecnica de Valencia", "Master in Cloud and High-Performance Computing", "Valencia", "https://www.upv.es/en/studies/master-degrees", ["Computer Science"]),
    ("Universitat de Valencia", "Master in Data Science", "Valencia", "https://www.uv.es/uvweb/master-data-science", ["Data Science"]),
    ("University of Navarra", "Master in Artificial Intelligence", "Pamplona", "https://www.unav.edu/en/master/artificial-intelligence", ["Artificial Intelligence"]),
    ("Universidad de Granada", "Master in Data Science and Computer Engineering", "Granada", "https://masteres.ugr.es/datcom/", ["Data Science"]),
    ("Universitat de Girona", "Master in Intelligent Robotic Systems", "Girona", "https://www.udg.edu/en/estudia/Oferta-formativa/Masters-oficials", ["Robotics"]),
    ("Universitat Jaume I", "Master in Intelligent Systems", "Castellon", "https://www.uji.es/estudis/oferta/base/masters/actual/", ["Artificial Intelligence"]),
    ("Universidad del Pais Vasco", "Master in Computational Engineering and Intelligent Systems", "Bilbao", "https://www.ehu.eus/en/web/master", ["Computer Science"]),
    ("Universidad del Pais Vasco", "Master in Language Analysis and Processing", "San Sebastian", "https://www.ehu.eus/en/web/master", ["Natural Language Processing"]),
    ("Universidade da Coruna / Santiago / Vigo", "Master in Artificial Intelligence (joint)", "A Coruna", "https://citic.udc.es/en/studies/master-in-artificial-intelligence/", ["Artificial Intelligence"]),
    ("Universidad de Zaragoza", "Master in Robotics, Graphics, and Computer Vision", "Zaragoza", "https://estudios.unizar.es/", ["Robotics", "Computer Vision"]),
    ("Universitat Oberta de Catalunya", "Master in Data Science", "Barcelona", "https://www.uoc.edu/en/studies/masters", ["Data Science"]),
    ("Universitat Oberta de Catalunya", "Master in Computational and Mathematical Engineering", "Barcelona", "https://www.uoc.edu/en/studies/masters", ["Computer Science"]),
]

# Fetch existing
existing = set()
offset = 0
while True:
    r = httpx.get(f"{URL}/rest/v1/masters_programs?select=fingerprint&limit=1000&offset={offset}",
                  headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"}, timeout=30)
    batch = r.json() or []
    for row in batch:
        if row.get("fingerprint"): existing.add(row["fingerprint"])
    if len(batch) < 1000: break
    offset += 1000

inserted = skipped = 0
for uni, name, city, url, fields in PROGRAMS:
    f = fp(name)
    if f in existing:
        skipped += 1
        continue
    record = {
        "university": uni, "program_name": name, "country": "Spain", "city": city,
        "level": "master", "category": "cs_ai", "duration_years": 1.5,
        "tuition_usd_year": None, "language": "English", "ielts_min": None,
        "gre_required": False, "gpa_min": None, "gpa_scale": 4.0,
        "intake": "Fall/Spring", "deadline": None, "scholarship_available": False,
        "description": f"{name} at {uni}, Spain. English-taught.",
        "requirements": [], "field_of_study": fields,
        "apply_url": url, "source_url": url, "source_name": "curated",
        "is_active": True, "fingerprint": f,
    }
    r = httpx.post(f"{URL}/rest/v1/masters_programs", headers=H, json=record, timeout=15)
    if r.status_code in (200, 201):
        inserted += 1
    else:
        print(f"  FAIL: {name}: {r.status_code} {r.text[:200]}")
    existing.add(f)

print(f"Inserted: {inserted}, Skipped (dupes): {skipped}")
