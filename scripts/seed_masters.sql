-- ============================================================
-- Masters Program Finder — Schema + Seed Data
-- Run in Supabase SQL Editor after schema.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS masters_programs (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  university            TEXT NOT NULL,
  program_name          TEXT NOT NULL,
  country               TEXT NOT NULL,
  city                  TEXT NOT NULL,
  field_of_study        TEXT[] NOT NULL DEFAULT '{}',
  category              TEXT NOT NULL, -- 'cs_ai', 'engineering', 'business', 'science'
  duration_years        NUMERIC(3,1) NOT NULL DEFAULT 2,
  tuition_usd_year      NUMERIC(12,2),      -- NULL = free/no tuition
  language              TEXT NOT NULL DEFAULT 'English',
  ielts_min             NUMERIC(3,1),
  gre_required          BOOLEAN NOT NULL DEFAULT FALSE,
  gpa_min               NUMERIC(3,2),
  gpa_scale             NUMERIC(3,1) NOT NULL DEFAULT 4.0,
  intake                TEXT NOT NULL DEFAULT 'Winter/Summer',
  deadline              TEXT,
  scholarship_available BOOLEAN NOT NULL DEFAULT FALSE,
  description           TEXT NOT NULL DEFAULT '',
  requirements          TEXT[] NOT NULL DEFAULT '{}',
  apply_url             TEXT NOT NULL DEFAULT '',
  qs_ranking            INT,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mp_country   ON masters_programs(country);
CREATE INDEX IF NOT EXISTS idx_mp_category  ON masters_programs(category);
CREATE INDEX IF NOT EXISTS idx_mp_field     ON masters_programs USING gin(field_of_study);

CREATE TABLE IF NOT EXISTS match_sessions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email             TEXT,
  extracted_profile JSONB NOT NULL DEFAULT '{}',
  matched_programs  JSONB NOT NULL DEFAULT '[]',
  is_registered     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

GRANT ALL ON masters_programs  TO anon, authenticated, service_role;
GRANT ALL ON match_sessions     TO anon, authenticated, service_role;

-- ============================================================
-- SEED: ~45 programs across CS/AI, Engineering, Business, Science
-- Countries: Germany, USA/Canada, Netherlands, Sweden, France,
--            Belgium, Poland, Italy, Spain
-- ============================================================

INSERT INTO masters_programs (university, program_name, country, city, category, field_of_study, duration_years, tuition_usd_year, language, ielts_min, gre_required, gpa_min, gpa_scale, intake, deadline, scholarship_available, description, requirements, apply_url, qs_ranking) VALUES

-- ── COMPUTER SCIENCE / AI / DATA SCIENCE ──────────────────────

('Technical University of Munich', 'M.Sc. Informatics', 'Germany', 'Munich', 'cs_ai',
 ARRAY['Computer Science','Software Engineering','Algorithms'], 2, 200, 'English', 6.5, FALSE, 3.0, 4.0,
 'Winter/Summer', 'Rolling', TRUE,
 'One of Europe''s top CS programs at a globally ranked university. No tuition fees (semester contribution ~€200). Strong industry connections with BMW, Siemens, MAN.',
 ARRAY['Bachelor in CS or related','English proficiency','GPA > 3.0/4.0','Motivation letter','2 references'], 'https://www.tum.de/en/studies/degree-programs/detail/informatics-master-of-science-msc', 37),

('RWTH Aachen University', 'M.Sc. Computer Science', 'Germany', 'Aachen', 'cs_ai',
 ARRAY['Computer Science','Networks','Human-Computer Interaction'], 2, 200, 'English', 6.5, FALSE, 3.0, 4.0,
 'Winter/Summer', 'Rolling', FALSE,
 'Germany''s top technical university for engineering and CS. Free tuition with strong research output and industry links to automotive and manufacturing sectors.',
 ARRAY['Bachelor in CS or equivalent','English B2 level','Mathematics background','Motivation letter'], 'https://www.rwth-aachen.de/cms/root/studium/vor-dem-studium/studiengaenge/liste-aktuelle-studiengaenge/studiengangbeschreibung/~bkhf/informatik-m-sc/', 106),

('Karlsruhe Institute of Technology', 'M.Sc. Computer Science', 'Germany', 'Karlsruhe', 'cs_ai',
 ARRAY['Computer Science','Artificial Intelligence','Robotics'], 2, 200, 'English', 6.5, FALSE, 2.8, 4.0,
 'Winter', 'May 15', FALSE,
 'KIT is Germany''s #1 national research center. The CS program offers strong AI, robotics, and systems focus. Free tuition.',
 ARRAY['BSc in CS or related','English B2','Mathematics 24 ECTS','Statement of purpose'], 'https://www.informatik.kit.edu/english/graduate_program_cs.php', 119),

('TU Berlin', 'M.Sc. Computer Science', 'Germany', 'Berlin', 'cs_ai',
 ARRAY['Computer Science','Machine Learning','Distributed Systems'], 2, 200, 'English', 6.5, FALSE, 3.0, 4.0,
 'Winter/Summer', 'Rolling', FALSE,
 'Located in Germany''s startup capital with free tuition. Strong focus on ML, distributed systems, and IT security. Berlin''s tech ecosystem offers internship opportunities.',
 ARRAY['Bachelor in CS','English proficiency','Mathematics background'], 'https://www.tu.berlin/en/studying/study-programs/all-programs-offered/study-course/computer-science-m-sc/', 154),

('Delft University of Technology', 'M.Sc. Computer Science', 'Netherlands', 'Delft', 'cs_ai',
 ARRAY['Computer Science','Software Technology','Data Science'], 2, 18000, 'English', 6.5, FALSE, 3.0, 4.0,
 'September', 'January 15', TRUE,
 'TU Delft is the Netherlands'' #1 technical university. The CS program is consistently ranked in the European top 10 with excellent research and industry placement.',
 ARRAY['BSc in CS or related','IELTS 6.5','Motivation letter','2 reference letters','CV'], 'https://www.tudelft.nl/en/education/programmes/masters/cs/msc-computer-science', 57),

('TU/e Eindhoven', 'M.Sc. Data Science & Artificial Intelligence', 'Netherlands', 'Eindhoven', 'cs_ai',
 ARRAY['Data Science','Artificial Intelligence','Machine Learning'], 2, 16000, 'English', 6.5, FALSE, 3.0, 4.0,
 'September', 'April 1', TRUE,
 'Specialised program at Philips'' home university. Strong industry collaboration with ASML, Philips, NXP. Excellent career outcomes in AI and data engineering.',
 ARRAY['BSc in CS/Math/Engineering','Programming skills','Statistics background','IELTS 6.5'], 'https://www.tue.nl/en/education/graduate-school/masters-programs/data-science-and-artificial-intelligence', 179),

('KTH Royal Institute of Technology', 'M.Sc. Machine Learning', 'Sweden', 'Stockholm', 'cs_ai',
 ARRAY['Machine Learning','Computer Vision','Natural Language Processing'], 2, 0, 'English', 6.5, FALSE, 3.0, 4.0,
 'August', 'January 15', TRUE,
 'Free tuition for EU students. One of Europe''s top ML programs with Spotify, Ericsson, and King as recruitment partners. Stockholm''s tech scene is booming.',
 ARRAY['BSc in CS/Math/Engineering','Programming in Python','Linear algebra & statistics','IELTS 6.5'], 'https://www.kth.se/en/studies/master/machinelearning', 98),

('KU Leuven', 'M.Sc. Artificial Intelligence', 'Belgium', 'Leuven', 'cs_ai',
 ARRAY['Artificial Intelligence','Machine Learning','Robotics','Computer Vision'], 2, 8000, 'English', 6.5, FALSE, 3.0, 4.0,
 'September', 'March 1', TRUE,
 'Belgium''s top university with a dedicated AI program. Strong research groups in ML, NLP, and computer vision. Leuven is a vibrant student city.',
 ARRAY['BSc in CS/Engineering/Math','Programming skills','IELTS 6.5','Motivation letter'], 'https://kuleuven.be/english/research/ai', 74),

('Warsaw University of Technology', 'M.Sc. Computer Science', 'Poland', 'Warsaw', 'cs_ai',
 ARRAY['Computer Science','Software Engineering','Cybersecurity'], 2, 2000, 'English', 6.0, FALSE, 3.0, 4.0,
 'October', 'July 31', FALSE,
 'Poland''s #1 technical university. Very affordable tuition with a strong CS program. Warsaw is one of Europe''s fastest growing tech hubs with many multinational companies.',
 ARRAY['BSc in CS or related','English B2','Mathematics background'], 'https://www.pw.edu.pl/enPW/Education/Masters-studies', 801),

('University of Toronto', 'M.Sc. Computer Science', 'Canada', 'Toronto', 'cs_ai',
 ARRAY['Computer Science','Machine Learning','Systems'], 2, 14000, 'English', 7.0, FALSE, 3.3, 4.0,
 'September', 'December 1', TRUE,
 'Canada''s top CS program with world-class AI research (birthplace of deep learning with Geoffrey Hinton). Strong industry ties to Google, Amazon, and Toronto''s growing AI cluster.',
 ARRAY['BSc in CS','IELTS 7.0 or TOEFL 93','3 reference letters','Statement of purpose','Strong GPA'], 'https://web.cs.toronto.edu/graduate/prospective', 21),

('Georgia Institute of Technology', 'M.S. Computer Science (OMSCS)', 'USA', 'Atlanta', 'cs_ai',
 ARRAY['Computer Science','Machine Learning','Computing Systems'], 2, 7000, 'English', 7.0, FALSE, 3.0, 4.0,
 'Fall/Spring', 'Rolling', FALSE,
 'Georgia Tech''s Online MS CS is the world''s largest online graduate CS program at ~$7,000 total. Also available on-campus. Specializations in ML, computing systems, and interactive intelligence.',
 ARRAY['BSc in CS or related','Statement of purpose','3 references','TOEFL/IELTS'], 'https://omscs.gatech.edu/', 136),

('Politecnico di Milano', 'M.Sc. Computer Science and Engineering', 'Italy', 'Milan', 'cs_ai',
 ARRAY['Computer Science','Software Engineering','Data Engineering'], 2, 4000, 'English', 6.5, FALSE, 3.0, 4.0,
 'September', 'April 30', TRUE,
 'Italy''s #1 engineering university. Affordable tuition with possible scholarship waivers. Milan is Italy''s innovation hub with strong startup and corporate ecosystem.',
 ARRAY['BSc in CS/Engineering','IELTS 6.5','Motivation letter','2 references','Academic transcript'], 'https://www.polimi.it/en/education/laurea-magistrale-programmes/computer-science-and-engineering/', 137),

('Université Paris Saclay', 'M.Sc. Computer Science', 'France', 'Paris', 'cs_ai',
 ARRAY['Computer Science','Algorithms','Artificial Intelligence'], 2, 4000, 'English/French', 6.5, FALSE, 3.0, 4.0,
 'September', 'April 1', TRUE,
 'Part of the Paris-Saclay cluster (one of Europe''s largest science campuses). Strong theory and AI research. Some scholarships available for international students.',
 ARRAY['BSc in CS/Math','French or English proficiency','Letter of motivation','References'], 'https://www.universite-paris-saclay.fr/en/education/master/computer-science', 14),

-- ── ENGINEERING ──────────────────────────────────────────────

('Technical University of Munich', 'M.Sc. Electrical Engineering', 'Germany', 'Munich', 'engineering',
 ARRAY['Electrical Engineering','Power Systems','Microelectronics','Communications'], 2, 200, 'English', 6.5, FALSE, 3.0, 4.0,
 'Winter/Summer', 'Rolling', TRUE,
 'World-class EE program at TUM with free tuition. Strong in power engineering, semiconductor devices, and communications. Industry partners include Infineon, Intel, and Siemens.',
 ARRAY['BSc in EE or related','Mathematics 30 ECTS','English B2','Motivation letter'], 'https://www.tum.de/en/studies/degree-programs/detail/electrical-engineering-master-of-science-msc', 37),

('RWTH Aachen University', 'M.Sc. Mechanical Engineering', 'Germany', 'Aachen', 'engineering',
 ARRAY['Mechanical Engineering','Automotive Engineering','Manufacturing'], 2, 200, 'English', 6.5, FALSE, 3.0, 4.0,
 'Winter/Summer', 'Rolling', FALSE,
 'RWTH Aachen is Europe''s top mechanical engineering university. Free tuition. Strong links to automotive industry (Ford, Volkswagen research centers nearby). Excellent for manufacturing and production engineering.',
 ARRAY['BSc in Mechanical/Industrial Engineering','Mathematics background','English B2','CV and motivation letter'], 'https://www.rwth-aachen.de/go/id/bkfq/lidx/1', 106),

('Delft University of Technology', 'M.Sc. Civil Engineering', 'Netherlands', 'Delft', 'engineering',
 ARRAY['Civil Engineering','Structural Engineering','Water Management','Geotechnics'], 2, 18000, 'English', 6.5, FALSE, 3.0, 4.0,
 'September', 'January 15', TRUE,
 'TU Delft is the world leader in water management and hydraulic engineering — fitting for the Netherlands. Excellent for structural, geotechnical, and coastal engineering.',
 ARRAY['BSc in Civil Engineering','IELTS 6.5','Motivation letter','2 references','Maths and physics background'], 'https://www.tudelft.nl/en/education/programmes/masters/civil-engineering', 57),

('KIT Karlsruhe', 'M.Sc. Electrical Engineering and Information Technology', 'Germany', 'Karlsruhe', 'engineering',
 ARRAY['Electrical Engineering','Information Technology','Signal Processing'], 2, 200, 'English', 6.5, FALSE, 3.0, 4.0,
 'Winter', 'May 15', FALSE,
 'Free tuition at Germany''s national research center. Strong in energy systems, communications, and microelectronics. Direct access to KIT''s research labs.',
 ARRAY['BSc in EE or related','English B2','Mathematics and physics background'], 'https://www.etit.kit.edu/english/1371.php', 119),

('Politecnico di Torino', 'M.Sc. Civil Engineering', 'Italy', 'Turin', 'engineering',
 ARRAY['Civil Engineering','Structural Engineering','Environmental Engineering'], 2, 3500, 'English', 6.0, FALSE, 2.7, 4.0,
 'September', 'April 30', TRUE,
 'Italy''s second-ranked engineering school (after PoliMi). Very affordable tuition with merit scholarships available. Strong in structural and geotechnical engineering.',
 ARRAY['BSc in Civil Engineering','IELTS 6.0','Motivation letter','Academic transcript'], 'https://www.polito.it/en/education/master-of-science-programmes/civil-engineering', 301),

('Universidad Politécnica de Madrid', 'M.Sc. Civil Engineering', 'Spain', 'Madrid', 'engineering',
 ARRAY['Civil Engineering','Transportation','Hydraulics','Geotechnics'], 2, 3000, 'Spanish/English', 6.0, FALSE, 2.8, 4.0,
 'September', 'June 30', FALSE,
 'Spain''s top technical university. The Civil Engineering program is taught partly in English. Low tuition and living costs. Madrid offers rich cultural experience.',
 ARRAY['BSc in Civil Engineering','Spanish or English proficiency','Motivation letter','Official transcripts'], 'https://www.upm.es/internacional/Students/StudyingUPM/MastersDegrees', 477),

('University of Toronto', 'M.Eng. Civil Engineering', 'Canada', 'Toronto', 'engineering',
 ARRAY['Civil Engineering','Structural Engineering','Environmental Engineering','Transportation'], 1, 30000, 'English', 7.0, FALSE, 3.0, 4.0,
 'September', 'January 31', TRUE,
 'Professional one-year engineering degree at Canada''s top university. Excellent industry connections and career placement. Toronto''s infrastructure boom creates strong job demand.',
 ARRAY['BSc in Civil Engineering','IELTS 7.0','2 references','Statement of purpose'], 'https://civil.engineering.utoronto.ca/graduate-studies/master-of-engineering/', 21),

('Georgia Institute of Technology', 'M.S. Electrical and Computer Engineering', 'USA', 'Atlanta', 'engineering',
 ARRAY['Electrical Engineering','Computer Engineering','Signal Processing','Power Systems'], 2, 28000, 'English', 7.0, FALSE, 3.0, 4.0,
 'Fall/Spring', 'January 1', TRUE,
 'Georgia Tech is a top-5 US engineering school. ECE program excels in signal processing, power electronics, and microelectronics. Strong industry recruitment from Texas Instruments, Intel, Qualcomm.',
 ARRAY['BSc in EE/CE','TOEFL 90 or IELTS 7.0','3 references','Statement of purpose','GRE recommended'], 'https://ece.gatech.edu/graduate-degree-programs/ms', 136),

('KU Leuven', 'M.Sc. Electrical Engineering', 'Belgium', 'Leuven', 'engineering',
 ARRAY['Electrical Engineering','Electronics','Photonics','Power Engineering'], 2, 8000, 'English', 6.5, FALSE, 3.0, 4.0,
 'September', 'March 1', TRUE,
 'Belgium''s top engineering program with excellent research in microelectronics (imec is nearby). Strong in photonics and power electronics. Scholarship opportunities available.',
 ARRAY['BSc in EE or related','IELTS 6.5','Motivation letter','2 references'], 'https://www.kuleuven.be/english/education/graduate-programmes/electrical-engineering', 74),

('TU/e Eindhoven', 'M.Sc. Electrical Engineering', 'Netherlands', 'Eindhoven', 'engineering',
 ARRAY['Electrical Engineering','Signal Processing','Embedded Systems','Power Electronics'], 2, 16000, 'English', 6.5, FALSE, 3.0, 4.0,
 'September', 'April 1', TRUE,
 'Strong links to ASML (world''s only EUV chip maker) and Philips. Excellent for embedded systems, semiconductor design, and power electronics. High employment rate.',
 ARRAY['BSc in EE or related','IELTS 6.5','Motivation letter','Academic records'], 'https://www.tue.nl/en/education/graduate-school/masters-programs/electrical-engineering', 179),

-- ── BUSINESS / FINANCE / MBA ──────────────────────────────────

('Frankfurt School of Finance & Management', 'M.Sc. Finance', 'Germany', 'Frankfurt', 'business',
 ARRAY['Finance','Investment Banking','Risk Management','FinTech'], 2, 22000, 'English', 6.5, FALSE, 3.3, 4.0,
 'September', 'March 31', TRUE,
 'Germany''s #1 finance school located in Europe''s financial capital. Strong CFA preparation and direct placement into Frankfurt''s banking sector (Deutsche Bank, DWS, ECB).',
 ARRAY['Bachelor in any field','GMAT/GRE strongly recommended','IELTS 6.5','Relevant work experience preferred','3 references'], 'https://www.frankfurt-school.de/en/home/programmes/master/msc-finance.html', NULL),

('Rotterdam School of Management (Erasmus)', 'M.Sc. Finance & Investments', 'Netherlands', 'Rotterdam', 'business',
 ARRAY['Finance','Investments','Corporate Finance','Asset Management'], 1, 22000, 'English', 6.5, FALSE, 3.3, 4.0,
 'September', 'April 1', TRUE,
 'Europe''s top-ranked management school. One-year intensive MSc in Finance with strong quant and investment focus. Excellent alumni network in European finance.',
 ARRAY['Bachelor in Economics/Finance/Quantitative field','GMAT 600+','IELTS 6.5','2 references','Statement of purpose'], 'https://www.rsm.nl/master/msc-programmes/msc-finance-investments/', 49),

('HEC Paris', 'M.Sc. Finance', 'France', 'Paris', 'business',
 ARRAY['Finance','Corporate Finance','Investment Management','Financial Markets'], 1, 29000, 'English', 7.0, FALSE, 3.5, 4.0,
 'September', 'March 31', TRUE,
 'Europe''s #1 business school (FT ranking). The MSc Finance is highly selective and places graduates in top investment banks and asset managers in Paris and London.',
 ARRAY['Bachelor in quantitative field','GMAT 680+ or GRE equivalent','IELTS 7.0','Work experience advantageous','Essays'], 'https://www.hec.edu/en/masters-programs/msc-programs/msc-finance', 6),

('Bocconi University', 'M.Sc. Finance', 'Italy', 'Milan', 'business',
 ARRAY['Finance','Corporate Finance','Banking','Financial Markets'], 2, 14000, 'English', 6.5, FALSE, 3.3, 4.0,
 'September', 'February 28', TRUE,
 'Italy''s best business school and one of Europe''s top finance programs. Affordable compared to UK/France. Strong placement in Italian and European banking and consulting.',
 ARRAY['Bachelor in Economics/Management/Math','GMAT 600+ recommended','IELTS 6.5','Motivation letter','CV'], 'https://www.unibocconi.eu/wps/wcm/connect/bocconi/sitopubblico_en/navigation+tree/home/programs/master+of+science/finance', 7),

('IE Business School', 'Master in Management (MiM)', 'Spain', 'Madrid', 'business',
 ARRAY['Business Administration','Management','Entrepreneurship','Strategy'], 1, 36000, 'English', 7.0, FALSE, 3.3, 4.0,
 'September', 'Rolling', TRUE,
 'Spain''s top business school with a highly international cohort (80+ nationalities). Strong entrepreneurship focus and Madrid''s growing startup scene. Good for career changers.',
 ARRAY['Bachelor in any field','GMAT/GRE recommended','IELTS 7.0','2 professional references','Essays'], 'https://www.ie.edu/business-school/programs/masters/master-in-management/', 22),

('Schulich School of Business (York)', 'M.Sc. Finance', 'Canada', 'Toronto', 'business',
 ARRAY['Finance','Financial Analysis','Corporate Finance','Derivatives'], 2, 20000, 'English', 7.0, FALSE, 3.3, 4.0,
 'September', 'February 1', TRUE,
 'Canada''s top specialized finance program. Strong CFA exam pass rates. Close ties to Toronto''s Bay Street financial district. Good value vs. American programs.',
 ARRAY['Bachelor in business/quantitative field','GMAT 600+','IELTS 7.0','3 references','Statement of purpose'], 'https://schulich.yorku.ca/programs/msc-finance/', NULL),

('ESCP Business School', 'M.Sc. Financial Markets', 'France', 'Paris', 'business',
 ARRAY['Finance','Financial Markets','Trading','Risk Management'], 1, 20000, 'English', 6.5, FALSE, 3.0, 4.0,
 'September', 'April 30', TRUE,
 'Pan-European business school with campuses in Paris, Berlin, London, Madrid, and Turin. The Financial Markets MSc offers strong quantitative training and bank placement.',
 ARRAY['Bachelor in any field','GMAT/GRE','IELTS 6.5','CV','Motivation letter'], 'https://escp.eu/programmes/master-in-management', NULL),

('Warsaw School of Economics', 'M.Sc. Finance and Accounting', 'Poland', 'Warsaw', 'business',
 ARRAY['Finance','Accounting','Banking','Risk Management'], 2, 2500, 'English', 6.0, FALSE, 3.0, 4.0,
 'October', 'July 31', FALSE,
 'Poland''s top economics university with one of Central Europe''s most affordable finance programs. Warsaw is a growing financial hub with international banks and shared service centers.',
 ARRAY['Bachelor in Economics/Finance/Business','English B2','Motivation letter','Transcript'], 'https://www.sgh.waw.pl/en/Pages/study-offer/master-degree-programmes/Finance-and-Accounting.aspx', NULL),

-- ── NATURAL SCIENCES ──────────────────────────────────────────

('Heidelberg University', 'M.Sc. Physics', 'Germany', 'Heidelberg', 'science',
 ARRAY['Physics','Astrophysics','Particle Physics','Condensed Matter'], 2, 200, 'English', 6.5, FALSE, 3.0, 4.0,
 'Winter', 'May 31', TRUE,
 'Germany''s oldest university and #1 in natural sciences. Free tuition. World-class research in astrophysics and particle physics. Access to CERN collaboration and DESI experiments.',
 ARRAY['BSc in Physics','English B2','Mathematics background','Statement of purpose','2 academic references'], 'https://www.physik.uni-heidelberg.de/studies/master/', 64),

('Technical University of Munich', 'M.Sc. Chemistry', 'Germany', 'Munich', 'science',
 ARRAY['Chemistry','Organic Chemistry','Biochemistry','Catalysis'], 2, 200, 'English', 6.5, FALSE, 3.0, 4.0,
 'Winter/Summer', 'Rolling', TRUE,
 'TUM Chemistry is Germany''s top chemistry program. Free tuition. Research groups are internationally renowned, with strong ties to pharma (Roche, BASF partnerships). Munich offers high quality of life.',
 ARRAY['BSc in Chemistry','English B2 or C1','Lab experience preferred','Motivation letter'], 'https://www.tum.de/en/studies/degree-programs/detail/chemistry-master-of-science-msc', 37),

('Utrecht University', 'M.Sc. Chemistry', 'Netherlands', 'Utrecht', 'science',
 ARRAY['Chemistry','Molecular Chemistry','Energy & Sustainability','Drug Innovation'], 2, 16000, 'English', 6.5, FALSE, 3.0, 4.0,
 'September', 'April 1', TRUE,
 'Utrecht is the Netherlands'' #1 general university. The Chemistry MSc offers tracks in molecular chemistry, drug innovation, and energy/sustainability. Strong research culture.',
 ARRAY['BSc in Chemistry or related','IELTS 6.5','Motivation letter','Academic records','English proficiency test'], 'https://www.uu.nl/en/masters/chemistry', 87),

('Ghent University', 'M.Sc. Chemistry', 'Belgium', 'Ghent', 'science',
 ARRAY['Chemistry','Biochemistry','Materials Chemistry','Analytical Chemistry'], 2, 1000, 'English', 6.5, FALSE, 3.0, 4.0,
 'September', 'March 1', FALSE,
 'One of Belgium''s top universities with very low tuition for a high-quality science program. Ghent is a charming medieval city with affordable living costs.',
 ARRAY['BSc in Chemistry or Biochemistry','IELTS 6.5','Motivation letter','Academic transcript'], 'https://www.ugent.be/en/programmes/master-of-science-in-chemistry.htm', 129),

('Université Paris Saclay', 'M.Sc. Physics', 'France', 'Paris', 'science',
 ARRAY['Physics','Theoretical Physics','Nuclear Physics','Optics'], 2, 4000, 'English/French', 6.0, FALSE, 3.0, 4.0,
 'September', 'April 1', TRUE,
 'Paris-Saclay hosts multiple Nobel laureates and is Europe''s densest research cluster. The Physics MSc includes tracks in theoretical, nuclear, and optical physics. CEA and CNRS lab access.',
 ARRAY['BSc in Physics','French or English proficiency','References','Transcript'], 'https://www.universite-paris-saclay.fr/en/education/master/physics', 14),

('Jagiellonian University', 'M.Sc. Physics', 'Poland', 'Kraków', 'science',
 ARRAY['Physics','Theoretical Physics','Nuclear Physics','Biophysics'], 2, 800, 'English', 6.0, FALSE, 3.0, 4.0,
 'October', 'July 15', FALSE,
 'Poland''s oldest and most prestigious university (est. 1364). Very affordable physics program with strong theoretical research tradition. Kraków is a beautiful, low-cost city.',
 ARRAY['BSc in Physics or related','English B2','Motivation letter','Academic transcript'], 'https://en.uj.edu.pl/en_GB/admitted/-/journal_content/56_INSTANCE_ivKkFiQlPQMo/10171536/143891049', 601),

('University of Toronto', 'M.Sc. Chemistry', 'Canada', 'Toronto', 'science',
 ARRAY['Chemistry','Organic Chemistry','Physical Chemistry','Materials Science'], 2, 10000, 'English', 7.0, FALSE, 3.5, 4.0,
 'September', 'December 1', TRUE,
 'Canada''s top chemistry program with world-class research facilities. Thesis-based program with full funding (TA/RA positions) typically available for qualified students.',
 ARRAY['BSc in Chemistry','IELTS 7.0','3 academic references','Research statement','Transcript'], 'https://www.chemistry.utoronto.ca/graduate', 21),

('University of Milan', 'M.Sc. Biological Sciences', 'Italy', 'Milan', 'science',
 ARRAY['Biology','Molecular Biology','Genetics','Ecology'], 2, 3000, 'English', 6.0, FALSE, 3.0, 4.0,
 'September', 'April 30', TRUE,
 'Italy''s largest university with a strong biology and biomedical research program. Affordable tuition with scholarship opportunities. Milan''s San Raffaele and IEO institutes offer research collaboration.',
 ARRAY['BSc in Biology/Biotechnology/Natural Sciences','IELTS 6.0','Motivation letter','Transcript'], 'https://www.unimi.it/en/education/master-programme-courses/biological-sciences', 301),

('Lund University', 'M.Sc. Physics', 'Sweden', 'Lund', 'science',
 ARRAY['Physics','Atomic Physics','Synchrotron Physics','Condensed Matter'], 2, 0, 'English', 6.5, FALSE, 3.0, 4.0,
 'August', 'January 15', TRUE,
 'Free tuition for EU students. Home of MAX IV, the world''s brightest synchrotron radiation source. Strong atomic and condensed matter physics research. Lund is a charming university town.',
 ARRAY['BSc in Physics','IELTS 6.5','Motivation letter','2 academic references'], 'https://www.lunduniversity.lu.se/lubas/i-uoh-lu-NAFYA', 98)

ON CONFLICT DO NOTHING;
