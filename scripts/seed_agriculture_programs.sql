-- ============================================================
-- Seed: Agriculture & Forestry Master's programs from Mastersportal
-- Source: mastersportal.eu — pages 1–5 (93 programs)
-- Run AFTER seed_masters.sql AND migrate_programs.sql
-- Safe to run multiple times — ON CONFLICT (fingerprint) DO NOTHING
-- ============================================================

INSERT INTO masters_programs (
  university, program_name, country, city, category,
  duration_years, tuition_usd_year, language,
  field_of_study, scholarship_available, description,
  level, source_name, source_url, apply_url, fingerprint
)
SELECT
  v.university, v.program_name, v.country, v.city, 'agriculture',
  v.duration_years, v.tuition_eur, 'English',
  v.fields, v.scholarship, v.description,
  'master', 'mastersportal',
  'https://www.mastersportal.eu/disciplines/0/agriculture-forestry.html', '',
  encode(sha256((lower(trim(v.program_name)) || '|' || lower(v.country) || '|master')::bytea), 'hex')
FROM (VALUES

-- ── PAGE 1 ─────────────────────────────────────────────────────────────────
('University of Perugia','Agricultural and Environmental Biotechnology','Italy','Perugia',2.0,2200,ARRAY['Agriculture','Biotechnology','Environmental Science'],false,'MSc forming specialists in conventional and advanced biotechnologies for agricultural and environmental sectors.'),
('Vrije Universiteit Brussel','Marine and Lacustrine Science and Management','Belgium','Brussels',2.0,1182,ARRAY['Marine Science','Environmental Science','Biology'],false,'MSc offering high-end theoretical courses and practical experience in marine and lacustrine science.'),
('University of Padua','Food, Nutrition and Health','Italy','Padova',2.0,2739,ARRAY['Food Science','Nutrition','Health Sciences'],true,'Joint Master by five universities exploring food production, quality, diet and human health.'),
('University of Padua','Forest Sciences','Italy','Legnaro',2.0,2739,ARRAY['Forestry','Natural Resource Management','Environmental Science'],false,'Holistic and international programme on management and conservation of forests and natural resources.'),
('Aeres University of Applied Sciences','Food Systems Innovation','Netherlands','Almere Stad',1.0,2695,ARRAY['Food Science','Sustainability','Systems Innovation'],false,'Designing future-proof, sustainable food system solutions for societal challenges.'),
('Utrecht University','Marine Sciences','Netherlands','Utrecht',2.0,2694,ARRAY['Marine Science','Oceanography','Biology'],false,'Broad understanding of marine systems with specialisation in physical, chemical, biological and geological ocean processes.'),
('Free University of Bozen-Bolzano','Environmental Management of Mountain Areas','Italy','Bolzano',2.0,1200,ARRAY['Environmental Science','Sustainability','Mountain Ecosystems'],false,'Focuses on sustainable landscape development and agro-ecosystem management in mountain areas.'),
('Free University of Bozen-Bolzano','Smart Sustainable Agriculture Systems in Mountain Areas','Italy','Bolzano',2.0,1200,ARRAY['Agriculture','Sustainability','Smart Technologies'],false,'Advanced training in sustainable mountain agriculture with a focus on smart technologies and resource management.'),
('ISARA','Sustainable Food Systems','France','Lyon',2.0,6400,ARRAY['Food Science','Sustainability','Agri-Food'],false,'Two-year international master educating managers for food companies in sustainable food production.'),
('Université Côte d Azur','MARRES - Ocean Science, Conservation and Innovation','France','Sophia Antipolis',2.0,7500,ARRAY['Marine Science','Conservation','Ocean Science'],false,'Unique educational pathway in ocean science, conservation and innovation beyond traditional research careers.'),
('Maastricht University','Crop Biotechnology and Engineering','Netherlands','Venlo',2.0,2694,ARRAY['Agriculture','Biotechnology','Engineering'],false,'Blends cutting-edge plant science with AI and robotics to redesign smart greenhouse systems.'),
('University College Cork','Animal Behaviour and Welfare','Ireland','Cork',1.0,4900,ARRAY['Animal Science','Behaviour','Welfare'],false,'MSc for motivated students interested in research in the rapidly evolving discipline of animal behaviour.'),
('Università Cattolica del Sacro Cuore','Sustainable Viticulture and Enology','Italy','Piacenza',2.0,6850,ARRAY['Agriculture','Viticulture','Food Science'],false,'Expands knowledge in viticulture and enology focusing on new sustainable technologies in the wine value chain.'),
('University College Cork','Marine Biology','Ireland','Cork',1.0,8000,ARRAY['Marine Science','Biology'],false,'Trains graduates in multiple areas of marine biology including field skills in sea survival and powerboat handling.'),
('University College Cork','Marine and Maritime Law','Ireland','Cork',1.0,9200,ARRAY['Marine Science','Law','Maritime'],false,'Covers shipping law, marine environmental protection and international law of the sea.'),
('Wageningen University and Research','Animal Sciences','Netherlands','Wageningen',2.0,2694,ARRAY['Animal Science','Sustainability'],false,'Contributing to worldwide sustainable and responsible animal husbandry; animal-human interaction is central.'),
('University of Milano-Bicocca','Marine Sciences','Italy','Milano',2.0,1000,ARRAY['Marine Science','Biology','Environmental Science'],false,'International curriculum in marine sciences welcoming Italian and international students.'),
('Wageningen University and Research','Forest and Nature Conservation','Netherlands','Wageningen',2.0,2694,ARRAY['Forestry','Conservation','Biodiversity'],false,'Policy, sustainable management and conservation of forest and nature including deforestation, biodiversity and ecotourism.'),
('Università Cattolica del Sacro Cuore','Innovation in Food Science and Technology','Italy','Cremona',1.0,5000,ARRAY['Food Science','Technology','Innovation'],false,'Inter-university programme in food science and technology innovation by Cattolica and University of Turin.'),
('Università Cattolica del Sacro Cuore','Food Processing - Innovation and Tradition','Italy','Cremona',2.0,6850,ARRAY['Food Science','Food Technology','Innovation'],false,'Enables students to generate new food products and improve food quality through innovation.'),

-- ── PAGE 2 ─────────────────────────────────────────────────────────────────
('INSEEC Grand Ecole','Wine, Spirits and Customer Experience','France','Bordeaux',2.0,12190,ARRAY['Agriculture','Viticulture','Business'],false,'Specialized expertise in the wine industry combining management and customer experience.'),
('Radboud University','Crop Biotechnology and Engineering','Netherlands','Venlo',2.0,2695,ARRAY['Agriculture','Biotechnology','Engineering'],false,'Blends plant science with AI and robotics to redesign and innovate smart greenhouse systems.'),
('University of Szeged','Sustainable Agriculture','Hungary','Szeged',2.0,6000,ARRAY['Agriculture','Sustainability'],false,'Trains agricultural specialists to apply crop production, horticulture and animal husbandry knowledge at a high synthesis level.'),
('Ghent University','Maritime Science','Belgium','Gent',1.0,7080,ARRAY['Marine Science','Maritime Management','Shipping'],false,'Multidisciplinary curriculum integrating pillars of the global maritime sector including shipping and port operations.'),
('Wageningen University and Research','Food Technology','Netherlands','Wageningen',2.0,2694,ARRAY['Food Science','Technology'],false,'One of the leading universities in Food Science and Technology in Europe with over 50 years of history.'),
('University of Limerick','Human Nutrition and Dietetics','Ireland','Limerick',1.0,16330,ARRAY['Nutrition','Health Sciences','Food Science'],false,'One-year pre-master offering guaranteed progression to partner universities in nutrition and dietetics.'),
('University Centre of the Westfjords','Coastal and Marine Management','Iceland','Isafjordur',2.0,NULL,ARRAY['Marine Science','Environmental Management','Coastal Management'],false,'Built on the principle and practice of biology, sociology and economics in coastal management.'),
('Université Côte d Azur','Biocontrol Solutions for Plant Health','France','Sophia Antipolis',2.0,500,ARRAY['Agriculture','Plant Science','Biotechnology'],false,'Trains students to design eco-friendly, biologically based plant protection solutions.'),
('Wageningen University and Research','European Masters Animal Biodiversity and Genomics','Netherlands','Wageningen',2.0,2694,ARRAY['Animal Science','Genetics','Biodiversity'],true,'International programme combining animal breeding, genetics and international teamwork across European institutions.'),
('Tallinn University of Technology','Maritime Digital Solutions','Estonia','Tallinn',1.0,NULL,ARRAY['Marine Science','Digital Technology','Maritime'],false,'Knowledge on digitalisation possibilities in the maritime sector for sustainable and environmentally friendly strategies.'),
('Wageningen University and Research','Resilient Farming and Food Systems','Netherlands','Wageningen',2.0,2694,ARRAY['Agriculture','Sustainability','Food Systems'],false,'Focuses on food systems of the future, balancing human needs with natural resource use and environmental protection.'),
('Atlantic Technological University','Applied Marine Conservation','Ireland','Galway',1.0,6300,ARRAY['Marine Science','Conservation','Fisheries'],false,'Focuses on fisheries, marine conservation, sustainability and ecosystem based management.'),
('University of Amsterdam','Freshwater and Marine Biology','Netherlands','Amsterdam',2.0,2695,ARRAY['Marine Science','Biology','Freshwater Ecology'],false,'Investigates aquatic ecosystems from phytoplankton to whales, addressing global change and pollution.'),
('Wageningen University and Research','Aquaculture and Marine Resource Management','Netherlands','Wageningen',2.0,2694,ARRAY['Aquaculture','Marine Science','Environmental Management'],false,'Innovative and sustainable solutions to preserve marine biodiversity and ecosystem functions.'),

-- ── PAGE 3 ─────────────────────────────────────────────────────────────────
('Wageningen University and Research','Health Management in Aquaculture','Netherlands','Wageningen',2.0,2694,ARRAY['Aquaculture','Animal Health','Marine Science'],true,'Joint programme with NTNU, Ghent University and Universitat Autonoma Barcelona on aquaculture health.'),
('Università Cattolica del Sacro Cuore','Agricultural and Food Economics','Italy','Cremona',2.0,6850,ARRAY['Agriculture','Food Economics','Agri-Food'],false,'Expert team in agriculture and food economics at the forefront of food innovation and technology.'),
('University of Dubrovnik','Mariculture','Croatia','Dubrovnik',2.0,3200,ARRAY['Aquaculture','Marine Science'],false,'Explores the potential of the world oceans with science meeting sustainability in mariculture.'),
('University of Helsinki','Technologies for Sustainable Use of Renewable Resources','Finland','Helsinki',2.0,NULL,ARRAY['Agriculture','Forestry','Sustainability','Renewable Resources'],false,'Professionals in new and emerging technologies in the field of agri-food and forestry.'),
('University of Helsinki','Agricultural Sciences','Finland','Helsinki',2.0,NULL,ARRAY['Agriculture','Plant Production','Animal Science'],false,'Expert in plant production sciences, animal science, agrotechnology or environmental soil science.'),
('University of Helsinki','Agricultural, Environmental and Resource Economics','Finland','Helsinki',2.0,NULL,ARRAY['Agriculture','Economics','Environmental Science'],false,'Professional in applied economics in agricultural, environmental and resource-focused fields.'),
('Klaipeda University','Marine Biotechnology','Lithuania','Klaipeda',2.0,5000,ARRAY['Marine Science','Biotechnology'],true,'Integrated multidisciplinary joint programme within one of the first transnational European universities.'),
('University of Helsinki','Forest Sciences','Finland','Helsinki',2.0,NULL,ARRAY['Forestry','Natural Resource Management'],false,'Broad and versatile perspective on forests and their sustainable use.'),
('University of Barcelona','Aquaculture','Spain','Barcelona',1.0,1140,ARRAY['Aquaculture','Marine Science','Biology'],false,'Comprehensive training in sustainable aquaculture practices, marine biology and fisheries management.'),
('Ghent University','Rural Development','Belgium','Gent',2.0,4500,ARRAY['Agriculture','Rural Development','Sustainability'],false,'International expert training in rural development through multifunctional approaches and capacity building worldwide.'),
('Ghent University','Aquaculture','Belgium','Gent',2.0,1181,ARRAY['Aquaculture','Marine Science'],false,'Constantly actualised programme balancing multidisciplinary approach with in-depth research-based training in aquaculture.'),
('Politecnico di Milano','Agricultural Engineering','Italy','Cremona',2.0,3900,ARRAY['Agricultural Engineering','Engineering','Agri-Food'],false,'Trains engineers for the agro-industrial sector with vision of technological aspects and sustainability.'),
('KU Leuven','Food Technology','Belgium','Leuven',2.0,1181,ARRAY['Food Science','Technology'],false,'Multi-disciplinary professional education in food technology with emphasis on postharvest and food preservation engineering.'),
('University of Hradec Kralove','Biology and Ecology - Animal Biology','Czech Republic','Hradec Kralove',2.0,1500,ARRAY['Animal Science','Biology','Ecology'],false,'MA studies covering important ecological aspects with focus on animal biology and conservation.'),
('University of Padua','Marine Biology','Italy','Padova',2.0,2739,ARRAY['Marine Science','Biology'],false,'Trains marine biologists in key processes of marine ecosystems, conservation and sustainable use of marine resources.'),
('KU Leuven','Bioscience Engineering - Agro- and Ecosystems Engineering','Belgium','Leuven',2.0,1181,ARRAY['Agriculture','Engineering','Ecosystems'],false,'Training experts in sustainable management of natural and agro-ecosystems from biophysical and socio-economic perspectives.'),
('University of Pavia','Agri-Food Sustainability','Italy','Pavia',2.0,156,ARRAY['Agriculture','Food Science','Sustainability'],false,'Strong scientific education in agriculture and food systems focused on environmental protection and consumer health.'),
('University of Thessaly','Dairy Cattle Management','Greece','Larisa',1.0,3800,ARRAY['Animal Science','Agriculture'],false,'Trains animal scientists in nutrition, reproduction, genetic improvement and health management of dairy cattle.'),
('University of Gdansk','Marine Biotechnology','Poland','Gdansk',2.0,NULL,ARRAY['Marine Science','Biotechnology'],false,'Multi-disciplinary marine biotechnology studies from oceanography and intercollegiate biotechnology faculties.'),
('Universita degli Studi della Tuscia','Marine Biology and Ecology','Italy','Viterbo',2.0,NULL,ARRAY['Marine Science','Biology','Ecology'],false,'Highly qualified professional training in marine biology for research, environmental management and biotechnological development.'),

-- ── PAGE 4 ─────────────────────────────────────────────────────────────────
('University of Catania','Agricultural Science and Technology','Italy','Catania',2.0,306,ARRAY['Agriculture','Agronomy','Sustainability'],false,'High-level professionals specialised in agricultural production planning with focus on agronomic management and sustainability.'),
('Swedish University of Agricultural Sciences','Management of Fish and Wildlife Populations','Sweden','Skara',2.0,NULL,ARRAY['Fisheries','Wildlife Management','Conservation'],false,'Prepares students for careers in governmental and non-governmental organisations managing fish and wildlife resources.'),
('University of Agriculture in Krakow','Food Technology and Human Nutrition','Poland','Krakow',1.5,NULL,ARRAY['Food Science','Nutrition','Technology'],false,'Specialists in food processing, preservation, storage and food quality control.'),
('Rovira i Virgili University','Wine Tourism Innovation','Spain','Tarragona',2.0,6000,ARRAY['Agriculture','Viticulture','Tourism'],true,'Erasmus Mundus integrating expertise in Tourism and Oenology from three universities and regions.'),
('International Hellenic University','Sustainable Agriculture and Business','Greece','Thessaloniki',2.0,1250,ARRAY['Agriculture','Business','Sustainability'],false,'Interdisciplinary approach to agriculture focusing on production, environmental impact and agricultural enterprise management.'),
('University of Gottingen','Integrated Plant and Animal Breeding','Germany','Gottingen',2.0,NULL,ARRAY['Agriculture','Plant Science','Animal Science','Genetics'],false,'Interdisciplinary approach bridging the gap between animal and plant breeding research.'),
('University of Lleida','European Forestry','Spain','Lleida',2.0,4250,ARRAY['Forestry','Natural Resource Management','Bioeconomy'],true,'Erasmus Mundus two-year interdisciplinary programme in sustainable resource management with bioeconomy emphasis.'),
('University of Szeged','Food Science and Food Technology Engineering','Hungary','Szeged',2.0,5300,ARRAY['Food Science','Technology','Nutrition'],false,'Scientific and technical knowledge to develop healthy food products using innovative technologies.'),
('Szent Istvan University','Agricultural Biotechnology','Hungary','Budapest',2.0,6000,ARRAY['Agriculture','Biotechnology','Genetics'],false,'Training agricultural biotechnology engineers in biochemistry, microbiology, genetics and transgenic breeding.'),
('University of the Basque Country','International Master in Marine Biological Resources','Spain','Bilbao',2.0,4500,ARRAY['Marine Science','Biology','Fisheries','Aquaculture'],false,'Aligned with EU Blue Growth strategy; covers fisheries, aquaculture, conservation and blue biotechnology.'),
('University of Debrecen','Agricultural Water Management Engineering','Hungary','Debrecen',2.0,6888,ARRAY['Agriculture','Engineering','Water Management'],false,'Graduates cooperate with experts in solving domestic and international agricultural water management problems.'),
('Poznan University of Life Sciences','Horticulture - Seed Science and Technology','Poland','Poznan',2.0,2100,ARRAY['Agriculture','Horticulture','Seed Science'],false,'Latest trends in horticulture, especially seed production, quality evaluation, enhancement and marketing.'),
('University of Basel','Animal Biology','Switzerland','Basel',1.5,1860,ARRAY['Animal Science','Biology'],false,'MSc degree awarded for 90 credit points including thesis project, courses and final exam.'),
('The University of Milan','Crops and Plant Sciences','Italy','Milano',2.0,312,ARRAY['Agriculture','Plant Science','Agronomy'],false,'Strong specialisation in cultivation systems, technical and recreational green areas, and sustainability of production processes.'),
('University of Malta','Rural and Environmental Sciences','Malta','Msida',1.5,NULL,ARRAY['Environmental Science','Rural Development','Sustainability'],false,'Interdisciplinary approach to rural and environmental sciences addressing environmental, planning and social concerns.'),
('University of South Bohemia','Multifunctional Agriculture','Czech Republic','Ceske Budejovice',2.0,3000,ARRAY['Agriculture','Sustainability','Rural Development'],false,'Broader approach combining sustainable agricultural production with product processing, agrotourism and social agriculture.'),
('Lithuanian University of Health Sciences','Animal and Human Interaction','Lithuania','Kaunas',1.5,5538,ARRAY['Animal Science','Health Sciences'],false,'Master programme in animal and human interaction at Lithuanian University of Health Sciences.'),
('Tomas Bata University in Zlin','Food Technology','Czech Republic','Zlin',2.0,2677,ARRAY['Food Science','Technology'],false,'Expert in food production technology and quality control in the food industry and research institutions.'),
('University of Algarve','Aquaculture and Fisheries','Portugal','Faro',2.0,1100,ARRAY['Aquaculture','Fisheries','Marine Science'],false,'Two specialisations in Aquaculture and Fisheries; combines environmental and biological sciences.'),

-- ── PAGE 5 ─────────────────────────────────────────────────────────────────
('University of Gottingen','Sustainable International Agriculture','Germany','Gottingen',2.0,NULL,ARRAY['Agriculture','Sustainability','International Development'],false,'For students who want to contribute to sustainable development of agriculture worldwide.'),
('University of Hohenheim','Food Science and Engineering','Germany','Stuttgart',2.0,NULL,ARRAY['Food Science','Engineering'],false,'Research-intensive programme on links between complex food matrices and technological processes for safe food.'),
('Ghent University','Food Technology','Belgium','Gent',2.0,1157,ARRAY['Food Science','Technology','Food Security'],false,'Highly skilled professional in food technology focused on food security challenges in countries with food insecurity.'),
('University of Groningen','Marine Biology','Netherlands','Groningen',2.0,2601,ARRAY['Marine Science','Biology'],false,'Two-year selective MSc programme focusing on life in our seas and oceans.'),
('Swedish University of Agricultural Sciences','Animal Science','Sweden','Uppsala',2.0,NULL,ARRAY['Animal Science','Agriculture'],false,'Farm animals supply us with food and clothing; this programme explores animal science and management.'),
('Delft University of Technology','Marine Technology','Netherlands','Delft',2.0,2601,ARRAY['Marine Science','Engineering','Naval Architecture'],false,'Knowledge and skills for design, construction, production and operation of ships and marine systems.'),
('Swedish University of Agricultural Sciences','Agricultural Economics and Management','Sweden','Skara',2.0,NULL,ARRAY['Agriculture','Economics','Business'],false,'Understanding and skills in business administration or economics alongside agronomy-economics students.'),
('University of Bremen','Marine Biology','Germany','Bremen',2.0,NULL,ARRAY['Marine Science','Biology'],false,'Unique teaching concept with close ties to world-class marine research institutions in the state of Bremen.'),
('Lund University','Biology - Aquatic Ecology','Sweden','Lund',2.0,NULL,ARRAY['Marine Science','Ecology','Biology'],false,'Broad insight into marine ecology and freshwater ecology increasing career prospects.'),
('University of Hohenheim','Environmental Protection and Agricultural Food Production','Germany','Stuttgart',2.0,NULL,ARRAY['Agriculture','Environmental Science','Sustainability'],false,'Developed to intensify food production with environmentally friendly and sustainable production systems.'),
('University College Dublin','Agricultural Extension and Innovation','Ireland','Dublin',1.0,10430,ARRAY['Agriculture','Extension','Innovation'],false,'One-year programme for careers in advisory, consultancy or education services in public, private or NGO sectors.'),
('University College Dublin','Animal Science','Ireland','Dublin',1.0,10430,ARRAY['Animal Science','Agriculture'],false,'Advanced studies in livestock sector for graduates pursuing careers in animal science.'),
('University of Copenhagen','Global Forestry','Denmark','Copenhagen',2.0,NULL,ARRAY['Forestry','Environmental Science','Natural Resource Management'],true,'Erasmus Mundus two-year programme preparing students to tackle forestry challenges and potential globally.'),
('University of Lorraine','Biology and Ecology for Forest Agronomy and Environment','France','Nancy',2.0,480,ARRAY['Forestry','Biology','Ecology','Environmental Science'],false,'Master degree with one semester of English courses focused on forests and their environments.'),
('University of Kassel','Sustainable International Agriculture','Germany','Kassel',2.0,782,ARRAY['Agriculture','Sustainability','International Development'],false,'Joint degree with University of Kassel (Organic Agricultural Sciences) and University of Gottingen.')

) AS v(university, program_name, country, city, duration_years, tuition_eur, fields, scholarship, description)
ON CONFLICT (fingerprint) DO NOTHING;

-- Verify after running:
-- SELECT COUNT(*) FROM masters_programs WHERE source_name = 'mastersportal';
-- SELECT country, COUNT(*) FROM masters_programs WHERE source_name = 'mastersportal' GROUP BY 1 ORDER BY 2 DESC;
