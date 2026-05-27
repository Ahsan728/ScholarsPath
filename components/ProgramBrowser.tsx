"use client"

import { useEffect, useState, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import { SlidersHorizontal, X, Search } from "lucide-react"
import ProgramCard from "@/components/ProgramCard"
import type { MastersProgram } from "@/types"

const LEVELS = [
  { value: "all", label: "All Programs" },
  { value: "master", label: "Master" },
  { value: "bachelor", label: "Bachelor" },
  { value: "language", label: "Language" },
]

const CATEGORIES = [
  { value: "", label: "All Fields" },
  { value: "cs_ai", label: "CS / AI" },
  { value: "engineering", label: "Engineering" },
  { value: "business", label: "Business" },
  { value: "science", label: "Science" },
  { value: "agriculture", label: "Agriculture & Forestry" },
  { value: "health", label: "Health" },
  { value: "arts", label: "Arts & Design" },
  { value: "social", label: "Social Sciences" },
  { value: "languages", label: "Languages" },
]

const COUNTRIES = [
  "Germany", "France", "Italy", "Netherlands", "Sweden",
  "Belgium", "Spain", "Poland", "Denmark", "Austria",
  "Finland", "Norway", "Switzerland", "Portugal", "Ireland",
]

const ACTIVE = "bg-blue-600 text-white border-blue-600"
const INACTIVE = "border-gray-300 text-gray-600 hover:bg-gray-50"

export default function ProgramBrowser() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const level        = searchParams.get("level") ?? "all"
  const category     = searchParams.get("category") ?? ""
  const countryParam = searchParams.get("country") ?? ""
  const freeOnly     = searchParams.get("free_only") === "true"
  const scholarOnly  = searchParams.get("scholarship_only") === "true"
  const emjmOnly     = searchParams.get("emjm_only") === "true"
  const cityParam    = searchParams.get("city") ?? ""
  const query        = searchParams.get("q") ?? ""
  const page         = parseInt(searchParams.get("page") ?? "1", 10)

  const selectedCountries = countryParam ? countryParam.split(",") : []

  const [programs, setPrograms]         = useState<MastersProgram[]>([])
  const [total, setTotal]               = useState(0)
  const [loading, setLoading]           = useState(true)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [searchInput, setSearchInput]   = useState(query)
  const [savedIds, setSavedIds]         = useState<Set<string>>(new Set())

  // Sync search input when URL query changes (e.g. browser back/forward)
  useEffect(() => { setSearchInput(query) }, [query])

  // Load saved program IDs (for heart icons)
  useEffect(() => {
    fetch("/api/programs/save").then(r => r.json()).then(j => {
      if (Array.isArray(j.ids)) setSavedIds(new Set(j.ids))
    }).catch(() => {})
  }, [])

  const apiUrl = useCallback(() => {
    const p = new URLSearchParams()
    if (level !== "all") p.set("level", level)
    if (category)        p.set("category", category)
    if (countryParam)    p.set("country", countryParam)
    if (freeOnly)        p.set("free_only", "true")
    if (scholarOnly)     p.set("scholarship_only", "true")
    if (emjmOnly)        p.set("emjm_only", "true")
    if (cityParam)       p.set("city", cityParam)
    if (query)           p.set("q", query)
    p.set("page",  String(page))
    p.set("limit", "24")
    return `/api/programs?${p}`
  }, [level, category, countryParam, freeOnly, scholarOnly, emjmOnly, cityParam, query, page])

  useEffect(() => {
    setLoading(true)
    fetch(apiUrl())
      .then((r) => r.json())
      .then((d) => { setPrograms(d.programs ?? []); setTotal(d.total ?? 0) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [apiUrl])

  function buildUrl(overrides: Record<string, string | undefined>) {
    const merged: Record<string, string | undefined> = {}
    if (level !== "all") merged.level    = level
    if (category)        merged.category = category
    if (countryParam)    merged.country  = countryParam
    if (freeOnly)        merged.free_only = "true"
    if (scholarOnly)     merged.scholarship_only = "true"
    if (emjmOnly)        merged.emjm_only = "true"
    if (cityParam)       merged.city = cityParam
    if (query)           merged.q = query
    Object.assign(merged, overrides)
    const p = new URLSearchParams(
      Object.entries(merged).filter(([, v]) => !!v) as [string, string][]
    )
    return `/programs?${p}`
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    router.push(buildUrl({ q: searchInput.trim() || undefined, page: undefined }))
  }

  const totalPages = Math.ceil(total / 24)
  const activeFilterCount = [
    level !== "all", !!category, !!countryParam, freeOnly, scholarOnly, !!query,
  ].filter(Boolean).length

  const sidebarContent = (
    <div className="space-y-5">
      {/* Level */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Program Type</p>
        <div className="flex flex-wrap gap-2">
          {LEVELS.map((l) => (
            <Link key={l.value}
              href={buildUrl({ level: l.value === "all" ? undefined : l.value, page: undefined })}
              onClick={() => setMobileFiltersOpen(false)}
              className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                level === l.value ? ACTIVE : INACTIVE
              }`}>
              {l.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Category */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Field of Study</p>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <Link key={c.value}
              href={buildUrl({ category: c.value || undefined, page: undefined })}
              onClick={() => setMobileFiltersOpen(false)}
              className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                category === c.value ? ACTIVE : INACTIVE
              }`}>
              {c.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Countries */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Country</p>
        <div className="flex flex-wrap gap-2">
          {COUNTRIES.map((c) => {
            const isSelected = selectedCountries.includes(c)
            const next = isSelected
              ? selectedCountries.filter((x) => x !== c)
              : [...selectedCountries, c]
            return (
              <Link key={c}
                href={buildUrl({ country: next.length > 0 ? next.join(",") : undefined, page: undefined })}
                onClick={() => setMobileFiltersOpen(false)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                  isSelected ? ACTIVE : INACTIVE
                }`}>
                {c}
              </Link>
            )
          })}
        </div>
      </div>

      {/* City */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">City</p>
        <input
          type="text"
          value={cityParam}
          onChange={(e) => {
            const val = e.target.value
            const p = new URLSearchParams(window.location.search)
            if (val) p.set("city", val); else p.delete("city")
            p.delete("page")
            router.push(`/programs?${p}`)
          }}
          placeholder="Type a city (e.g. Berlin, Paris)"
          className="w-full text-xs px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:outline-none"
        />
      </div>

      {/* Toggles */}
      <div className="flex gap-2 flex-wrap">
        <Link href={buildUrl({ free_only: freeOnly ? undefined : "true", page: undefined })}
          onClick={() => setMobileFiltersOpen(false)}
          className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
            freeOnly ? ACTIVE : INACTIVE
          }`}>
          Free / Low Tuition
        </Link>
        <Link href={buildUrl({ scholarship_only: scholarOnly ? undefined : "true", page: undefined })}
          onClick={() => setMobileFiltersOpen(false)}
          className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
            scholarOnly ? ACTIVE : INACTIVE
          }`}>
          Scholarship Available
        </Link>
        <Link href={buildUrl({ emjm_only: emjmOnly ? undefined : "true", page: undefined })}
          onClick={() => setMobileFiltersOpen(false)}
          className={`text-xs font-bold px-3 py-1.5 rounded-full border-2 transition-colors ${
            emjmOnly
              ? "bg-blue-600 text-white border-blue-600"
              : "bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100"
          }`}>
          ✨ Erasmus Mundus only
        </Link>
        {activeFilterCount > 0 && (
          <Link href="/programs"
            onClick={() => setMobileFiltersOpen(false)}
            className="text-xs font-medium px-3 py-1.5 rounded-full border border-red-300 text-red-600 hover:bg-red-50">
            Clear All
          </Link>
        )}
      </div>

      {/* Smart Match promo */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
        <p className="font-semibold mb-1">Smart Match</p>
        <p className="text-xs mb-2">Get personalized suggestions based on your GPA, IELTS, and background.</p>
        <Link href="/match" className="text-xs font-semibold text-blue-700 underline">
          Try Smart Match →
        </Link>
      </div>
    </div>
  )

  return (
    <div>
      {/* ── Search bar ────────────────────────────────────────── */}
      <form onSubmit={handleSearch} className="mb-5 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search programs, universities…"
            className="w-full rounded-xl border border-gray-200 pl-9 pr-9 py-2.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => { setSearchInput(""); router.push(buildUrl({ q: undefined, page: undefined })) }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          type="submit"
          className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          Search
        </button>
      </form>

      <div className="flex gap-6">
        {/* ── Sidebar — hidden on mobile until toggled ─────────── */}
        <aside className={`lg:w-72 shrink-0 ${mobileFiltersOpen ? "block" : "hidden"} lg:block`}>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            {/* Mobile close button */}
            <div className="flex items-center justify-between mb-4 lg:hidden">
              <span className="text-sm font-semibold text-gray-800">Filters</span>
              <button onClick={() => setMobileFiltersOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            {sidebarContent}
          </div>
        </aside>

        {/* ── Results ──────────────────────────────────────────── */}
        <main className="flex-1 min-w-0">
          {/* Mobile filter toggle + result count row */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">
              {loading ? "Loading…" : `${total.toLocaleString()} programs found`}
            </p>
            <button
              onClick={() => setMobileFiltersOpen((v) => !v)}
              className="lg:hidden flex items-center gap-1.5 text-sm font-medium border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {activeFilterCount > 0 && (
                <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl border h-56 animate-pulse" />
              ))}
            </div>
          ) : programs.length === 0 ? (
            <div className="text-center py-20 text-gray-500">
              <p className="text-xl font-medium mb-2">No programs found</p>
              <p className="text-sm">Try adjusting your filters or search query.</p>
              <Link href="/programs" className="mt-4 inline-block rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                Clear all filters
              </Link>
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {programs.map((p) => (
                  <ProgramCard key={p.id} program={p} savedIds={savedIds} />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex justify-center items-center gap-2 mt-8">
                  {page > 1 && (
                    <Link href={buildUrl({ page: String(page - 1) })}
                      className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
                      ← Prev
                    </Link>
                  )}
                  <span className="px-4 py-2 text-sm text-gray-500">
                    Page {page} of {totalPages}
                  </span>
                  {page < totalPages && (
                    <Link href={buildUrl({ page: String(page + 1) })}
                      className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
                      Next →
                    </Link>
                  )}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
