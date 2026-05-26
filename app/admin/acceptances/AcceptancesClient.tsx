"use client"

import { useState, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Plus, Trash2, Check, X, Loader2, ExternalLink, Search } from "lucide-react"
import type { AcceptanceRow } from "./page"

interface Props {
  initial: AcceptanceRow[]
  filters: { status?: string; country?: string }
  countries: string[]
}

const STATUS_COLORS: Record<string, string> = {
  accepted:   "bg-green-900/40 text-green-300 border-green-800",
  enrolled:   "bg-blue-900/40 text-blue-300 border-blue-800",
  waitlisted: "bg-amber-900/40 text-amber-300 border-amber-800",
  rejected:   "bg-red-900/40 text-red-300 border-red-800",
  withdrew:   "bg-gray-800 text-gray-300 border-gray-700",
}

const STATUSES = ["accepted", "enrolled", "waitlisted", "rejected", "withdrew"]

export function AcceptancesClient({ initial, filters, countries }: Props) {
  const router = useRouter()
  const params = useSearchParams()
  const [rows, setRows] = useState<AcceptanceRow[]>(initial)
  const [busy, setBusy] = useState<string | null>(null)

  // Add form
  const [showAdd, setShowAdd] = useState(false)
  const [progQuery, setProgQuery] = useState("")
  const [progSelected, setProgSelected] = useState<{ id: string; label: string } | null>(null)
  const [progResults, setProgResults] = useState<any[]>([])
  const [addCountry, setAddCountry] = useState("")
  const [addStatus, setAddStatus]   = useState("accepted")
  const [addYear, setAddYear]       = useState("")
  const [addSem, setAddSem]         = useState("")
  const [addNotes, setAddNotes]     = useState("")
  const [addVerified, setAddVerified] = useState(true)
  const [addMsg, setAddMsg] = useState<string | null>(null)

  function setFilter(key: string, value: string | null) {
    const p = new URLSearchParams(params?.toString() ?? "")
    if (value) p.set(key, value); else p.delete(key)
    router.push(`/admin/acceptances${p.toString() ? `?${p}` : ""}`)
  }

  async function searchPrograms(q: string) {
    setProgQuery(q); setProgSelected(null)
    if (q.trim().length < 3) { setProgResults([]); return }
    const r = await fetch(`/api/admin/programs/search?q=${encodeURIComponent(q.trim())}`).catch(() => null)
    if (r?.ok) {
      const j = await r.json()
      setProgResults(j.results ?? [])
    } else {
      // Fall back: simple fetch from the public programs endpoint if no admin search route
      setProgResults([])
    }
  }

  async function addManual() {
    if (!progSelected) { setAddMsg("Pick a program first."); return }
    if (!addCountry.trim()) { setAddMsg("Country is required."); return }
    setBusy("add")
    try {
      const r = await fetch("/api/admin/acceptances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          program_id: progSelected.id,
          country: addCountry.trim(),
          status: addStatus,
          intake_year: addYear ? Number(addYear) : null,
          intake_semester: addSem || null,
          notes: addNotes.trim() || null,
          admin_verified: addVerified,
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || "Failed")
      setShowAdd(false)
      setProgSelected(null); setProgQuery(""); setProgResults([])
      setAddCountry(""); setAddYear(""); setAddSem(""); setAddNotes("")
      router.refresh()
    } catch (e: any) {
      setAddMsg(e.message)
    } finally {
      setBusy(null)
    }
  }

  async function toggleVerified(r: AcceptanceRow) {
    setBusy(r.id)
    try {
      const res = await fetch(`/api/admin/acceptances/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_verified: !r.admin_verified }),
      })
      if (!res.ok) throw new Error((await res.json()).error || "Failed")
      setRows(s => s.map(x => x.id === r.id ? { ...x, admin_verified: !r.admin_verified } : x))
    } catch (e: any) { alert(e.message) } finally { setBusy(null) }
  }

  async function remove(r: AcceptanceRow) {
    if (!confirm(`Delete this record for ${r.program?.program_name ?? r.program_id}?`)) return
    setBusy(r.id)
    try {
      const res = await fetch(`/api/admin/acceptances/${r.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error((await res.json()).error || "Failed")
      setRows(s => s.filter(x => x.id !== r.id))
    } catch (e: any) { alert(e.message) } finally { setBusy(null) }
  }

  return (
    <div className="space-y-4">
      {/* Filters + Add button */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <Search className="h-3 w-3 text-gray-500" />
        <button
          onClick={() => setFilter("status", null)}
          className={`px-2 py-1 rounded ${!filters.status ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300 hover:text-white"}`}
        >
          All
        </button>
        {STATUSES.map(s => (
          <button
            key={s}
            onClick={() => setFilter("status", s)}
            className={`px-2 py-1 rounded ${filters.status === s ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300 hover:text-white"}`}
          >
            {s}
          </button>
        ))}
        {countries.length > 0 && (
          <select
            value={filters.country ?? ""}
            onChange={(e) => setFilter("country", e.target.value || null)}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 ml-2"
          >
            <option value="">All countries</option>
            {countries.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <button
          onClick={() => setShowAdd(s => !s)}
          className="ml-auto inline-flex items-center gap-1 rounded bg-purple-600 hover:bg-purple-700 px-3 py-1.5 text-white font-medium"
        >
          <Plus className="h-3 w-3" /> Add record
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-gray-900 border border-purple-900/50 rounded-xl p-5 space-y-3">
          <h3 className="font-semibold text-white text-sm">Record a new acceptance manually</h3>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Search program</label>
            <input
              type="text"
              value={progSelected ? progSelected.label : progQuery}
              onChange={(e) => searchPrograms(e.target.value)}
              placeholder="Type 3+ characters of program or university name"
              className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-white"
              disabled={!!progSelected}
            />
            {progSelected && (
              <button onClick={() => { setProgSelected(null); setProgQuery("") }}
                      className="text-xs text-blue-400 hover:text-blue-300 mt-1">Change</button>
            )}
            {!progSelected && progResults.length > 0 && (
              <div className="mt-1 max-h-40 overflow-y-auto bg-gray-950 border border-gray-700 rounded">
                {progResults.slice(0, 8).map((p: any) => (
                  <button
                    key={p.id}
                    onClick={() => setProgSelected({ id: p.id, label: `${p.program_name} — ${p.university}` })}
                    className="block w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800"
                  >
                    {p.program_name} <span className="text-gray-500">— {p.university} · {p.country}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <input value={addCountry} onChange={(e) => setAddCountry(e.target.value)} placeholder="Country *"
                   className="bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-white" />
            <select value={addStatus} onChange={(e) => setAddStatus(e.target.value)}
                    className="bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-white">
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <input type="number" min={2020} max={2035} value={addYear} onChange={(e) => setAddYear(e.target.value)}
                   placeholder="Year" className="bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-white" />
            <select value={addSem} onChange={(e) => setAddSem(e.target.value)}
                    className="bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-white">
              <option value="">Semester</option>
              <option value="Fall">Fall</option>
              <option value="Spring">Spring</option>
              <option value="Summer">Summer</option>
            </select>
          </div>
          <input value={addNotes} onChange={(e) => setAddNotes(e.target.value)} placeholder="Notes (optional)"
                 className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-xs text-white" />
          <label className="inline-flex items-center gap-1.5 text-xs text-gray-300">
            <input type="checkbox" checked={addVerified} onChange={(e) => setAddVerified(e.target.checked)} />
            Mark as admin-verified
          </label>
          {addMsg && <p className="text-xs text-red-400">{addMsg}</p>}
          <div className="flex gap-2">
            <button onClick={addManual} disabled={busy === "add"}
                    className="rounded bg-purple-600 hover:bg-purple-700 disabled:opacity-50 px-3 py-1.5 text-xs text-white font-medium inline-flex items-center gap-1">
              {busy === "add" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Save
            </button>
            <button onClick={() => setShowAdd(false)} className="text-xs text-gray-400 hover:text-white">Cancel</button>
          </div>
        </div>
      )}

      {/* List */}
      {rows.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <p className="text-sm text-gray-500">No records match these filters.</p>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-950 text-xs uppercase text-gray-500 border-b border-gray-800">
              <tr>
                <th className="text-left px-3 py-2.5">Program</th>
                <th className="text-left px-3 py-2.5">Country</th>
                <th className="text-left px-3 py-2.5">Status</th>
                <th className="text-left px-3 py-2.5">Intake</th>
                <th className="text-left px-3 py-2.5">Source</th>
                <th className="text-right px-3 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-b border-gray-800/60 last:border-0 hover:bg-gray-950/30 align-top">
                  <td className="px-3 py-3 max-w-md">
                    {r.program ? (
                      <>
                        <Link href={`/programs/${r.program_id}`} target="_blank"
                              className="text-blue-400 hover:text-blue-300 text-sm font-medium inline-flex items-center gap-1">
                          {r.program.program_name}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                        <p className="text-xs text-gray-500">{r.program.university} · {r.program.country}</p>
                      </>
                    ) : (
                      <span className="text-xs text-gray-500">program {r.program_id.slice(0, 8)}…</span>
                    )}
                    {r.notes && <p className="text-xs text-gray-400 italic mt-1">{r.notes}</p>}
                  </td>
                  <td className="px-3 py-3 text-gray-300 text-xs">{r.country}</td>
                  <td className="px-3 py-3">
                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${STATUS_COLORS[r.status] ?? "bg-gray-800 text-gray-300 border-gray-700"}`}>
                      {r.status}
                    </span>
                    {r.admin_verified && (
                      <span className="ml-1 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-300 inline-flex items-center gap-0.5">
                        <Check className="h-2.5 w-2.5" /> verified
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-300">
                    {r.intake_year ?? "—"}{r.intake_semester ? ` · ${r.intake_semester}` : ""}
                  </td>
                  <td className="px-3 py-3 text-xs">
                    <span className={r.submitted_by === "admin" ? "text-purple-300" : "text-gray-400"}>
                      {r.submitted_by}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <div className="inline-flex gap-1">
                      <button
                        onClick={() => toggleVerified(r)}
                        disabled={busy === r.id}
                        className={`p-1.5 rounded ${r.admin_verified ? "text-gray-400 hover:bg-gray-800" : "text-blue-400 hover:bg-blue-900/30"} disabled:opacity-30`}
                        title={r.admin_verified ? "Un-verify" : "Mark verified"}
                      >
                        {busy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : r.admin_verified ? <X className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                      </button>
                      <button onClick={() => remove(r)} disabled={busy === r.id}
                              className="p-1.5 rounded text-red-400 hover:bg-red-900/30 disabled:opacity-30" title="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
