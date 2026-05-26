-- ============================================================
-- Page Status Migration (Phase D — Page Validator)
--
-- Adds page-level quality columns to masters_programs. Populated by
-- crawlers/validate_program_pages.py, which fetches each program's
-- apply_url and analyses the actual page content.
--
-- page_status            — overall verdict from the validator
-- language_status        — language(s) of instruction
-- page_title / page_lang_attr — raw page metadata
-- suggested_new_name     — if the page advertises a different name
-- detected_languages     — array, e.g. ['English', 'Italian']
-- page_checked_at        — last validator run timestamp
--
-- Run in Supabase SQL Editor (idempotent — uses IF NOT EXISTS).
-- ============================================================

ALTER TABLE masters_programs
  ADD COLUMN IF NOT EXISTS page_status         TEXT,
  ADD COLUMN IF NOT EXISTS language_status     TEXT,
  ADD COLUMN IF NOT EXISTS page_title          TEXT,
  ADD COLUMN IF NOT EXISTS page_lang_attr      TEXT,
  ADD COLUMN IF NOT EXISTS suggested_new_name  TEXT,
  ADD COLUMN IF NOT EXISTS detected_languages  TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS page_checked_at     TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_programs_page_status
  ON masters_programs (page_status);
CREATE INDEX IF NOT EXISTS idx_programs_language_status
  ON masters_programs (language_status);
CREATE INDEX IF NOT EXISTS idx_programs_page_checked
  ON masters_programs (page_checked_at NULLS FIRST);
