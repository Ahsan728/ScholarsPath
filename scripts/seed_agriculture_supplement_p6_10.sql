-- ============================================================
-- Supplement: Agriculture & Forestry programs missed from pages 6–10
-- 6 programs not captured in seed_agriculture_programs_p6_10.sql
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

('University of Kassel','Sustainable International Agriculture','Germany','Kassel',2.0,782,ARRAY['Agriculture','Sustainability','International Development'],false,'Joint MSc by University of Kassel (Organic Agricultural Sciences) and University of Göttingen (Agricultural Sciences) for sustainable farming in international contexts.'),
('University College Dublin','Animal Science','Ireland','Dublin',1.0,10430,ARRAY['Animal Science','Biology','Sustainability'],false,'MSc for students pursuing advanced careers in the livestock sector covering animal physiology, production, and welfare.'),
('University of Copenhagen','Global Forestry','Denmark','Copenhagen',2.0,NULL,ARRAY['Forestry','Sustainability','Global Studies'],true,'Erasmus Mundus joint MSc preparing graduates for forestry challenges including biodiversity protection, climate change, and the circular bio-economy; full scholarship available.'),
('Umea University','Plant and Forest Biotechnology','Sweden','Umeå',2.0,NULL,ARRAY['Forestry','Biotechnology','Plant Science'],false,'MSc providing specialised competence in plant and forest biotechnology to solve global challenges in food security and forest ecosystem management; tuition-free for EU students.'),
('University of Göttingen','Sustainable Forest and Nature Management','Germany','Göttingen',2.0,NULL,ARRAY['Forestry','Natural Resource Management','Sustainability'],false,'Erasmus Mundus-linked MSc on sustainable management of forests and natural resources; joint programme with universities across Europe; tuition-free.'),
('AgroParisTech','Predictive and Integrative Animal Biology','France','Paris',1.0,250,ARRAY['Animal Science','Biology','Data Science'],false,'MSc training students in applied animal sciences through an integrative approach encompassing genetics, physiology, and animal behaviour.')

) AS v(university, program_name, country, city, duration_years, tuition_eur, fields, scholarship, description)
ON CONFLICT (fingerprint) DO NOTHING;
