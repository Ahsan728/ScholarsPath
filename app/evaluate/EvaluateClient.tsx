"use client"

import { useState, useRef } from "react"
import Link from "next/link"
import {
  Upload, FileText, X, Loader2, Crown, CheckCircle,
  MapPin, Calendar, ChevronRight, AlertTriangle,
} from "lucide-react"
import { UpgradeModal } from "@/components/UpgradeModal"
import type { UserTier, ProgramMatch, Opportunity, StudentProfile } from "@/types"

interface Props {
  tier: UserTier
  cvUsed: number
  cvLimit: number
}

interface EvalResults {
  profile_summary: string
  student_profile: StudentProfile
  program_matches: ProgramMatch[]
  opportunity_matches: (Opportunity & { fit_score?: number; reasons?: string[]; recommendation?: string })[]
  usage: { used: number; limit: number; is_pro: boolean }
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80 ? "bg-green-100 text-green-700" :
    score >= 60 ? "bg-yellow-100 text-yellow-700" :
    "bg-red-100 text-red-700"
  return (
    <span className={`shrink-0 text-sm font-bold px-2.5 py-0.5 rounded-full ${color}`}>
      {score}%
    </span>
  )
}

function FileDropzone({
  label, required, file, onChange, onClear,
}: {
  label: string
  required?: boolean
  file: File | null
  onChange: (f: File) => void
  onClear: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  if (file) {
    return (
      <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-xl">
        <div className="flex items-center gap-2 min-w-0">
          <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
          <span className="text-sm font-medium text-green-800 truncate">{file.name}</span>
          <span className="text-xs text-green-500 shrink-0">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
        </div>
        <button type="button" onClick={onClear} className="ml-2 text-green-500 hover:text-red-500 transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <label className="flex flex-col items-center justify-center gap-2 h-28 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all">
      <Upload className="h-7 w-7 text-gray-300" />
      <div className="text-center">
        <p className="text-sm text-gray-500">
          {label} {required && <span className="text-red-400">*</span>}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">PDF only · max 10 MB</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onChange(f) }}
      />
    </label>
  )
}

export default function EvaluateClient({ tier, cvUsed, cvLimit }: Props) {
  const [cvFile, setCvFile] = useState<File | null>(null)
  const [transcriptFile, setTranscriptFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<EvalResults | null>(null)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [upgradeReason, setUpgradeReason] = useState<"cv_block" | "cv_limit">("cv_block")
  const [error, setError] = useState("")

  const atLimit = cvUsed >= cvLimit
  const isPro = tier === "pro"

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!cvFile) { setError("Please upload your CV (PDF)."); return }

    if (atLimit) {
      setUpgradeReason(isPro ? "cv_limit" : "cv_block")
      setShowUpgrade(true)
      return
    }

    setLoading(true)
    setError("")

    const formData = new FormData()
    formData.append("cv", cvFile)
    if (transcriptFile) formData.append("transcript", transcriptFile)

    try {
      const res = await fetch("/api/match/evaluate", { method: "POST", body: formData })
      const data = await res.json()

      if (res.status === 429 || res.status === 401) {
        setUpgradeReason(isPro ? "cv_limit" : "cv_block")
        setShowUpgrade(true)
        return
      }
      if (!res.ok) {
        setError(data.error ?? "Evaluation failed. Please try again.")
        return
      }
      setResults(data)
    } catch {
      setError("Network error. Please check your connection and try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">CV & Transcript Evaluation</h1>
          <p className="mt-1 text-sm text-gray-500">
            Upload your CV and academic transcript — our AI extracts your profile and matches you to programs and scholarships.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isPro ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 text-blue-700 px-3 py-1 text-xs font-semibold">
              <Crown className="h-3 w-3" /> {cvUsed}/{cvLimit} used this month
            </span>
          ) : (
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
              atLimit ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"
            }`}>
              {cvUsed}/{cvLimit} free evaluation{cvLimit > 1 ? "s" : ""} used
            </span>
          )}
        </div>
      </div>

      {/* Upload form */}
      {!results && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">
          {atLimit ? (
            <div className="text-center py-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 mx-auto mb-4">
                <Crown className="h-7 w-7 text-blue-600" />
              </div>
              <h3 className="font-bold text-gray-900 mb-2">
                {isPro ? "Monthly limit reached" : "Free evaluation used"}
              </h3>
              <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">
                {isPro
                  ? "You've used all 3 evaluations this month. Your quota resets on the 1st."
                  : "You've used your 1 free evaluation. Upgrade to Pro for 3 evaluations every month."}
              </p>
              <Link
                href="/pricing"
                className="inline-block rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
              >
                {isPro ? "Manage Subscription" : "Upgrade to Pro — $2.50/mo"}
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  CV / Resume <span className="text-red-400">*</span>
                </label>
                <FileDropzone
                  label="Upload CV PDF"
                  required
                  file={cvFile}
                  onChange={setCvFile}
                  onClear={() => setCvFile(null)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Academic Transcript{" "}
                  <span className="text-xs font-normal text-gray-400">(optional — improves GPA + course matching)</span>
                </label>
                <FileDropzone
                  label="Upload Transcript PDF"
                  file={transcriptFile}
                  onChange={setTranscriptFile}
                  onClear={() => setTranscriptFile(null)}
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || !cvFile}
                className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analyzing your profile… (30–60 s)
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4" />
                    Evaluate My Profile
                  </>
                )}
              </button>

              <p className="text-xs text-center text-gray-400">
                Your files are processed by AI and never stored permanently.
              </p>
            </form>
          )}
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="space-y-6">
          {/* Profile summary */}
          <div className="bg-blue-600 rounded-2xl p-6 text-white">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-full bg-blue-500 flex items-center justify-center shrink-0">
                <FileText className="h-5 w-5 text-blue-100" />
              </div>
              <div>
                <h2 className="font-bold mb-1 text-sm uppercase tracking-wide text-blue-200">Your Academic Profile</h2>
                <p className="text-white text-sm leading-relaxed">{results.profile_summary}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {results.student_profile.field && (
                    <span className="rounded-full bg-blue-500/50 px-2.5 py-0.5 text-xs font-medium text-blue-100">
                      {results.student_profile.field}
                    </span>
                  )}
                  {results.student_profile.gpa && (
                    <span className="rounded-full bg-blue-500/50 px-2.5 py-0.5 text-xs font-medium text-blue-100">
                      GPA {results.student_profile.gpa}/{results.student_profile.gpa_scale}
                    </span>
                  )}
                  {results.student_profile.english_proficiency && (
                    <span className="rounded-full bg-blue-500/50 px-2.5 py-0.5 text-xs font-medium text-blue-100">
                      {results.student_profile.english_proficiency}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Two-column results */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Matched Programs */}
            <div>
              <h2 className="text-base font-bold text-gray-900 mb-3">
                Matched Programs <span className="text-sm font-normal text-gray-400">({results.program_matches.length})</span>
              </h2>
              <div className="space-y-3">
                {results.program_matches.map((m, i) => (
                  <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-gray-900 text-sm leading-snug">{m.program.program_name}</h3>
                        <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {m.program.university}, {m.program.country}
                        </p>
                      </div>
                      <ScoreBadge score={m.fit_score} />
                    </div>

                    {m.reasons.length > 0 && (
                      <ul className="mb-1 space-y-0.5">
                        {m.reasons.slice(0, 2).map((r, ri) => (
                          <li key={ri} className="text-xs text-green-700 flex items-start gap-1">
                            <span className="mt-0.5 shrink-0">✓</span>
                            <span>{r}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {m.concerns.length > 0 && (
                      <ul className="mb-2 space-y-0.5">
                        {m.concerns.slice(0, 1).map((c, ci) => (
                          <li key={ci} className="text-xs text-amber-700 flex items-start gap-1">
                            <span className="mt-0.5 shrink-0">!</span>
                            <span>{c}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        {m.program.tuition_usd_year
                          ? `€${m.program.tuition_usd_year.toLocaleString()}/yr`
                          : "Free tuition"}
                        {m.program.scholarship_available && (
                          <span className="bg-green-50 text-green-700 rounded px-1.5 py-0.5">Scholarship</span>
                        )}
                      </div>
                      <a
                        href={m.program.apply_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-blue-600 hover:underline flex items-center gap-0.5"
                      >
                        View <ChevronRight className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Matched Opportunities */}
            <div>
              <h2 className="text-base font-bold text-gray-900 mb-3">
                Matched Scholarships & Opportunities{" "}
                <span className="text-sm font-normal text-gray-400">({results.opportunity_matches.length})</span>
              </h2>
              <div className="space-y-3">
                {results.opportunity_matches.map((o, i) => (
                  <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-gray-900 text-sm leading-snug">{o.title}</h3>
                        <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {o.host_country?.join(", ")}
                          {o.deadline && (
                            <>
                              <span>·</span>
                              <Calendar className="h-3 w-3 shrink-0" />
                              {new Date(o.deadline).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                            </>
                          )}
                        </p>
                      </div>
                      {o.fit_score != null && <ScoreBadge score={o.fit_score} />}
                    </div>

                    {o.reasons && o.reasons.length > 0 && (
                      <ul className="mb-2 space-y-0.5">
                        {o.reasons.slice(0, 2).map((r, ri) => (
                          <li key={ri} className="text-xs text-green-700 flex items-start gap-1">
                            <span className="mt-0.5 shrink-0">✓</span>
                            <span>{r}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {o.recommendation && (
                      <p className="text-xs text-gray-600 italic mb-2">{o.recommendation}</p>
                    )}

                    <a
                      href={o.apply_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-blue-600 hover:underline flex items-center gap-0.5"
                    >
                      Apply / Learn More <ChevronRight className="h-3 w-3" />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Re-evaluate CTA */}
          <div className="text-center pt-2">
            <button
              onClick={() => { setResults(null); setCvFile(null); setTranscriptFile(null) }}
              className="text-sm text-gray-500 hover:text-gray-700 underline transition-colors"
            >
              Evaluate a different CV
            </button>
          </div>
        </div>
      )}

      {showUpgrade && (
        <UpgradeModal reason={upgradeReason} onClose={() => setShowUpgrade(false)} />
      )}
    </div>
  )
}
