import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import type { Opportunity, SearchFilters, SearchResult, User } from "@/types"
import type { SupabaseClient } from "@supabase/supabase-js"

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is required. Add it to your Vercel project environment variables.`)
  }
  return value
}

function createLazySupabaseClient(getClient: () => SupabaseClient): SupabaseClient {
  return new Proxy({} as SupabaseClient, {
    get(_target, prop, receiver) {
      const client = getClient()
      const value = Reflect.get(client, prop, receiver)
      return typeof value === "function" ? value.bind(client) : value
    },
  })
}

let publicClient: SupabaseClient | null = null
let serviceClient: SupabaseClient | null = null

// Browser/public client — used in client components
export const supabase = createLazySupabaseClient(() => {
  publicClient ??= createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  )
  return publicClient
})

// Server client — used in Server Components / API routes
export function createServerSupabase() {
  const cookieStore = cookies()
  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value },
        set() {},
        remove() {},
      },
    }
  )
}

// Admin client — bypasses RLS (server-side only, never expose to browser)
export const adminSupabase = createLazySupabaseClient(() => {
  serviceClient ??= createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  return serviceClient
})

// ============================================================
// OPPORTUNITY QUERIES
// ============================================================

// Slug → keyword list used by the post-fetch research-domain filter.
// Mirrors RESEARCH_DOMAINS in components/FilterSidebar.tsx. Keep in sync.
// Keywords are matched as substrings against a space-padded lowercase
// join of field_of_study, so leading/trailing spaces give word boundaries
// (" ai " matches "ai" as a token but not "Spain").
const DOMAIN_KEYWORDS: Record<string, string[]> = {
  cs_ai:        ["computer", " ai ", "artificial intelligence", "data science", "cyber", "software", "machine learning", "information technology", "informatics", "computing"],
  engineering:  ["engineering", "robotics", "mechanical", "electrical", "civil engineering", "chemical engineering", "materials", "aerospace", "energy"],
  architecture: ["architect", "urban design", "interior design", "landscape architecture", "urban planning"],
  science:      ["physics", "chemistry", "biology", "biological", "mathematics", "biotech", "natural science", "earth", "marine", "geosci", " stem ", "life sciences"],
  environment:  ["environmental", "sustainability", "sustainable", "climate", "renewable", "ecology", "biodiversity", "conservation"],
  health:       ["health", "medicine", "medical", "biomedical", "pharma", "clinical", "neuroscience", "psychology"],
  business:     ["business", "management", "finance", "economic", "marketing", " mba ", "accounting", "entrepreneur"],
  law:          [" law ", "legal", "llm", "intellectual property", "human rights"],
  social:       ["social", "political", "international relations", "public policy", "communication", "journalism", "sociology", "anthropology", "criminology"],
  humanities:   ["humanities", "philosophy", "history", "literature", "religious", "theology", "archaeology", "cultural studies"],
  arts:         [" art ", "design", "music", "fashion", "theatre", "film", "fine art", "performing"],
  agriculture:  ["agriculture", "agronomy", " food ", "forestry", "aquaculture"],
  all:          [],
}

export async function getOpportunities(filters: SearchFilters): Promise<SearchResult> {
  const {
    query, type, host_country, eligible_for, field, degree_level,
    funding_type, status = "open", deadline_after,
    page = 1, limit = 20,
  } = filters

  // Query BOTH tables in parallel.
  // Phase 0 gate on discovered_opportunities: only surface rows whose
  // apply_url HEAD-checked OK AND whose target page actually contains
  // the opportunity title. Excludes dead URLs, generic-page hits, and
  // unchecked rows so users don't click through to broken or wrong
  // pages. Legacy `opportunities` table predates Phase 0 — leave it
  // unfiltered; it's small and was hand-curated.
  let qLegacy = adminSupabase.from("opportunities").select("*", { count: "exact" })
  let qDisc   = adminSupabase.from("discovered_opportunities")
    .select("*", { count: "exact" })
    .eq("is_active", true)
    .eq("url_status", "ok")
    .in("page_status", ["specific_match", "name_changed"])

  if (status) qLegacy = qLegacy.eq("status", status)
  if (type?.length) {
    qLegacy = qLegacy.in("type", type)
    qDisc   = qDisc.in("type", type)
  }
  if (host_country?.length) {
    qLegacy = qLegacy.overlaps("host_country", host_country)
    qDisc   = qDisc.in("country", host_country)
  }
  if (eligible_for) {
    qLegacy = qLegacy.or(`eligible_nations.cs.{"ALL"},eligible_nations.cs.{"${eligible_for}"}`)
  }
  // Research-domain filter. discovered_opportunities carries a category
  // slug populated by the classifier at insert time. We always include
  // 'general' alongside the user's selection so that field-agnostic
  // scholarships ("Diritto allo Studio", regional grants) appear under
  // every specific domain filter — those scholarships apply to any
  // field, so a student filtering by "CS/AI" should still see them.
  // Legacy `opportunities` table never had a category column; we keep
  // the post-fetch JS filter for that table only.
  if (field?.length) {
    qDisc = qDisc.in("category", [...field, "general"])
  }
  if (degree_level?.length) {
    qLegacy = qLegacy.in("degree_level", degree_level)
    qDisc   = qDisc.in("degree_level", degree_level)
  }
  if (funding_type?.length) qLegacy = qLegacy.in("funding_type", funding_type)
  if (deadline_after) {
    qLegacy = qLegacy.gte("deadline", deadline_after)
  }
  if (query) {
    qLegacy = qLegacy.ilike("title", `%${query}%`)
    qDisc   = qDisc.ilike("title", `%${query}%`)
  }

  // Fetch both — broader limit since we'll merge + slice
  qLegacy = qLegacy.order("deadline", { ascending: true, nullsFirst: false })
                   .order("created_at", { ascending: false })
                   .range(0, page * limit + 50)
  qDisc   = qDisc.order("discovered_at", { ascending: false })
                 .range(0, page * limit + 50)

  const [legacyResp, discResp] = await Promise.all([qLegacy, qDisc])

  if (legacyResp.error) throw new Error(`Legacy query: ${legacyResp.error.message}`)

  // Map discovered_opportunities rows to Opportunity shape
  const discMapped = (discResp.data ?? []).map((d: any) => ({
    id: d.id, title: d.title || "", type: d.type || "scholarship",
    host_country: d.country ? [d.country] : [],
    eligible_nations: ["ALL"], ineligible_nations: [],
    field_of_study: d.field_of_study || [],
    degree_level: d.degree_level || "any",
    funding_type: d.funding_type, amount_usd: null, currency: null,
    deadline: null, open_date: null, status: "open",
    description: d.description || "", eligibility_text: d.eligibility_text,
    requirements: [], apply_url: d.apply_url || "",
    source_url: d.source_url || "", source_name: "discoverer",
    is_verified: false, is_featured: false, scam_score: 0,
    embedding_id: null,
    created_at: d.discovered_at || new Date().toISOString(),
    updated_at: d.last_seen_at || d.discovered_at || new Date().toISOString(),
  } as Opportunity))

  // Merge + sort by recency, then paginate
  let merged = [...(legacyResp.data ?? []) as Opportunity[], ...discMapped]
  merged.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))

  // Legacy opportunities table doesn't have a category column. Apply
  // the keyword filter only to legacy rows (already in `merged` mixed
  // with discovered rows — distinguish by source_name).
  if (field?.length) {
    const keywords = field.flatMap((slug) => DOMAIN_KEYWORDS[slug] ?? [])
    if (keywords.length > 0) {
      merged = merged.filter((opp) => {
        // discovered rows already passed the DB filter — keep them all
        if ((opp as any).source_name === "discoverer") return true
        // Legacy rows: substring match against field_of_study text
        const haystack = " " + (opp.field_of_study || []).join("  ").toLowerCase() + " "
        if (haystack.trim() === "") return false
        return keywords.some((kw) => haystack.includes(kw))
      })
    }
  }

  const totalCount = field?.length ? merged.length : (legacyResp.count ?? 0) + (discResp.count ?? 0)
  const from = (page - 1) * limit
  const paged = merged.slice(from, from + limit)

  return {
    opportunities: paged,
    total: totalCount,
    page,
    has_more: totalCount > page * limit,
  }
}

export async function getOpportunityById(id: string): Promise<Opportunity | null> {
  // Try legacy table first
  const legacy = await adminSupabase
    .from("opportunities").select("*").eq("id", id).maybeSingle()
  if (legacy.data) return legacy.data as Opportunity

  // Fall back to discovered_opportunities
  const disc = await adminSupabase
    .from("discovered_opportunities").select("*").eq("id", id).maybeSingle()
  if (!disc.data) return null

  // Map discovered_opportunities row to Opportunity shape
  const d: any = disc.data
  return {
    id: d.id, title: d.title || "", type: d.type || "scholarship",
    host_country: d.country ? [d.country] : [],
    eligible_nations: ["ALL"], ineligible_nations: [],
    field_of_study: d.field_of_study || [],
    degree_level: d.degree_level || "any",
    funding_type: d.funding_type, amount_usd: null, currency: null,
    deadline: null, open_date: null, status: "open",
    description: d.description || "", eligibility_text: d.eligibility_text,
    requirements: [], apply_url: d.apply_url || "",
    source_url: d.source_url || "", source_name: "discoverer",
    is_verified: false, is_featured: false, scam_score: 0,
    embedding_id: null,
    created_at: d.discovered_at || new Date().toISOString(),
    updated_at: d.last_seen_at || d.discovered_at || new Date().toISOString(),
  } as Opportunity
}

// Live counts for the homepage hero (programs + opportunities + EMJMs)
export async function getHeroCounts(): Promise<{ programs: number; opportunities: number; emjm: number }> {
  try {
    // Counts must match what the public catalog actually shows — apply
    // the same Phase 0 quality gate as getOpportunities / getActivePrograms.
    const [
      { count: programs },
      { count: legacyOpps },
      { count: discOpps },
      { count: emjm },
    ] = await Promise.all([
      adminSupabase.from("masters_programs")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true)
        .eq("url_status", "ok")
        .in("page_status", ["specific_english", "name_changed"]),
      adminSupabase.from("opportunities")
        .select("*", { count: "exact", head: true }),
      adminSupabase.from("discovered_opportunities")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true)
        .eq("url_status", "ok")
        .in("page_status", ["specific_match", "name_changed"]),
      adminSupabase.from("masters_programs")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true)
        .eq("program_type", "erasmus_mundus_joint")
        .eq("url_status", "ok")
        .in("page_status", ["specific_english", "name_changed"]),
    ])
    return {
      programs: programs ?? 0,
      opportunities: (legacyOpps ?? 0) + (discOpps ?? 0),
      emjm: emjm ?? 0,
    }
  } catch {
    return { programs: 7800, opportunities: 1700, emjm: 36 }
  }
}

export async function getFeaturedOpportunities(limit = 6): Promise<Opportunity[]> {
  const { data } = await adminSupabase
    .from("opportunities")
    .select("*")
    .eq("is_featured", true)
    .eq("status", "open")
    .order("deadline", { ascending: true })
    .limit(limit)

  return (data ?? []) as Opportunity[]
}

export async function getRecentOpportunities(limit = 12): Promise<Opportunity[]> {
  const today = new Date().toISOString().split("T")[0]

  // Pull from BOTH legacy opportunities AND discovered_opportunities,
  // merge, and return the most recent across both tables.
  const [{ data: legacy }, { data: discovered }] = await Promise.all([
    adminSupabase
      .from("opportunities")
      .select("*")
      .eq("status", "open")
      .or(`deadline.gte.${today},deadline.is.null`)
      .order("created_at", { ascending: false })
      .limit(limit),
    adminSupabase
      .from("discovered_opportunities")
      .select("*")
      .eq("is_active", true)
      .order("discovered_at", { ascending: false })
      .limit(limit),
  ])

  // Map discovered_opportunities to the Opportunity display shape
  const mappedDiscovered = (discovered ?? []).map((d: any): Opportunity => ({
    id: d.id,
    title: d.title,
    type: d.type ?? "scholarship",
    host_country: [d.country],
    eligible_nations: d.eligible_nations ?? ["ALL"],
    ineligible_nations: d.ineligible_nations ?? [],
    field_of_study: d.field_of_study ?? [],
    degree_level: d.degree_level ?? "any",
    funding_type: d.funding_type ?? null,
    amount_usd: d.amount_usd ?? null,
    currency: null,
    deadline: d.deadline ?? null,
    open_date: null,
    status: "open",
    description: d.description ?? "",
    eligibility_text: d.eligibility_text ?? null,
    requirements: [],
    apply_url: d.apply_url ?? d.source_url ?? "",
    source_url: d.source_url,
    source_name: "discovered",
    is_verified: false,
    is_featured: false,
    scam_score: 0,
    embedding_id: null,
    created_at: d.discovered_at,
    updated_at: d.last_seen_at,
  }))

  // Merge + sort by date, return top N
  const merged = [...(legacy ?? []) as Opportunity[], ...mappedDiscovered]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit)

  return merged
}

// Personalised feed for a logged-in user
export async function getPersonalisedFeed(user: User, limit = 20): Promise<Opportunity[]> {
  const today = new Date().toISOString().split("T")[0]

  let q = adminSupabase
    .from("opportunities")
    .select("*")
    .eq("status", "open")
    .or(`deadline.gte.${today},deadline.is.null`)
    .order("deadline", { ascending: true })
    .limit(limit)

  // Filter by user nationality
  if (user.nationality.length > 0) {
    const natFilters = user.nationality
      .map((n) => `eligible_nations.cs.{"${n}"}`)
      .concat(['eligible_nations.cs.{"ALL"}'])
      .join(",")
    q = q.or(natFilters)
  }

  // Filter by field of study
  if (user.field_of_study.length > 0) {
    q = q.overlaps("field_of_study", user.field_of_study)
  }

  // Filter by degree level
  if (user.degree_level) {
    q = q.in("degree_level", [user.degree_level, "any"])
  }

  const { data } = await q
  return (data ?? []) as Opportunity[]
}

// ============================================================
// UPSERT (used by crawler pipeline)
// ============================================================

export async function upsertOpportunity(
  opp: Partial<Opportunity> & { fingerprint: string }
): Promise<{ id: string; is_new: boolean }> {
  // Check if fingerprint already exists
  const { data: existing } = await adminSupabase
    .from("opportunities")
    .select("id")
    .eq("fingerprint", opp.fingerprint)
    .single()

  if (existing) {
    // Update existing record
    await adminSupabase
      .from("opportunities")
      .update({ ...opp, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
    return { id: existing.id, is_new: false }
  }

  // Insert new record
  const { data, error } = await adminSupabase
    .from("opportunities")
    .insert(opp)
    .select("id")
    .single()

  if (error) throw new Error(`Insert error: ${error.message}`)
  return { id: data.id, is_new: true }
}
