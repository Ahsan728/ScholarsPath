import { Suspense } from "react"
import { SearchBar } from "@/components/SearchBar"
import { OpportunityCard } from "@/components/OpportunityCard"
import { FilterSidebar } from "@/components/FilterSidebar"
import { ChatSearch } from "@/components/ChatSearch"
import { StatsBar } from "@/components/StatsBar"
import { getRecentOpportunities, getFeaturedOpportunities, getOpportunities } from "@/lib/supabase"
import type { SearchFilters } from "@/types"

interface HomeProps {
  searchParams: {
    q?: string
    type?: string
    country?: string
    for?: string       // nationality filter
    field?: string
    level?: string
    page?: string
  }
}

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

  const [searchResults, featured, recent] = await Promise.all([
    hasFilters ? getOpportunities(filters) : null,
    !hasFilters ? getFeaturedOpportunities(6) : Promise.resolve([]),
    !hasFilters ? getRecentOpportunities(12) : Promise.resolve([]),
  ])

  const displayOpps = searchResults?.opportunities ?? recent
  const total = searchResults?.total ?? 0

  return (
    <div className="min-h-screen">
      {/* Hero */}
      {!hasFilters && (
        <section className="bg-gradient-to-br from-blue-700 via-blue-600 to-blue-500 px-4 py-16 text-white">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
              Find Your Scholarship, <br className="hidden sm:block" />
              PhD, or Fellowship
            </h1>
            <p className="mt-4 text-lg text-blue-100">
              1,000+ fully funded opportunities worldwide — filtered for Bangladeshi &amp; global students.
              Powered by AI.
            </p>
            <div className="mt-8">
              <SearchBar initialQuery={searchParams.q} large />
            </div>
            <p className="mt-4 text-sm text-blue-200">
              Try: &quot;fully funded PhD Germany&quot; · &quot;scholarship for Bangladeshi students 2025&quot; · &quot;postdoc UK computer science&quot;
            </p>
          </div>
        </section>
      )}

      <div className="mx-auto max-w-7xl px-4 py-8">
        {/* Stats */}
        <Suspense>
          <StatsBar />
        </Suspense>

        {hasFilters && (
          <div className="mb-6">
            <SearchBar initialQuery={searchParams.q} />
          </div>
        )}

        {/* AI Chat Search */}
        {!hasFilters && (
          <div className="mb-10">
            <h2 className="mb-3 text-lg font-semibold text-gray-700">
              🤖 Ask ScholarPath AI
            </h2>
            <ChatSearch />
          </div>
        )}

        <div className="flex gap-8">
          {/* Sidebar filters */}
          <aside className="hidden w-64 shrink-0 lg:block">
            <FilterSidebar currentFilters={searchParams} />
          </aside>

          {/* Main content */}
          <div className="flex-1">
            {/* Featured (homepage only) */}
            {!hasFilters && featured.length > 0 && (
              <section className="mb-8">
                <h2 className="mb-4 text-xl font-bold text-gray-900">
                  ⭐ Featured Opportunities
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {featured.map((opp) => (
                    <OpportunityCard key={opp.id} opportunity={opp} featured />
                  ))}
                </div>
              </section>
            )}

            {/* Search results or recent */}
            <section>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">
                  {hasFilters
                    ? `${total.toLocaleString()} results${searchParams.q ? ` for "${searchParams.q}"` : ""}`
                    : "Latest Opportunities"}
                </h2>
                {hasFilters && (
                  <a href="/" className="text-sm text-blue-600 hover:underline">
                    Clear filters
                  </a>
                )}
              </div>

              {displayOpps.length === 0 ? (
                <div className="rounded-xl border bg-white p-12 text-center text-gray-500">
                  <p className="text-lg">No opportunities found.</p>
                  <p className="mt-2 text-sm">Try adjusting your filters or search query.</p>
                  <a href="/" className="mt-4 inline-block text-blue-600 hover:underline">
                    Browse all opportunities →
                  </a>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {displayOpps.map((opp) => (
                    <OpportunityCard key={opp.id} opportunity={opp} />
                  ))}
                </div>
              )}

              {/* Pagination */}
              {searchResults && searchResults.has_more && (
                <div className="mt-8 flex justify-center">
                  <a
                    href={`?${new URLSearchParams({
                      ...searchParams,
                      page: String((filters.page ?? 1) + 1),
                    })}`}
                    className="rounded-lg border bg-white px-6 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                  >
                    Load more →
                  </a>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
