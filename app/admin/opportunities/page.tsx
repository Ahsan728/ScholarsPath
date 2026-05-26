import Link from "next/link"
import { adminSupabase } from "@/lib/supabase"
import { OpportunitiesClient } from "./OpportunitiesClient"

export interface OpportunityRow {
  id: string
  source_id: string | null
  source_url: string
  run_id: string | null
  prompt_version: string
  content_hash: string | null
  type: string
  title: string
  description: string | null
  university: string | null
  country: string
  degree_level: string | null
  field_of_study: string[]
  amount_usd: number | null
  amount_text: string | null
  funding_type: string | null
  eligibility_text: string | null
  eligible_nations: string[]
  ineligible_nations: string[]
  deadline: string | null
  deadline_text: string | null
  intake: string | null
  apply_url: string | null
  is_active: boolean
  discovered_at: string
  last_seen_at: string
}

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function AdminOpportunitiesPage({
  searchParams,
}: {
  searchParams: { country?: string; type?: string; q?: string }
}) {
  // Build query with optional filters
  let query = adminSupabase
    .from("discovered_opportunities")
    .select("*")
    .order("last_seen_at", { ascending: false })
    .limit(200)

  if (searchParams.country) query = query.eq("country", searchParams.country)
  if (searchParams.type)    query = query.eq("type", searchParams.type)
  if (searchParams.q)       query = query.ilike("title", `%${searchParams.q}%`)

  const { data, error } = await query
  const opps: OpportunityRow[] = (data as OpportunityRow[]) ?? []

  // Aggregates (separate small queries; head/count for efficiency)
  let totalActive = 0
  let totalAll = 0
  let countriesCount = 0
  let typesBreakdown: Record<string, number> = {}
  if (!error) {
    const { count: a } = await adminSupabase.from("discovered_opportunities")
      .select("id", { count: "exact", head: true }).eq("is_active", true)
    totalActive = a ?? 0
    const { count: t } = await adminSupabase.from("discovered_opportunities")
      .select("id", { count: "exact", head: true })
    totalAll = t ?? 0

    // For simple aggregates we just inspect the loaded page (good enough
    // when limit=200 — admin can paginate by filter to see more)
    typesBreakdown = opps.reduce<Record<string, number>>((m, o) => {
      m[o.type] = (m[o.type] ?? 0) + 1; return m
    }, {})
    countriesCount = new Set(opps.map(o => o.country)).size
  }

  return (
    <div className="max-w-6xl">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Opportunities</h1>
          <p className="text-sm text-gray-400 mt-1 max-w-3xl">
            Scholarships, grants, PhDs, and funding rows extracted by the{" "}
            <code className="bg-gray-800 px-1.5 py-0.5 rounded text-xs text-blue-300">opportunity_discoverer</code>
            {" "}agent from <Link href="/admin/sources" className="text-blue-400 hover:underline">curated sources</Link>
            {" "}and target-country university pages.
          </p>
        </div>
        <Link href="/admin/sources" className="text-xs text-blue-400 hover:text-blue-300 whitespace-nowrap">
          → Manage sources
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-amber-900/30 border border-amber-800 px-4 py-3 text-sm text-amber-300">
          {error.message?.includes("does not exist")
            ? <>Table <code>discovered_opportunities</code> doesn't exist yet. Apply <code>scripts/opportunities_migration.sql</code> in Supabase SQL Editor.</>
            : <>Failed to load: {error.message}</>}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Stat label="Total"     value={totalAll}     color="text-white" />
        <Stat label="Active"    value={totalActive}  color="text-green-400" />
        <Stat label="In view"   value={opps.length}  color="text-blue-400" />
        <Stat label="Countries (page)" value={countriesCount} color="text-amber-400" />
      </div>

      {/* Type chips */}
      {Object.keys(typesBreakdown).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {Object.entries(typesBreakdown).sort((a, b) => b[1] - a[1]).map(([t, n]) => (
            <span key={t} className={`text-xs px-2 py-1 rounded-full ${TYPE_COLORS[t] ?? "bg-gray-800 text-gray-300"}`}>
              {TYPE_LABELS[t] ?? t}: <strong>{n}</strong>
            </span>
          ))}
        </div>
      )}

      <OpportunitiesClient opportunities={opps} filters={searchParams} />
    </div>
  )
}

const TYPE_COLORS: Record<string, string> = {
  scholarship: "bg-blue-900/30 text-blue-300",
  grant:       "bg-green-900/30 text-green-300",
  phd:         "bg-purple-900/30 text-purple-300",
  postdoc:     "bg-indigo-900/30 text-indigo-300",
  fellowship:  "bg-amber-900/30 text-amber-300",
  internship:  "bg-teal-900/30 text-teal-300",
  bursary:     "bg-orange-900/30 text-orange-300",
  assistantship: "bg-pink-900/30 text-pink-300",
  exchange:    "bg-cyan-900/30 text-cyan-300",
}

const TYPE_LABELS: Record<string, string> = {
  scholarship: "Scholarship", grant: "Grant", phd: "PhD",
  postdoc: "Postdoc", fellowship: "Fellowship",
  internship: "Internship", bursary: "Bursary",
  assistantship: "Assistantship", exchange: "Exchange",
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
      <p className="text-[10px] uppercase text-gray-500 font-bold">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value.toLocaleString()}</p>
    </div>
  )
}
