-- ============================================================
-- Opportunity validation columns (Phase 0)
--
-- Adds URL + page status tracking to discovered_opportunities,
-- mirroring the schema already present on masters_programs. Lets the
-- new validate_opportunity_urls.py and validate_opportunity_pages.py
-- crawlers classify every opportunity URL the same way we classify
-- program URLs.
--
-- After running, every row should eventually have:
--   url_status = 'ok' AND page_status = 'specific_match'
-- before it appears on the public site.
-- ============================================================

ALTER TABLE discovered_opportunities
  ADD COLUMN IF NOT EXISTS url_status      TEXT,
  ADD COLUMN IF NOT EXISTS url_http_code   INTEGER,
  ADD COLUMN IF NOT EXISTS url_final_url   TEXT,
  ADD COLUMN IF NOT EXISTS url_checked_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS url_check_error TEXT,
  ADD COLUMN IF NOT EXISTS page_status     TEXT,
  ADD COLUMN IF NOT EXISTS page_title      TEXT,
  ADD COLUMN IF NOT EXISTS page_checked_at TIMESTAMPTZ;

-- url_status values mirror masters_programs:
--   'ok' | 'dead' | 'redirect' | 'wrong_domain' | 'timeout' | NULL (unchecked)
-- page_status values:
--   'specific_match'      title appears on the page (good)
--   'name_changed'        page is alive but title doesn't appear (might need rename)
--   'not_found'           page is alive but 404-style content
--   'unreachable'         couldn't fetch
--   NULL                  unchecked

CREATE INDEX IF NOT EXISTS idx_disc_url_status_active
  ON discovered_opportunities (url_status)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_disc_page_status_active
  ON discovered_opportunities (page_status)
  WHERE is_active = true;
