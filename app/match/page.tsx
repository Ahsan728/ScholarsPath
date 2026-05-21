"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { Loader2, GraduationCap, Search, BookOpen, Globe, Trophy } from "lucide-react"
import { ProgramMatchCard } from "@/components/ProgramMatchCard"
import type { ProgramMatch } from "@/types"

const TRIAL_KEY = "sp_trial_used"

const BACHELOR_SUBJECTS = [
  "Computer Science / AI / Data Science",
  "Software Engineering",
  "Information Technology",
  "Electrical / Electronics Engineering",
  "Mechanical Engineering",
  "Civil / Structural Engineering",
  "Chemical Engineering",
  "Finance / Economics / Business",
  "Management / MBA",
  "Accounting / Banking",
  "Physics",
  "Chemistry",
  "Biology / Biomedical Sciences",
  "Other",
]

const GPA_SCALES = [
  { label: "4.0 (USA/BD standard)", value: 4.0 },
  { label: "5.0 (some BD universities)", value: 5.0 },
  { label: "10.0 (Indian scale)", value: 10.0 },
  { label: "100 (percentage)", value: 100 },
]

const COUNTRIES = [
  { flag: "🇩🇪", name: "Germany" },
  { flag: "🇺🇸", name: "USA" },
  { flag: "🇨🇦", name: "Canada" },
  { flag: "🇳🇱", name: "Netherlands" },
  { flag: "🇸🇪", name: "Sweden" },
  { flag: "🇫🇷", name: "France" },
  { flag: "🇧🇪", name: "Belgium" },
  { flag: "🇵🇱", name: "Poland" },
  { flag: "🇮🇹", name: "Italy" },
  { flag: "🇪🇸", name: "Spain" },
]

const CATEGORIES = [
  { value: "all", label: "All Programs" },
  { value: "cs_ai", label: "CS & AI" },
  { value: "engineering", label: "Engineering" },
  { value: "business", label: "Business" },
  { value: "science", label: "Natural Sciences" },
]

function StatBadge({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600">
        {icon}
      </div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-semibold text-gray-800">{value}</p>
    </div>
  )
}

export default function MatchPage() {
  const [subject, setSubject] = useState("")
  const [category, setCategory] = useState("all")
  const [gpa, setGpa] = useState("")
  const [gpaScale, setGpaScale] = useState(4.0)
  const [engType, setEngType] = useState<"ielts" | "toefl" | "none">("ielts")
  const [engScore, setEngScore] = useState("")
  const [selectedCountries, setSelectedCountries] = useState<string[]>([])
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [matches, setMatches] = useState<ProgramMatch[]>([])
  const [searched, setSearched] = useState(false)
  const resultsRef = useRef<HTMLDivElement>(null)

  const toggleCountry = (country: string) => {
    setSelectedCountries((prev) =>
      prev.includes(country) ? prev.filter((c) => c !== country) : [...prev, country]
    )
  }

  const canSearch = !!subject && !!gpa && parseFloat(gpa) > 0

  const handleSearch = async () => {
    if (!canSearch) return
    setError("")
    setLoading(true)
    try {
      const res = await fetch("/api/match/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bachelor_subject: subject,
          category,
          gpa: parseFloat(gpa),
          gpa_scale: gpaScale,
          english_type: engType,
          english_score: engScore ? parseFloat(engScore) : null,
          countries: selectedCountries,
          email: email.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Search failed")
      setMatches(data.matches)
      setSearched(true)
      if (email.trim()) localStorage.setItem(TRIAL_KEY, "1")
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth" }), 100)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div className="bg-white border-b">
        <div className="mx-auto max-w-5xl px-4 py-12 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-1.5 text-sm font-medium text-blue-700">
            <GraduationCap className="h-4 w-4" />
            AI-Powered Masters Finder
          </div>
          <h1 className="mb-3 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Find Your Perfect Masters Program
          </h1>
          <p className="mx-auto mb-6 max-w-lg text-base text-gray-500">
            Enter your bachelor background, GPA, and English score. We'll match you with the best-fit
            universities across Europe and North America — instantly, for free.
          </p>
          <div className="flex flex-wrap justify-center gap-3 text-sm text-gray-500">
            <StatBadge icon={<BookOpen className="h-5 w-5" />} label="Programs" value="500+" />
            <StatBadge icon={<Globe className="h-5 w-5" />} label="Countries" value="10" />
            <StatBadge icon={<Trophy className="h-5 w-5" />} label="Top-ranked" value="QS 50+" />
            <StatBadge icon={<Search className="h-5 w-5" />} label="Matching" value="Free" />
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-6 text-lg font-semibold text-gray-900">Your Academic Background</h2>

          {/* Row 1: Subject */}
          <div className="mb-5">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Bachelor Field of Study <span className="text-red-500">*</span>
            </label>
            <select
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value)
                // auto-set category
                const subj = e.target.value
                if (subj.includes("Computer") || subj.includes("Software") || subj.includes("Information")) setCategory("cs_ai")
                else if (subj.includes("Engineering")) setCategory("engineering")
                else if (subj.includes("Finance") || subj.includes("Management") || subj.includes("Accounting")) setCategory("business")
                else if (["Physics", "Chemistry", "Biology / Biomedical Sciences"].includes(subj)) setCategory("science")
                else setCategory("all")
              }}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <option value="">Select your bachelor subject…</option>
              {BACHELOR_SUBJECTS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Row 2: GPA + English */}
          <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                CGPA <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 3.60"
                  value={gpa}
                  onChange={(e) => setGpa(e.target.value)}
                  className="w-28 rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
                <select
                  value={gpaScale}
                  onChange={(e) => setGpaScale(parseFloat(e.target.value))}
                  className="flex-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                >
                  {GPA_SCALES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                English Proficiency
              </label>
              <div className="flex gap-2">
                <select
                  value={engType}
                  onChange={(e) => { setEngType(e.target.value as "ielts" | "toefl" | "none"); setEngScore("") }}
                  className="w-32 rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                >
                  <option value="ielts">IELTS</option>
                  <option value="toefl">TOEFL iBT</option>
                  <option value="none">Not yet</option>
                </select>
                {engType !== "none" && (
                  <input
                    type="number"
                    step={engType === "ielts" ? "0.5" : "1"}
                    min={engType === "ielts" ? "4" : "40"}
                    max={engType === "ielts" ? "9" : "120"}
                    placeholder={engType === "ielts" ? "e.g. 7.0" : "e.g. 90"}
                    value={engScore}
                    onChange={(e) => setEngScore(e.target.value)}
                    className="w-28 rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Row 3: Program type */}
          <div className="mb-5">
            <label className="mb-2 block text-sm font-medium text-gray-700">Program Type</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    category === c.value
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Row 4: Countries */}
          <div className="mb-5">
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Preferred Countries{" "}
              <span className="font-normal text-gray-400">(leave blank for all)</span>
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {COUNTRIES.map((c) => (
                <label
                  key={c.name}
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                    selectedCountries.includes(c.name)
                      ? "border-blue-400 bg-blue-50 font-medium text-blue-700"
                      : "border-gray-100 bg-gray-50 text-gray-600 hover:border-blue-200"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={selectedCountries.includes(c.name)}
                    onChange={() => toggleCountry(c.name)}
                  />
                  <span>{c.flag}</span>
                  <span>{c.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Row 5: Email (optional) */}
          <div className="mb-5">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Email{" "}
              <span className="font-normal text-gray-400">— optional, to save your results</span>
            </label>
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full max-w-xs rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {error && (
            <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          <button
            onClick={handleSearch}
            disabled={!canSearch || loading}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Finding matches…
              </>
            ) : (
              <>
                <Search className="h-4 w-4" />
                Find My Matches
              </>
            )}
          </button>
        </div>

        {/* Results */}
        {searched && (
          <div ref={resultsRef} className="mt-10">
            {matches.length === 0 ? (
              <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center text-gray-500">
                <p className="mb-1 font-medium">No strong matches found</p>
                <p className="text-sm">Try selecting different countries or "All Programs" as the program type.</p>
              </div>
            ) : (
              <>
                <div className="mb-6 flex items-center justify-between">
                  <h2 className="text-xl font-bold text-gray-900">
                    Your Top {matches.length} Matches
                  </h2>
                  <span className="text-sm text-gray-500">Sorted by fit score</span>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {matches.map((m, i) => (
                    <ProgramMatchCard key={m.program.id} match={m} rank={i + 1} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Cross-link to program browser */}
      <div className="mx-auto max-w-3xl px-4 pb-12 text-center">
        <p className="text-sm text-gray-500">
          Want to browse all available programs without a profile?{" "}
          <Link href="/programs" className="font-medium text-blue-600 hover:underline">
            Explore all programs →
          </Link>
        </p>
      </div>
    </div>
  )
}
