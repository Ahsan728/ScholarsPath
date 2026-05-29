-- ============================================================
-- Opportunity category column
--
-- discovered_opportunities now stores a normalized domain slug (cs_ai,
-- engineering, environment, ...) alongside the free-text field_of_study
-- array. Lets the homepage filter query the DB directly instead of
-- doing post-fetch keyword matching in JS — which failed on rows with
-- empty field_of_study (very common) or non-English text (Campus France
-- French disciplines).
--
-- Slug values mirror masters_programs.category and the
-- RESEARCH_DOMAINS / CATEGORIES lists in components/. Population is
-- handled by crawlers/domain_classifier.py.
-- ============================================================

ALTER TABLE discovered_opportunities
  ADD COLUMN IF NOT EXISTS category TEXT;

CREATE INDEX IF NOT EXISTS idx_disc_category_active
  ON discovered_opportunities (category)
  WHERE is_active = true;

-- Compound index for the common (category, type) filter combo on the
-- public homepage (e.g. "Phd + CS/AI").
CREATE INDEX IF NOT EXISTS idx_disc_category_type_active
  ON discovered_opportunities (category, type)
  WHERE is_active = true;
