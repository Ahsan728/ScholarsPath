-- ============================================================
-- Program Feedback Migration
-- Lets logged-in users report inaccuracies on /programs/[id] pages.
-- Admin reviews in /admin/feedback and (Phase 2) AI suggests updates.
--
-- Run in Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS program_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id      UUID NOT NULL REFERENCES masters_programs(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  user_email      TEXT,
  issue_type      TEXT NOT NULL CHECK (issue_type IN (
                    'wrong_requirement','broken_link','missing_info',
                    'incorrect_tuition','outdated_info','other'
                  )),
  field           TEXT,            -- which column (tuition, ielts_min, apply_url, requirements, deadline...)
  current_value   TEXT,            -- what the user sees on the page right now
  suggested_value TEXT,            -- what they think it should be
  evidence_url    TEXT,            -- their source / proof
  notes           TEXT,            -- free-form details
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','resolved','rejected')),
  admin_note      TEXT,            -- admin's resolution note (visible only to admin)
  ai_analysis     JSONB,           -- Phase 2: structured suggestion from Claude
  reviewed_by     TEXT,
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pf_status     ON program_feedback(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pf_program    ON program_feedback(program_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pf_issue_type ON program_feedback(issue_type);

ALTER TABLE program_feedback ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can submit feedback (user_id checked server-side).
DROP POLICY IF EXISTS "anyone insert"        ON program_feedback;
CREATE POLICY "anyone insert" ON program_feedback
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Users can see only their own submissions.
DROP POLICY IF EXISTS "users read own"       ON program_feedback;
CREATE POLICY "users read own" ON program_feedback
  FOR SELECT USING (auth.uid() = user_id);

GRANT ALL ON program_feedback TO service_role;
