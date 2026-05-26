import { adminSupabase } from "@/lib/supabase"
import { AcceptancesClient } from "./AcceptancesClient"

export interface AcceptanceRow {
  id: string
  program_id: string
  user_id: string | null
  country: string
  status: "accepted" | "enrolled" | "rejected" | "waitlisted" | "withdrew"
  intake_year: number | null
  intake_semester: string | null
  notes: string | null
  submitted_by: "admin" | "user"
  admin_verified: boolean
  admin_note: string | null
  created_at: string
  // Joined
  program?: { program_name: string; university: string; country: string } | null
}

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function AdminAcceptancesPage({
  searchParams,
}: {
  searchParams: { status?: string; country?: string }
}) {
  let q = adminSupabase
    .from("student_acceptances")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500)
  if (searchParams.status)  q = q.eq("status",  searchParams.status)
  if (searchParams.country) q = q.eq("country", searchParams.country)

  const { data: rows, error } = await q
  const list = (rows as AcceptanceRow[]) ?? []

  // Hydrate with program info
  const ids = Array.from(new Set(list.map(r => r.program_id)))
  if (ids.length > 0) {
    const { data: progs } = await adminSupabase
      .from("masters_programs")
      .select("id, program_name, university, country")
      .in("id", ids)
    const map = new Map((progs ?? []).map((p: any) => [p.id, p]))
    for (const r of list) r.program = map.get(r.program_id) ?? null
  }

  // Stats
  const total = list.length
  const acceptedCount = list.filter(r => r.status === "accepted" || r.status === "enrolled").length
  const verifiedCount = list.filter(r => r.admin_verified).length
  const countries = Array.from(new Set(list.map(r => r.country))).sort()

  return (
    <div className="max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Student Acceptances</h1>
        <p className="text-sm text-gray-400 mt-1 max-w-3xl">
          Real students who applied to programs in the catalog. Adds social proof to
          program pages (anonymous aggregates only — names never shown publicly).
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-amber-900/30 border border-amber-800 px-4 py-3 text-sm text-amber-300">
          {error.message?.includes("does not exist")
            ? <>Table <code>student_acceptances</code> doesn't exist yet. Apply <code>scripts/student_acceptances_migration.sql</code> in Supabase SQL Editor.</>
            : <>Failed to load: {error.message}</>}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Stat label="Total records"  value={total}          color="text-white" />
        <Stat label="Accepted/Enrolled" value={acceptedCount} color="text-green-400" />
        <Stat label="Admin-verified" value={verifiedCount}   color="text-blue-400" />
        <Stat label="Countries"      value={countries.length} color="text-amber-400" />
      </div>

      <AcceptancesClient initial={list} filters={searchParams} countries={countries} />
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
