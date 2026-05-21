-- ============================================================
-- ScholarAssist — Tier System Migration
-- Run this in the Supabase SQL Editor (once)
-- ============================================================

-- 1. Subscription tier enum + table
DO $$ BEGIN
  CREATE TYPE subscription_tier AS ENUM ('free', 'pro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS subscriptions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES users(id) ON DELETE CASCADE,
  tier                subscription_tier NOT NULL DEFAULT 'free',
  stripe_customer_id  TEXT,
  stripe_sub_id       TEXT,
  current_period_end  TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- 2. API usage log — every Claude call (RAG chat, CV evaluate, extraction)
CREATE TABLE IF NOT EXISTS api_usage_log (
  id            BIGSERIAL PRIMARY KEY,
  feature       TEXT NOT NULL,  -- 'rag_chat' | 'cv_evaluate' | 'extraction'
  user_id       UUID REFERENCES users(id),
  session_id    TEXT,
  model         TEXT,
  input_tokens  INT,
  output_tokens INT,
  cost_usd      NUMERIC(10,6),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Pipeline run history — each crawler run summary
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id              BIGSERIAL PRIMARY KEY,
  run_type        TEXT NOT NULL,  -- 'opportunities' | 'programs'
  items_processed INT DEFAULT 0,
  items_new       INT DEFAULT 0,
  items_updated   INT DEFAULT 0,
  claude_calls    INT DEFAULT 0,
  input_tokens    INT DEFAULT 0,
  output_tokens   INT DEFAULT 0,
  cost_usd        NUMERIC(10,6) DEFAULT 0,
  duration_sec    INT DEFAULT 0,
  ran_at          TIMESTAMPTZ DEFAULT NOW()
);

-- 4. RAG usage — session-based lifetime counter (free users, 3 total)
CREATE TABLE IF NOT EXISTS rag_usage (
  session_id  TEXT PRIMARY KEY,
  count       INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Session time usage — 10-min per 24h for free users
CREATE TABLE IF NOT EXISTS session_usage (
  session_id    TEXT NOT NULL,
  date          DATE NOT NULL,
  seconds_used  INT NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, date)
);

-- 6. Add columns to existing users table (additive — no data loss)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS rag_queries_month   INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rag_reset_month     INT DEFAULT EXTRACT(MONTH FROM NOW())::INT,
  ADD COLUMN IF NOT EXISTS cv_eval_used        BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cv_eval_month       INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cv_eval_reset_month INT DEFAULT EXTRACT(MONTH FROM NOW())::INT;

-- 7. Indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_user   ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_feature    ON api_usage_log(feature, created_at);
CREATE INDEX IF NOT EXISTS idx_api_usage_user       ON api_usage_log(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_api_usage_month      ON api_usage_log(created_at);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_type   ON pipeline_runs(run_type, ran_at);
CREATE INDEX IF NOT EXISTS idx_session_usage_date   ON session_usage(session_id, date);

-- 8. RLS
ALTER TABLE subscriptions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage_log    ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_runs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_usage        ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_usage    ENABLE ROW LEVEL SECURITY;

-- Users can only read their own subscription
DROP POLICY IF EXISTS "Users view own subscription" ON subscriptions;
CREATE POLICY "Users view own subscription" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- Only service_role writes to logging tables (no user access)
GRANT ALL ON subscriptions   TO authenticated, service_role;
GRANT ALL ON api_usage_log   TO service_role;
GRANT ALL ON pipeline_runs   TO service_role;
GRANT ALL ON rag_usage       TO service_role;
GRANT ALL ON session_usage   TO service_role;
GRANT USAGE, SELECT ON SEQUENCE api_usage_log_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE pipeline_runs_id_seq TO service_role;
