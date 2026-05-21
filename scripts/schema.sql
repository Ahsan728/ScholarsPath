-- ============================================================
-- scholars.ahsansuny.com — Supabase PostgreSQL Schema
-- Run this in your Supabase SQL editor (Dashboard > SQL Editor)
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- for full-text trigram search

-- ============================================================
-- ENUM TYPES
-- ============================================================

DO $$ BEGIN
  CREATE TYPE opportunity_type AS ENUM (
    'scholarship', 'grant', 'phd', 'postdoc',
    'fellowship', 'internship', 'bursary', 'exchange'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE funding_type AS ENUM ('full', 'partial', 'stipend', 'salary');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE degree_level AS ENUM (
    'undergraduate', 'masters', 'phd', 'postdoc', 'any'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE opportunity_status AS ENUM ('open', 'closed', 'rolling', 'upcoming');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE digest_frequency AS ENUM ('daily', 'weekly', 'never');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE source_type AS ENUM (
    'website', 'rss', 'api', 'linkedin', 'telegram', 'email'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE alert_type AS ENUM (
    'deadline_30d', 'deadline_14d', 'deadline_7d', 'deadline_1d', 'status_change'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE alert_channel AS ENUM ('email', 'telegram', 'push');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- SOURCES — crawl registry
-- ============================================================

CREATE TABLE IF NOT EXISTS sources (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              TEXT NOT NULL,
  base_url          TEXT NOT NULL,
  source_type       source_type NOT NULL DEFAULT 'website',
  crawl_frequency   INTERVAL NOT NULL DEFAULT '24 hours',
  last_crawled_at   TIMESTAMPTZ,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  scraper_module    TEXT,                  -- e.g. "crawlers.shed_gov_bd"
  scraper_config    JSONB DEFAULT '{}',
  credibility_score FLOAT DEFAULT 0.8 CHECK (credibility_score BETWEEN 0 AND 1),
  country_focus     TEXT[],               -- ISO-2 codes, e.g. ['BD']
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- OPPORTUNITIES — core table
-- ============================================================

CREATE TABLE IF NOT EXISTS opportunities (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title               TEXT NOT NULL,
  type                opportunity_type NOT NULL DEFAULT 'scholarship',
  host_country        TEXT[] NOT NULL DEFAULT '{}',
  eligible_nations    TEXT[] NOT NULL DEFAULT '{"ALL"}',
  ineligible_nations  TEXT[] NOT NULL DEFAULT '{}',
  field_of_study      TEXT[] NOT NULL DEFAULT '{}',
  degree_level        degree_level NOT NULL DEFAULT 'any',
  funding_type        funding_type,
  amount_usd          NUMERIC(12,2),
  currency            TEXT,
  deadline            DATE,
  open_date           DATE,
  status              opportunity_status NOT NULL DEFAULT 'open',
  description         TEXT NOT NULL DEFAULT '',
  eligibility_text    TEXT,
  requirements        TEXT[] NOT NULL DEFAULT '{}',
  apply_url           TEXT NOT NULL,
  source_url          TEXT NOT NULL,
  source_name         TEXT NOT NULL,
  source_id           UUID REFERENCES sources(id) ON DELETE SET NULL,
  is_verified         BOOLEAN NOT NULL DEFAULT FALSE,
  is_featured         BOOLEAN NOT NULL DEFAULT FALSE,
  scam_score          FLOAT NOT NULL DEFAULT 0 CHECK (scam_score BETWEEN 0 AND 1),
  fingerprint         TEXT UNIQUE,         -- SHA256 for dedup
  embedding_id        TEXT,               -- Pinecone vector ID
  raw_html_path       TEXT,               -- S3/R2 path for archived snapshot
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_opp_title_fts
  ON opportunities USING gin(to_tsvector('english', title || ' ' || COALESCE(description, '')));

-- Filter indexes
CREATE INDEX IF NOT EXISTS idx_opp_type       ON opportunities(type);
CREATE INDEX IF NOT EXISTS idx_opp_status     ON opportunities(status);
CREATE INDEX IF NOT EXISTS idx_opp_deadline   ON opportunities(deadline);
CREATE INDEX IF NOT EXISTS idx_opp_eligible   ON opportunities USING gin(eligible_nations);
CREATE INDEX IF NOT EXISTS idx_opp_host       ON opportunities USING gin(host_country);
CREATE INDEX IF NOT EXISTS idx_opp_field      ON opportunities USING gin(field_of_study);
CREATE INDEX IF NOT EXISTS idx_opp_degree     ON opportunities(degree_level);
CREATE INDEX IF NOT EXISTS idx_opp_featured   ON opportunities(is_featured) WHERE is_featured = TRUE;

-- ============================================================
-- USERS — student profiles
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email             TEXT UNIQUE NOT NULL,
  full_name         TEXT,
  nationality       TEXT[] NOT NULL DEFAULT '{}',   -- ISO-2 codes
  residence         TEXT,
  field_of_study    TEXT[] NOT NULL DEFAULT '{}',
  degree_level      degree_level,
  target_countries  TEXT[] NOT NULL DEFAULT '{}',
  languages         TEXT[] NOT NULL DEFAULT '{}',
  gpa               NUMERIC(3,2),
  has_publications  BOOLEAN DEFAULT FALSE,
  digest_frequency  digest_frequency NOT NULL DEFAULT 'weekly',
  telegram_id       TEXT,
  onboarded         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- BOOKMARKS
-- ============================================================

CREATE TABLE IF NOT EXISTS bookmarks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opportunity_id  UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, opportunity_id)
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(user_id);

-- ============================================================
-- ALERTS — deadline & status notifications
-- ============================================================

CREATE TABLE IF NOT EXISTS alerts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opportunity_id  UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  alert_type      alert_type NOT NULL,
  channel         alert_channel NOT NULL DEFAULT 'email',
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_alerts_unsent ON alerts(sent_at) WHERE sent_at IS NULL;

-- ============================================================
-- COMMUNITY SUBMISSIONS — user-submitted opportunities
-- ============================================================

CREATE TABLE IF NOT EXISTS submissions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submitted_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  apply_url       TEXT NOT NULL,
  source_url      TEXT,
  raw_text        TEXT,
  status          TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected | spam
  ai_validation   JSONB,   -- Claude's classification result
  reviewer_note   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- UPDATED_AT TRIGGER (applies to all tables)
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_opp_updated     ON opportunities;
DROP TRIGGER IF EXISTS trg_users_updated   ON users;
DROP TRIGGER IF EXISTS trg_sources_updated ON sources;

CREATE TRIGGER trg_opp_updated
  BEFORE UPDATE ON opportunities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_users_updated
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_sources_updated
  BEFORE UPDATE ON sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY (Supabase)
-- ============================================================

ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookmarks     ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts        ENABLE ROW LEVEL SECURITY;

-- Public read on opportunities
DROP POLICY IF EXISTS "opportunities_public_read" ON opportunities;
CREATE POLICY "opportunities_public_read"
  ON opportunities FOR SELECT USING (TRUE);

-- Users can only read/update their own profile
DROP POLICY IF EXISTS "users_own_profile" ON users;
CREATE POLICY "users_own_profile"
  ON users FOR ALL USING (auth.uid() = id);

-- Bookmarks: own only
DROP POLICY IF EXISTS "bookmarks_own" ON bookmarks;
CREATE POLICY "bookmarks_own"
  ON bookmarks FOR ALL USING (auth.uid() = user_id);

-- Alerts: own only
DROP POLICY IF EXISTS "alerts_own" ON alerts;
CREATE POLICY "alerts_own"
  ON alerts FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- SEED: SOURCE REGISTRY
-- ============================================================

INSERT INTO sources (name, base_url, source_type, crawl_frequency, scraper_module, country_focus, credibility_score) VALUES
  ('SHED MoEdu BD',         'https://shed.gov.bd/pages/moedu-scholarships', 'website', '12 hours', 'shed_gov_bd',    '{BD}', 1.0),
  ('EURAXESS',              'https://euraxess.ec.europa.eu',                 'website', '6 hours',  'euraxess',       '{}',   0.98),
  ('DAAD',                  'https://www.daad.de',                           'website', '12 hours', 'daad',           '{}',   0.98),
  ('OpportunityDesk',       'https://opportunitydesk.org',                   'website', '12 hours', 'opportunitydesk','{}',   0.85),
  ('The Daily Star BD',     'https://www.thedailystar.net',                  'website', '6 hours',  'daily_star_bd',  '{BD}', 0.9),
  ('Chevening',             'https://www.chevening.org',                     'website', '24 hours', 'chevening',      '{}',   0.99),
  ('Australian Awards BD',  'https://www.australiaawardsbangladesh.org',     'website', '24 hours', 'australian_awards_bd', '{BD}', 0.99),
  ('FindAPhD',              'https://www.findaphd.com',                      'website', '12 hours', 'findaphd',       '{}',   0.9),
  ('scholars4dev',          'https://scholars4dev.com',                      'website', '12 hours', 'scholars4dev',   '{}',   0.85),
  ('UGC Bangladesh',        'https://www.ugc.gov.bd',                        'website', '24 hours', 'ugc_bd',         '{BD}', 0.95)
ON CONFLICT DO NOTHING;
