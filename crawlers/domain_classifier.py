"""Classify a program or opportunity into one of the 11 standard
ScholarsPath research-domain slugs that the public filter UI exposes.

The slugs MUST match those in:
  - components/FilterSidebar.tsx (RESEARCH_DOMAINS — opportunity filter)
  - components/ProgramBrowser.tsx (CATEGORIES — program filter)
  - lib/supabase.ts (DOMAIN_KEYWORDS — runtime query filter)

Used by crawlers/discover_opportunities.py and any future enrichment
script that inserts into masters_programs or discovered_opportunities,
so every new row lands in a domain the user can filter by.
"""

from __future__ import annotations
import re

# (slug, keyword set). Order matters: more specific matches first to
# break ties (e.g. 'biomedical engineering' should land in 'health',
# not 'engineering').
_RULES: list[tuple[str, set[str]]] = [
    ("architecture", {
        "architecture", "architectural", "urban design",
        "interior design", "landscape architecture", "building design",
        "urban planning", "city planning",
    }),
    ("environment", {
        "environmental", "sustainability", "sustainable",
        "climate", "renewable energy", "ecology", "biodiversity",
        "conservation", "green tech", "circular economy",
        "earth observation", "environmental engineering",
        "environmental science",
    }),
    ("health", {
        "medicine", "medical", "biomedical", "health", "clinical",
        "pharma", "pharmacy", "neuroscience", "psychology", "nursing",
        "dental", "dentistry", "veterinary", "epidemiology", "public health",
        "biomechanics", "rehabilitation", "physiotherapy", "midwifery",
        "sports science", "kinesiology",
    }),
    ("cs_ai", {
        "computer", "artificial intelligence", "data science",
        "cyber", "cybersecurity", "software", "machine learning",
        "information technology", "informatics", "computing", " ai ",
        "data analytics", "bioinformatics", "cognitive science",
        "embedded systems", "telecommunications",
    }),
    ("engineering", {
        "engineering", "robotics", "mechanical", "electrical",
        "civil engineering", "chemical engineering", "materials",
        "aerospace", "automotive", "manufacturing",
        "industrial engineering", "petroleum", "nuclear engineering",
        "power systems",
    }),
    ("science", {
        "physics", "chemistry", "biology", "biotech", "biological",
        "mathematics", "statistics", "natural science",
        "marine", "geo", "geophysics", "astronomy",
        "molecular", "genetic", "biochemistry", "microbiology",
        " stem ", "life science", "physical sciences",
        "food science", "nanotechnology",
    }),
    ("business", {
        "business", "management", "finance", "economic", "economics",
        "marketing", "mba", "accounting", "entrepreneur", "commerce",
        "supply chain", "logistics", "hospitality", "tourism",
        "human resource", "real estate",
    }),
    ("law", {
        " law ", "legal", "international law", "european law",
        "commercial law", "corporate law", "business law", "tax law",
        "intellectual property", "ip law", "criminal law",
        "maritime law", "environmental law", "human rights law",
        "international and european law", "llm",
    }),
    ("social", {
        "social", "political", "politics", "public policy",
        "communication", "journalism", "sociology", "anthropology",
        "criminology", "development studies", "european studies",
        "area studies", "diplomacy", "global affairs",
        "international relations", "human rights", "education",
        "urban planning", "demography",
    }),
    ("humanities", {
        "humanities", "philosophy", "history", "historical",
        "literature", "religious", "theology", "archaeology",
        "cultural studies", "classics", "medieval studies",
        "ancient", "comparative literature", "digital humanities",
    }),
    ("arts", {
        "design", "music", "fashion", "fine arts", "visual arts",
        "performing arts", "theatre", "film", "media studies",
        "linguistic", "linguistics", "translation", "creative writing",
        " art ", "graphic design", "interior design",
    }),
    ("agriculture", {
        "agriculture", "agronomy", "agricultural", "forestry",
        "aquaculture", "horticulture", "viticulture", "soil",
        "crop science", "animal science", "agribusiness",
    }),
    ("languages", {
        "language", "translation", "linguistic", "tesol", "tefl",
        "applied linguistics", "modern language",
    }),
]

# Generic catch-all for rows whose text doesn't clearly fit a specific
# domain (e.g. "Italian Regional Diritto allo Studio scholarship" — the
# winner can study any field). These show under "All Fields" but NOT
# under specific filter chips like "Science" or "CS/AI", so filter
# results stay precise.
_DEFAULT = "general"

_WS = re.compile(r"\s+")


def _haystack(fields, name=None):
    """Build a space-padded lowercase string for substring matching."""
    parts = []
    if isinstance(fields, list):
        parts.extend(str(f) for f in fields if f)
    elif isinstance(fields, str) and fields:
        parts.append(fields)
    if name:
        parts.append(str(name))
    s = " " + " ".join(parts).lower() + " "
    return _WS.sub(" ", s)


def classify(fields, name=None):
    """Return one of the 9 standard category slugs. Never returns None."""
    hay = _haystack(fields, name)
    for slug, keywords in _RULES:
        for kw in keywords:
            if kw in hay:
                return slug
    return _DEFAULT
