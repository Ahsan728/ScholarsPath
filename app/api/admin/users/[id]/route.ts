import { NextRequest, NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase"

// Admin-only PATCH for a single user. Currently supports tier + period_end
// updates (which write into the `subscriptions` table — `users` itself
// doesn't carry tier). Other user fields are read-only from the admin UI.

const VALID_TIERS = new Set(["free", "pro", "student"])

function ensureAdmin(req: NextRequest): NextResponse | null {
  if (req.cookies.get("admin_auth")?.value !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return null
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureAdmin(req); if (denied) return denied

  const body = await req.json().catch(() => ({}))
  const tier = body.tier
  const periodEnd = body.current_period_end

  if (tier !== undefined && !VALID_TIERS.has(tier)) {
    return NextResponse.json({ error: "invalid tier" }, { status: 400 })
  }
  if (periodEnd !== undefined && periodEnd !== null && isNaN(Date.parse(periodEnd))) {
    return NextResponse.json({ error: "invalid current_period_end" }, { status: 400 })
  }

  // Make sure the user exists
  const { data: user } = await adminSupabase
    .from("users").select("id").eq("id", params.id).maybeSingle()
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

  // Upsert subscription row keyed by user_id
  const { data: existing } = await adminSupabase
    .from("subscriptions").select("id").eq("user_id", params.id).maybeSingle()

  const payload: Record<string, any> = {}
  if (tier !== undefined)      payload.tier = tier
  if (periodEnd !== undefined) payload.current_period_end = periodEnd
  if (tier === "free")         payload.current_period_end = null  // free has no period

  if (existing) {
    const { error } = await adminSupabase
      .from("subscriptions").update(payload).eq("id", (existing as any).id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await adminSupabase
      .from("subscriptions").insert({ user_id: params.id, tier: tier ?? "free", ...payload })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
