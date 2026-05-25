-- ============================================================
-- Opportunity Sources Migration
-- Registry of trusted source URLs for the Source Ingester agent.
-- The Source Ingester upserts by normalized URL and records crawl status
-- for later discovery jobs.
--
-- Run in Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS opportunity_sources (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url             TEXT NOT NULL,
  country         TEXT,
  scope           TEXT NOT NULL
                  CHECK (scope IN (
                    'pan_european','national_portal','regional',
                    'university','funding_body','aggregator'
                  )),
  title           TEXT,
  notes           TEXT,
  source_doc      TEXT,
  added_by        TEXT DEFAULT 'system',
  last_crawled_at TIMESTAMPTZ,
  last_status     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_os_url_lower
  ON opportunity_sources (lower(url));

CREATE INDEX IF NOT EXISTS idx_os_country_scope
  ON opportunity_sources(country, scope);

CREATE INDEX IF NOT EXISTS idx_os_last_crawled_at
  ON opportunity_sources(last_crawled_at NULLS FIRST);

ALTER TABLE opportunity_sources ENABLE ROW LEVEL SECURITY;

GRANT ALL ON opportunity_sources TO service_role;
