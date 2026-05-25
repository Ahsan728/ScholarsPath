import Link from "next/link"
import { adminSupabase } from "@/lib/supabase"
import { IssuesClient } from "./IssuesClient"

export interface IssueRow {
  id: string
  program_name: string
  university: string
  country: string
  apply_url: string | null
  source_url: string | null
  url_status: string | null
  url_http_code: number | null
  url_checked_at: string | null
  url_check_error: string | null
  domain_match_status: string | null
  domain_match_host: string | null
  is_active: boolean
}

const FILTERS = {
  all_issues: { label: "All issues", description: "Any URL or domain problem" },
  mismatch:   { label: "Domain mismatch", description: "URL host ≠ university" },
  aggregator: { label: "Aggregator URLs", description: "Linking to mastersportal etc." },
  dead:       { label: "Dead URLs", description: "HTTP 4xx/5xx or unreachable" },
  wrong_domain: { label: "Wrong domain", description: "Redirects to aggregator/unrelated site" },
  no_url:     { label: "No URL", description: "apply_url missing or invalid" },
} as const

type FilterKey = keyof typeof FILTERS

export const dynamic = "force-dynamic"
export const revalidate = 0

async function loadIssues(filter: FilterKey, country: string | null, offset: number, pageSize: number) {
  const cols = "id, program_name, university, country, apply_url, source_url, " +
               "url_status, url_http_code, url_checked_at, url_check_error, " +
               "domain_match_status, domain_match_host, is_active"

  // Build the query for COUNT and SELECT in parallel
  function applyFilter(q: any) {
    if (country) q = q.eq("country", country)
    switch (filter) {
      case "mismatch":     return q.eq("domain_match_status", "mismatch")
      case "aggregator":   return q.eq("domain_match_status", "aggregator")
      case "dead":         return q.eq("url_status", "dead")
      case "wrong_domain": return q.eq("url_status", "wrong_domain")
      case "no_url":       return q.eq("domain_match_status", "no_url")
      case "all_issues":
      default:
        // Either domain flag or url flag indicates a problem
        return q.or(
          "domain_match_status.in.(mismatch,aggregator,no_url)," +
          "url_status.in.(dead,wrong_domain,timeout)"
        )
    }
  }

  const [{ count }, { data }] = await Promise.all([
    applyFilter(adminSupabase.from("masters_programs").select("id", { count: "exact", head: true })),
    applyFilter(adminSupabase.from("masters_programs").select(cols))
      .order("university", { ascending: true })
      .range(offset, offset + pageSize - 1),
  ])

  // Distinct countries with any issue (cheap small query)
  const { data: countryRaw } = await adminSupabase
    .from("masters_programs")
    .select("country")
    .or("domain_match_status.in.(mismatch,aggregator,no_url),url_status.in.(dead,wrong_domain,timeout)")
    .limit(5000)
  const countries = Array.from(new Set((countryRaw ?? []).map((r: any) => r.country).filter(Boolean))).sort()

  return {
    rows: (data as IssueRow[]) ?? [],
    total: count ?? 0,
    countries,
  }
}

export default async function ProgramIssuesPage({
  searchParams,
}: {
  searchParams: { filter?: string; country?: string; page?: string }
}) {
  const filter = (Object.keys(FILTERS).includes(searchParams.filter ?? "")
    ? searchParams.filter
    : "all_issues") as FilterKey
  const country = searchParams.country || null
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1)
  const pageSize = 50
  const offset = (page - 1) * pageSize

  const { rows, total, countries } = await loadIssues(filter, country, offset, pageSize)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Program Issues Triage</h1>
          <p className="text-sm text-gray-400 mt-1 max-w-3xl">
            Programs flagged by URL validation (Phase 1) and domain mismatch detection (Phase 2).
            Fix the URL, mark inactive, or open the program page to edit other fields.
          </p>
        </div>
        <Link
          href="/admin/crawlers"
          className="text-xs text-blue-400 hover:text-blue-300"
        >
          ← Back to Crawlers
        </Link>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-gray-800 mb-4 overflow-x-auto">
        {(Object.entries(FILTERS) as [FilterKey, typeof FILTERS[FilterKey]][]).map(([k, meta]) => {
          const q = new URLSearchParams()
          q.set("filter", k)
          if (country) q.set("country", country)
          return (
            <Link
              key={k}
              href={`/admin/programs/issues?${q.toString()}`}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                filter === k
                  ? "border-blue-500 text-white"
                  : "border-transparent text-gray-400 hover:text-white"
              }`}
              title={meta.description}
            >
              {meta.label}
            </Link>
          )
        })}
      </div>

      {/* Country filter + count */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-500">Country:</span>
          <Link
            href={`/admin/programs/issues?filter=${filter}`}
            className={`px-2 py-1 rounded ${!country ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300 hover:text-white"}`}
          >
            All ({total})
          </Link>
          {countries.slice(0, 12).map(c => {
            const q = new URLSearchParams({ filter, country: c as string })
            return (
              <Link
                key={c as string}
                href={`/admin/programs/issues?${q.toString()}`}
                className={`px-2 py-1 rounded ${country === c ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300 hover:text-white"}`}
              >
                {c as string}
              </Link>
            )
          })}
        </div>
        <p className="text-xs text-gray-500">
          Showing {rows.length ? offset + 1 : 0}–{offset + rows.length} of {total.toLocaleString()}
        </p>
      </div>

      <IssuesClient rows={rows} filter={filter} />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6 text-xs">
          {[page - 1, page, page + 1].filter(n => n >= 1 && n <= totalPages).map(n => {
            const q = new URLSearchParams({ filter, page: String(n) })
            if (country) q.set("country", country)
            return (
              <Link
                key={n}
                href={`/admin/programs/issues?${q.toString()}`}
                className={`px-3 py-1.5 rounded ${
                  n === page ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300 hover:text-white"
                }`}
              >
                {n}
              </Link>
            )
          })}
          <span className="text-gray-500 ml-2">of {totalPages} pages</span>
        </div>
      )}
    </div>
  )
}
