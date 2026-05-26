"use client"

import { useState, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ExternalLink, Calendar, MapPin, Tag, Trash2, EyeOff, Eye, Loader2, Search } from "lucide-react"
import type { OpportunityRow } from "./page"

interface Props {
  opportunities: OpportunityRow[]
  filters: { country?: string; type?: string; q?: string }
}

const TYPE_COLORS: Record<string, string> = {
  scholarship: "bg-blue-900/30 text-blue-200 border-blue-800",
  grant:       "bg-green-900/30 text-green-200 border-green-800",
  phd:         "bg-purple-900/30 text-purple-200 border-purple-800",
  postdoc:     "bg-indigo-900/30 text-indigo-200 border-indigo-800",
  fellowship:  "bg-amber-900/30 text-amber-200 border-amber-800",
  internship:  "bg-teal-900/30 text-teal-200 border-teal-800",
  bursary:     "bg-orange-900/30 text-orange-200 border-orange-800",
  assistantship: "bg-pink-900/30 text-pink-200 border-pink-800",
  exchange:    "bg-cyan-900/30 text-cyan-200 border-cyan-800",
}

const TYPES = ["scholarship","grant","phd","postdoc","fellowship","internship","bursary","assistantship","exchange"]

export function OpportunitiesClient({ opportunities, filters }: Props) {
  const router = useRouter()
  const params = useSearchParams()
  const [busy, setBusy] = useState<string | null>(null)
  const [q, setQ] = useState(filters.q ?? "")

  const countries = useMemo(() =>
    Array.from(new Set(opportunities.map(o => o.country))).sort(),
    [opportunities])

  function updateFilter(key: string, value: string | null) {
    const p = new URLSearchParams(params?.toString() ?? "")
    if (value) p.set(key, value); else p.delete(key)
    router.push(`/admin/opportunities${p.toString() ? `?${p}` : ""}`)
  }

  async function toggleActive(o: OpportunityRow) {
    setBusy(o.id)
    try {
      const r = await fetch(`/api/admin/opportunities/${o.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !o.is_active }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.error || "Failed")
      }
      router.refresh()
    } catch (e: any) {
      alert(`Error: ${e.message}`)
    } finally {
      setBusy(null)
    }
  }

  async function remove(o: OpportunityRow) {
    if (!confirm(`Delete "${o.title}"? This removes it from the registry permanently.`)) return
    setBusy(o.id)
    try {
      const r = await fetch(`/api/admin/opportunities/${o.id}`, { method: "DELETE" })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.error || "Failed")
      }
      router.refresh()
    } catch (e: any) {
      alert(`Error: ${e.message}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex items-center gap-2 flex-wrap text-xs">
        <Search className="h-3 w-3 text-gray-500" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && updateFilter("q", q || null)}
          placeholder="Search title…"
          className="flex-1 min-w-[200px] bg-gray-950 border border-gray-700 rounded px-2 py-1 text-white placeholder-gray-500"
        />
        <select
          value={filters.type ?? ""}
          onChange={(e) => updateFilter("type", e.target.value || null)}
          className="bg-gray-950 border border-gray-700 rounded px-2 py-1 text-gray-200"
        >
          <option value="">All types</option>
          {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          value={filters.country ?? ""}
          onChange={(e) => updateFilter("country", e.target.value || null)}
          className="bg-gray-950 border border-gray-700 rounded px-2 py-1 text-gray-200"
        >
          <option value="">All countries</option>
          {countries.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {(filters.q || filters.type || filters.country) && (
          <button
            onClick={() => { setQ(""); router.push("/admin/opportunities") }}
            className="text-blue-400 hover:text-blue-300"
          >Clear</button>
        )}
      </div>

      {opportunities.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <p className="text-sm text-gray-500">
            No opportunities yet. Run the Discoverer:
            {" "}<code className="bg-gray-800 px-1.5 py-0.5 rounded text-xs">python crawlers/discover_opportunities.py --queue 1 --limit 5 --max-usd 0.50</code>
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {opportunities.map(o => (
            <div key={o.id} className={`bg-gray-900 border ${o.is_active ? "border-gray-800" : "border-gray-900 opacity-60"} rounded-xl p-4`}>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${TYPE_COLORS[o.type] ?? "bg-gray-800 text-gray-300 border-gray-700"}`}>
                      {o.type}
                    </span>
                    {o.degree_level && (
                      <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-gray-800 text-gray-300">
                        {o.degree_level}
                      </span>
                    )}
                    {o.funding_type && (
                      <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-green-900/40 text-green-300">
                        {o.funding_type}
                      </span>
                    )}
                    <span className="text-xs text-gray-500 inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {o.country}
                    </span>
                    {o.university && (
                      <span className="text-xs text-gray-500">· {o.university}</span>
                    )}
                  </div>
                  <h3 className="text-white font-medium">{o.title}</h3>
                  {o.description && <p className="text-xs text-gray-400 mt-1">{o.description}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => toggleActive(o)}
                    disabled={busy === o.id}
                    className={`p-1.5 rounded ${o.is_active ? "text-amber-400 hover:bg-amber-900/30" : "text-green-400 hover:bg-green-900/30"} disabled:opacity-30`}
                    title={o.is_active ? "Hide from public" : "Restore"}
                  >
                    {busy === o.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : o.is_active ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={() => remove(o)}
                    disabled={busy === o.id}
                    className="p-1.5 rounded text-red-400 hover:bg-red-900/30 disabled:opacity-30"
                    title="Delete permanently"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mt-3">
                {(o.amount_usd || o.amount_text) && (
                  <Field label="Amount" value={o.amount_usd ? `$${o.amount_usd.toLocaleString()}` : o.amount_text ?? ""} />
                )}
                {(o.deadline || o.deadline_text) && (
                  <Field label="Deadline" value={o.deadline ?? o.deadline_text ?? ""} icon={Calendar} />
                )}
                {o.intake && <Field label="Intake" value={o.intake} />}
                {o.eligible_nations.length > 0 && (
                  <Field label="Eligible" value={o.eligible_nations.slice(0, 4).join(", ") + (o.eligible_nations.length > 4 ? "…" : "")} />
                )}
              </div>

              {o.eligibility_text && (
                <p className="text-xs text-gray-500 mt-2 italic">{o.eligibility_text}</p>
              )}

              <div className="mt-3 pt-2 border-t border-gray-800 flex items-center justify-between gap-3 text-[10px] text-gray-600">
                <div className="flex items-center gap-3 flex-wrap">
                  {o.field_of_study.length > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Tag className="h-3 w-3" />
                      {o.field_of_study.slice(0, 3).join(" · ")}
                    </span>
                  )}
                  <span>discovered {new Date(o.discovered_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}</span>
                  <span>prompt {o.prompt_version}</span>
                </div>
                <div className="flex gap-2">
                  {o.apply_url && (
                    <a href={o.apply_url} target="_blank" rel="noopener noreferrer"
                       className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1">
                      apply <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  )}
                  <a href={o.source_url} target="_blank" rel="noopener noreferrer"
                     className="text-gray-500 hover:text-gray-300 inline-flex items-center gap-1">
                    source <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Field({ label, value, icon: Icon }: { label: string; value: string; icon?: any }) {
  return (
    <div>
      <p className="text-[10px] uppercase text-gray-500 font-bold">{label}</p>
      <p className="text-white inline-flex items-center gap-1">
        {Icon && <Icon className="h-3 w-3" />}
        {value}
      </p>
    </div>
  )
}
