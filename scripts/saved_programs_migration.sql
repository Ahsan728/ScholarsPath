-- ============================================================
-- Saved Programs (bookmarks)
--
-- Lets logged-in users save programs to their account for later.
-- Heart/bookmark icon on every ProgramCard; list at /account.
--
-- Run in Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS saved_programs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  program_id  UUID NOT NULL REFERENCES masters_programs(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sp_user_program
  ON saved_programs (user_id, program_id);
CREATE INDEX IF NOT EXISTS idx_sp_user
  ON saved_programs (user_id, created_at DESC);

ALTER TABLE saved_programs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users insert own" ON saved_programs;
CREATE POLICY "users insert own" ON saved_programs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "users read own" ON saved_programs;
CREATE POLICY "users read own" ON saved_programs
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "users delete own" ON saved_programs;
CREATE POLICY "users delete own" ON saved_programs
  FOR DELETE USING (auth.uid() = user_id);

GRANT ALL ON saved_programs TO service_role;
