"use client"

import { useMemo, useState } from "react"
import { CheckCircle2, XCircle, Clock, AlertTriangle, Activity, Terminal, RefreshCw } from "lucide-react"
import type { CrawlerRunRow, CrawlerEventRow } from "./page"

interface Props {
  urlCounts: Record<string, number>
  domainCounts: Record<string, number>
  totalPrograms: number
  runs: CrawlerRunRow[]
  errors: CrawlerEventRow[]
}

const DOMAIN_STATUS_META: Record<string, { label: string; color: string }> = {
  match:      { label: "Matches uni",   color: "bg-green-900/30 text-green-300 border-green-800" },
  mismatch:   { label: "Mismatch",      color: "bg-red-900/30 text-red-300 border-red-800" },
  aggregator: { label: "Aggregator",    color: "bg-orange-900/30 text-orange-300 border-orange-800" },
  no_url:     { label: "No URL",        color: "bg-gray-800 text-gray-300 border-gray-700" },
  unchecked:  { label: "Never checked", color: "bg-gray-900 text-gray-400 border-gray-800" },
}

const URL_STATUS_META: Record<string, { label: string; color: string }> = {
  ok:           { label: "Valid",          color: "bg-green-900/30 text-green-300 border-green-800" },
  redirect:     { label: "Redirected",     color: "bg-blue-900/30 text-blue-300 border-blue-800" },
  dead:         { label: "Dead (4xx/5xx)", color: "bg-red-900/30 text-red-300 border-red-800" },
  wrong_domain: { label: "Wrong domain",   color: "bg-orange-900/30 text-orange-300 border-orange-800" },
  timeout:      { label: "Timeout",        color: "bg-amber-900/30 text-amber-300 border-amber-800" },
  unknown:      { label: "Unknown",        color: "bg-gray-800 text-gray-300 border-gray-700" },
  unchecked:    { label: "Never checked",  color: "bg-gray-900 text-gray-400 border-gray-800" },
}

const RUN_STATUS_META: Record<string, { color: string; icon: any }> = {
  running:    { color: "text-blue-400",  icon: Activity },
  completed:  { color: "text-green-400", icon: CheckCircle2 },
  failed:     { color: "text-red-400",   icon: XCircle },
  cancelled:  { color: "text-gray-400",  icon: AlertTriangle },
}

function fmtDuration(ms: number | null): string {
  if (!ms) return "—"
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)}m`
  return `${(ms / 3_600_000).toFixed(2)}h`
}

function fmtRelative(iso: string): string {
  const d = new Date(iso).getTime()
  const diff = Date.now() - d
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

export function CrawlersClient({ urlCounts, domainCounts, totalPrograms, runs, errors }: Props) {
  const [filter, setFilter] = useState<string>("all")
  const [expanded, setExpanded] = useState<string | null>(null)

  const crawlers = useMemo(() => {
    const set = new Set(runs.map(r => r.crawler))
    return ["all", ...Array.from(set).sort()]
  }, [runs])

  const filteredRuns = filter === "all" ? runs : runs.filter(r => r.crawler === filter)

  const perCrawler = useMemo(() => {
    const m = new Map<string, {
      total: number, ok: number, failed: number, running: number,
      lastRun: string | null, totalCost: number,
    }>()
    for (const r of runs) {
      const e = m.get(r.crawler) ?? { total: 0, ok: 0, failed: 0, running: 0, lastRun: null, totalCost: 0 }
      e.total++
      if (r.status === "completed") e.ok++
      else if (r.status === "failed") e.failed++
      else if (r.status === "running") e.running++
      e.totalCost += Number(r.cost_usd ?? 0)
      if (!e.lastRun || r.started_at > e.lastRun) e.lastRun = r.started_at
      m.set(r.crawler, e)
    }
    return Array.from(m.entries()).sort((a, b) =>
      (b[1].lastRun ?? "").localeCompare(a[1].lastRun ?? "")
    )
  }, [runs])

  return (
    <div className="space-y-6">
      {/* URL VALIDATION OVERVIEW */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-white">URL Validation</h2>
          <span className="text-xs text-gray-500">
            {totalPrograms.toLocaleString()} programs in catalog
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          {Object.entries(URL_STATUS_META).map(([key, meta]) => {
            const n = urlCounts[key] ?? 0
            const pct = totalPrograms ? Math.round((n / totalPrograms) * 100) : 0
            return (
              <div key={key} className={`rounded-lg border px-3 py-2.5 ${meta.color}`}>
                <p className="text-[10px] uppercase font-bold tracking-wide opacity-80">
                  {meta.label}
                </p>
                <p className="text-xl font-bold mt-0.5">{n.toLocaleString()}</p>
                <p className="text-[10px] opacity-60">{pct}%</p>
              </div>
            )
          })}
        </div>
        <div className="mt-4 text-xs text-gray-500">
          Re-run with{" "}
          <code className="bg-gray-800 px-1.5 py-0.5 rounded text-blue-300">
            python crawlers/validate_program_urls.py
          </code>{" "}
          (incremental: rows older than 7 days). Use{" "}
          <code className="bg-gray-800 px-1.5 py-0.5 rounded text-blue-300">--refresh</code>{" "}
          to recheck all, or{" "}
          <code className="bg-gray-800 px-1.5 py-0.5 rounded text-blue-300">--only-status dead</code>{" "}
          to retry failures.
        </div>
      </section>

      {/* DOMAIN MATCH OVERVIEW */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h2 className="font-semibold text-white">Domain Match Audit</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Flags programs whose apply_url host doesn't match the listed university (e.g. "MIT program" pointing to a random aggregator).
              Zero AI cost — pure token comparison.
            </p>
          </div>
          <a
            href="/admin/programs/issues"
            className="text-xs px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium whitespace-nowrap"
          >
            Triage flagged programs →
          </a>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {Object.entries(DOMAIN_STATUS_META).map(([key, meta]) => {
            const n = domainCounts[key] ?? 0
            const pct = totalPrograms ? Math.round((n / totalPrograms) * 100) : 0
            return (
              <div key={key} className={`rounded-lg border px-3 py-2.5 ${meta.color}`}>
                <p className="text-[10px] uppercase font-bold tracking-wide opacity-80">
                  {meta.label}
                </p>
                <p className="text-xl font-bold mt-0.5">{n.toLocaleString()}</p>
                <p className="text-[10px] opacity-60">{pct}%</p>
              </div>
            )
          })}
        </div>
        <div className="mt-4 text-xs text-gray-500">
          Re-run with{" "}
          <code className="bg-gray-800 px-1.5 py-0.5 rounded text-blue-300">
            python crawlers/detect_domain_mismatch.py
          </code>{" "}
          (only un-checked rows by default). Use{" "}
          <code className="bg-gray-800 px-1.5 py-0.5 rounded text-blue-300">--refresh</code>{" "}
          to re-classify everything.
        </div>
      </section>

      {/* PER-CRAWLER SUMMARY */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="font-semibold text-white mb-4">Crawlers in the system</h2>
        {perCrawler.length === 0 ? (
          <p className="text-sm text-gray-500">
            No crawler runs logged yet. The first run of any script using{" "}
            <code className="bg-gray-800 px-1.5 py-0.5 rounded text-xs text-blue-300">crawler_logger.CrawlerRun</code>{" "}
            will appear here.
          </p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-gray-500 border-b border-gray-800">
                <tr>
                  <th className="text-left px-2 py-2">Crawler</th>
                  <th className="text-right px-2 py-2">Runs</th>
                  <th className="text-right px-2 py-2">OK</th>
                  <th className="text-right px-2 py-2">Failed</th>
                  <th className="text-right px-2 py-2">Active</th>
                  <th className="text-right px-2 py-2">Total cost</th>
                  <th className="text-right px-2 py-2">Last run</th>
                </tr>
              </thead>
              <tbody>
                {perCrawler.map(([name, s]) => (
                  <tr key={name} className="border-b border-gray-800/60 hover:bg-gray-800/30">
                    <td className="px-2 py-2 font-mono text-blue-300">{name}</td>
                    <td className="px-2 py-2 text-right text-gray-300">{s.total}</td>
                    <td className="px-2 py-2 text-right text-green-400">{s.ok}</td>
                    <td className="px-2 py-2 text-right text-red-400">{s.failed}</td>
                    <td className="px-2 py-2 text-right text-blue-400">{s.running || ""}</td>
                    <td className="px-2 py-2 text-right text-gray-300">
                      {s.totalCost > 0 ? `$${s.totalCost.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-2 py-2 text-right text-gray-500 text-xs">
                      {s.lastRun ? fmtRelative(s.lastRun) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* RUN HISTORY */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <h2 className="font-semibold text-white">Run history</h2>
          <div className="flex items-center gap-2">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200"
            >
              {crawlers.map(c => <option key={c} value={c}>{c === "all" ? "All crawlers" : c}</option>)}
            </select>
            <button
              onClick={() => location.reload()}
              className="text-xs text-gray-400 hover:text-white inline-flex items-center gap-1"
            >
              <RefreshCw className="h-3 w-3" /> Refresh
            </button>
          </div>
        </div>

        {filteredRuns.length === 0 ? (
          <p className="text-sm text-gray-500">No runs match this filter.</p>
        ) : (
          <div className="space-y-2">
            {filteredRuns.map((r) => {
              const meta = RUN_STATUS_META[r.status] ?? RUN_STATUS_META.cancelled
              const Icon = meta.icon
              const isOpen = expanded === r.id
              const total = r.items_total || r.items_processed
              const pct = total ? Math.round((r.items_processed / total) * 100) : 0
              return (
                <div key={r.id} className="border border-gray-800 rounded-lg bg-gray-950/50">
                  <button
                    onClick={() => setExpanded(isOpen ? null : r.id)}
                    className="w-full px-3 py-2.5 flex items-center gap-3 text-left hover:bg-gray-800/30 transition-colors rounded-lg"
                  >
                    <Icon className={`h-4 w-4 ${meta.color} ${r.status === "running" ? "animate-pulse" : ""}`} />
                    <span className="font-mono text-xs text-blue-300 min-w-[140px]">{r.crawler}</span>
                    <span className={`text-[10px] uppercase font-bold ${meta.color} min-w-[70px]`}>
                      {r.status}
                    </span>
                    <span className="text-xs text-gray-500 hidden sm:inline">
                      {fmtRelative(r.started_at)}
                    </span>
                    <span className="text-xs text-gray-500 ml-auto whitespace-nowrap">
                      {r.items_processed}/{r.items_total || "?"} · {fmtDuration(r.duration_ms)}
                      {r.items_failed > 0 && (
                        <span className="text-red-400 ml-2">{r.items_failed} err</span>
                      )}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="px-3 pb-3 pt-1 border-t border-gray-800 mt-1 text-xs space-y-2">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
                        <Field label="OK"      value={r.items_ok.toString()}      color="text-green-400" />
                        <Field label="Failed"  value={r.items_failed.toString()}  color="text-red-400" />
                        <Field label="Skipped" value={r.items_skipped.toString()} color="text-gray-400" />
                        <Field label="Progress" value={total ? `${pct}%` : "—"}    color="text-blue-400" />
                        {r.cost_usd > 0 && <Field label="Cost"     value={`$${r.cost_usd.toFixed(4)}`} color="text-amber-400" />}
                        {r.tokens_in > 0 && <Field label="Tokens in"  value={r.tokens_in.toLocaleString()}  color="text-gray-300" />}
                        {r.tokens_out > 0 && <Field label="Tokens out" value={r.tokens_out.toLocaleString()} color="text-gray-300" />}
                        {r.host && <Field label="Host" value={r.host} color="text-gray-400" />}
                      </div>

                      {r.params && Object.keys(r.params).length > 0 && (
                        <div>
                          <p className="text-[10px] uppercase text-gray-500 mb-1">Params</p>
                          <pre className="bg-black/50 rounded p-2 overflow-x-auto text-gray-300">
                            {JSON.stringify(r.params, null, 2)}
                          </pre>
                        </div>
                      )}
                      {r.summary && Object.keys(r.summary).length > 0 && (
                        <div>
                          <p className="text-[10px] uppercase text-gray-500 mb-1">Summary</p>
                          <pre className="bg-black/50 rounded p-2 overflow-x-auto text-gray-300">
                            {JSON.stringify(r.summary, null, 2)}
                          </pre>
                        </div>
                      )}
                      {r.error_message && (
                        <div>
                          <p className="text-[10px] uppercase text-red-400 mb-1">Error</p>
                          <pre className="bg-red-950/30 border border-red-900/50 rounded p-2 overflow-x-auto text-red-300 whitespace-pre-wrap">
                            {r.error_message}
                          </pre>
                        </div>
                      )}
                      <p className="text-[10px] text-gray-600 font-mono pt-1">run_id: {r.id}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* RECENT ERRORS */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
          <Terminal className="h-4 w-4 text-red-400" /> Recent errors
        </h2>
        {errors.length === 0 ? (
          <p className="text-sm text-gray-500">No errors logged.</p>
        ) : (
          <div className="space-y-2">
            {errors.map(e => (
              <div key={e.id} className="bg-red-950/20 border border-red-900/40 rounded-lg p-3 text-xs">
                <div className="flex items-center gap-2 text-[10px] text-gray-500 mb-1">
                  <Clock className="h-3 w-3" /> {fmtRelative(e.created_at)}
                  {e.target_url && (
                    <a href={e.target_url} target="_blank" rel="noopener noreferrer"
                       className="text-blue-400 hover:underline truncate max-w-[400px]">
                      {e.target_url}
                    </a>
                  )}
                </div>
                <p className="text-red-300 break-words">{e.message}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function Field({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase text-gray-500">{label}</p>
      <p className={`font-semibold ${color}`}>{value}</p>
    </div>
  )
}
