"use client"

import { useState } from "react"
import { Trash2, Plus, Loader2 } from "lucide-react"

interface StudentRow {
  email: string
  added_by: string | null
  added_at: string
  notes: string | null
}

interface Props {
  initialStudents: StudentRow[]
}

export function StudentsClient({ initialStudents }: Props) {
  const [students, setStudents] = useState<StudentRow[]>(initialStudents)
  const [emails, setEmails] = useState("")
  const [notes, setNotes] = useState("")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function refresh() {
    const r = await fetch("/api/admin/students", { cache: "no-store" })
    const j = await r.json()
    if (Array.isArray(j.students)) setStudents(j.students)
  }

  async function addEmails() {
    setMsg(null)
    const list = emails
      .split(/[\n,]/)
      .map(s => s.trim())
      .filter(Boolean)
    if (list.length === 0) { setMsg("Enter at least one email."); return }

    setBusy(true)
    try {
      const r = await fetch("/api/admin/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: list, notes: notes.trim() || null }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || "Failed")
      setMsg(`✓ Added ${j.added} email(s)`)
      setEmails("")
      setNotes("")
      await refresh()
    } catch (e: any) {
      setMsg(`Error: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function removeEmail(email: string) {
    if (!confirm(`Remove ${email} from the allowlist? Their existing student tier will NOT be revoked automatically — you'd need to update the subscriptions table manually.`)) return
    setBusy(true)
    try {
      const r = await fetch(`/api/admin/students?email=${encodeURIComponent(email)}`, { method: "DELETE" })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.error || "Failed")
      }
      setStudents(s => s.filter(x => x.email !== email))
    } catch (e: any) {
      alert(`Error: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Add form */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Plus className="h-4 w-4" /> Add student emails
        </h2>
        <div className="space-y-3">
          <textarea
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            placeholder={"one@example.com\nanother@example.com\nor comma-separated"}
            rows={4}
            className="w-full px-3 py-2 rounded-lg bg-gray-950 border border-gray-700 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
          />
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder='Notes (e.g., "Mentorship 2026-Q1", "Private student")'
            className="w-full px-3 py-2 rounded-lg bg-gray-950 border border-gray-700 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={addEmails}
              disabled={busy}
              className="rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 text-sm font-medium text-white inline-flex items-center gap-2"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add to allowlist
            </button>
            {msg && <p className="text-sm text-gray-400">{msg}</p>}
          </div>
        </div>
      </div>

      {/* List */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Current students ({students.length})</h2>
        </div>
        {students.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">No students yet. Add some emails above.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-950 text-xs uppercase text-gray-500 border-b border-gray-800">
              <tr>
                <th className="text-left px-5 py-2.5 font-medium">Email</th>
                <th className="text-left px-5 py-2.5 font-medium">Notes</th>
                <th className="text-left px-5 py-2.5 font-medium">Added</th>
                <th className="text-right px-5 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.email} className="border-b border-gray-800 last:border-0 hover:bg-gray-950/50">
                  <td className="px-5 py-3 text-white font-mono text-xs">{s.email}</td>
                  <td className="px-5 py-3 text-gray-400">{s.notes ?? "—"}</td>
                  <td className="px-5 py-3 text-gray-500 text-xs">
                    {new Date(s.added_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => removeEmail(s.email)}
                      disabled={busy}
                      className="text-red-400 hover:text-red-300 disabled:opacity-50 inline-flex items-center gap-1 text-xs"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </button>
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
