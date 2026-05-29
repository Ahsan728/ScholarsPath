-- ============================================================
-- JS render support for opportunity_sources (Phase 1B)
--
-- Marks sources that need Playwright/Chromium rendering (React/Angular
-- SPAs that ship an empty HTML shell). The Discoverer reads this flag
-- and routes to the Cloud Run browser-fetch service when true,
-- otherwise uses the existing httpx path.
--
-- max_pages caps pagination on JS sources to prevent runaway loops.
-- Default is conservative; bump per-source for big catalogs like EURAXESS.
-- ============================================================

ALTER TABLE opportunity_sources
  ADD COLUMN IF NOT EXISTS js_render BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_pages INTEGER NOT NULL DEFAULT 50;

-- Help the auto-detect step ("if httpx returned <500 chars, flag this
-- source for JS render next time") find candidates quickly.
CREATE INDEX IF NOT EXISTS idx_opp_sources_js_render
  ON opportunity_sources (js_render);
