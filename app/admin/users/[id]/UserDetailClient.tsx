"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ExternalLink, Loader2, Mail, Globe, GraduationCap, MessageSquareWarning, Receipt, Save, Check, X } from "lucide-react"
import type { UserDetail, FeedbackRow, AcceptanceRow, PaymentRow } from "./page"

interface Props {
  user: UserDetail
  feedback: FeedbackRow[]
  acceptances: AcceptanceRow[]
  payments: PaymentRow[]
}

const TIER_COLORS: Record<string, string> = {
  free:    "bg-gray-700 text-gray-200 border-gray-600",
  pro:     "bg-blue-900/50 text-blue-200 border-blue-800",
  student: "bg-purple-900/50 text-purple-200 border-purple-800",
}

const FB_STATUS_COLORS: Record<string, string> = {
  pending:  "bg-amber-900/40 text-amber-300",
  resolved: "bg-green-900/40 text-green-300",
  rejected: "bg-red-900/40 text-red-300",
}

const PAY_STATUS_COLORS: Record<string, string> = {
  pending:  "bg-amber-900/40 text-amber-300",
  approved: "bg-green-900/40 text-green-300",
  rejected: "bg-red-900/40 text-red-300",
}

export function UserDetailClient({ user, feedback, acceptances, payments }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [tier, setTier] = useState(user.tier)
  const [periodEnd, setPeriodEnd] = useState(user.current_period_end?.slice(0, 10) ?? "")
  const [allowlistNote, setAllowlistNote] = useState(user.mentorship_note ?? "")
  const [msg, setMsg] = useState<string | null>(null)

  async function saveTier() {
    setMsg(null); setBusy("tier")
    try {
      const r = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier,
          current_period_end: periodEnd ? new Date(periodEnd).toISOString() : null,
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || "Failed")
      setMsg("✓ Tier saved")
      router.refresh()
    } catch (e: any) { setMsg(`Error: ${e.message}`) }
    finally { setBusy(null) }
  }

  async function toggleAllowlist(add: boolean) {
    if (!user.email) { setMsg("User has no email — cannot allowlist"); return }
    setBusy("allowlist")
    try {
      if (add) {
        const r = await fetch("/api/admin/students", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emails: [user.email], notes: allowlistNote.trim() || null }),
        })
        if (!r.ok) throw new Error((await r.json()).error || "Failed")
      } else {
        const r = await fetch(`/api/admin/students?email=${encodeURIComponent(user.email)}`, { method: "DELETE" })
        if (!r.ok) throw new Error((await r.json()).error || "Failed")
      }
      router.refresh()
    } catch (e: any) { setMsg(`Error: ${e.message}`) }
    finally { setBusy(null) }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${TIER_COLORS[user.tier] ?? TIER_COLORS.free}`}>
                {user.tier}
              </span>
              {user.in_allowlist && (
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-amber-900/40 text-amber-300">
                  mentorship
                </span>
              )}
              {!user.onboarded && (
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-red-900/40 text-red-300">
                  not onboarded
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold text-white">
              {user.full_name || <span className="text-gray-500 italic">(no name)</span>}
            </h1>
            <p className="text-sm text-blue-400 inline-flex items-center gap-1 mt-1">
              <Mail className="h-3.5 w-3.5" />
              {user.email ?? <span className="text-gray-500 italic">(no email)</span>}
            </p>
            <p className="text-[10px] text-gray-600 mt-1 font-mono">id: {user.id}</p>
          </div>
          <div className="text-right text-xs text-gray-500">
            <p>Joined {new Date(user.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</p>
            {user.current_period_end && (
              <p className="text-gray-300 mt-0.5">{user.tier} until {new Date(user.current_period_end).toLocaleDateString("en-GB")}</p>
            )}
          </div>
        </div>

        {/* Profile snapshot */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs pt-4 border-t border-gray-800">
          {user.nationality && <Field label="Nationality" value={user.nationality} icon={<Globe className="h-3 w-3" />} />}
          {user.residence    && <Field label="Residence"   value={user.residence} />}
          {user.degree_level && <Field label="Degree"      value={user.degree_level} />}
          {user.gpa != null  && <Field label="GPA"         value={String(user.gpa)} />}
          {user.field_of_study?.length ? <Field label="Fields"  value={user.field_of_study.slice(0, 3).join(", ")} /> : null}
          {user.target_countries?.length ? <Field label="Target" value={user.target_countries.slice(0, 4).join(", ")} /> : null}
          {user.has_publications != null && <Field label="Publications" value={user.has_publications ? "Yes" : "No"} />}
          {user.digest_frequency && <Field label="Digest" value={user.digest_frequency} />}
        </div>

        {/* Usage */}
        {((user.cv_eval_used ?? 0) > 0 || (user.rag_queries_month ?? 0) > 0) && (
          <div className="mt-3 pt-3 border-t border-gray-800 text-xs text-gray-400">
            {(user.cv_eval_used ?? 0) > 0 && (
              <span className="mr-3">CV evals this month: <strong className="text-white">{user.cv_eval_used}</strong></span>
            )}
            {(user.rag_queries_month ?? 0) > 0 && (
              <span>RAG queries this month: <strong className="text-white">{user.rag_queries_month}</strong></span>
            )}
          </div>
        )}
      </div>

      {/* Admin actions */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white">Admin actions</h2>

        {/* Tier + period_end */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <div>
            <label className="block text-[10px] uppercase text-gray-500 font-bold mb-1">Tier</label>
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value as any)}
              className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
            >
              <option value="free">free</option>
              <option value="pro">pro</option>
              <option value="student">student</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase text-gray-500 font-bold mb-1">
              Period end {tier !== "free" ? "(when access expires)" : "(ignored on free)"}
            </label>
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
            />
          </div>
          <button
            onClick={saveTier}
            disabled={busy === "tier"}
            className="rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-3 py-2 text-sm text-white font-medium inline-flex items-center gap-1"
          >
            {busy === "tier" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save tier
          </button>
        </div>

        {/* Allowlist */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end pt-3 border-t border-gray-800">
          <div>
            <label className="block text-[10px] uppercase text-gray-500 font-bold mb-1">
              Mentorship allowlist {user.in_allowlist && "(currently IN — listed below)"}
            </label>
            <input
              type="text"
              value={allowlistNote}
              onChange={(e) => setAllowlistNote(e.target.value)}
              placeholder="Note (e.g., 'Mentorship 2026-Q1')"
              className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
              disabled={!user.email}
            />
          </div>
          {user.in_allowlist ? (
            <button
              onClick={() => toggleAllowlist(false)}
              disabled={busy === "allowlist"}
              className="rounded bg-red-600 hover:bg-red-700 disabled:opacity-50 px-3 py-2 text-sm text-white font-medium inline-flex items-center gap-1"
            >
              {busy === "allowlist" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
              Remove from allowlist
            </button>
          ) : (
            <button
              onClick={() => toggleAllowlist(true)}
              disabled={busy === "allowlist" || !user.email}
              className="rounded bg-purple-600 hover:bg-purple-700 disabled:opacity-50 px-3 py-2 text-sm text-white font-medium inline-flex items-center gap-1"
            >
              {busy === "allowlist" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Add to allowlist
            </button>
          )}
        </div>

        {msg && <p className="text-xs text-gray-400">{msg}</p>}
        <p className="text-[11px] text-gray-500">
          Tier change updates the <code>subscriptions</code> table. Allowlist toggle uses the existing
          <code> /api/admin/students</code> endpoint. Removing from allowlist doesn't auto-downgrade their
          tier — change it explicitly above if needed.
        </p>
      </div>

      {/* Acceptances */}
      <Section
        icon={<GraduationCap className="h-4 w-4 text-purple-400" />}
        title="Acceptances"
        count={acceptances.length}
        empty="No applications recorded."
      >
        {acceptances.map(a => (
          <div key={a.id} className="bg-gray-950/40 border border-gray-800 rounded-lg p-3 text-xs flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Link href={`/programs/${a.program_id}`} target="_blank" className="text-blue-400 hover:underline inline-flex items-center gap-1">
                {a.program_name || "(unknown program)"} <ExternalLink className="h-3 w-3" />
              </Link>
              <p className="text-gray-500">{a.university} · {a.country}</p>
              <div className="flex gap-3 text-gray-400 mt-1 flex-wrap">
                {a.gpa != null         && <span>GPA {a.gpa}</span>}
                {a.ielts_score != null && <span>IELTS {a.ielts_score}</span>}
                {(a.publications_count ?? 0) > 0 && <span>{a.publications_count} pubs</span>}
                {a.intake_year && <span>Intake {a.intake_year}{a.intake_semester ? ` ${a.intake_semester}` : ""}</span>}
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="text-[10px] uppercase font-bold bg-purple-900/40 text-purple-300 px-1.5 py-0.5 rounded">
                {a.status}
              </span>
              {a.admin_verified && <p className="text-[10px] text-blue-400 mt-1">✓ verified</p>}
              <p className="text-[10px] text-gray-600 mt-1">{new Date(a.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</p>
            </div>
          </div>
        ))}
      </Section>

      {/* Feedback */}
      <Section
        icon={<MessageSquareWarning className="h-4 w-4 text-orange-400" />}
        title="Feedback submitted"
        count={feedback.length}
        empty="No feedback submitted."
      >
        {feedback.map(f => (
          <div key={f.id} className="bg-gray-950/40 border border-gray-800 rounded-lg p-3 text-xs">
            <div className="flex items-start justify-between gap-3 mb-1">
              <div className="min-w-0 flex-1">
                <Link href={`/programs/${f.program_id}`} target="_blank" className="text-blue-400 hover:underline inline-flex items-center gap-1">
                  {f.program_name || "(unknown program)"} <ExternalLink className="h-3 w-3" />
                </Link>
                <p className="text-gray-500">{f.university}</p>
              </div>
              <div className="text-right shrink-0">
                <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${FB_STATUS_COLORS[f.status] ?? "bg-gray-800 text-gray-300"}`}>
                  {f.status}
                </span>
                <p className="text-[10px] text-gray-600 mt-1">{new Date(f.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</p>
              </div>
            </div>
            <p className="text-gray-400 mt-1">
              <span className="font-mono text-gray-500">{f.issue_type}:</span> {f.notes?.slice(0, 200)}
            </p>
          </div>
        ))}
      </Section>

      {/* Payments */}
      <Section
        icon={<Receipt className="h-4 w-4 text-green-400" />}
        title="Payment requests"
        count={payments.length}
        empty="No payment requests."
      >
        {payments.map(p => (
          <div key={p.id} className="bg-gray-950/40 border border-gray-800 rounded-lg p-3 text-xs flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-white">
                <span className="font-medium">{p.plan}</span> · ${p.amount_usd} · <span className="text-gray-400">{p.method}</span>
              </p>
              {p.admin_note && <p className="text-gray-500 italic mt-1">{p.admin_note}</p>}
            </div>
            <div className="text-right shrink-0">
              <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${PAY_STATUS_COLORS[p.status] ?? "bg-gray-800 text-gray-300"}`}>
                {p.status}
              </span>
              <p className="text-[10px] text-gray-600 mt-1">
                {new Date(p.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                {p.reviewed_at && ` · reviewed ${new Date(p.reviewed_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`}
              </p>
            </div>
          </div>
        ))}
      </Section>
    </div>
  )
}

function Field({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase text-gray-500 font-bold">{label}</p>
      <p className="text-white inline-flex items-center gap-1">{icon}{value}</p>
    </div>
  )
}

function Section({ icon, title, count, empty, children }: {
  icon: React.ReactNode; title: string; count: number; empty: string; children: React.ReactNode
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-white inline-flex items-center gap-2 mb-3">
        {icon} {title} <span className="text-gray-500 font-normal">({count})</span>
      </h2>
      {count === 0 ? (
        <p className="text-xs text-gray-500">{empty}</p>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </div>
  )
}
