"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Check, X, ExternalLink, Loader2, AlertCircle } from "lucide-react"
import type { FeedbackRow } from "./page"

interface Props {
  rows: FeedbackRow[]
  tab: FeedbackRow["status"]
}

const ISSUE_LABELS: Record<string, string> = {
  wrong_requirement: "Wrong requirement",
  broken_link:       "Broken link",
  missing_info:      "Missing info",
  incorrect_tuition: "Incorrect tuition",
  outdated_info:     "Outdated info",
  other:             "Other",
}

const ISSUE_COLORS: Record<string, string> = {
  broken_link:       "bg-red-900/30 text-red-300",
  incorrect_tuition: "bg-amber-900/30 text-amber-300",
  wrong_requirement: "bg-orange-900/30 text-orange-300",
  outdated_info:     "bg-purple-900/30 text-purple-300",
  missing_info:      "bg-blue-900/30 text-blue-300",
  other:             "bg-gray-800 text-gray-300",
}

export function FeedbackClient({ rows, tab }: Props) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)

  async function resolve(row: FeedbackRow, applySuggestion: boolean) {
    const note = prompt(
      applySuggestion
        ? `Apply suggested value to program field "${row.field}" and mark resolved?\n\nValue: ${row.suggested_value}\n\n(Optional admin note)`
        : "Mark this feedback as resolved? (Optional admin note)"
    )
    if (note === null) return // user cancelled prompt

    setBusyId(row.id)
    try {
      const body: any = { status: "resolved", admin_note: note || null }
      if (applySuggestion && row.field && row.suggested_value !== null) {
        // For numeric fields, try to parse. Otherwise pass through as string.
        let value: any = row.suggested_value
        const numericFields = ["tuition_usd_year", "duration_years", "ielts_min", "gpa_min"]
        if (numericFields.includes(row.field)) {
          const n = Number(value)
          if (Number.isFinite(n)) value = n
        }
        if (row.field === "scholarship_available") {
          value = /^(true|yes|1)$/i.test(String(value))
        }
        body.apply = { field: row.field, value }
      }

      const r = await fetch(`/api/admin/feedback/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      router.refresh()
    } catch (e: any) {
      alert(`Failed: ${e.message}`)
    } finally {
      setBusyId(null)
    }
  }

  async function reject(row: FeedbackRow) {
    const note = prompt("Reason for rejecting this feedback (required):")
    if (!note || !note.trim()) return
    setBusyId(row.id)
    try {
      const r = await fetch(`/api/admin/feedback/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "rejected", admin_note: note.trim() }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      router.refresh()
    } catch (e: any) {
      alert(`Failed: ${e.message}`)
    } finally {
      setBusyId(null)
    }
  }

  if (rows.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
        <p className="text-sm text-gray-500">No {tab} feedback.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const hasSuggestion = r.field && r.suggested_value
        return (
          <div key={r.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${ISSUE_COLORS[r.issue_type] ?? ISSUE_COLORS.other}`}>
                    {ISSUE_LABELS[r.issue_type] ?? r.issue_type}
                  </span>
                  {r.field && (
                    <span className="text-[10px] font-bold uppercase tracking-wide bg-gray-800 text-gray-300 px-2 py-0.5 rounded">
                      field: {r.field}
                    </span>
                  )}
                  <span className="text-xs text-gray-500">
                    {new Date(r.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                {r.program_name && (
                  <Link
                    href={`/programs/${r.program_id}`}
                    target="_blank"
                    className="text-sm text-blue-400 hover:text-blue-300 font-medium"
                  >
                    {r.program_name} <ExternalLink className="h-3 w-3 inline-block ml-0.5" />
                  </Link>
                )}
                {r.university && (
                  <p className="text-xs text-gray-500">{r.university}</p>
                )}
                {r.user_email && (
                  <p className="text-xs text-gray-600 mt-1">— {r.user_email}</p>
                )}
              </div>
            </div>

            {/* Suggested change */}
            {hasSuggestion && (
              <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
                <div className="bg-red-950/30 border border-red-900/40 rounded-lg p-3">
                  <p className="text-[10px] font-bold uppercase text-red-400 mb-1">Current</p>
                  <p className="text-red-200 font-mono text-xs break-words">{r.current_value || "(empty)"}</p>
                </div>
                <div className="bg-green-950/30 border border-green-900/40 rounded-lg p-3">
                  <p className="text-[10px] font-bold uppercase text-green-400 mb-1">Suggested</p>
                  <p className="text-green-200 font-mono text-xs break-words">{r.suggested_value}</p>
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="bg-gray-950 border border-gray-800 rounded-lg p-3 mb-3">
              <p className="text-xs text-gray-300 whitespace-pre-wrap">{r.notes}</p>
            </div>

            {/* Evidence */}
            {r.evidence_url && (
              <div className="mb-3">
                <a
                  href={r.evidence_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                >
                  <AlertCircle className="h-3 w-3" /> Evidence: {r.evidence_url.length > 70 ? r.evidence_url.slice(0, 70) + "…" : r.evidence_url}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}

            {/* Admin note (for resolved/rejected) */}
            {r.admin_note && (
              <div className="bg-gray-950 border-l-2 border-blue-700 rounded-r-lg p-2.5 mb-3">
                <p className="text-[10px] font-bold uppercase text-blue-400 mb-0.5">Admin note</p>
                <p className="text-xs text-gray-300">{r.admin_note}</p>
              </div>
            )}

            {/* Actions (pending only) */}
            {tab === "pending" && (
              <div className="flex gap-2 flex-wrap pt-1">
                {hasSuggestion && (
                  <button
                    onClick={() => resolve(r, true)}
                    disabled={busyId !== null}
                    className="rounded bg-green-600 hover:bg-green-700 disabled:opacity-50 px-3 py-1.5 text-xs font-medium text-white inline-flex items-center gap-1"
                  >
                    {busyId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    Apply &amp; resolve
                  </button>
                )}
                <button
                  onClick={() => resolve(r, false)}
                  disabled={busyId !== null}
                  className="rounded border border-green-700 hover:bg-green-900/30 disabled:opacity-50 px-3 py-1.5 text-xs font-medium text-green-400 inline-flex items-center gap-1"
                >
                  <Check className="h-3 w-3" /> Resolve only
                </button>
                <button
                  onClick={() => reject(r)}
                  disabled={busyId !== null}
                  className="rounded bg-red-600 hover:bg-red-700 disabled:opacity-50 px-3 py-1.5 text-xs font-medium text-white inline-flex items-center gap-1"
                >
                  <X className="h-3 w-3" /> Reject
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
