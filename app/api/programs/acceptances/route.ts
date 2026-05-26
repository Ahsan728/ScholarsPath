import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { adminSupabase } from "@/lib/supabase"
import { ensureUserRow } from "@/lib/userBootstrap"

// Public POST: logged-in user records their own acceptance.
// Public GET (with ?program_id=): returns aggregated anonymous stats only.

const VALID_STATUSES = new Set([
  "accepted", "enrolled", "rejected", "waitlisted", "withdrew",
])
const VALID_SEMESTERS = new Set(["Fall", "Spring", "Summer"])

async function getUser(req: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n: string) => req.cookies.get(n)?.value, set: () => {}, remove: () => {} } }
  )
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user ?? null
}

// ─── GET: anonymous aggregates for a program ─────────────────
export async function GET(req: NextRequest) {
  const programId = req.nextUrl.searchParams.get("program_id")
  if (!programId) {
    return NextResponse.json({ error: "program_id is required" }, { status: 400 })
  }
  const { data, error } = await adminSupabase
    .from("student_acceptances")
    .select("country, status, intake_year, intake_semester")
    .eq("program_id", programId)
    .limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = data ?? []
  const total = rows.length
  const accepted_or_enrolled = rows.filter(
    r => r.status === "accepted" || r.status === "enrolled"
  ).length
  const byCountry: Record<string, number> = {}
  const byYear: Record<string, number> = {}
  for (const r of rows) {
    if (r.country) byCountry[r.country] = (byCountry[r.country] ?? 0) + 1
    if (r.intake_year) byYear[String(r.intake_year)] = (byYear[String(r.intake_year)] ?? 0) + 1
  }
  return NextResponse.json({
    total,
    accepted_or_enrolled,
    by_country: byCountry,
    by_year: byYear,
  })
}

// ─── POST: logged-in user records their acceptance ───────────
export async function POST(req: NextRequest) {
  const user = await getUser(req)
  if (!user) {
    return NextResponse.json({ error: "Please sign in to record your acceptance" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const {
    program_id, country, status, intake_year, intake_semester, notes,
  } = body

  if (!program_id || typeof program_id !== "string") {
    return NextResponse.json({ error: "program_id is required" }, { status: 400 })
  }
  if (!country || typeof country !== "string" || country.trim().length < 2) {
    return NextResponse.json({ error: "country is required" }, { status: 400 })
  }
  if (!VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 })
  }
  if (intake_semester && !VALID_SEMESTERS.has(intake_semester)) {
    return NextResponse.json({ error: "intake_semester must be Fall, Spring or Summer" }, { status: 400 })
  }
  const year = intake_year ? Number(intake_year) : null
  if (year !== null && (!Number.isInteger(year) || year < 2020 || year > 2035)) {
    return NextResponse.json({ error: "intake_year must be between 2020 and 2035" }, { status: 400 })
  }

  // Confirm program exists
  const { data: prog } = await adminSupabase
    .from("masters_programs").select("id").eq("id", program_id).maybeSingle()
  if (!prog) return NextResponse.json({ error: "Program not found" }, { status: 404 })

  await ensureUserRow(user)

  // Upsert by (user_id, program_id) — the unique index handles the rest
  const { error } = await adminSupabase.from("student_acceptances").upsert({
    program_id,
    user_id: user.id,
    country: country.trim().slice(0, 80),
    status,
    intake_year: year,
    intake_semester: intake_semester || null,
    notes: notes ? String(notes).trim().slice(0, 1000) : null,
    submitted_by: "user",
  }, { onConflict: "user_id,program_id" })

  if (error) {
    console.error("[programs/acceptances] upsert failed:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
