import { adminSupabase } from "@/lib/supabase"
import { FeedbackClient } from "./FeedbackClient"

export interface FeedbackRow {
  id: string
  program_id: string
  user_email: string | null
  issue_type: string
  field: string | null
  current_value: string | null
  suggested_value: string | null
  evidence_url: string | null
  notes: string
  status: "pending" | "resolved" | "rejected"
  admin_note: string | null
  reviewed_at: string | null
  created_at: string
  // Joined fields
  program_name?: string
  university?: string
}

const TABS = [
  { key: "pending",  label: "Pending"  },
  { key: "resolved", label: "Resolved" },
  { key: "rejected", label: "Rejected" },
] as const

export const dynamic = "force-dynamic"

export default async function AdminFeedbackPage({ searchParams }: { searchParams: { tab?: string } }) {
  const tab = (TABS.find(t => t.key === searchParams.tab)?.key ?? "pending") as FeedbackRow["status"]

  // We can't easily join here without a foreign-key relationship being set up
  // in Supabase config, so do two queries.
  const { data: feedback } = await adminSupabase
    .from("program_feedback")
    .select("*")
    .eq("status", tab)
    .order("created_at", { ascending: false })
    .limit(200)

  const rows: FeedbackRow[] = (feedback as FeedbackRow[]) ?? []
  const programIds = Array.from(new Set(rows.map(r => r.program_id)))

  if (programIds.length > 0) {
    const { data: progs } = await adminSupabase
      .from("masters_programs")
      .select("id, program_name, university")
      .in("id", programIds)
    const progMap = new Map((progs ?? []).map((p: any) => [p.id, p]))
    for (const r of rows) {
      const p = progMap.get(r.program_id)
      r.program_name = p?.program_name
      r.university   = p?.university
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Program Feedback</h1>
        <p className="text-sm text-gray-400 mt-1">
          Users flag inaccuracies — wrong links, outdated info, incorrect requirements.
          Click <strong>Resolve</strong> to mark fixed (optionally applying the suggested value
          directly to the program), or <strong>Reject</strong> with a note.
        </p>
      </div>

      <div className="flex gap-1 border-b border-gray-800 mb-5">
        {TABS.map(t => (
          <a
            key={t.key}
            href={`/admin/feedback?tab=${t.key}`}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? "border-blue-500 text-white"
                : "border-transparent text-gray-400 hover:text-white"
            }`}
          >
            {t.label}
          </a>
        ))}
      </div>

      <FeedbackClient rows={rows} tab={tab} />
    </div>
  )
}
