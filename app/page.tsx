import { Suspense } from "react"
import Link from "next/link"
import { SearchBar } from "@/components/SearchBar"
import { OpportunityCard } from "@/components/OpportunityCard"
import { FilterSidebar } from "@/components/FilterSidebar"
import { ChatSearch } from "@/components/ChatSearch"
import { StatsBar } from "@/components/StatsBar"
import { getRecentOpportunities, getFeaturedOpportunities, getOpportunities, getHeroCounts } from "@/lib/supabase"
import type { SearchFilters } from "@/types"

interface HomeProps {
  searchParams: {
    q?: string
    type?: string
    country?: string
    for?: string
    field?: string
    level?: string
    page?: string
  }
}

const QUICK_FILTERS = [
  { label: "🎓 Scholarships", href: "/?type=scholarship" },
  { label: "🔬 PhD Positions", href: "/?type=phd" },
  { label: "🏆 Fellowships", href: "/?type=fellowship" },
  { label: "💼 Internships", href: "/?type=internship" },
  { label: "🇧🇩 For BD Students", href: "/?for=BD" },
  { label: "🇩🇪 Germany", href: "/?country=DE" },
  { label: "🇬🇧 UK", href: "/?country=GB" },
  { label: "🇺🇸 USA", href: "/?country=US" },
]

const FEATURE_HIGHLIGHTS = [
  {
    icon: "🎓",
    title: "7,800+ Programs",
    desc: "Masters & bachelors from 800+ European universities. English-taught, validated, updated weekly.",
  },
  {
    icon: "✨",
    title: "Erasmus Mundus",
    desc: "Fully funded joint masters across 2-4 European countries. Filter with one click.",
  },
  {
    icon: "🎯",
    title: "Smart Match",
    desc: "Enter your GPA + IELTS + field — get a ranked list of programs that fit your profile.",
  },
  {
    icon: "🇧🇩",
    title: "Built for You",
    desc: "Curated for Bangladeshi & South Asian students. Scholarship eligibility built in.",
  },
]

export default async function HomePage({ searchParams }: HomeProps) {
  const filters: SearchFilters = {
    query: searchParams.q,
    type: searchParams.type ? [searchParams.type as any] : undefined,
    host_country: searchParams.country ? [searchParams.country] : undefined,
    eligible_for: searchParams.for,
    field: searchParams.field ? [searchParams.field] : undefined,
    degree_level: searchParams.level ? [searchParams.level as any] : undefined,
    status: "open",
    page: searchParams.page ? parseInt(searchParams.page) : 1,
    limit: 20,
  }

  const hasFilters = Object.values(searchParams).some(Boolean)

  const [searchResults, featured, recent, heroCounts] = await Promise.all([
    hasFilters ? getOpportunities(filters) : null,
    !hasFilters ? getFeaturedOpportunities(6) : Promise.resolve([]),
    !hasFilters ? getRecentOpportunities(12) : Promise.resolve([]),
    !hasFilters ? getHeroCounts() : Promise.resolve({ programs: 7000, opportunities: 140, emjm: 36 }),
  ])

  const displayOpps = searchResults?.opportunities ?? recent
  const total = searchResults?.total ?? 0

  return (
    <div className="min-h-screen">
      {/* ── Hero ──────────────────────────────────────────────── */}
      {!hasFilters && (
        <section className="relative overflow-hidden bg-gradient-to-br from-blue-900 via-blue-700 to-blue-500 px-4 pb-16 pt-14 text-white">
          {/* Decorative blobs */}
          <div className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full bg-blue-400/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 left-10 h-56 w-56 rounded-full bg-indigo-400/20 blur-3xl" />

          <div className="relative mx-auto max-w-3xl text-center">
            {/* Tag */}
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-300/40 bg-white/10 px-4 py-1.5 text-sm font-medium text-blue-100 backdrop-blur-sm">
              <span className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
              Live — updated daily from 20+ sources
            </div>

            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
              Opportunities in{" "}
              <span className="bg-gradient-to-r from-yellow-300 to-orange-300 bg-clip-text text-transparent">
                Europe
              </span>
              <br className="hidden sm:block" /> Scholarship, Funding, PhD 
            </h1>

            <p className="mt-5 text-lg leading-relaxed text-blue-100 sm:text-xl">
              {heroCounts.programs.toLocaleString()}+ English-taught masters &amp; bachelors, {heroCounts.opportunities}+ scholarships &amp; PhD positions — plus{" "}
              <span className="font-semibold text-white">{heroCounts.emjm} Erasmus Mundus fully funded programs</span>.
              Matched to your profile.
            </p>

            {/* Search bar */}
            <div className="mt-8">
              <SearchBar initialQuery={searchParams.q} large />
            </div>

            {/* Quick filter chips */}
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {QUICK_FILTERS.map((f) => (
                <Link
                  key={f.href}
                  href={f.href}
                  className="rounded-full border border-white/25 bg-white/10 px-3.5 py-1.5 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/20"
                >
                  {f.label}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Filtered search bar (when filters active) ─────────── */}
      {hasFilters && (
        <div className="border-b bg-white px-4 py-4 shadow-sm">
          <div className="mx-auto max-w-7xl">
            <SearchBar initialQuery={searchParams.q} />
          </div>
        </div>
      )}

      <div className="mx-auto max-w-7xl px-4 py-8">

        {/* Stats bar */}
        <Suspense>
          <StatsBar />
        </Suspense>

        {/* ── Feature highlights (homepage only) ────────────────── */}
        {!hasFilters && (
          <div className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {FEATURE_HIGHLIGHTS.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition hover:shadow-md"
              >
                <div className="mb-2 text-2xl">{f.icon}</div>
                <p className="text-sm font-semibold text-gray-900">{f.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{f.desc}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Erasmus Mundus Hero (homepage only) ───────────────── */}
        {!hasFilters && (
          <div className="mb-10 rounded-2xl bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 p-6 sm:p-8 text-white relative overflow-hidden">
            <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
            <div className="relative flex flex-col sm:flex-row items-start gap-6">
              <div className="flex-1 min-w-0">
                <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold mb-3 backdrop-blur-sm">
                  <span className="text-yellow-300">✨</span> Erasmus Mundus Joint Masters
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">
                  Fully Funded Masters in Europe
                </h2>
                <p className="text-blue-100 text-sm sm:text-base leading-relaxed mb-4 max-w-xl">
                  Study at 2-4 top European universities under one scholarship.
                  €1,400/month stipend + tuition + travel covered. 36 programs across
                  Engineering, Science, Law, Health, Business &amp; more.
                </p>
                <div className="flex gap-3 flex-wrap">
                  <Link
                    href="/programs?emjm_only=true"
                    className="inline-block rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-blue-700 hover:bg-blue-50 transition-colors shadow-sm"
                  >
                    Browse Erasmus Mundus →
                  </Link>
                  <Link
                    href="/match"
                    className="inline-block rounded-xl border border-white/40 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/20 transition-colors backdrop-blur-sm"
                  >
                    Smart Match My Profile
                  </Link>
                </div>
              </div>
              <div className="hidden sm:flex flex-col gap-2 text-right shrink-0">
                <div className="rounded-xl bg-white/15 backdrop-blur-sm px-4 py-3">
                  <p className="text-2xl font-extrabold">36</p>
                  <p className="text-[10px] uppercase tracking-wide text-blue-200">Programs</p>
                </div>
                <div className="rounded-xl bg-white/15 backdrop-blur-sm px-4 py-3">
                  <p className="text-2xl font-extrabold">30+</p>
                  <p className="text-[10px] uppercase tracking-wide text-blue-200">Countries</p>
                </div>
                <div className="rounded-xl bg-white/15 backdrop-blur-sm px-4 py-3">
                  <p className="text-2xl font-extrabold">€33k</p>
                  <p className="text-[10px] uppercase tracking-wide text-blue-200">Stipend</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── AI Chat (homepage only) ────────────────────────────── */}
        {!hasFilters && (
          <div className="mb-10">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-base">🤖</span>
              <h2 className="text-lg font-bold text-gray-900">Ask ScholarAssist AI</h2>
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                New
              </span>
            </div>
            <ChatSearch />
          </div>
        )}

        <div className="flex gap-8">
          {/* Sidebar */}
          <aside className="hidden w-64 shrink-0 lg:block">
            <FilterSidebar currentFilters={searchParams} />
          </aside>

          {/* Main */}
          <div className="flex-1 min-w-0">

            {/* Featured opportunities */}
            {!hasFilters && featured.length > 0 && (
              <section className="mb-10">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-xl font-bold text-gray-900">⭐ Featured Opportunities</h2>
                  <Link href="/?type=scholarship" className="text-sm font-medium text-blue-600 hover:underline">
                    View all →
                  </Link>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {featured.map((opp) => (
                    <OpportunityCard key={opp.id} opportunity={opp} featured />
                  ))}
                </div>
              </section>
            )}

            {/* Results / Recent */}
            <section>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">
                  {hasFilters
                    ? `${total.toLocaleString()} results${searchParams.q ? ` for "${searchParams.q}"` : ""}`
                    : "🕐 Latest Opportunities"}
                </h2>
                {hasFilters && (
                  <a href="/" className="text-sm font-medium text-blue-600 hover:underline">
                    Clear filters
                  </a>
                )}
              </div>

              {displayOpps.length === 0 ? (
                <div className="rounded-2xl border bg-white p-12 text-center text-gray-500 shadow-sm">
                  <p className="text-lg font-medium">No opportunities found.</p>
                  <p className="mt-2 text-sm">Try adjusting your filters or search query.</p>
                  <a href="/" className="mt-4 inline-block rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                    Browse all opportunities
                  </a>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {displayOpps.map((opp) => (
                    <OpportunityCard key={opp.id} opportunity={opp} />
                  ))}
                </div>
              )}

              {searchResults?.has_more && (
                <div className="mt-8 flex justify-center">
                  <a
                    href={`?${new URLSearchParams({
                      ...searchParams,
                      page: String((filters.page ?? 1) + 1),
                    })}`}
                    className="rounded-xl border bg-white px-8 py-3 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
                  >
                    Load more →
                  </a>
                </div>
              )}
            </section>
          </div>
        </div>

        {/* ── Explore Programs CTA (homepage only) ──────────────── */}
        {!hasFilters && (
          <div className="mt-16 rounded-3xl bg-gradient-to-br from-indigo-600 to-blue-600 p-8 text-center text-white shadow-lg">
            <h3 className="text-2xl font-bold">Looking for Study Programs in Europe?</h3>
            <p className="mt-2 text-blue-100">
              Browse 500+ bachelor, master &amp; language programs from top European universities.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                href="/programs?level=master"
                className="rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-50"
              >
                Master Programs
              </Link>
              <Link
                href="/programs?level=bachelor"
                className="rounded-full border border-white/40 px-6 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
              >
                Bachelor Programs
              </Link>
              <Link
                href="/match"
                className="rounded-full border border-white/40 px-6 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
              >
                🎯 Smart Match
              </Link>
            </div>
          </div>
        )}

        {/* ── Mentorship Program soft sell (homepage only) ──────── */}
        {!hasFilters && (
          <Link
            href="/mentorship"
            className="mt-8 block rounded-2xl bg-white border border-gray-200 p-6 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 shrink-0">
                <span className="text-xl">🎯</span>
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-gray-900">Need 1-on-1 help with your applications?</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  Join the Complete Mentorship Program — 30 sessions, 6 mentors, one full application cycle.
                </p>
              </div>
              <span className="text-blue-600 text-sm font-semibold whitespace-nowrap">Learn more →</span>
            </div>
          </Link>
        )}
      </div>
    </div>
  )
}
