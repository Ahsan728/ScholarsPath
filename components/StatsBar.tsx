import { adminSupabase } from "@/lib/supabase"

export async function StatsBar() {
  try {
    // Count from BOTH legacy opportunities AND discovered_opportunities.
    // Apply the same Phase 0 gate as getOpportunities / getActivePrograms
    // so the bar matches what users actually see in the catalog.
    const [
      { count: legacyTotal }, { count: legacyOpen },
      { count: discTotal }, { count: discActive },
      { count: programs },
    ] = await Promise.all([
      adminSupabase.from("opportunities").select("*", { count: "exact", head: true }),
      adminSupabase.from("opportunities").select("*", { count: "exact", head: true }).eq("status", "open"),
      adminSupabase.from("discovered_opportunities")
        .select("*", { count: "exact", head: true })
        .eq("url_status", "ok")
        .in("page_status", ["specific_match", "name_changed"]),
      adminSupabase.from("discovered_opportunities")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true)
        .eq("url_status", "ok")
        .in("page_status", ["specific_match", "name_changed"]),
      adminSupabase.from("masters_programs")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true)
        .eq("url_status", "ok")
        .in("page_status", ["specific_english", "name_changed"]),
    ])

    const totalOpps = (legacyTotal ?? 0) + (discTotal ?? 0)
    const activeOpps = (legacyOpen ?? 0) + (discActive ?? 0)

    return (
      <div className="mb-6 flex flex-wrap gap-4 text-sm text-gray-600">
        <span>
          <strong className="text-gray-900">{(programs ?? 0).toLocaleString()}</strong> programs
        </span>
        <span>·</span>
        <span>
          <strong className="text-green-700">{totalOpps.toLocaleString()}</strong> scholarships &amp; grants
        </span>
        <span>·</span>
        <span>
          <strong className="text-blue-700">{activeOpps.toLocaleString()}</strong> active now
        </span>
      </div>
    )
  } catch {
    return null
  }
}
