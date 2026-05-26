-- ============================================================
-- Agent Runtime Migration (Phase B)
--
-- Establishes operational rails for the six-agent pipeline:
--   1. agent_definitions  — schedule, budget, mode toggle per agent
--   2. audit_snapshots    — rollback-ready snapshots before bulk writes
--
-- Both tables are service-role-only (admin panel reads via adminSupabase).
-- Run in Supabase SQL Editor.
-- ============================================================

-- 1. AGENT DEFINITIONS ---------------------------------------
CREATE TABLE IF NOT EXISTS agent_definitions (
  crawler             TEXT PRIMARY KEY,    -- matches CrawlerRun(name=...)
  description         TEXT,
  mode                TEXT NOT NULL DEFAULT 'bootstrap'
                       CHECK (mode IN ('bootstrap', 'steady', 'paused')),
  bootstrap_schedule  TEXT,                 -- cron string for bootstrap mode
  steady_schedule     TEXT,                 -- cron string for steady mode
  max_usd_per_run     NUMERIC(8, 2) NOT NULL DEFAULT 0,
  max_usd_per_month   NUMERIC(8, 2) NOT NULL DEFAULT 50,
  alert_on_failure    BOOLEAN NOT NULL DEFAULT TRUE,
  enabled             BOOLEAN NOT NULL DEFAULT TRUE,
  params              JSONB,                -- per-agent runtime config
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE agent_definitions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON agent_definitions TO service_role;

-- Seed all six agents with sensible defaults (idempotent — ON CONFLICT DO NOTHING).
INSERT INTO agent_definitions
  (crawler, description, mode, bootstrap_schedule, steady_schedule,
   max_usd_per_run, max_usd_per_month)
VALUES
  ('program_ingester',
   'Parse Documents/*.txt (Mastersportal format) into masters_programs.',
   'paused', NULL, NULL, 0, 0),
  ('source_ingester',
   'Parse Documents/sources/*.txt curated URL lists into opportunity_sources.',
   'paused', NULL, NULL, 0.05, 1),
  ('url_validator',
   'HTTP-classify apply_url (ok / dead / redirect / wrong_domain / timeout).',
   'bootstrap', '0 3 * * *', '0 3 * * 0', 0, 0),
  ('domain_mismatch_detector',
   'Flag URL host vs university mismatches. Pure offline.',
   'bootstrap', '30 3 * * *', '30 3 * * 0', 0, 0),
  ('program_corrector',
   'DDG-search official program URLs for flagged or empty rows.',
   'bootstrap', '0 4 * * 1', '0 4 * * 1', 0, 0),
  ('opportunity_discoverer',
   'Crawl opportunity_sources + university pages, extract scholarships/funding/PhDs.',
   'paused', '0 5 * * *', '0 5 1 * *', 20, 50)
ON CONFLICT (crawler) DO NOTHING;

-- 2. AUDIT SNAPSHOTS -----------------------------------------
-- Before any bulk UPDATE on masters_programs (or other production tables),
-- the agent should snapshot the affected rows here so the admin can roll
-- back from a single UPDATE.
CREATE TABLE IF NOT EXISTS audit_snapshots (
  id          BIGSERIAL PRIMARY KEY,
  run_id      UUID REFERENCES crawler_runs(id) ON DELETE SET NULL,
  table_name  TEXT NOT NULL,
  row_id      TEXT NOT NULL,                -- stringified PK
  before      JSONB NOT NULL,
  reason      TEXT,                          -- 'bulk_correction', 'discoverer', etc.
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snapshots_run
  ON audit_snapshots(run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_table_row
  ON audit_snapshots(table_name, row_id, created_at DESC);

ALTER TABLE audit_snapshots ENABLE ROW LEVEL SECURITY;
GRANT ALL ON audit_snapshots TO service_role;

-- 3. agent_definitions auto-update trigger -------------------
CREATE OR REPLACE FUNCTION update_agent_definitions_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agent_definitions_updated_at ON agent_definitions;
CREATE TRIGGER trg_agent_definitions_updated_at
  BEFORE UPDATE ON agent_definitions
  FOR EACH ROW EXECUTE FUNCTION update_agent_definitions_timestamp();
