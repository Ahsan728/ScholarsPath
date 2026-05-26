"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { GraduationCap, Loader2, X } from "lucide-react"
import { supabase } from "@/lib/supabase-browser"

interface Props {
  program: { id: string; program_name: string }
}

const STATUSES: { value: string; label: string; color: string }[] = [
  { value: "accepted",   label: "Got an offer",   color: "border-green-700 text-green-300" },
  { value: "enrolled",   label: "Enrolled",       color: "border-blue-700 text-blue-300" },
  { value: "waitlisted", label: "Waitlisted",     color: "border-amber-700 text-amber-300" },
  { value: "rejected",   label: "Rejected",       color: "border-red-700 text-red-300" },
  { value: "withdrew",   label: "Withdrew",       color: "border-gray-600 text-gray-300" },
]

export function ReportAcceptanceButton({ program }: Props) {
  const router = useRouter()
  const [open, setOpen]   = useState(false)
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone]   = useState(false)

  // form — outcome
  const [status, setStatus]       = useState("accepted")
  const [country, setCountry]     = useState("")
  const [year, setYear]           = useState("")
  const [semester, setSemester]   = useState("")
  const [notes, setNotes]         = useState("")
  // form — profile snapshot
  const [gpa, setGpa]             = useState("")
  const [gpaScale, setGpaScale]   = useState("4.0")
  const [ielts, setIelts]         = useState("")
  const [toefl, setToefl]         = useState("")
  const [pubCount, setPubCount]   = useState("")
  const [pubText, setPubText]     = useState("")
  const [bSubject, setBSubject]   = useState("")
  const [bUni, setBUni]           = useState("")
  const [showProfile, setShowProfile] = useState(false)

  async function openModal() {
    const { data: { session } } = await supabase.auth.getSession()
    setAuthed(!!session)
    setOpen(true)
    setError(null)
    setDone(false)
  }

  async function submit() {
    setError(null)
    if (!country.trim()) { setError("Country is required."); return }
    setBusy(true)
    try {
      const r = await fetch("/api/programs/acceptances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          program_id: program.id,
          status,
          country: country.trim(),
          intake_year:     year     ? Number(year) : null,
          intake_semester: semester || null,
          notes:           notes.trim() || null,
          gpa:                 gpa      ? Number(gpa) : null,
          gpa_scale:           gpaScale ? Number(gpaScale) : null,
          ielts_score:         ielts    ? Number(ielts) : null,
          toefl_score:         toefl    ? Number(toefl) : null,
          publications_count:  pubCount ? Number(pubCount) : null,
          publications_text:   pubText.trim()  || null,
          bachelor_subject:    bSubject.trim() || null,
          bachelor_university: bUni.trim()     || null,
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setDone(true)
      router.refresh()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        onClick={openModal}
        className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl border border-purple-300 bg-purple-50 hover:bg-purple-100 text-purple-800 transition-colors"
      >
        <GraduationCap className="h-4 w-4" />
        I applied / got accepted
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <h3 className="font-semibold text-gray-900 inline-flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-purple-600" />
                Record your application
              </h3>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5">
              {authed === null ? (
                <p className="text-sm text-gray-500">Checking sign-in…</p>
              ) : !authed ? (
                <div className="text-center py-4">
                  <p className="text-sm text-gray-600 mb-4">
                    Sign in to record your application for{" "}
                    <span className="font-medium">{program.program_name}</span>.
                  </p>
                  <Link
                    href={`/auth/login?redirect=/programs/${program.id}`}
                    className="inline-block px-5 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium"
                  >
                    Sign in
                  </Link>
                </div>
              ) : done ? (
                <div className="text-center py-6">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-700 mb-3">
                    ✓
                  </div>
                  <p className="text-sm text-gray-700">Saved. Thanks for sharing.</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Aggregated stats will appear on this program's page.
                    Your name is never shown publicly.
                  </p>
                  <button
                    onClick={() => setOpen(false)}
                    className="mt-4 text-sm text-purple-600 hover:text-purple-800"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <div className="space-y-4 text-sm">
                  <p className="text-gray-600 text-xs">
                    Help us track real outcomes. Your name is <strong>not</strong> shown publicly —
                    only aggregated stats (country, year, status counts).
                  </p>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Status *</label>
                    <div className="flex gap-1.5 flex-wrap">
                      {STATUSES.map(s => (
                        <button
                          key={s.value}
                          type="button"
                          onClick={() => setStatus(s.value)}
                          className={`px-3 py-1.5 rounded-lg border text-xs font-medium ${
                            status === s.value ? s.color + " bg-gray-50" : "border-gray-300 text-gray-500 hover:bg-gray-50"
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Your country *</label>
                    <input
                      type="text"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      placeholder="e.g. Bangladesh"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Intake year</label>
                      <input
                        type="number"
                        min={2020} max={2035}
                        value={year}
                        onChange={(e) => setYear(e.target.value)}
                        placeholder="2026"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Semester</label>
                      <select
                        value={semester}
                        onChange={(e) => setSemester(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      >
                        <option value="">—</option>
                        <option value="Fall">Fall</option>
                        <option value="Spring">Spring</option>
                        <option value="Summer">Summer</option>
                      </select>
                    </div>
                  </div>

                  {/* Profile snapshot — collapsible */}
                  <div className="border-t pt-3">
                    <button
                      type="button"
                      onClick={() => setShowProfile(s => !s)}
                      className="text-xs text-purple-700 hover:text-purple-900 font-medium"
                    >
                      {showProfile ? "▼" : "▶"} Add your profile (optional — helps future applicants)
                    </button>
                    {showProfile && (
                      <div className="space-y-3 mt-3">
                        <p className="text-[11px] text-gray-500">
                          Anonymous medians (GPA / IELTS / pubs) are shown on the program page.
                          Your exact values are never displayed publicly.
                        </p>

                        <div className="grid grid-cols-3 gap-2">
                          <div className="col-span-2">
                            <label className="block text-xs font-medium text-gray-700 mb-1">CGPA</label>
                            <input
                              type="number" step="0.01" min={0} max={10}
                              value={gpa}
                              onChange={(e) => setGpa(e.target.value)}
                              placeholder="3.33"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Scale</label>
                            <select
                              value={gpaScale}
                              onChange={(e) => setGpaScale(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            >
                              <option value="4.0">/ 4.0</option>
                              <option value="5.0">/ 5.0</option>
                              <option value="10.0">/ 10.0</option>
                              <option value="100">/ 100</option>
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">IELTS</label>
                            <input
                              type="number" step="0.5" min={0} max={9}
                              value={ielts}
                              onChange={(e) => setIelts(e.target.value)}
                              placeholder="6.5"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">TOEFL <span className="text-gray-400">(alt.)</span></label>
                            <input
                              type="number" min={0} max={120}
                              value={toefl}
                              onChange={(e) => setToefl(e.target.value)}
                              placeholder="95"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1"># of publications</label>
                          <input
                            type="number" min={0} max={999}
                            value={pubCount}
                            onChange={(e) => setPubCount(e.target.value)}
                            placeholder="0"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                        </div>
                        {pubCount && Number(pubCount) > 0 && (
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Publication titles (optional)</label>
                            <textarea
                              value={pubText}
                              onChange={(e) => setPubText(e.target.value)}
                              rows={2}
                              placeholder="One title per line"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs"
                            />
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Bachelor subject</label>
                            <input
                              type="text"
                              value={bSubject}
                              onChange={(e) => setBSubject(e.target.value)}
                              placeholder="Computer Science"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Bachelor university</label>
                            <input
                              type="text"
                              value={bUni}
                              onChange={(e) => setBUni(e.target.value)}
                              placeholder="BUET, DU…"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Notes (optional)</label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                      placeholder="Anything you'd like to add"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>

                  {error && (
                    <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                      {error}
                    </div>
                  )}

                  <button
                    onClick={submit}
                    disabled={busy || !country.trim()}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2.5 text-white font-medium"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <GraduationCap className="h-4 w-4" />}
                    Save my record
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
