"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ExternalLink, Loader2, EyeOff, Pencil, Check, X, Search } from "lucide-react"
import type { IssueRow } from "./page"

interface Props {
  rows: IssueRow[]
  filter: string
}

export function IssuesClient({ rows, filter }: Props) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")

  async function update(id: string, body: Record<string, any>, action: string) {
    setBusyId(id)
    try {
      const r = await fetch(`/api/admin/programs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      router.refresh()
    } catch (e: any) {
      alert(`${action} failed: ${e.message}`)
    } finally {
      setBusyId(null)
      setEditId(null)
    }
  }

  if (rows.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
        <p className="text-sm text-gray-500">Nothing flagged 🎉 — try a different filter or country.</p>
      </div>
    )
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-950/50 text-xs uppercase text-gray-500 border-b border-gray-800">
          <tr>
            <th className="text-left px-3 py-2">Program / University</th>
            <th className="text-left px-3 py-2">apply_url → host</th>
            <th className="text-left px-3 py-2">Flags</th>
            <th className="text-right px-3 py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isEditing = editId === r.id
            const host = (() => {
              try { return r.apply_url ? new URL(r.apply_url).hostname.replace(/^www\./, "") : "" }
              catch { return "" }
            })()
            return (
              <tr key={r.id} className="border-b border-gray-800/60 hover:bg-gray-800/20 align-top">
                <td className="px-3 py-3">
                  <Link href={`/programs/${r.id}`} target="_blank" className="text-blue-400 hover:text-blue-300 font-medium">
                    {r.program_name}
                  </Link>
                  <p className="text-xs text-gray-500">{r.university}</p>
                  <p className="text-xs text-gray-600">{r.country}{!r.is_active && " · INACTIVE"}</p>
                </td>
                <td className="px-3 py-3 max-w-md">
                  {isEditing ? (
                    <div className="flex gap-1 items-start">
                      <input
                        autoFocus
                        type="url"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && editValue.startsWith("http")) {
                            update(r.id, { apply_url: editValue, source_url: editValue }, "URL update")
                          } else if (e.key === "Escape") {
                            setEditId(null)
                          }
                        }}
                        className="flex-1 text-xs bg-gray-950 border border-gray-700 rounded px-2 py-1 text-gray-200 font-mono"
                        placeholder="https://..."
                      />
                      <button
                        onClick={() => editValue.startsWith("http") && update(r.id, { apply_url: editValue, source_url: editValue }, "URL update")}
                        disabled={!editValue.startsWith("http") || busyId === r.id}
                        className="p-1 text-green-400 hover:bg-green-900/30 rounded disabled:opacity-30"
                      >
                        {busyId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                      </button>
                      <button onClick={() => setEditId(null)} className="p-1 text-gray-400 hover:bg-gray-800 rounded">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : r.apply_url ? (
                    <a
                      href={r.apply_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-gray-400 hover:text-blue-300 inline-flex items-start gap-1 break-all"
                    >
                      <span className="font-mono">{host || r.apply_url.slice(0, 60)}</span>
                      <ExternalLink className="h-3 w-3 mt-0.5 shrink-0" />
                    </a>
                  ) : (
                    <span className="text-xs text-gray-600 italic">(none)</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-col gap-1">
                    {r.url_status && r.url_status !== "ok" && (
                      <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded inline-block w-fit ${
                        r.url_status === "dead" ? "bg-red-900/40 text-red-300"
                          : r.url_status === "timeout" ? "bg-amber-900/40 text-amber-300"
                          : r.url_status === "wrong_domain" ? "bg-orange-900/40 text-orange-300"
                          : "bg-gray-800 text-gray-300"
                      }`}>
                        {r.url_status}{r.url_http_code ? ` (${r.url_http_code})` : ""}
                      </span>
                    )}
                    {r.domain_match_status && r.domain_match_status !== "match" && (
                      <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded inline-block w-fit ${
                        r.domain_match_status === "mismatch" ? "bg-red-900/40 text-red-300"
                          : r.domain_match_status === "aggregator" ? "bg-orange-900/40 text-orange-300"
                          : "bg-gray-800 text-gray-300"
                      }`}>
                        {r.domain_match_status}
                      </span>
                    )}
                    {r.url_check_error && (
                      <span className="text-[10px] text-gray-500 truncate max-w-xs" title={r.url_check_error}>
                        {r.url_check_error.slice(0, 50)}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-3 text-right whitespace-nowrap">
                  <div className="inline-flex gap-1">
                    <button
                      onClick={() => { setEditId(r.id); setEditValue(r.apply_url ?? "") }}
                      disabled={busyId !== null}
                      className="p-1.5 text-blue-400 hover:bg-blue-900/30 rounded disabled:opacity-30"
                      title="Edit URL"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <a
                      href={`https://duckduckgo.com/?q=${encodeURIComponent(`"${r.program_name}" site:${r.university.toLowerCase().replace(/\s+/g, "")}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 text-purple-400 hover:bg-purple-900/30 rounded inline-flex"
                      title="Search DuckDuckGo for the correct URL"
                    >
                      <Search className="h-3.5 w-3.5" />
                    </a>
                    {r.is_active && (
                      <button
                        onClick={() => {
                          if (!confirm(`Hide "${r.program_name}" from the public catalog?`)) return
                          update(r.id, { is_active: false }, "Deactivate")
                        }}
                        disabled={busyId !== null}
                        className="p-1.5 text-red-400 hover:bg-red-900/30 rounded disabled:opacity-30"
                        title="Mark inactive (hide from public site)"
                      >
                        <EyeOff className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
