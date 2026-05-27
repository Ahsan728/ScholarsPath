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

export async function getOpportunities(filters: SearchFilters): Promise<SearchResult> {
  const {
    query,
    type,
    host_country,
    eligible_for,
    field,
    degree_level,
    funding_type,
    status = "open",
    deadline_after,
    page = 1,
    limit = 20,
  } = filters

  let q = adminSupabase
    .from("opportunities")
    .select("*", { count: "exact" })
    .order("deadline", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })

  // Status filter
  if (status) q = q.eq("status", status)

  // Opportunity type
  if (type?.length) q = q.in("type", type)

  // Host country
  if (host_country?.length) q = q.overlaps("host_country", host_country)

  // Nationality eligibility: ALL or contains the nationality code
  if (eligible_for) {
    q = q.or(`eligible_nations.cs.{"ALL"},eligible_nations.cs.{"${eligible_for}"}`)
  }

  // Field of study
  if (field?.length) q = q.overlaps("field_of_study", field)

  // Degree level
  if (degree_level?.length) q = q.in("degree_level", degree_level)

  // Funding type
  if (funding_type?.length) q = q.in("funding_type", funding_type)

  // Deadline filter — only show not-yet-expired
  if (deadline_after) {
    q = q.gte("deadline", deadline_after)
  } else {
    q = q.or(`deadline.gte.${new Date().toISOString().split("T")[0]},deadline.is.null`)
  }

  // Full-text keyword search
  if (query) {
    q = q.textSearch("title", query, { type: "websearch", config: "english" })
  }

  // Pagination
  const from = (page - 1) * limit
  q = q.range(from, from + limit - 1)

  const { data, error, count } = await q

  if (error) throw new Error(`Supabase query error: ${error.message}`)

  return {
    opportunities: (data ?? []) as Opportunity[],
    total: count ?? 0,
    page,
    has_more: (count ?? 0) > page * limit,
  }
}

export async function getOpportunityById(id: string): Promise<Opportunity | null> {
  const { data, error } = await adminSupabase
    .from("opportunities")
    .select("*")
    .eq("id", id)
    .single()

  if (error) return null
  return data as Opportunity
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
