-- ============================================================
-- Crawler Observability Migration
--
-- Adds:
--  1. crawler_runs            — one row per crawler invocation
--  2. crawler_events          — optional per-item log (errors / notable items)
--  3. URL-validation columns on masters_programs
--
-- All tables are service-role-only (admin panel reads via adminSupabase).
-- Run in Supabase SQL Editor.
-- ============================================================

-- 1. CRAWLER RUNS ---------------------------------------------
CREATE TABLE IF NOT EXISTS crawler_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crawler         TEXT NOT NULL,                 -- e.g. 'url_validator', 'opportunity_discovery'
  status          TEXT NOT NULL DEFAULT 'running'
                  CHECK (status IN ('running','completed','failed','cancelled')),
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  finished_at     TIMESTAMPTZ,
  duration_ms     INTEGER,

  -- counts
  items_total     INTEGER DEFAULT 0,             -- planned items
  items_processed INTEGER DEFAULT 0,             -- actually touched
  items_ok        INTEGER DEFAULT 0,
  items_failed    INTEGER DEFAULT 0,
  items_skipped   INTEGER DEFAULT 0,

  -- optional cost telemetry (Phase 3 LLM crawlers)
  tokens_in       INTEGER DEFAULT 0,
  tokens_out      INTEGER DEFAULT 0,
  cost_usd        NUMERIC(10,4) DEFAULT 0,

  -- free-form
  params          JSONB,                          -- CLI args / filters used
  summary         JSONB,                          -- per-category counts, top errors, etc.
  error_message   TEXT,
  host            TEXT                            -- where it ran (laptop / github-actions / ...)
);

CREATE INDEX IF NOT EXISTS idx_runs_crawler_started ON crawler_runs(crawler, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_status          ON crawler_runs(status, started_at DESC);

ALTER TABLE crawler_runs ENABLE ROW LEVEL SECURITY;
GRANT ALL ON crawler_runs TO service_role;

-- 2. CRAWLER EVENTS -------------------------------------------
-- Lightweight per-item log. Keep terse — one row per noteworthy thing.
CREATE TABLE IF NOT EXISTS crawler_events (
  id          BIGSERIAL PRIMARY KEY,
  run_id      UUID NOT NULL REFERENCES crawler_runs(id) ON DELETE CASCADE,
  level       TEXT NOT NULL DEFAULT 'info'
              CHECK (level IN ('info','warn','error')),
  target_id   TEXT,           -- e.g. program UUID, university name
  target_url  TEXT,
  message     TEXT,
  meta        JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_run   ON crawler_events(run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_level ON crawler_events(level, created_at DESC);

ALTER TABLE crawler_events ENABLE ROW LEVEL SECURITY;
GRANT ALL ON crawler_events TO service_role;

-- 3. URL VALIDATION COLUMNS ON masters_programs --------------
-- apply_url already exists; we add metadata about whether it actually works.
ALTER TABLE masters_programs
  ADD COLUMN IF NOT EXISTS url_status        TEXT,           -- 'ok' | 'dead' | 'redirect' | 'wrong_domain' | 'timeout' | 'unknown'
  ADD COLUMN IF NOT EXISTS url_http_code     INTEGER,        -- last HTTP status
  ADD COLUMN IF NOT EXISTS url_final_url     TEXT,           -- after redirects
  ADD COLUMN IF NOT EXISTS url_checked_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS url_check_error   TEXT;

CREATE INDEX IF NOT EXISTS idx_programs_url_status    ON masters_programs(url_status);
CREATE INDEX IF NOT EXISTS idx_programs_url_checked   ON masters_programs(url_checked_at);
