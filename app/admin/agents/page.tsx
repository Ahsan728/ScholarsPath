import Link from "next/link"
import { adminSupabase } from "@/lib/supabase"
import { AgentsClient } from "./AgentsClient"

export interface AgentRow {
  crawler: string
  description: string | null
  mode: "bootstrap" | "steady" | "paused"
  bootstrap_schedule: string | null
  steady_schedule: string | null
  max_usd_per_run: number
  max_usd_per_month: number
  alert_on_failure: boolean
  enabled: boolean
  params: any
  updated_at: string
}

export interface AgentSpend {
  crawler: string
  month_spend: number
  last_run_at: string | null
  last_run_status: string | null
  recent_runs_30d: number
}

export const dynamic = "force-dynamic"
export const revalidate = 0

async function loadAgentsWithSpend(): Promise<{ agents: AgentRow[]; spend: Map<string, AgentSpend> }> {
  const { data: agents } = await adminSupabase
    .from("agent_definitions")
    .select("*")
    .order("crawler", { ascending: true })

  // Aggregate this-month spend per crawler from crawler_runs
  const monthStart = new Date()
  monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0)
  const { data: runs } = await adminSupabase
    .from("crawler_runs")
    .select("crawler, cost_usd, started_at, status")
    .gte("started_at", monthStart.toISOString())

  const spendMap = new Map<string, AgentSpend>()
  for (const r of (runs as any[]) ?? []) {
    const cur = spendMap.get(r.crawler) ?? {
      crawler: r.crawler, month_spend: 0,
      last_run_at: null, last_run_status: null, recent_runs_30d: 0,
    }
    cur.month_spend += Number(r.cost_usd ?? 0)
    cur.recent_runs_30d += 1
    if (!cur.last_run_at || r.started_at > cur.last_run_at) {
      cur.last_run_at = r.started_at
      cur.last_run_status = r.status
    }
    spendMap.set(r.crawler, cur)
  }

  return { agents: (agents as AgentRow[]) ?? [], spend: spendMap }
}

export default async function AdminAgentsPage() {
  let agents: AgentRow[] = []
  let spend = new Map<string, AgentSpend>()
  let loadError: string | null = null
  try {
    const data = await loadAgentsWithSpend()
    agents = data.agents
    spend = data.spend
  } catch (e: any) {
    loadError = e.message
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Agents</h1>
          <p className="text-sm text-gray-400 mt-1">
            Per-agent operational controls. Toggle mode, set budget caps, and watch this-month spend.
            See run history at <Link href="/admin/crawlers" className="text-blue-400 hover:underline">/admin/crawlers</Link>.
          </p>
        </div>
        <Link href="/admin/crawlers" className="text-xs text-blue-400 hover:text-blue-300">
          → Crawler runs
        </Link>
      </div>

      {(loadError || agents.length === 0) && (
        <div className="mb-4 rounded-lg bg-amber-900/30 border border-amber-800 px-4 py-3 text-sm text-amber-300">
          {loadError?.includes("does not exist") || agents.length === 0 ? (
            <>
              No agents found — table <code>agent_definitions</code> not initialized.
              Apply <code>scripts/agent_runtime_migration.sql</code> in the Supabase SQL Editor.
            </>
          ) : (
            <>Failed to load: {loadError}</>
          )}
        </div>
      )}

      <AgentsClient initialAgents={agents} initialSpend={Array.from(spend.values())} />
    </div>
  )
}
