-- ============================================================
-- Student Acceptances — Profile Fields (additive)
--
-- Extends student_acceptances with the student's profile snapshot at
-- time of application: GPA, IELTS, TOEFL, publications, bachelor
-- background. All fields nullable.
--
-- Aggregates these in /programs/[id] badge (median GPA / IELTS) so
-- future applicants can see "what kind of profile got in here".
-- Names still never exposed; only anonymous numeric aggregates.
--
-- Run AFTER scripts/student_acceptances_migration.sql.
-- ============================================================

ALTER TABLE student_acceptances
  ADD COLUMN IF NOT EXISTS gpa                  NUMERIC(4,2),  -- e.g. 3.33, 3.85, 8.7
  ADD COLUMN IF NOT EXISTS gpa_scale            NUMERIC(3,1) DEFAULT 4.0, -- 4.0 / 5.0 / 10.0
  ADD COLUMN IF NOT EXISTS ielts_score          NUMERIC(3,1),  -- e.g. 6.5, 7.0
  ADD COLUMN IF NOT EXISTS toefl_score          INTEGER,       -- e.g. 95, 110 (alternative)
  ADD COLUMN IF NOT EXISTS publications_count   INTEGER,       -- number of papers
  ADD COLUMN IF NOT EXISTS publications_text    TEXT,          -- short list of titles, optional
  ADD COLUMN IF NOT EXISTS bachelor_subject     TEXT,          -- e.g. 'Computer Science'
  ADD COLUMN IF NOT EXISTS bachelor_university  TEXT;          -- e.g. 'BUET'

CREATE INDEX IF NOT EXISTS idx_sa_gpa
  ON student_acceptances (gpa) WHERE gpa IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sa_ielts
  ON student_acceptances (ielts_score) WHERE ielts_score IS NOT NULL;

-- Drop the partial unique index that ON CONFLICT can't use, replace with
-- a plain non-partial constraint via COALESCE so admin (NULL user_id) and
-- user (filled user_id) entries co-exist properly. We use the zero UUID
-- as the "admin sentinel": every admin row has a different program_id
-- (we never dedup admin rows), and every user has at most one row per
-- program. The UNIQUE on (coalesce(user_id, gen_random_uuid()), …) trick
-- doesn't work because gen_random_uuid is non-deterministic in indexes.
--
-- Simpler approach: drop the unique constraint entirely and enforce
-- single-row-per-(user,program) at the application layer (the API route
-- check-then-INSERT/UPDATE). Postgres unique partial indexes interact
-- badly with PostgREST ON CONFLICT, and the application-level guard is
-- robust enough.

DROP INDEX IF EXISTS idx_sa_user_program_unique;

-- Keep a NON-unique index for lookup performance (used by the API check)
CREATE INDEX IF NOT EXISTS idx_sa_user_program
  ON student_acceptances (user_id, program_id)
  WHERE user_id IS NOT NULL;
