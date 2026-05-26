import { NextRequest, NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase"

const VALID_STATUSES = new Set([
  "accepted", "enrolled", "rejected", "waitlisted", "withdrew",
])
const VALID_SEMESTERS = new Set(["Fall", "Spring", "Summer"])

function ensureAdmin(req: NextRequest): NextResponse | null {
  if (req.cookies.get("admin_auth")?.value !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return null
}

// GET: list acceptances (newest first) with joined program info
export async function GET(req: NextRequest) {
  const denied = ensureAdmin(req); if (denied) return denied

  const status = req.nextUrl.searchParams.get("status")
  let q = adminSupabase
    .from("student_acceptances")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500)
  if (status) q = q.eq("status", status)
  const { data: rows, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Hydrate with program info
  const ids = Array.from(new Set((rows ?? []).map(r => r.program_id)))
  let progMap = new Map<string, any>()
  if (ids.length > 0) {
    const { data: progs } = await adminSupabase
      .from("masters_programs")
      .select("id, program_name, university, country")
      .in("id", ids)
    progMap = new Map((progs ?? []).map((p: any) => [p.id, p]))
  }
  const hydrated = (rows ?? []).map((r: any) => ({
    ...r,
    program: progMap.get(r.program_id) ?? null,
  }))
  return NextResponse.json({ rows: hydrated })
}

// POST: admin manually adds an acceptance (e.g., student DMs you)
export async function POST(req: NextRequest) {
  const denied = ensureAdmin(req); if (denied) return denied

  const body = await req.json().catch(() => ({}))
  const {
    program_id, country, status, intake_year, intake_semester, notes, admin_verified,
    gpa, gpa_scale, ielts_score, toefl_score,
    publications_count, publications_text,
    bachelor_subject, bachelor_university,
  } = body

  if (!program_id) return NextResponse.json({ error: "program_id is required" }, { status: 400 })
  if (!country || country.trim().length < 2) return NextResponse.json({ error: "country is required" }, { status: 400 })
  if (!VALID_STATUSES.has(status)) return NextResponse.json({ error: "invalid status" }, { status: 400 })
  if (intake_semester && !VALID_SEMESTERS.has(intake_semester)) return NextResponse.json({ error: "invalid intake_semester" }, { status: 400 })
  const year = intake_year ? Number(intake_year) : null
  if (year !== null && (!Number.isInteger(year) || year < 2020 || year > 2035)) {
    return NextResponse.json({ error: "intake_year must be between 2020 and 2035" }, { status: 400 })
  }

  const { data: prog } = await adminSupabase
    .from("masters_programs").select("id").eq("id", program_id).maybeSingle()
  if (!prog) return NextResponse.json({ error: "Program not found" }, { status: 404 })

  const num = (v: any) => (v === "" || v === null || v === undefined) ? null : Number(v)

  const { data, error } = await adminSupabase.from("student_acceptances").insert({
    program_id,
    user_id: null,                                    // admin-added, no user account linked
    country: country.trim().slice(0, 80),
    status,
    intake_year: year,
    intake_semester: intake_semester || null,
    notes:               notes ? String(notes).trim().slice(0, 1000) : null,
    gpa:                 num(gpa),
    gpa_scale:           num(gpa) !== null ? (num(gpa_scale) ?? 4.0) : null,
    ielts_score:         num(ielts_score),
    toefl_score:         num(toefl_score),
    publications_count:  num(publications_count),
    publications_text:   publications_text   ? String(publications_text).trim().slice(0, 2000) : null,
    bachelor_subject:    bachelor_subject    ? String(bachelor_subject).trim().slice(0, 120)   : null,
    bachelor_university: bachelor_university ? String(bachelor_university).trim().slice(0, 200): null,
    submitted_by: "admin",
    admin_verified: admin_verified === true,
  }).select("id").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: (data as any)?.id })
}
