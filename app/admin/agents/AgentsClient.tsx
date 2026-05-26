"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Save, Loader2, Activity, Pause, Zap, AlertCircle, CheckCircle2, XCircle } from "lucide-react"
import type { AgentRow, AgentSpend } from "./page"

interface Props {
  initialAgents: AgentRow[]
  initialSpend: AgentSpend[]
}

const MODE_META: Record<string, { color: string; icon: any; label: string }> = {
  bootstrap: { color: "bg-blue-600 text-white",  icon: Zap,      label: "Bootstrap" },
  steady:    { color: "bg-green-600 text-white", icon: Activity, label: "Steady" },
  paused:    { color: "bg-gray-700 text-gray-300", icon: Pause,  label: "Paused" },
}

const STATUS_ICON: Record<string, any> = {
  completed: CheckCircle2,
  running:   Activity,
  failed:    XCircle,
  cancelled: AlertCircle,
}

function fmtRelative(iso: string | null): string {
  if (!iso) return "never"
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

export function AgentsClient({ initialAgents, initialSpend }: Props) {
  const router = useRouter()
  const [agents, setAgents] = useState<AgentRow[]>(initialAgents)
  const [busy, setBusy] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<Partial<AgentRow>>({})

  const spendMap = useMemo(() => {
    const m = new Map<string, AgentSpend>()
    for (const s of initialSpend) m.set(s.crawler, s)
    return m
  }, [initialSpend])

  function startEdit(a: AgentRow) {
    setEditing(a.crawler)
    setDraft({
      mode: a.mode,
      bootstrap_schedule: a.bootstrap_schedule,
      steady_schedule: a.steady_schedule,
      max_usd_per_run: a.max_usd_per_run,
      max_usd_per_month: a.max_usd_per_month,
      enabled: a.enabled,
      alert_on_failure: a.alert_on_failure,
    })
  }

  async function save(crawler: string) {
    setBusy(crawler)
    try {
      const r = await fetch(`/api/admin/agents/${encodeURIComponent(crawler)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setAgents(a => a.map(x => x.crawler === crawler ? { ...x, ...draft } as AgentRow : x))
      setEditing(null)
      router.refresh()
    } catch (e: any) {
      alert(`Save failed: ${e.message}`)
    } finally {
      setBusy(null)
    }
  }

  if (agents.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
        <p className="text-sm text-gray-500">No agents defined.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {agents.map((a) => {
        const meta = MODE_META[a.mode]
        const Icon = meta.icon
        const s = spendMap.get(a.crawler)
        const isEdit = editing === a.crawler
        const pct = a.max_usd_per_month > 0 ? (Number(s?.month_spend ?? 0) / a.max_usd_per_month) * 100 : 0

        return (
          <div key={a.crawler} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded inline-flex items-center gap-1 ${meta.color}`}>
                    <Icon className={`h-3 w-3 ${a.mode === "steady" ? "animate-pulse" : ""}`} /> {meta.label}
                  </span>
                  <h3 className="font-mono text-sm text-white font-semibold">{a.crawler}</h3>
                  {!a.enabled && (
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-red-900/40 text-red-300">DISABLED</span>
                  )}
                </div>
                {a.description && <p className="text-xs text-gray-500">{a.description}</p>}
              </div>

              {!isEdit ? (
                <button
                  onClick={() => startEdit(a)}
                  className="text-xs text-blue-400 hover:text-blue-300 whitespace-nowrap"
                >
                  Edit
                </button>
              ) : (
                <div className="flex gap-1">
                  <button
                    onClick={() => save(a.crawler)}
                    disabled={busy === a.crawler}
                    className="rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-2.5 py-1 text-xs text-white font-medium inline-flex items-center gap-1"
                  >
                    {busy === a.crawler ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    Save
                  </button>
                  <button
                    onClick={() => setEditing(null)}
                    className="rounded bg-gray-700 hover:bg-gray-600 px-2.5 py-1 text-xs text-white"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              {/* Mode */}
              <div>
                <p className="text-[10px] uppercase text-gray-500 font-bold mb-1">Mode</p>
                {isEdit ? (
                  <select
                    value={draft.mode}
                    onChange={(e) => setDraft({ ...draft, mode: e.target.value as any })}
                    className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1 text-white"
                  >
                    <option value="bootstrap">Bootstrap</option>
                    <option value="steady">Steady</option>
                    <option value="paused">Paused</option>
                  </select>
                ) : (
                  <p className="text-white">{meta.label}</p>
                )}
              </div>

              {/* Schedules */}
              <div className="col-span-2">
                <p className="text-[10px] uppercase text-gray-500 font-bold mb-1">Schedule (active = {a.mode})</p>
                {isEdit ? (
                  <div className="space-y-1">
                    <input
                      type="text"
                      placeholder="bootstrap cron (e.g., 0 3 * * *)"
                      value={draft.bootstrap_schedule || ""}
                      onChange={(e) => setDraft({ ...draft, bootstrap_schedule: e.target.value || null })}
                      className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1 text-white font-mono text-[11px]"
                    />
                    <input
                      type="text"
                      placeholder="steady cron (e.g., 0 3 * * 0)"
                      value={draft.steady_schedule || ""}
                      onChange={(e) => setDraft({ ...draft, steady_schedule: e.target.value || null })}
                      className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1 text-white font-mono text-[11px]"
                    />
                  </div>
                ) : (
                  <p className="text-gray-300 font-mono">
                    {a.mode === "paused" ? "—" : (a.mode === "bootstrap" ? a.bootstrap_schedule : a.steady_schedule) || "(unset)"}
                  </p>
                )}
              </div>

              {/* Budget */}
              <div>
                <p className="text-[10px] uppercase text-gray-500 font-bold mb-1">$/run · $/month</p>
                {isEdit ? (
                  <div className="flex gap-1">
                    <input
                      type="number" step="0.01" min="0"
                      value={draft.max_usd_per_run ?? 0}
                      onChange={(e) => setDraft({ ...draft, max_usd_per_run: Number(e.target.value) })}
                      className="w-1/2 bg-gray-950 border border-gray-700 rounded px-2 py-1 text-white"
                    />
                    <input
                      type="number" step="1" min="0"
                      value={draft.max_usd_per_month ?? 0}
                      onChange={(e) => setDraft({ ...draft, max_usd_per_month: Number(e.target.value) })}
                      className="w-1/2 bg-gray-950 border border-gray-700 rounded px-2 py-1 text-white"
                    />
                  </div>
                ) : (
                  <p className="text-white">${Number(a.max_usd_per_run).toFixed(2)} · ${a.max_usd_per_month}</p>
                )}
              </div>
            </div>

            {/* Spend bar + run history */}
            {s && (
              <div className="mt-3 pt-3 border-t border-gray-800 grid grid-cols-3 gap-3 text-xs">
                <div>
                  <p className="text-[10px] uppercase text-gray-500 font-bold mb-1">This month</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${pct > 80 ? "bg-red-500" : pct > 50 ? "bg-amber-500" : "bg-green-500"}`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                    <span className="text-white whitespace-nowrap">
                      ${Number(s.month_spend).toFixed(2)} {a.max_usd_per_month > 0 && `(${pct.toFixed(0)}%)`}
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-gray-500 font-bold mb-1">Runs (30d)</p>
                  <p className="text-white">{s.recent_runs_30d}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-gray-500 font-bold mb-1">Last run</p>
                  <p className="text-white inline-flex items-center gap-1">
                    {s.last_run_status && STATUS_ICON[s.last_run_status] && (
                      (() => { const I = STATUS_ICON[s.last_run_status!]; return <I className="h-3 w-3" /> })()
                    )}
                    {fmtRelative(s.last_run_at)}
                    {s.last_run_status && <span className="text-gray-500">({s.last_run_status})</span>}
                  </p>
                </div>
              </div>
            )}

            {isEdit && (
              <div className="mt-3 pt-3 border-t border-gray-800 flex items-center gap-4 text-xs">
                <label className="inline-flex items-center gap-1.5 text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!draft.enabled}
                    onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
                    className="rounded"
                  />
                  Enabled
                </label>
                <label className="inline-flex items-center gap-1.5 text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!draft.alert_on_failure}
                    onChange={(e) => setDraft({ ...draft, alert_on_failure: e.target.checked })}
                    className="rounded"
                  />
                  Alert on failure
                </label>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
