-- ============================================================
-- Student Allowlist Migration
-- Adds 'student' tier + table of allowlisted emails (Mentorship Program members
-- and Ahsan's private students). Students get Pro-level access + exclusive
-- CV/Transcript evaluation.
--
-- Run in Supabase SQL Editor.
-- The ALTER TYPE must run OUTSIDE a transaction (Postgres restriction).
-- ============================================================

-- 1. Add 'student' to the existing subscription_tier enum.
--    IF NOT EXISTS guards against re-running.
ALTER TYPE subscription_tier ADD VALUE IF NOT EXISTS 'student';

-- 2. Email allowlist. PK on lowercase email keeps lookups simple and
--    prevents duplicates. notes column distinguishes mentorship cohorts
--    from private students (e.g., "Mentorship 2026-Q1", "Private student").
CREATE TABLE IF NOT EXISTS student_allowlist (
  email      TEXT PRIMARY KEY,
  added_by   TEXT,
  added_at   TIMESTAMPTZ DEFAULT NOW(),
  notes      TEXT
);

ALTER TABLE student_allowlist ENABLE ROW LEVEL SECURITY;

-- Only the service_role (admin server) can read or write the allowlist.
GRANT ALL ON student_allowlist TO service_role;
