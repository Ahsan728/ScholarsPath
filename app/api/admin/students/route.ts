import { NextRequest, NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase"

// Middleware already gates /api/admin/* via the admin_auth cookie check —
// see middleware.ts. But middleware's matcher excludes /api by default
// in the current config, so we double-check here for safety.
function ensureAdmin(req: NextRequest): NextResponse | null {
  const cookie = req.cookies.get("admin_auth")?.value
  if (cookie !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return null
}

export async function GET(req: NextRequest) {
  const denied = ensureAdmin(req); if (denied) return denied

  const { data, error } = await adminSupabase
    .from("student_allowlist")
    .select("*")
    .order("added_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ students: data ?? [] })
}

// Accepts either { email: "x" } for a single add, or { emails: ["a", "b"] }
// for bulk (newline-pasted from the admin form). Optional notes apply to all.
export async function POST(req: NextRequest) {
  const denied = ensureAdmin(req); if (denied) return denied

  const body = await req.json().catch(() => ({}))
  const notes: string | null = body.notes ?? null
  const raw: string[] =
    Array.isArray(body.emails)
      ? body.emails
      : body.email ? [body.email] : []

  const emails = Array.from(new Set(
    raw
      .map((e: string) => String(e || "").trim().toLowerCase())
      .filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
  ))

  if (emails.length === 0) {
    return NextResponse.json({ error: "No valid emails provided" }, { status: 400 })
  }

  const rows = emails.map(email => ({ email, notes, added_by: "admin" }))
  const { error } = await adminSupabase
    .from("student_allowlist")
    .upsert(rows, { onConflict: "email" })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ added: emails.length, emails })
}

export async function DELETE(req: NextRequest) {
  const denied = ensureAdmin(req); if (denied) return denied

  const { searchParams } = req.nextUrl
  const email = searchParams.get("email")?.trim().toLowerCase()
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 })

  const { error } = await adminSupabase
    .from("student_allowlist")
    .delete()
    .eq("email", email)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
