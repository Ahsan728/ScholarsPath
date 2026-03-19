import { NextRequest, NextResponse } from "next/server"
import { getOpportunities } from "@/lib/supabase"
import type { SearchFilters } from "@/types"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  const filters: SearchFilters = {
    query: searchParams.get("q") ?? undefined,
    type: searchParams.getAll("type") as any,
    host_country: searchParams.getAll("country"),
    eligible_for: searchParams.get("for") ?? undefined,
    field: searchParams.getAll("field"),
    degree_level: searchParams.getAll("level") as any,
    funding_type: searchParams.getAll("funding") as any,
    status: (searchParams.get("status") as any) ?? "open",
    page: parseInt(searchParams.get("page") ?? "1"),
    limit: Math.min(parseInt(searchParams.get("limit") ?? "20"), 100),
  }

  // Remove empty arrays
  if (!filters.type?.length) delete filters.type
  if (!filters.host_country?.length) delete filters.host_country
  if (!filters.field?.length) delete filters.field
  if (!filters.degree_level?.length) delete filters.degree_level
  if (!filters.funding_type?.length) delete filters.funding_type

  try {
    const result = await getOpportunities(filters)
    return NextResponse.json(result)
  } catch (error) {
    console.error("Opportunities API error:", error)
    return NextResponse.json({ error: "Failed to fetch opportunities" }, { status: 500 })
  }
}
