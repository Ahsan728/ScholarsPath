-- ============================================================
-- Discovered Opportunities Migration (Phase C)
--
-- Stores scholarship / funding / PhD / grant rows extracted by the
-- opportunity_discoverer agent from opportunity_sources URLs and from
-- valid university program pages.
--
-- ⚠️  Renamed from `opportunities` to `discovered_opportunities` to avoid
--    colliding with the legacy `opportunities` table from scripts/schema.sql
--    (the original RAG dataset queried by the homepage, search, alerts,
--    and CV evaluation flows).
--
-- Run AFTER:
--   scripts/opportunity_sources_migration.sql  (source registry table)
--   scripts/crawler_runs_migration.sql         (already applied)
--
-- Run in Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS discovered_opportunities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Provenance
  source_id       UUID REFERENCES opportunity_sources(id) ON DELETE SET NULL,
  source_url      TEXT NOT NULL,           -- the page the row was extracted from
  run_id          UUID REFERENCES crawler_runs(id) ON DELETE SET NULL,
  prompt_version  TEXT NOT NULL DEFAULT 'v1',  -- versioned so we can re-extract
  content_hash    TEXT,                    -- sha256 of cleaned page text; skip if unchanged

  -- Identity
  type            TEXT NOT NULL
                  CHECK (type IN (
                    'scholarship', 'grant', 'phd', 'postdoc',
                    'fellowship', 'internship', 'bursary', 'assistantship',
                    'exchange'
                  )),
  title           TEXT NOT NULL,
  description     TEXT,

  -- Scope
  university      TEXT,                    -- nullable: national/regional opps have no university
  country         TEXT NOT NULL,           -- 'Italy', 'Germany', 'Europe' (pan-European), etc.
  degree_level    TEXT
                  CHECK (degree_level IS NULL OR degree_level IN (
                    'undergraduate', 'masters', 'phd', 'postdoc', 'any'
                  )),
  field_of_study  TEXT[] DEFAULT '{}',

  -- Money
  amount_usd      NUMERIC(10, 2),
  amount_text     TEXT,                    -- e.g. "€3,400/month + family allowance"
  funding_type    TEXT
                  CHECK (funding_type IS NULL OR funding_type IN (
                    'full', 'partial', 'stipend', 'salary', 'tuition_waiver'
                  )),

  -- Eligibility
  eligibility_text   TEXT,
  eligible_nations   TEXT[] DEFAULT '{}',  -- ['ALL'] or ['BD','PK',...] or ['DEVELOPING']
  ineligible_nations TEXT[] DEFAULT '{}',

  -- Timing
  deadline        DATE,
  deadline_text   TEXT,                    -- 'Rolling', 'Mid-March 2026', etc.
  intake          TEXT,                    -- 'Fall 2026', 'Spring/Fall', etc.

  -- Bookkeeping
  apply_url       TEXT,                    -- direct apply link, if found
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  discovered_at   TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Dedup: same opp shouldn't appear twice from the same source page
CREATE UNIQUE INDEX IF NOT EXISTS idx_disc_dedup
  ON discovered_opportunities (lower(coalesce(university, '')), country, type, lower(title));

CREATE INDEX IF NOT EXISTS idx_disc_country     ON discovered_opportunities (country);
CREATE INDEX IF NOT EXISTS idx_disc_type        ON discovered_opportunities (type);
CREATE INDEX IF NOT EXISTS idx_disc_deadline    ON discovered_opportunities (deadline);
CREATE INDEX IF NOT EXISTS idx_disc_active      ON discovered_opportunities (is_active, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_disc_source      ON discovered_opportunities (source_id);
CREATE INDEX IF NOT EXISTS idx_disc_content_hash ON discovered_opportunities (content_hash);

ALTER TABLE discovered_opportunities ENABLE ROW LEVEL SECURITY;

-- Public read (active rows only) — students can browse discovered_opportunities on
-- the live site without auth. Service role bypasses RLS.
DROP POLICY IF EXISTS "anyone read active" ON discovered_opportunities;
CREATE POLICY "anyone read active" ON discovered_opportunities
  FOR SELECT USING (is_active = true);

GRANT ALL ON discovered_opportunities TO service_role;
GRANT SELECT ON discovered_opportunities TO anon, authenticated;
