-- ============================================================
-- Manual URL fixes for programs where web search returns
-- aggregator results instead of official university pages
-- Safe to run multiple times
-- ============================================================

-- NMBU Norway
UPDATE masters_programs SET apply_url='https://www.nmbu.no/en/studies/master-2-year/animal-science', source_url='https://www.nmbu.no/en/studies/master-2-year/animal-science'
WHERE lower(trim(program_name))='animal science' AND lower(country)='norway' AND source_name='mastersportal';

UPDATE masters_programs SET apply_url='https://www.nmbu.no/en/studies/master-2-year/plant-sciences', source_url='https://www.nmbu.no/en/studies/master-2-year/plant-sciences'
WHERE lower(trim(program_name))='plant sciences' AND lower(country)='norway' AND source_name='mastersportal';

UPDATE masters_programs SET apply_url='https://www.nmbu.no/en/studies/master-2-year/aquaculture', source_url='https://www.nmbu.no/en/studies/master-2-year/aquaculture'
WHERE lower(trim(program_name))='aquaculture' AND lower(country)='norway' AND source_name='mastersportal';

UPDATE masters_programs SET apply_url='https://www.nmbu.no/en/studies/master-2-year/aquatic-food-production-safety-and-quality', source_url='https://www.nmbu.no/en/studies/master-2-year/aquatic-food-production-safety-and-quality'
WHERE lower(trim(program_name)) LIKE 'aquatic food production%' AND lower(country)='norway';

-- ETH Zurich
UPDATE masters_programs SET apply_url='https://ethz.ch/en/studies/master/degree-programmes/agriculture-and-food/agricultural-sciences.html', source_url='https://ethz.ch/en/studies/master/degree-programmes/agriculture-and-food/agricultural-sciences.html'
WHERE lower(trim(program_name))='agricultural sciences' AND lower(university) LIKE '%eth zurich%';

-- Wageningen
UPDATE masters_programs SET apply_url='https://www.wur.nl/en/education/master/masters-resilient-farming-food-systems.htm', source_url='https://www.wur.nl/en/education/master/masters-resilient-farming-food-systems.htm'
WHERE lower(trim(program_name)) LIKE '%resilient farming%' AND lower(country)='netherlands';

UPDATE masters_programs SET apply_url='https://www.wur.nl/en/education/master/masters-animal-sciences', source_url='https://www.wur.nl/en/education/master/masters-animal-sciences'
WHERE lower(trim(program_name))='animal sciences' AND lower(university) LIKE '%wageningen%';

-- University of Algarve
UPDATE masters_programs SET apply_url='https://www.ualg.pt/en/content/food-technology-0', source_url='https://www.ualg.pt/en/content/food-technology-0'
WHERE lower(trim(program_name))='food technology' AND lower(country)='portugal' AND lower(university) LIKE '%algarve%';

-- UCD
UPDATE masters_programs SET apply_url='https://www.ucd.ie/courses/digital-technology-for-sustainable-agriculture-msc', source_url='https://www.ucd.ie/courses/digital-technology-for-sustainable-agriculture-msc'
WHERE lower(trim(program_name)) LIKE '%digital technology for sustainable agriculture%' AND lower(country)='ireland';

UPDATE masters_programs SET apply_url='https://www.ucd.ie/courses/biosystems-and-food-engineering-mengsc', source_url='https://www.ucd.ie/courses/biosystems-and-food-engineering-mengsc'
WHERE lower(trim(program_name)) LIKE '%biosystems and food engineering%' AND lower(country)='ireland';

-- University of Hamburg
UPDATE masters_programs SET apply_url='https://www.uni-hamburg.de/en/pomor.html', source_url='https://www.uni-hamburg.de/en/pomor.html'
WHERE lower(trim(program_name)) LIKE '%polar and marine sciences%' AND lower(country)='germany';

-- University of Kiel
UPDATE masters_programs SET apply_url='https://www.uni-kiel.de/en/studies/master/dairy-science', source_url='https://www.uni-kiel.de/en/studies/master/dairy-science'
WHERE lower(trim(program_name))='dairy science' AND lower(country)='germany';

-- BOKU Vienna
UPDATE masters_programs SET apply_url='https://www.boku.ac.at/en/studium/studienarten/masterstudien/horticultural-sciences', source_url='https://www.boku.ac.at/en/studium/studienarten/masterstudien/horticultural-sciences'
WHERE lower(trim(program_name))='horticultural sciences' AND lower(university) LIKE '%natural resources%vienna%';

UPDATE masters_programs SET apply_url='https://www.boku.ac.at/en/studium/studienarten/masterstudien/mountain-forestry', source_url='https://www.boku.ac.at/en/studium/studienarten/masterstudien/mountain-forestry'
WHERE lower(trim(program_name))='mountain forestry' AND lower(country)='austria';

UPDATE masters_programs SET apply_url='https://www.boku.ac.at/en/studium/studienarten/masterstudien/organic-agricultural-systems-and-agroecology', source_url='https://www.boku.ac.at/en/studium/studienarten/masterstudien/organic-agricultural-systems-and-agroecology'
WHERE lower(trim(program_name)) LIKE '%organic agricultural systems%agroecology%' AND lower(country)='austria';

UPDATE masters_programs SET apply_url='https://www.boku.ac.at/en/studium/studienarten/masterstudien/limnology-and-wetland-management', source_url='https://www.boku.ac.at/en/studium/studienarten/masterstudien/limnology-and-wetland-management'
WHERE lower(trim(program_name))='limnology and wetland management' AND lower(country)='austria';

-- Tomas Bata Zlin
UPDATE masters_programs SET apply_url='https://www.utb.cz/en/studying-at-tbu/programmes-and-courses/', source_url='https://www.utb.cz/en/studying-at-tbu/programmes-and-courses/'
WHERE lower(trim(program_name))='food technology' AND lower(university) LIKE '%tomas bata%';

-- Universita Cattolica
UPDATE masters_programs SET apply_url='https://international.unicatt.it/ucscinternational-sustainable-viticulture-and-enology', source_url='https://international.unicatt.it/ucscinternational-sustainable-viticulture-and-enology'
WHERE lower(trim(program_name)) LIKE '%sustainable viticulture%' AND lower(university) LIKE '%cattolica%';

-- University of Lorraine Forestry
UPDATE masters_programs SET apply_url='https://formations.univ-lorraine.fr/en/degree-programs/bac4-bac5/master-s-degree/2141-master-in-forestry.html', source_url='https://formations.univ-lorraine.fr/en/degree-programs/bac4-bac5/master-s-degree/2141-master-in-forestry.html'
WHERE lower(trim(program_name))='forestry' AND lower(university) LIKE '%lorraine%';

-- Polytechnic Institute Braganca
UPDATE masters_programs SET apply_url='https://ipb.pt/en/curso/management-of-forest-resources', source_url='https://ipb.pt/en/curso/management-of-forest-resources'
WHERE lower(trim(program_name)) LIKE '%management of forest resources%';

-- Poznan Horticulture
UPDATE masters_programs SET apply_url='https://www.puls.edu.pl/en/study-offer/master-degree', source_url='https://www.puls.edu.pl/en/study-offer/master-degree'
WHERE lower(trim(program_name)) LIKE '%horticulture%seed%' AND lower(university) LIKE '%poznan%';

-- Wroclaw Food Technology
UPDATE masters_programs SET apply_url='https://www.upwr.edu.pl/en/study/study_offer/master_studies.html', source_url='https://www.upwr.edu.pl/en/study/study_offer/master_studies.html'
WHERE lower(trim(program_name))='food technology' AND lower(university) LIKE '%wroclaw%';

-- University of Iceland
UPDATE masters_programs SET apply_url='https://www.hi.is/english/biology_and_fisheries', source_url='https://www.hi.is/english/biology_and_fisheries'
WHERE lower(trim(program_name)) LIKE '%aquatic biology and fisheries%' AND lower(country)='iceland';

-- University of Perugia
UPDATE masters_programs SET apply_url='https://www.unipg.it/en/studying-at-unipg/degree-programmes/agricultural-and-environmental-biotechnology', source_url='https://www.unipg.it/en/studying-at-unipg/degree-programmes/agricultural-and-environmental-biotechnology'
WHERE lower(trim(program_name)) LIKE '%agricultural and environmental biotechnology%';

-- University of Agriculture Krakow Horticultural Science
UPDATE masters_programs SET apply_url='https://urk.edu.pl/en/study/study-in-english/master-studies', source_url='https://urk.edu.pl/en/study/study-in-english/master-studies'
WHERE lower(trim(program_name))='horticultural science' AND lower(university) LIKE '%krakow%';

-- AgroParisTech Forest Nature Society
UPDATE masters_programs SET apply_url='https://www.agroparistech.fr/en/formations/masters/masters-jointly-run-other-institutions/forest-nature-and-society-international-management-geeft', source_url='https://www.agroparistech.fr/en/formations/masters/masters-jointly-run-other-institutions/forest-nature-and-society-international-management-geeft'
WHERE lower(trim(program_name)) LIKE '%forest, nature and society%' AND lower(university) LIKE '%agroparistech%';

-- University of Gottingen Integrated Plant and Animal Breeding
UPDATE masters_programs SET apply_url='https://www.uni-goettingen.de/en/568499.html', source_url='https://www.uni-goettingen.de/en/568499.html'
WHERE lower(trim(program_name)) LIKE '%integrated plant and animal breeding%';

-- Warsaw University Sustainable Horticulture
UPDATE masters_programs SET apply_url='https://www.sggw.edu.pl/en/academic-offer/studies-in-english/masters-studies/', source_url='https://www.sggw.edu.pl/en/academic-offer/studies-in-english/masters-studies/'
WHERE lower(trim(program_name))='sustainable horticulture' AND lower(university) LIKE '%warsaw%';

-- University of Warmia Food Engineering
UPDATE masters_programs SET apply_url='https://uwm.edu.pl/wnz/en/study-english/food-engineering-general-information', source_url='https://uwm.edu.pl/wnz/en/study-english/food-engineering-general-information'
WHERE lower(trim(program_name))='food engineering' AND lower(university) LIKE '%warmia%';

-- SLU Animal Science
UPDATE masters_programs SET apply_url='https://www.slu.se/en/study/programmes-courses/masters-programmes/animal-science/', source_url='https://www.slu.se/en/study/programmes-courses/masters-programmes/animal-science/'
WHERE lower(trim(program_name))='animal science' AND lower(university) LIKE '%swedish university of agricultural%';

-- Plant Breeding BOKU (Erasmus Mundus)
UPDATE masters_programs SET apply_url='https://www.boku.ac.at/en/studium/studienarten/masterstudien/plant-breeding', source_url='https://www.boku.ac.at/en/studium/studienarten/masterstudien/plant-breeding'
WHERE lower(trim(program_name)) LIKE '%plant breeding%' AND lower(country)='austria';
