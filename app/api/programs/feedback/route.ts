import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { adminSupabase } from "@/lib/supabase"
import { ensureUserRow } from "@/lib/userBootstrap"

const VALID_ISSUE_TYPES = new Set([
  "wrong_requirement",
  "broken_link",
  "missing_info",
  "incorrect_tuition",
  "outdated_info",
  "other",
])

async function getUser(req: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n: string) => req.cookies.get(n)?.value, set: () => {}, remove: () => {} } }
  )
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user ?? null
}

export async function POST(req: NextRequest) {
  const user = await getUser(req)
  if (!user) {
    return NextResponse.json({ error: "Please sign in to report an issue" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const {
    program_id, issue_type, field, current_value, suggested_value, evidence_url, notes,
  } = body

  if (!program_id || typeof program_id !== "string") {
    return NextResponse.json({ error: "program_id is required" }, { status: 400 })
  }
  if (!VALID_ISSUE_TYPES.has(issue_type)) {
    return NextResponse.json({ error: "invalid issue_type" }, { status: 400 })
  }
  if (!notes || String(notes).trim().length < 10) {
    return NextResponse.json({ error: "Please describe the issue (at least 10 characters)" }, { status: 400 })
  }

  // Confirm the program exists (cheap, avoids polluting the table with bad IDs)
  const { data: prog, error: progErr } = await adminSupabase
    .from("masters_programs")
    .select("id")
    .eq("id", program_id)
    .maybeSingle()
  if (progErr || !prog) {
    return NextResponse.json({ error: "Program not found" }, { status: 404 })
  }

  // Bootstrap public.users row before inserting (FK on user_id).
  await ensureUserRow(user)

  // Rate-limit: max 5 submissions per user per program per day. Prevents abuse.
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count } = await adminSupabase
    .from("program_feedback")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("program_id", program_id)
    .gte("created_at", dayAgo)
  if ((count ?? 0) >= 5) {
    return NextResponse.json(
      { error: "You've already submitted 5 feedback items for this program in the last 24h. Thanks — we'll review them." },
      { status: 429 }
    )
  }

  const { error } = await adminSupabase.from("program_feedback").insert({
    program_id,
    user_id: user.id,
    user_email: user.email ?? null,
    issue_type,
    field: field ? String(field).slice(0, 60) : null,
    current_value: current_value ? String(current_value).slice(0, 500) : null,
    suggested_value: suggested_value ? String(suggested_value).slice(0, 500) : null,
    evidence_url: evidence_url ? String(evidence_url).slice(0, 500) : null,
    notes: String(notes).slice(0, 2000),
    status: "pending",
  })

  if (error) {
    console.error("[programs/feedback] insert failed:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
