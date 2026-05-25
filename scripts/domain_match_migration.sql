-- ============================================================
-- Domain Match Migration (Phase 2)
--
-- Adds a column to flag programs whose apply_url host has no
-- meaningful relationship to the listed university name.
-- Detection is pure-Python token comparison — no HTTP, no AI.
--
-- Status values:
--   'match'      — host tokens overlap with university name
--   'mismatch'   — clear domain/university mismatch (likely wrong listing)
--   'aggregator' — apply_url is on a known aggregator domain
--   'no_url'     — apply_url empty or invalid
--   NULL         — not yet checked
--
-- Run in Supabase SQL Editor.
-- ============================================================

ALTER TABLE masters_programs
  ADD COLUMN IF NOT EXISTS domain_match_status    TEXT,
  ADD COLUMN IF NOT EXISTS domain_match_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS domain_match_host      TEXT;

CREATE INDEX IF NOT EXISTS idx_programs_domain_match
  ON masters_programs(domain_match_status);
