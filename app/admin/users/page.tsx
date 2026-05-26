import { adminSupabase } from "@/lib/supabase"
import { UsersClient } from "./UsersClient"

export interface UserRow {
  id: string
  email: string | null
  full_name: string | null
  nationality: string | null
  field_of_study: string[] | null
  degree_level: string | null
  gpa: number | null
  has_publications: boolean | null
  onboarded: boolean | null
  created_at: string
  // hydrated
  tier: "free" | "pro" | "student"
  current_period_end: string | null
  is_mentorship_student: boolean
  feedback_count: number
  acceptances_count: number
  payment_count: number
}

export const dynamic = "force-dynamic"
export const revalidate = 0

async function loadUsers(): Promise<UserRow[]> {
  // Pull users newest first (limit 500 for v1; paginate later if needed)
  const { data: usersData } = await adminSupabase
    .from("users")
    .select("id, email, full_name, nationality, field_of_study, degree_level, gpa, has_publications, onboarded, created_at")
    .order("created_at", { ascending: false })
    .limit(500)
  const users = (usersData ?? []) as any[]
  if (users.length === 0) return []

  const ids = users.map(u => u.id)
  const emails = users.map(u => u.email).filter(Boolean) as string[]

  // Parallel fan-out for the per-user joins
  const [subsRes, allowRes, fbRes, accRes, payRes] = await Promise.all([
    adminSupabase.from("subscriptions").select("user_id, tier, current_period_end").in("user_id", ids),
    emails.length > 0
      ? adminSupabase.from("student_allowlist").select("email").in("email", emails)
      : Promise.resolve({ data: [] as any[] }),
    adminSupabase.from("program_feedback").select("user_id").in("user_id", ids),
    adminSupabase.from("student_acceptances").select("user_id").in("user_id", ids),
    adminSupabase.from("payment_requests").select("user_id").in("user_id", ids),
  ])

  const subsByUser = new Map<string, { tier: string; current_period_end: string | null }>()
  for (const s of (subsRes.data ?? []) as any[]) {
    subsByUser.set(s.user_id, { tier: s.tier, current_period_end: s.current_period_end })
  }
  const allowSet = new Set<string>((allowRes.data ?? []).map((r: any) => (r.email ?? "").toLowerCase()))
  const fbCount: Record<string, number> = {}
  for (const r of (fbRes.data ?? []) as any[]) fbCount[r.user_id] = (fbCount[r.user_id] ?? 0) + 1
  const accCount: Record<string, number> = {}
  for (const r of (accRes.data ?? []) as any[]) accCount[r.user_id] = (accCount[r.user_id] ?? 0) + 1
  const payCount: Record<string, number> = {}
  for (const r of (payRes.data ?? []) as any[]) payCount[r.user_id] = (payCount[r.user_id] ?? 0) + 1

  return users.map(u => {
    const sub = subsByUser.get(u.id)
    return {
      ...u,
      tier: (sub?.tier as any) ?? "free",
      current_period_end: sub?.current_period_end ?? null,
      is_mentorship_student: u.email ? allowSet.has(u.email.toLowerCase()) : false,
      feedback_count:     fbCount[u.id]  ?? 0,
      acceptances_count:  accCount[u.id] ?? 0,
      payment_count:      payCount[u.id] ?? 0,
    } as UserRow
  })
}

export default async function AdminUsersPage() {
  const users = await loadUsers()

  const counts = users.reduce<Record<string, number>>((m, u) => {
    m[u.tier] = (m[u.tier] ?? 0) + 1
    return m
  }, {})
  const onboardedCount = users.filter(u => u.onboarded).length

  return (
    <div className="max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Users</h1>
        <p className="text-sm text-gray-400 mt-1 max-w-3xl">
          Everyone who's signed up. Tier badge comes from <code className="bg-gray-800 px-1.5 py-0.5 rounded text-xs">subscriptions</code>;
          activity counts are from <code className="bg-gray-800 px-1.5 py-0.5 rounded text-xs">program_feedback</code>,{" "}
          <code className="bg-gray-800 px-1.5 py-0.5 rounded text-xs">student_acceptances</code>,{" "}
          and <code className="bg-gray-800 px-1.5 py-0.5 rounded text-xs">payment_requests</code>.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <Stat label="Total"      value={users.length}      color="text-white" />
        <Stat label="Free"       value={counts.free ?? 0}  color="text-gray-300" />
        <Stat label="Pro"        value={counts.pro ?? 0}   color="text-blue-400" />
        <Stat label="Student"    value={counts.student ?? 0} color="text-purple-400" />
        <Stat label="Onboarded"  value={onboardedCount}    color="text-green-400" />
      </div>

      <UsersClient initial={users} />
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
      <p className="text-[10px] uppercase text-gray-500 font-bold">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value.toLocaleString()}</p>
    </div>
  )
}
