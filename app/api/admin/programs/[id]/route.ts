import { NextRequest, NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase"

// Admin-only direct edit endpoint for masters_programs.
// Whitelist of fields the triage UI is allowed to update — keep tight.

const ALLOWED_FIELDS = new Set([
  "apply_url", "source_url",
  "program_name",
  "tuition_usd_year", "duration_years",
  "ielts_min", "gpa_min",
  "deadline", "intake", "language",
  "scholarship_available", "description",
  "is_active",
  // Page Validator overrides — let admin clear/correct the verdict
  "page_status", "suggested_new_name", "language_status",
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

  // If we're rewriting the URL, reset the validation flags so the next
  // crawler pass re-checks them.
  if ("apply_url" in updates) {
    updates.url_status = null
    updates.url_http_code = null
    updates.url_final_url = null
    updates.url_checked_at = null
    updates.url_check_error = null
    updates.domain_match_status = null
    updates.domain_match_host = null
    updates.domain_match_checked_at = null
    updates.page_status = null
    updates.page_checked_at = null
  }
  // If we're renaming the program, recompute fingerprint downstream (the
  // Auditor will re-classify on next pass).
  if ("program_name" in updates) {
    updates.domain_match_status = null
    updates.domain_match_checked_at = null
  }

  const { error } = await adminSupabase
    .from("masters_programs")
    .update(updates)
    .eq("id", params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
