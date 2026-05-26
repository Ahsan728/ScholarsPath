import Link from "next/link"
import { notFound } from "next/navigation"
import { adminSupabase } from "@/lib/supabase"
import { UserDetailClient } from "./UserDetailClient"

export interface UserDetail {
  id: string
  email: string | null
  full_name: string | null
  nationality: string | null
  residence: string | null
  target_countries: string[] | null
  field_of_study: string[] | null
  degree_level: string | null
  gpa: number | null
  languages: any
  has_publications: boolean | null
  onboarded: boolean | null
  digest_frequency: string | null
  cv_eval_used: number | null
  cv_eval_month: string | null
  rag_queries_month: number | null
  rag_reset_month: string | null
  telegram_id: string | null
  created_at: string
  updated_at: string | null
  // hydrated
  tier: "free" | "pro" | "student"
  current_period_end: string | null
  mentorship_note: string | null
  in_allowlist: boolean
}

export interface FeedbackRow {
  id: string; program_id: string; issue_type: string; status: string
  notes: string | null; created_at: string
  program_name?: string; university?: string
}
export interface AcceptanceRow {
  id: string; program_id: string; country: string; status: string
  intake_year: number | null; intake_semester: string | null
  gpa: number | null; ielts_score: number | null
  publications_count: number | null; admin_verified: boolean
  created_at: string
  program_name?: string; university?: string
}
export interface PaymentRow {
  id: string; plan: string; amount_usd: number; method: string
  status: string; created_at: string; admin_note: string | null
  reviewed_at: string | null
}

export const dynamic = "force-dynamic"
export const revalidate = 0

async function loadUser(id: string): Promise<{
  user: UserDetail | null
  feedback: FeedbackRow[]
  acceptances: AcceptanceRow[]
  payments: PaymentRow[]
}> {
  const { data: userRow } = await adminSupabase
    .from("users").select("*").eq("id", id).maybeSingle()
  if (!userRow) return { user: null, feedback: [], acceptances: [], payments: [] }

  const email = (userRow as any).email as string | null

  const [subsRes, allowRes, fbRes, accRes, payRes] = await Promise.all([
    adminSupabase.from("subscriptions").select("tier, current_period_end").eq("user_id", id).maybeSingle(),
    email
      ? adminSupabase.from("student_allowlist").select("email, notes").eq("email", email).maybeSingle()
      : Promise.resolve({ data: null }),
    adminSupabase.from("program_feedback").select("id, program_id, issue_type, status, notes, created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(50),
    adminSupabase.from("student_acceptances").select("id, program_id, country, status, intake_year, intake_semester, gpa, ielts_score, publications_count, admin_verified, created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(50),
    adminSupabase.from("payment_requests").select("id, plan, amount_usd, method, status, created_at, admin_note, reviewed_at").eq("user_id", id).order("created_at", { ascending: false }).limit(50),
  ])

  const feedback = (fbRes.data ?? []) as any[]
  const acceptances = (accRes.data ?? []) as any[]

  // Hydrate program info on feedback + acceptances (shared)
  const allProgIds = Array.from(new Set([
    ...feedback.map(f => f.program_id),
    ...acceptances.map(a => a.program_id),
  ]))
  let progMap = new Map<string, any>()
  if (allProgIds.length > 0) {
    const { data: progs } = await adminSupabase
      .from("masters_programs").select("id, program_name, university").in("id", allProgIds)
    progMap = new Map((progs ?? []).map((p: any) => [p.id, p]))
  }
  for (const r of feedback)    { const p = progMap.get(r.program_id); r.program_name = p?.program_name; r.university = p?.university }
  for (const r of acceptances) { const p = progMap.get(r.program_id); r.program_name = p?.program_name; r.university = p?.university }

  const sub = (subsRes as any).data
  const allow = (allowRes as any).data

  return {
    user: {
      ...(userRow as any),
      tier: sub?.tier ?? "free",
      current_period_end: sub?.current_period_end ?? null,
      mentorship_note: allow?.notes ?? null,
      in_allowlist: !!allow,
    },
    feedback:    feedback as FeedbackRow[],
    acceptances: acceptances as AcceptanceRow[],
    payments:    (payRes.data ?? []) as PaymentRow[],
  }
}

export default async function AdminUserDetailPage({ params }: { params: { id: string } }) {
  const { user, feedback, acceptances, payments } = await loadUser(params.id)
  if (!user) notFound()

  return (
    <div className="max-w-5xl">
      <div className="mb-4">
        <Link href="/admin/users" className="text-xs text-blue-400 hover:text-blue-300">← All users</Link>
      </div>
      <UserDetailClient user={user} feedback={feedback} acceptances={acceptances} payments={payments} />
    </div>
  )
}
