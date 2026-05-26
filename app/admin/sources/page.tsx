import { adminSupabase } from "@/lib/supabase"
import { SourcesClient } from "./SourcesClient"

export interface SourceRow {
  id: string
  url: string
  country: string | null
  scope: "pan_european" | "national_portal" | "regional" | "university" | "funding_body" | "aggregator"
  title: string | null
  notes: string | null
  source_doc: string | null
  added_by: string | null
  last_crawled_at: string | null
  last_status: string | null
  created_at: string
}

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function AdminSourcesPage() {
  const { data, error } = await adminSupabase
    .from("opportunity_sources")
    .select("*")
    .order("country", { ascending: true, nullsFirst: false })
    .order("scope", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(500)

  const sources: SourceRow[] = (data as SourceRow[]) ?? []

  // Aggregate stats for the header
  const byScope = sources.reduce<Record<string, number>>((m, s) => {
    m[s.scope] = (m[s.scope] ?? 0) + 1
    return m
  }, {})
  const byCountry = sources.reduce<Record<string, number>>((m, s) => {
    const k = s.country ?? "(none)"
    m[k] = (m[k] ?? 0) + 1
    return m
  }, {})
  const uncrawled = sources.filter(s => !s.last_crawled_at).length
  const stale7d = sources.filter(s => {
    if (!s.last_crawled_at) return false
    const t = new Date(s.last_crawled_at).getTime()
    return Date.now() - t > 7 * 24 * 3600 * 1000
  }).length

  return (
    <div className="max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Opportunity Sources</h1>
        <p className="text-sm text-gray-400 mt-1">
          Curated registry of scholarship / funding / PhD portals. The{" "}
          <code className="bg-gray-800 px-1.5 py-0.5 rounded text-xs text-blue-300">source_ingester</code>
          {" "}populates this from <code className="bg-gray-800 px-1.5 py-0.5 rounded text-xs">Documents/sources/*.txt</code>
          ; the{" "}
          <code className="bg-gray-800 px-1.5 py-0.5 rounded text-xs text-blue-300">opportunity_discoverer</code>
          {" "}(Phase C) reads from this table first when extracting opportunities.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-900/30 border border-red-800 px-4 py-3 text-sm text-red-300">
          {error.message?.includes("does not exist")
            ? <>Table <code>opportunity_sources</code> doesn't exist yet. Apply <code>scripts/opportunity_sources_migration.sql</code> in Supabase SQL Editor.</>
            : <>Failed to load: {error.message}</>}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Stat label="Total sources" value={sources.length}            color="text-white" />
        <Stat label="Uncrawled"      value={uncrawled}                 color="text-amber-400" />
        <Stat label="Stale (>7d)"    value={stale7d}                   color="text-orange-400" />
        <Stat label="Countries"      value={Object.keys(byCountry).filter(c => c !== "(none)").length} color="text-blue-400" />
      </div>

      {/* Scope distribution chips */}
      {sources.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {Object.entries(byScope).sort((a, b) => b[1] - a[1]).map(([scope, n]) => (
            <span key={scope} className={`text-xs px-2 py-1 rounded-full ${SCOPE_COLORS[scope] ?? "bg-gray-800 text-gray-300"}`}>
              {SCOPE_LABELS[scope] ?? scope}: <strong>{n}</strong>
            </span>
          ))}
        </div>
      )}

      <SourcesClient initialSources={sources} />
    </div>
  )
}

const SCOPE_COLORS: Record<string, string> = {
  pan_european:    "bg-purple-900/30 text-purple-300",
  national_portal: "bg-blue-900/30 text-blue-300",
  regional:        "bg-green-900/30 text-green-300",
  university:      "bg-indigo-900/30 text-indigo-300",
  funding_body:    "bg-amber-900/30 text-amber-300",
  aggregator:      "bg-red-900/30 text-red-300",
}

const SCOPE_LABELS: Record<string, string> = {
  pan_european:    "Pan-EU",
  national_portal: "National",
  regional:        "Regional",
  university:      "University",
  funding_body:    "Funding body",
  aggregator:      "Aggregator",
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
      <p className="text-[10px] uppercase text-gray-500 font-bold">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value.toLocaleString()}</p>
    </div>
  )
}
