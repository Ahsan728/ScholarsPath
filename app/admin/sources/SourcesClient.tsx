"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Loader2, Trash2, ExternalLink, Search, Clock, Play } from "lucide-react"
import type { SourceRow } from "./page"

interface Props {
  initialSources: SourceRow[]
}

const SCOPES = [
  "pan_european", "national_portal", "regional",
  "university", "funding_body", "aggregator",
] as const

const SCOPE_COLORS: Record<string, string> = {
  pan_european:    "bg-purple-900/40 text-purple-200 border-purple-800",
  national_portal: "bg-blue-900/40 text-blue-200 border-blue-800",
  regional:        "bg-green-900/40 text-green-200 border-green-800",
  university:      "bg-indigo-900/40 text-indigo-200 border-indigo-800",
  funding_body:    "bg-amber-900/40 text-amber-200 border-amber-800",
  aggregator:      "bg-red-900/40 text-red-200 border-red-800",
}

const SCOPE_LABELS: Record<string, string> = {
  pan_european:    "Pan-EU",
  national_portal: "National",
  regional:        "Regional",
  university:      "University",
  funding_body:    "Funding body",
  aggregator:      "Aggregator",
}

export function SourcesClient({ initialSources }: Props) {
  const router = useRouter()
  const [sources, setSources] = useState<SourceRow[]>(initialSources)
  const [filter, setFilter] = useState<string>("all")
  const [countryFilter, setCountryFilter] = useState<string>("all")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  // Add form
  const [newUrl, setNewUrl] = useState("")
  const [newCountry, setNewCountry] = useState("")
  const [newScope, setNewScope] = useState<typeof SCOPES[number]>("university")
  const [newTitle, setNewTitle] = useState("")
  const [newNotes, setNewNotes] = useState("")

  const countries = useMemo(() => {
    const set = new Set(sources.map(s => s.country).filter((c): c is string => !!c))
    return Array.from(set).sort()
  }, [sources])

  const filtered = useMemo(() => {
    return sources.filter(s => {
      if (filter !== "all" && s.scope !== filter) return false
      if (countryFilter !== "all" && s.country !== countryFilter) return false
      return true
    })
  }, [sources, filter, countryFilter])

  async function addSource() {
    setMsg(null)
    const url = newUrl.trim()
    if (!url.startsWith("http")) { setMsg("URL must start with http:// or https://"); return }
    setBusy(true)
    try {
      const r = await fetch("/api/admin/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          country: newCountry.trim() || null,
          scope:   newScope,
          title:   newTitle.trim() || null,
          notes:   newNotes.trim() || null,
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      if (j.duplicate) {
        setMsg("Already in registry — nothing changed.")
      } else {
        setMsg("✓ Added — processing...")
        // Auto-process: extract programs + opportunities from the new source
        if (j.id) {
          try {
            const pr = await fetch("/api/admin/sources/process", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ source_id: j.id }),
            })
            const pj = await pr.json()
            if (pr.ok) {
              setMsg(`✓ Done — ${pj.programs || 0} programs + ${pj.opportunities || 0} opportunities extracted`)
            } else {
              setMsg(`✓ Added but processing failed: ${pj.error || "unknown error"}`)
            }
          } catch (pe: any) {
            setMsg(`✓ Added but processing error: ${pe.message}`)
          }
        }
      }
      setNewUrl(""); setNewCountry(""); setNewTitle(""); setNewNotes("")
      router.refresh()
    } catch (e: any) {
      setMsg(`Error: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function processSource(id: string) {
    setBusy(true); setMsg(null)
    try {
      const r = await fetch("/api/admin/sources/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_id: id }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || "Failed")
      setMsg(`✓ ${j.programs || 0} programs + ${j.opportunities || 0} opportunities extracted`)
      router.refresh()
    } catch (e: any) {
      setMsg(`Processing failed: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function removeSource(id: string, url: string) {
    if (!confirm(`Remove "${url}" from the source registry?`)) return
    setBusy(true)
    try {
      const r = await fetch(`/api/admin/sources?id=${encodeURIComponent(id)}`, { method: "DELETE" })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.error || "Failed")
      }
      setSources(s => s.filter(x => x.id !== id))
    } catch (e: any) {
      alert(`Error: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Add form */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Plus className="h-4 w-4" /> Add a source
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            type="url"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="https://euraxess.ec.europa.eu/..."
            className="md:col-span-2 px-3 py-2 rounded-lg bg-gray-950 border border-gray-700 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none font-mono"
          />
          <input
            type="text"
            value={newCountry}
            onChange={(e) => setNewCountry(e.target.value)}
            placeholder="Country (e.g. Italy, Europe)"
            className="px-3 py-2 rounded-lg bg-gray-950 border border-gray-700 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
          />
          <select
            value={newScope}
            onChange={(e) => setNewScope(e.target.value as any)}
            className="px-3 py-2 rounded-lg bg-gray-950 border border-gray-700 text-sm text-white focus:border-blue-500 focus:outline-none"
          >
            {SCOPES.map(s => <option key={s} value={s}>{SCOPE_LABELS[s]}</option>)}
          </select>
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Short title (e.g. EURAXESS)"
            className="md:col-span-2 px-3 py-2 rounded-lg bg-gray-950 border border-gray-700 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
          />
          <textarea
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            placeholder="Notes (optional — when to use, scope of coverage, etc.)"
            rows={2}
            className="md:col-span-2 px-3 py-2 rounded-lg bg-gray-950 border border-gray-700 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-3 mt-3">
          <button
            onClick={addSource}
            disabled={busy}
            className="rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 text-sm font-medium text-white inline-flex items-center gap-2"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add source
          </button>
          {msg && <p className="text-sm text-gray-400">{msg}</p>}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <Search className="h-3 w-3 text-gray-500" />
        <span className="text-gray-500 mr-1">Filter:</span>
        <button
          onClick={() => setFilter("all")}
          className={`px-2 py-1 rounded ${filter === "all" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300 hover:text-white"}`}
        >
          All scopes ({sources.length})
        </button>
        {SCOPES.map(s => {
          const n = sources.filter(x => x.scope === s).length
          if (n === 0) return null
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-2 py-1 rounded ${filter === s ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300 hover:text-white"}`}
            >
              {SCOPE_LABELS[s]} ({n})
            </button>
          )
        })}
        {countries.length > 0 && (
          <>
            <span className="text-gray-500 ml-2">·</span>
            <select
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200"
            >
              <option value="all">All countries</option>
              {countries.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </>
        )}
      </div>

      {/* List */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">
            Sources ({filtered.length} of {sources.length})
          </h2>
        </div>
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">
            {sources.length === 0
              ? <>No sources yet. Run <code className="bg-gray-800 px-1.5 py-0.5 rounded text-xs">python crawlers/ingest_opportunity_sources.py</code> to populate from <code>Documents/sources/</code>, or add one above.</>
              : "No sources match these filters."}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-950 text-xs uppercase text-gray-500 border-b border-gray-800">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Scope</th>
                <th className="text-left px-4 py-2.5 font-medium">Country</th>
                <th className="text-left px-4 py-2.5 font-medium">URL / Title</th>
                <th className="text-left px-4 py-2.5 font-medium">Last crawled</th>
                <th className="text-right px-4 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id} className="border-b border-gray-800/60 last:border-0 hover:bg-gray-950/30 align-top">
                  <td className="px-4 py-3">
                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${SCOPE_COLORS[s.scope] ?? "bg-gray-800 text-gray-300 border-gray-700"}`}>
                      {SCOPE_LABELS[s.scope] ?? s.scope}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-300 text-xs">{s.country ?? "—"}</td>
                  <td className="px-4 py-3">
                    {s.title && <p className="text-white font-medium text-sm">{s.title}</p>}
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1 text-xs font-mono break-all"
                    >
                      {s.url.length > 80 ? s.url.slice(0, 80) + "…" : s.url}
                      <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    </a>
                    {s.notes && <p className="text-xs text-gray-500 mt-1 italic">{s.notes}</p>}
                    {s.source_doc && (
                      <p className="text-[10px] text-gray-600 mt-1">from: {s.source_doc}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {s.last_crawled_at ? (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(s.last_crawled_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                        {s.last_status && (
                          <span className={`ml-1 px-1 rounded text-[10px] ${s.last_status === "ok" ? "bg-green-900/40 text-green-300" : "bg-red-900/40 text-red-300"}`}>
                            {s.last_status}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-amber-400">uncrawled</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="inline-flex gap-2">
                      <button
                        onClick={() => processSource(s.id)}
                        disabled={busy}
                        className="text-green-400 hover:text-green-300 disabled:opacity-50 inline-flex items-center gap-1 text-xs"
                        title="Process: extract programs + opportunities from this URL"
                      >
                        <Play className="h-3.5 w-3.5" /> Process
                      </button>
                      <button
                        onClick={() => removeSource(s.id, s.url)}
                        disabled={busy}
                        className="text-red-400 hover:text-red-300 disabled:opacity-50 inline-flex items-center gap-1 text-xs"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
