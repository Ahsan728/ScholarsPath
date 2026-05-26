import { NextRequest, NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase"

// Admin PATCH endpoint for a single agent_definitions row. Whitelisted
// fields only; everything else (crawler name, description, created_at) is
// immutable from the UI.

const ALLOWED_FIELDS = new Set([
  "mode",
  "bootstrap_schedule",
  "steady_schedule",
  "max_usd_per_run",
  "max_usd_per_month",
  "alert_on_failure",
  "enabled",
  "params",
])

const ALLOWED_MODES = new Set(["bootstrap", "steady", "paused"])

function ensureAdmin(req: NextRequest): NextResponse | null {
  if (req.cookies.get("admin_auth")?.value !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return null
}

export async function PATCH(req: NextRequest, { params }: { params: { name: string } }) {
  const denied = ensureAdmin(req); if (denied) return denied

  const body = await req.json().catch(() => ({}))
  const updates: Record<string, any> = {}
  for (const [k, v] of Object.entries(body)) {
    if (!ALLOWED_FIELDS.has(k)) continue
    if (k === "mode" && !ALLOWED_MODES.has(v as string)) {
      return NextResponse.json({ error: `mode must be one of ${Array.from(ALLOWED_MODES).join(", ")}` }, { status: 400 })
    }
    if ((k === "max_usd_per_run" || k === "max_usd_per_month") && (typeof v !== "number" || v < 0)) {
      return NextResponse.json({ error: `${k} must be a non-negative number` }, { status: 400 })
    }
    updates[k] = v
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No allowed fields in request" }, { status: 400 })
  }

  const { error } = await adminSupabase
    .from("agent_definitions")
    .update(updates)
    .eq("crawler", params.name)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
