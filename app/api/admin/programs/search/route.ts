import { NextRequest, NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase"

// Admin-only typeahead search for masters_programs. Used by the
// /admin/acceptances "Add record" form to pick a program by name/university.

function ensureAdmin(req: NextRequest): NextResponse | null {
  if (req.cookies.get("admin_auth")?.value !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return null
}

export async function GET(req: NextRequest) {
  const denied = ensureAdmin(req); if (denied) return denied

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim()
  if (q.length < 3) return NextResponse.json({ results: [] })

  // OR-search across program_name and university (case-insensitive)
  const term = q.replace(/[%_]/g, "\\$&")
  const { data, error } = await adminSupabase
    .from("masters_programs")
    .select("id, program_name, university, country")
    .or(`program_name.ilike.%${term}%,university.ilike.%${term}%`)
    .eq("is_active", true)
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ results: data ?? [] })
}
