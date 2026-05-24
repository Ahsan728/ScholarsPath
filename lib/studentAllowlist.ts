import { adminSupabase } from "@/lib/supabase"

/**
 * Returns true if `email` matches a row in `student_allowlist`.
 * Comparison is case-insensitive (we always store lowercase).
 */
export async function isStudentEmail(email: string | null | undefined): Promise<boolean> {
  if (!email) return false
  const { data, error } = await adminSupabase
    .from("student_allowlist")
    .select("email")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle()
  if (error) {
    console.warn("[studentAllowlist] lookup error:", error.message)
    return false
  }
  return Boolean(data)
}

/**
 * If `email` is in the allowlist, upserts the user's subscriptions row
 * to `tier='student'`. Idempotent — safe to call on every login.
 *
 * Does NOT downgrade students who are no longer in the allowlist; admin must
 * manually edit `subscriptions` if they want to revoke a student.
 */
export async function ensureStudentTier(userId: string, email: string | null | undefined): Promise<void> {
  if (!email) return
  const allowed = await isStudentEmail(email)
  if (!allowed) return

  // Check current tier — only upgrade, never downgrade.
  const { data: sub } = await adminSupabase
    .from("subscriptions")
    .select("tier")
    .eq("user_id", userId)
    .maybeSingle()

  // Already student or pro? Leave it alone (pro is paid, so don't overwrite to student).
  if (sub?.tier === "student" || sub?.tier === "pro") return

  const { error } = await adminSupabase
    .from("subscriptions")
    .upsert(
      { user_id: userId, tier: "student", current_period_end: null },
      { onConflict: "user_id" }
    )
  if (error) {
    // FK violation here means public.users row doesn't exist yet.
    // Caller should have invoked ensureUserRow first; we log instead of throw
    // to avoid breaking the auth flow on a non-critical operation.
    console.warn("[ensureStudentTier] subscriptions upsert failed:", error.message)
  }
}
