import { NextRequest, NextResponse } from "next/server"
import { getActivePrograms } from "@/lib/match"
import type { ProgramFilters } from "@/types"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl

    const filters: ProgramFilters = {
      level: (searchParams.get("level") ?? "all") as ProgramFilters["level"],
      category: searchParams.get("category") ?? undefined,
      country: searchParams.get("country") ? searchParams.get("country")!.split(",") : undefined,
      free_only: searchParams.get("free_only") === "true",
      scholarship_only: searchParams.get("scholarship_only") === "true",
      emjm_only: searchParams.get("emjm_only") === "true",
      city: searchParams.get("city") ?? undefined,
      query: searchParams.get("q") ?? undefined,
      page: parseInt(searchParams.get("page") ?? "1", 10),
      limit: parseInt(searchParams.get("limit") ?? "24", 10),
    }

    const result = await getActivePrograms(filters)

    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    console.error("[/api/programs]", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
