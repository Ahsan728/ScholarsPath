import { NextRequest, NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase"

// Admin-only PATCH (hide/show, manual field edits) + DELETE for opportunities.

const ALLOWED_FIELDS = new Set([
  "is_active",
  "title", "description",
  "country", "degree_level", "field_of_study",
  "amount_usd", "amount_text", "funding_type",
  "eligibility_text", "eligible_nations", "ineligible_nations",
  "deadline", "deadline_text", "intake",
  "apply_url",
])

function ensureAdmin(req: NextRequest): NextResponse | null {
  if (req.cookies.get("admin_auth")?.value !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return null
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureAdmin(req); if (denied) return denied
  const body = await req.json().catch(() => ({}))
  const updates: Record<string, any> = {}
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED_FIELDS.has(k)) updates[k] = v
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No allowed fields in request" }, { status: 400 })
  }
  const { error } = await adminSupabase
    .from("opportunities").update(updates).eq("id", params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureAdmin(req); if (denied) return denied
  const { error } = await adminSupabase
    .from("opportunities").delete().eq("id", params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
