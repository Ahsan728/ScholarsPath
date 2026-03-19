import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import type { Opportunity, SearchFilters, SearchResult, User } from "@/types"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Browser/public client — used in client components
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Server client — used in Server Components / API routes
export function createServerSupabase() {
  const cookieStore = cookies()
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name) { return cookieStore.get(name)?.value },
      set() {},
      remove() {},
    },
  })
}

// Admin client — bypasses RLS (server-side only, never expose to browser)
export const adminSupabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
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
  const { data } = await adminSupabase
    .from("opportunities")
    .select("*")
    .eq("status", "open")
    .or(`deadline.gte.${today},deadline.is.null`)
    .order("created_at", { ascending: false })
    .limit(limit)

  return (data ?? []) as Opportunity[]
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
