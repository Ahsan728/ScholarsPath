import { NextRequest, NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase"

// Admin-only CRUD for the opportunity_sources registry. Backs /admin/sources.

const ALLOWED_SCOPES = new Set([
  "pan_european", "national_portal", "regional",
  "university", "funding_body", "aggregator",
])

function ensureAdmin(req: NextRequest): NextResponse | null {
  if (req.cookies.get("admin_auth")?.value !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return null
}

export async function GET(req: NextRequest) {
  const denied = ensureAdmin(req); if (denied) return denied
  const { data, error } = await adminSupabase
    .from("opportunity_sources")
    .select("*")
    .order("country", { ascending: true, nullsFirst: false })
    .order("scope", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(1000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sources: data ?? [] })
}

export async function POST(req: NextRequest) {
  const denied = ensureAdmin(req); if (denied) return denied
  const body = await req.json().catch(() => ({}))
  const url: string = (body.url ?? "").trim()
  const country: string | null = body.country?.trim() || null
  const scope: string = body.scope
  const title: string | null = body.title?.trim() || null
  const notes: string | null = body.notes?.trim() || null

  if (!url.startsWith("http")) {
    return NextResponse.json({ error: "url must start with http:// or https://" }, { status: 400 })
  }
  if (!ALLOWED_SCOPES.has(scope)) {
    return NextResponse.json({ error: `scope must be one of ${Array.from(ALLOWED_SCOPES).join(", ")}` }, { status: 400 })
  }

  // Check existing by lower(url) — the table has a unique index on the
  // expression but PostgREST can't filter via expression directly, so use
  // a plain ilike (case-insensitive equality) instead.
  const { data: existing } = await adminSupabase
    .from("opportunity_sources")
    .select("id, url")
    .ilike("url", url)
    .limit(1)
    .maybeSingle()
  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true, id: existing.id })
  }

  const { data, error } = await adminSupabase
    .from("opportunity_sources")
    .insert({
      url, country, scope, title, notes,
      added_by: "admin",
    })
    .select("id")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: (data as any)?.id })
}

export async function DELETE(req: NextRequest) {
  const denied = ensureAdmin(req); if (denied) return denied
  const id = req.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id query param required" }, { status: 400 })
  const { error } = await adminSupabase
    .from("opportunity_sources")
    .delete()
    .eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
