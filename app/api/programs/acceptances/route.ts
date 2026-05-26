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
    gpa, gpa_scale, ielts_score, toefl_score,
    publications_count, publications_text,
    bachelor_subject, bachelor_university,
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

  // Profile-field validation (all nullable)
  const num = (v: any) => (v === "" || v === null || v === undefined) ? null : Number(v)
  const gpaN          = num(gpa)
  const gpaScaleN     = num(gpa_scale) ?? 4.0
  const ieltsN        = num(ielts_score)
  const toeflN        = num(toefl_score)
  const pubsCountN    = num(publications_count)
  if (gpaN !== null && (!Number.isFinite(gpaN) || gpaN < 0 || gpaN > 10)) {
    return NextResponse.json({ error: "gpa must be 0-10" }, { status: 400 })
  }
  if (ieltsN !== null && (!Number.isFinite(ieltsN) || ieltsN < 0 || ieltsN > 9)) {
    return NextResponse.json({ error: "ielts_score must be 0-9" }, { status: 400 })
  }
  if (toeflN !== null && (!Number.isFinite(toeflN) || toeflN < 0 || toeflN > 120)) {
    return NextResponse.json({ error: "toefl_score must be 0-120" }, { status: 400 })
  }
  if (pubsCountN !== null && (!Number.isInteger(pubsCountN) || pubsCountN < 0 || pubsCountN > 999)) {
    return NextResponse.json({ error: "publications_count must be 0-999" }, { status: 400 })
  }

  // Confirm program exists
  const { data: prog } = await adminSupabase
    .from("masters_programs").select("id").eq("id", program_id).maybeSingle()
  if (!prog) return NextResponse.json({ error: "Program not found" }, { status: 404 })

  await ensureUserRow(user)

  const record = {
    program_id,
    user_id: user.id,
    country: country.trim().slice(0, 80),
    status,
    intake_year: year,
    intake_semester: intake_semester || null,
    notes:                 notes              ? String(notes).trim().slice(0, 1000) : null,
    gpa:                   gpaN,
    gpa_scale:             gpaN !== null ? gpaScaleN : null,
    ielts_score:           ieltsN,
    toefl_score:           toeflN,
    publications_count:    pubsCountN,
    publications_text:     publications_text  ? String(publications_text).trim().slice(0, 2000) : null,
    bachelor_subject:      bachelor_subject   ? String(bachelor_subject).trim().slice(0, 120)   : null,
    bachelor_university:   bachelor_university? String(bachelor_university).trim().slice(0, 200): null,
    submitted_by: "user",
  }

  // Application-layer single-row-per-(user, program): check, then INSERT
  // or UPDATE. We don't use ON CONFLICT because PostgREST can't bind it to
  // partial unique indexes.
  const { data: existing } = await adminSupabase
    .from("student_acceptances")
    .select("id")
    .eq("user_id", user.id)
    .eq("program_id", program_id)
    .maybeSingle()

  if (existing) {
    const { error } = await adminSupabase
      .from("student_acceptances")
      .update(record)
      .eq("id", existing.id)
    if (error) {
      console.error("[programs/acceptances] update failed:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, updated: true })
  } else {
    const { error } = await adminSupabase.from("student_acceptances").insert(record)
    if (error) {
      console.error("[programs/acceptances] insert failed:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, inserted: true })
  }
}
