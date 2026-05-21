-- ============================================================
-- Migration: Extend masters_programs into unified programs table
-- Run in Supabase SQL Editor AFTER seed_masters.sql
-- Safe to run multiple times (all IF NOT EXISTS / WHERE NULL guards)
-- ============================================================

ALTER TABLE masters_programs
  ADD COLUMN IF NOT EXISTS level       TEXT NOT NULL DEFAULT 'master'
                                       CHECK (level IN ('bachelor','master','language')),
  ADD COLUMN IF NOT EXISTS source_name TEXT NOT NULL DEFAULT 'curated',
  ADD COLUMN IF NOT EXISTS source_url  TEXT,
  ADD COLUMN IF NOT EXISTS fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ DEFAULT NOW();

-- Back-fill fingerprint for all rows
UPDATE masters_programs
SET fingerprint = encode(
      sha256((lower(trim(program_name)) || '|' || lower(country) || '|master')::bytea),
      'hex')
WHERE fingerprint IS NULL;

-- Remove duplicate rows — keep the one with the lowest id for each fingerprint
DELETE FROM masters_programs
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY fingerprint ORDER BY id) AS rn
    FROM masters_programs
  ) ranked
  WHERE rn > 1
);

-- Drop old constraint if it exists from a previous failed attempt
ALTER TABLE masters_programs
  DROP CONSTRAINT IF EXISTS masters_programs_fingerprint_key;

-- Now safe to add unique constraint
ALTER TABLE masters_programs
  ADD CONSTRAINT masters_programs_fingerprint_key UNIQUE (fingerprint);

-- Indexes for new filter patterns
CREATE INDEX IF NOT EXISTS idx_mp_level  ON masters_programs(level);
CREATE INDEX IF NOT EXISTS idx_mp_source ON masters_programs(source_name);
CREATE INDEX IF NOT EXISTS idx_mp_free   ON masters_programs(tuition_usd_year) WHERE tuition_usd_year IS NULL;

-- Grant (mirrors existing seed_masters.sql grants)
GRANT ALL ON masters_programs TO anon, authenticated, service_role;

-- Verify: should show rows with level='master', source_name='curated'
-- SELECT level, source_name, COUNT(*) FROM masters_programs GROUP BY 1, 2;
