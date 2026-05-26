-- ============================================================
-- Student Acceptances Migration
--
-- Tracks real students who have been offered / accepted into programs
-- in the catalog. Lets the public program page show social-proof badges
-- ("4 students from your country accepted") and admins/mentors record
-- ground-truth applications.
--
-- v1 scope (minimum useful):
--   - Core identity + outcome only (no GPA / profile snapshot yet)
--   - Either admin-added or user-self-submitted (logged-in only)
--   - No mandatory verification (user can opt in to verification later)
--   - Anonymous aggregates only (no names exposed to public reads)
--
-- Run in Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS student_acceptances (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id        UUID NOT NULL REFERENCES masters_programs(id) ON DELETE CASCADE,
  user_id           UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Core identity (v1 — keep it tight)
  country           TEXT NOT NULL,                    -- student nationality, e.g. 'Bangladesh'
  status            TEXT NOT NULL DEFAULT 'accepted'
                    CHECK (status IN (
                      'accepted', 'enrolled', 'rejected',
                      'waitlisted', 'withdrew'
                    )),
  intake_year       INTEGER,                          -- e.g. 2026
  intake_semester   TEXT,                             -- 'Fall' | 'Spring' | 'Summer' | NULL
  notes             TEXT,

  -- Submission metadata
  submitted_by      TEXT NOT NULL DEFAULT 'user'
                    CHECK (submitted_by IN ('admin', 'user')),
  admin_verified    BOOLEAN NOT NULL DEFAULT FALSE,   -- admin can optionally mark as verified
  admin_note        TEXT,

  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sa_program
  ON student_acceptances (program_id, status);
CREATE INDEX IF NOT EXISTS idx_sa_country
  ON student_acceptances (country, status);
CREATE INDEX IF NOT EXISTS idx_sa_user
  ON student_acceptances (user_id);
CREATE INDEX IF NOT EXISTS idx_sa_created
  ON student_acceptances (created_at DESC);

-- One user can only record themselves once per program (prevents accidental
-- duplicate submissions). Admin entries (user_id NULL) are not deduped.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sa_user_program_unique
  ON student_acceptances (user_id, program_id)
  WHERE user_id IS NOT NULL;

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE student_acceptances ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can INSERT (with their user_id), and only their own.
DROP POLICY IF EXISTS "users insert own"  ON student_acceptances;
CREATE POLICY "users insert own" ON student_acceptances
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users SELECT only their own rows. Public aggregates go through service-role
-- on the server side; the public API returns counts, not names.
DROP POLICY IF EXISTS "users read own"    ON student_acceptances;
CREATE POLICY "users read own" ON student_acceptances
  FOR SELECT USING (auth.uid() = user_id);

-- Users UPDATE / DELETE only their own rows
DROP POLICY IF EXISTS "users update own"  ON student_acceptances;
CREATE POLICY "users update own" ON student_acceptances
  FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "users delete own"  ON student_acceptances;
CREATE POLICY "users delete own" ON student_acceptances
  FOR DELETE USING (auth.uid() = user_id);

GRANT ALL ON student_acceptances TO service_role;

-- ── auto-update trigger for updated_at ──────────────────────
CREATE OR REPLACE FUNCTION update_student_acceptances_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_student_acceptances_updated_at ON student_acceptances;
CREATE TRIGGER trg_student_acceptances_updated_at
  BEFORE UPDATE ON student_acceptances
  FOR EACH ROW EXECUTE FUNCTION update_student_acceptances_timestamp();
