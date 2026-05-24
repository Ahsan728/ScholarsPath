"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, X, ExternalLink, Loader2 } from "lucide-react"
import type { PaymentRow } from "./page"

interface Props {
  rows: PaymentRow[]
  tab: PaymentRow["status"]
}

const PLAN_LABELS = { monthly: "Monthly", semi: "6 Months", annual: "Annual" } as const

export function PaymentsClient({ rows, tab }: Props) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)

  async function approve(id: string) {
    if (!confirm("Approve this payment? User will be granted Pro access for the plan duration.")) return
    setBusyId(id)
    try {
      const r = await fetch(`/api/admin/payments/${id}/approve`, { method: "POST" })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      router.refresh()
    } catch (e: any) {
      alert(`Failed: ${e.message}`)
    } finally {
      setBusyId(null)
    }
  }

  async function reject(id: string) {
    const note = prompt("Reason for rejection (required — this will be emailed to the user):")
    if (!note || !note.trim()) return
    setBusyId(id)
    try {
      const r = await fetch(`/api/admin/payments/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_note: note.trim() }),
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
        <p className="text-sm text-gray-500">No {tab} payments.</p>
      </div>
    )
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-950 text-xs uppercase text-gray-500 border-b border-gray-800">
          <tr>
            <th className="text-left px-4 py-2.5 font-medium">Email</th>
            <th className="text-left px-4 py-2.5 font-medium">Plan</th>
            <th className="text-left px-4 py-2.5 font-medium">Method</th>
            <th className="text-left px-4 py-2.5 font-medium">Txn ID</th>
            <th className="text-left px-4 py-2.5 font-medium">Receipt</th>
            <th className="text-left px-4 py-2.5 font-medium">Submitted</th>
            <th className="text-right px-4 py-2.5 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-950/50 align-top">
              <td className="px-4 py-3 text-white font-mono text-xs">{r.email}</td>
              <td className="px-4 py-3 text-gray-300">
                {PLAN_LABELS[r.plan]} <span className="text-gray-500">·</span> <span className="text-blue-400 font-semibold">${r.amount_usd}</span>
              </td>
              <td className="px-4 py-3 text-gray-400">{r.method}</td>
              <td className="px-4 py-3 text-gray-400 font-mono text-xs max-w-[150px] truncate">{r.transaction_id ?? "—"}</td>
              <td className="px-4 py-3">
                {r.receipt_signed_url ? (
                  <a
                    href={r.receipt_signed_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs"
                  >
                    View <ExternalLink className="h-3 w-3" />
                  </a>
                ) : <span className="text-gray-600 text-xs">none</span>}
              </td>
              <td className="px-4 py-3 text-gray-500 text-xs">
                {new Date(r.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
              </td>
              <td className="px-4 py-3 text-right">
                {tab === "pending" ? (
                  <div className="inline-flex gap-2">
                    <button
                      onClick={() => approve(r.id)}
                      disabled={busyId !== null}
                      className="rounded bg-green-600 hover:bg-green-700 disabled:opacity-50 px-2.5 py-1 text-xs font-medium text-white inline-flex items-center gap-1"
                    >
                      {busyId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                      Approve
                    </button>
                    <button
                      onClick={() => reject(r.id)}
                      disabled={busyId !== null}
                      className="rounded bg-red-600 hover:bg-red-700 disabled:opacity-50 px-2.5 py-1 text-xs font-medium text-white inline-flex items-center gap-1"
                    >
                      <X className="h-3 w-3" /> Reject
                    </button>
                  </div>
                ) : tab === "rejected" && r.admin_note ? (
                  <span className="text-xs text-gray-500 italic" title={r.admin_note}>
                    {r.admin_note.length > 40 ? r.admin_note.slice(0, 40) + "…" : r.admin_note}
                  </span>
                ) : (
                  <span className="text-xs text-gray-600">
                    {r.reviewed_at ? new Date(r.reviewed_at).toLocaleDateString() : "—"}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
