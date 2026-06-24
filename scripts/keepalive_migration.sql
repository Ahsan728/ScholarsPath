-- Tiny table used purely as a write target for the daily keepalive
-- ping. Supabase pauses free-tier projects after ~7 days with no
-- database activity (dashboard logins and cached API responses do NOT
-- count). The companion workflow .github/workflows/keepalive.yml does
-- a daily INSERT here so the inactivity timer never reaches the cap.
--
-- Schema choice notes
--   - id BIGINT IDENTITY  : trivial, monotonic, no client work needed.
--   - pinged_at TIMESTAMPTZ DEFAULT now() : default fills server-side
--     so the workflow can POST `{}` with no body and still get a row.
--
-- Apply once via the Supabase dashboard SQL editor.

CREATE TABLE IF NOT EXISTS keepalive (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pinged_at  TIMESTAMPTZ DEFAULT now()
);

-- Optional: keep the table tiny by deleting rows older than 30 days
-- on every insert. Comment out if you'd rather not run a trigger.
CREATE OR REPLACE FUNCTION trim_keepalive() RETURNS trigger AS $$
BEGIN
  DELETE FROM keepalive WHERE pinged_at < now() - INTERVAL '30 days';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trim_keepalive_trigger ON keepalive;
CREATE TRIGGER trim_keepalive_trigger
  AFTER INSERT ON keepalive
  EXECUTE FUNCTION trim_keepalive();
