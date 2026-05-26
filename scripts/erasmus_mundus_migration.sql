-- ============================================================
-- Erasmus Mundus Joint Masters (EMJM) Migration
--
-- Erasmus Mundus Joint Masters are multi-country consortium programs
-- offered by 2-4 universities across Europe. They're always fully funded
-- (€1,400/month + travel + tuition) for selected scholars and apply via
-- a single consortium application.
--
-- We keep them in masters_programs so existing filters still work, but
-- tag them with program_type and store consortium metadata.
--
-- Run AFTER scripts/schema.sql.
-- ============================================================

ALTER TABLE masters_programs
  ADD COLUMN IF NOT EXISTS program_type             TEXT NOT NULL DEFAULT 'standard'
                                                    CHECK (program_type IN (
                                                      'standard',
                                                      'erasmus_mundus_joint',
                                                      'erasmus_mundus_design'
                                                    )),
  ADD COLUMN IF NOT EXISTS consortium_universities  TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS consortium_countries     TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS emjm_code                TEXT,
  ADD COLUMN IF NOT EXISTS emjm_scholarship_eur     INTEGER,
  ADD COLUMN IF NOT EXISTS emjm_intake_starts       DATE,
  ADD COLUMN IF NOT EXISTS emjm_application_window  TEXT;

CREATE INDEX IF NOT EXISTS idx_programs_program_type
  ON masters_programs (program_type) WHERE program_type <> 'standard';

CREATE INDEX IF NOT EXISTS idx_programs_consortium_countries
  ON masters_programs USING gin (consortium_countries);

-- For EMJM, country = 'Europe' acts as a fallback when not yet detailed.
-- The actual countries live in consortium_countries[].
