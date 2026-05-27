import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { adminSupabase } from "@/lib/supabase"

async function getUser(req: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n: string) => req.cookies.get(n)?.value, set: () => {}, remove: () => {} } }
  )
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user ?? null
}

// GET: return user's saved program IDs (lightweight, for rendering heart icons)
export async function GET(req: NextRequest) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ ids: [] })
  const { data } = await adminSupabase
    .from("saved_programs")
    .select("program_id")
    .eq("user_id", user.id)
    .limit(500)
  return NextResponse.json({ ids: (data ?? []).map((r: any) => r.program_id) })
}

// POST: toggle save/unsave for a program
export async function POST(req: NextRequest) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: "Please sign in to save programs" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const programId = body.program_id
  if (!programId) return NextResponse.json({ error: "program_id required" }, { status: 400 })

  // Check if already saved
  const { data: existing } = await adminSupabase
    .from("saved_programs")
    .select("id")
    .eq("user_id", user.id)
    .eq("program_id", programId)
    .maybeSingle()

  if (existing) {
    // Unsave
    await adminSupabase.from("saved_programs").delete().eq("id", existing.id)
    return NextResponse.json({ saved: false })
  } else {
    // Save
    const { error } = await adminSupabase.from("saved_programs").insert({
      user_id: user.id,
      program_id: programId,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ saved: true })
  }
}
