import { NextRequest, NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase"

function ensureAdmin(req: NextRequest): NextResponse | null {
  if (req.cookies.get("admin_auth")?.value !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return null
}

// PATCH body: { status: 'resolved'|'rejected', admin_note?: string,
//                apply?: { field, value } }
// When `apply` is provided, the corresponding masters_programs column is
// updated in-place (admin already verified the change is correct).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureAdmin(req); if (denied) return denied

  const { id } = params
  const body = await req.json().catch(() => ({}))
  const status: string = body.status
  const adminNote: string | null = (body.admin_note ?? "").trim() || null
  const apply: { field: string; value: any } | undefined = body.apply

  if (!["resolved", "rejected"].includes(status)) {
    return NextResponse.json({ error: "status must be 'resolved' or 'rejected'" }, { status: 400 })
  }

  // Fetch feedback row to know which program it belongs to
  const { data: fb, error: fbErr } = await adminSupabase
    .from("program_feedback")
    .select("id, program_id, status")
    .eq("id", id)
    .maybeSingle()
  if (fbErr || !fb) {
    return NextResponse.json({ error: fbErr?.message ?? "Feedback not found" }, { status: 404 })
  }

  // Optional: apply the suggested correction directly to the program.
  if (status === "resolved" && apply && apply.field) {
    const safeFields = new Set([
      "apply_url", "source_url", "tuition_usd_year", "duration_years",
      "ielts_min", "gpa_min", "deadline", "intake", "language",
      "scholarship_available", "description",
    ])
    if (!safeFields.has(apply.field)) {
      return NextResponse.json({ error: "field is not allowed for direct update" }, { status: 400 })
    }
    const { error: updateErr } = await adminSupabase
      .from("masters_programs")
      .update({ [apply.field]: apply.value })
      .eq("id", fb.program_id)
    if (updateErr) {
      return NextResponse.json({ error: `Failed to update program: ${updateErr.message}` }, { status: 500 })
    }
  }

  const { error } = await adminSupabase
    .from("program_feedback")
    .update({
      status,
      admin_note: adminNote,
      reviewed_at: new Date().toISOString(),
      reviewed_by: "admin",
    })
    .eq("id", id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
