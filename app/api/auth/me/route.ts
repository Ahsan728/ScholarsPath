import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { adminSupabase } from "@/lib/supabase"
import { ensureUserRow } from "@/lib/userBootstrap"
import { ensureStudentTier } from "@/lib/studentAllowlist"
import type { UserTier } from "@/types"

export const dynamic = "force-dynamic"

/**
 * Lightweight endpoint that returns the current user's id, email, and tier.
 * Called by the Navbar after each auth state change so the tier badge
 * reflects subscription updates (e.g., a payment approval bumps Free→Pro).
 *
 * Returns 200 with {tier:'free'} for unauthenticated users (not 401) so the
 * Navbar's tier badge logic is simpler.
 */
export async function GET(req: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n: string) => req.cookies.get(n)?.value, set: () => {}, remove: () => {} } }
  )
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ user: null, tier: "free" as UserTier })
  }

  // Backfill: existing auth users who signed up before the bootstrap fix
  // get their public.users row created on first /me call after the fix.
  // Idempotent — no-op once the row exists.
  await ensureUserRow(session.user)
  await ensureStudentTier(session.user.id, session.user.email)

  const { data: sub } = await adminSupabase
    .from("subscriptions")
    .select("tier")
    .eq("user_id", session.user.id)
    .maybeSingle()

  const tier = (sub?.tier as UserTier) ?? "free"
  return NextResponse.json({
    user: { id: session.user.id, email: session.user.email },
    tier,
  })
}
