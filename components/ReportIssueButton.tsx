"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Flag, X, Loader2, Check } from "lucide-react"
import { supabase } from "@/lib/supabase-browser"
import type { MastersProgram } from "@/types"

type IssueType =
  | "wrong_requirement"
  | "broken_link"
  | "missing_info"
  | "incorrect_tuition"
  | "outdated_info"
  | "other"

const ISSUE_OPTIONS: { value: IssueType; label: string; hint: string }[] = [
  { value: "broken_link",       label: "Broken / wrong link",     hint: "Apply URL or Program Page goes nowhere" },
  { value: "incorrect_tuition", label: "Incorrect tuition",       hint: "Tuition fee shown is wrong" },
  { value: "wrong_requirement", label: "Wrong requirement",       hint: "IELTS, GPA, or other requirement is off" },
  { value: "missing_info",      label: "Missing information",     hint: "An important detail is missing" },
  { value: "outdated_info",     label: "Outdated information",    hint: "Deadline / intake / program has changed" },
  { value: "other",             label: "Something else",          hint: "Tell us in the notes" },
]

// Common fields users may flag. Free-form when "other" is chosen.
const FIELD_OPTIONS = [
  { value: "",                label: "(General — not a specific field)" },
  { value: "apply_url",       label: "Apply link" },
  { value: "source_url",      label: "Program page link" },
  { value: "tuition_usd_year",label: "Tuition" },
  { value: "duration_years",  label: "Duration" },
  { value: "ielts_min",       label: "IELTS minimum" },
  { value: "gpa_min",         label: "GPA minimum" },
  { value: "deadline",        label: "Deadline" },
  { value: "intake",          label: "Intake" },
  { value: "requirements",    label: "Requirements list" },
  { value: "description",     label: "Description" },
  { value: "field_of_study",  label: "Field of study" },
  { value: "language",        label: "Language of instruction" },
  { value: "scholarship_available", label: "Scholarship availability" },
]

interface Props {
  program: Pick<MastersProgram, "id" | "program_name">
}

/**
 * Renders a small "Report an issue" link/button on the program detail page.
 * Clicking it opens a modal where logged-in users can flag inaccuracies.
 */
export function ReportIssueButton({ program }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)

  // Form state
  const [issueType, setIssueType] = useState<IssueType>("broken_link")
  const [field, setField] = useState<string>("")
  const [currentValue, setCurrentValue] = useState("")
  const [suggestedValue, setSuggestedValue] = useState("")
  const [evidenceUrl, setEvidenceUrl] = useState("")
  const [notes, setNotes] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleOpen() {
    setOpen(true)
    if (!authChecked) {
      const { data } = await supabase.auth.getUser()
      setLoggedIn(Boolean(data.user))
      setAuthChecked(true)
    }
  }

  function reset() {
    setIssueType("broken_link")
    setField("")
    setCurrentValue("")
    setSuggestedValue("")
    setEvidenceUrl("")
    setNotes("")
    setBusy(false)
    setError(null)
    setDone(false)
  }

  function close() {
    setOpen(false)
    setTimeout(reset, 200)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (notes.trim().length < 10) {
      setError("Please describe the issue (at least 10 characters).")
      return
    }
    setBusy(true)
    try {
      const r = await fetch("/api/programs/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          program_id: program.id,
          issue_type: issueType,
          field: field || null,
          current_value: currentValue.trim() || null,
          suggested_value: suggestedValue.trim() || null,
          evidence_url: evidenceUrl.trim() || null,
          notes: notes.trim(),
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setDone(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-600 transition-colors"
      >
        <Flag className="h-3.5 w-3.5" /> Report an issue
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={close} />

          <div className="relative z-10 w-full max-w-lg bg-white rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Report an issue</h2>
              <button onClick={close} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-6 py-5">
              {!authChecked ? (
                <p className="text-sm text-gray-500">Loading…</p>
              ) : !loggedIn ? (
                <div className="text-center py-4">
                  <p className="text-sm text-gray-600 mb-4">
                    Please sign in to report an issue — this helps us verify and prevent abuse.
                  </p>
                  <button
                    onClick={() => router.push(`/auth/login?redirect=${encodeURIComponent(window.location.pathname)}`)}
                    className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Sign in
                  </button>
                </div>
              ) : done ? (
                <div className="text-center py-6">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-green-100 mb-3">
                    <Check className="h-6 w-6 text-green-600" />
                  </div>
                  <h3 className="font-bold text-gray-900 mb-1">Thanks for the feedback!</h3>
                  <p className="text-sm text-gray-500 mb-5">
                    We review submissions and update programs based on verified information.
                  </p>
                  <button
                    onClick={close}
                    className="rounded-xl border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <p className="text-xs text-gray-500">
                    Flagging: <strong className="text-gray-700">{program.program_name}</strong>
                  </p>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">What's the issue?</label>
                    <div className="space-y-1.5">
                      {ISSUE_OPTIONS.map((opt) => (
                        <label
                          key={opt.value}
                          className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                            issueType === opt.value
                              ? "border-blue-500 bg-blue-50"
                              : "border-gray-200 hover:bg-gray-50"
                          }`}
                        >
                          <input
                            type="radio"
                            name="issue_type"
                            value={opt.value}
                            checked={issueType === opt.value}
                            onChange={() => setIssueType(opt.value)}
                            className="mt-1"
                          />
                          <div>
                            <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                            <p className="text-xs text-gray-500">{opt.hint}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Which field? (optional)</label>
                    <select
                      value={field}
                      onChange={(e) => setField(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    >
                      {FIELD_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">What's shown now</label>
                      <input
                        type="text"
                        value={currentValue}
                        onChange={(e) => setCurrentValue(e.target.value)}
                        placeholder="e.g., IELTS 7.0"
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Should be</label>
                      <input
                        type="text"
                        value={suggestedValue}
                        onChange={(e) => setSuggestedValue(e.target.value)}
                        placeholder="e.g., IELTS 6.5"
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Source / evidence URL (optional)
                    </label>
                    <input
                      type="url"
                      value={evidenceUrl}
                      onChange={(e) => setEvidenceUrl(e.target.value)}
                      placeholder="https://university.edu/program-page"
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    />
                    <p className="text-xs text-gray-400 mt-1">Where did you find the correct information?</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes <span className="text-red-500">*</span></label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      required
                      placeholder="Briefly describe what's wrong (min 10 chars)…"
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  {error && (
                    <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={close}
                      className="flex-1 rounded-xl border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={busy}
                      className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
                    >
                      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                      {busy ? "Submitting…" : "Submit feedback"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
