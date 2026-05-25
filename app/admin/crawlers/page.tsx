import { adminSupabase } from "@/lib/supabase"
import { CrawlersClient } from "./CrawlersClient"

export interface CrawlerRunRow {
  id: string
  crawler: string
  status: "running" | "completed" | "failed" | "cancelled"
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  items_total: number
  items_processed: number
  items_ok: number
  items_failed: number
  items_skipped: number
  tokens_in: number
  tokens_out: number
  cost_usd: number
  params: any
  summary: any
  error_message: string | null
  host: string | null
}

export interface CrawlerEventRow {
  id: number
  run_id: string
  level: "info" | "warn" | "error"
  target_id: string | null
  target_url: string | null
  message: string | null
  meta: any
  created_at: string
}

export const dynamic = "force-dynamic"
export const revalidate = 0

async function loadStats() {
  // URL validation breakdown across the catalog
  const urlBuckets = ["ok", "redirect", "dead", "wrong_domain", "timeout", "unknown", null] as const
  const urlCounts: Record<string, number> = {}
  await Promise.all(
    urlBuckets.map(async (b) => {
      const q = adminSupabase.from("masters_programs").select("id", { count: "exact", head: true })
      const { count } = b === null ? await q.is("url_status", null) : await q.eq("url_status", b)
      urlCounts[b ?? "unchecked"] = count ?? 0
    })
  )

  // Domain-match breakdown
  const dmBuckets = ["match", "mismatch", "aggregator", "no_url", null] as const
  const dmCounts: Record<string, number> = {}
  await Promise.all(
    dmBuckets.map(async (b) => {
      const q = adminSupabase.from("masters_programs").select("id", { count: "exact", head: true })
      const { count } = b === null ? await q.is("domain_match_status", null) : await q.eq("domain_match_status", b)
      dmCounts[b ?? "unchecked"] = count ?? 0
    })
  )

  // Total programs
  const { count: total } = await adminSupabase
    .from("masters_programs").select("id", { count: "exact", head: true })

  // Recent runs (last 50)
  const { data: runs } = await adminSupabase
    .from("crawler_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(50)

  // Recent errors (last 20 across all runs)
  const { data: errors } = await adminSupabase
    .from("crawler_events")
    .select("*")
    .eq("level", "error")
    .order("created_at", { ascending: false })
    .limit(20)

  return {
    urlCounts,
    domainCounts: dmCounts,
    totalPrograms: total ?? 0,
    runs: (runs as CrawlerRunRow[]) ?? [],
    errors: (errors as CrawlerEventRow[]) ?? [],
  }
}

export default async function AdminCrawlersPage() {
  const { urlCounts, domainCounts, totalPrograms, runs, errors } = await loadStats()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Crawlers</h1>
        <p className="text-sm text-gray-400 mt-1">
          Observability for every crawler run — URL validation, opportunity discovery, future jobs.
          Each crawler writes to <code className="bg-gray-800 px-1.5 py-0.5 rounded text-xs">crawler_runs</code>{" "}
          and per-item errors to <code className="bg-gray-800 px-1.5 py-0.5 rounded text-xs">crawler_events</code>.
        </p>
      </div>

      <CrawlersClient
        urlCounts={urlCounts}
        domainCounts={domainCounts}
        totalPrograms={totalPrograms}
        runs={runs}
        errors={errors}
      />
    </div>
  )
}
