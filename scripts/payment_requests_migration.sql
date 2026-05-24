-- ============================================================
-- Payment Requests Migration
-- Manual payment verification flow: users submit bank/bKash/PayPal/Wise
-- proof + receipt screenshot, admin approves to grant Pro tier.
-- Receipt files live in a private Supabase Storage bucket called 'receipts'
-- (must be created separately via the Supabase dashboard or storage API).
--
-- Run in Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS payment_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  email           TEXT NOT NULL,
  plan            TEXT NOT NULL CHECK (plan IN ('monthly','semi','annual')),
  amount_usd      NUMERIC(8,2) NOT NULL,
  method          TEXT NOT NULL CHECK (method IN ('bank','bkash','paypal','wise')),
  transaction_id  TEXT,
  receipt_path    TEXT,                          -- relative path inside the receipts bucket
  notes           TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected')),
  admin_note      TEXT,
  reviewed_by     TEXT,
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pr_status ON payment_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pr_user   ON payment_requests(user_id, created_at DESC);

ALTER TABLE payment_requests ENABLE ROW LEVEL SECURITY;

-- Users can insert their own row and read their own rows. Admin (service_role)
-- has full access to approve/reject.
DROP POLICY IF EXISTS "users insert own" ON payment_requests;
CREATE POLICY "users insert own" ON payment_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users read own" ON payment_requests;
CREATE POLICY "users read own" ON payment_requests
  FOR SELECT USING (auth.uid() = user_id);

GRANT ALL ON payment_requests TO service_role;

-- ============================================================
-- Reminder for manual setup (NOT done by this SQL):
-- 1. Create a private Storage bucket called "receipts" in the Supabase dashboard.
-- 2. Bucket policy: authenticated users INSERT to `{auth.uid()}/...` paths only;
--    service_role read-all.
-- 3. File size limit: 5 MB. Allowed MIME types: image/*, application/pdf.
-- ============================================================
