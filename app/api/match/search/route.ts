import { NextRequest, NextResponse } from "next/server"
import { getActiveMastersPrograms, scoreAndRankPrograms, saveMatchSession } from "@/lib/match"
import type { StudentSearchProfile } from "@/types"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { bachelor_subject, category, gpa, gpa_scale, english_type, english_score, countries, email } = body

    if (!bachelor_subject || gpa == null || !gpa_scale) {
      return NextResponse.json({ error: "bachelor_subject, gpa, and gpa_scale are required" }, { status: 400 })
    }

    const profile: StudentSearchProfile = {
      bachelor_subject,
      category: category ?? "all",
      gpa: parseFloat(gpa),
      gpa_scale: parseFloat(gpa_scale),
      english_type: english_type ?? "none",
      english_score: english_score != null ? parseFloat(english_score) : null,
      countries: Array.isArray(countries) ? countries : [],
    }

    // Fetch programs — pre-filter by category and countries in DB for efficiency
    const categoryFilter = profile.category !== "all" ? profile.category : undefined
    const programs = await getActiveMastersPrograms(categoryFilter, profile.countries.length ? profile.countries : undefined)

    if (programs.length === 0) {
      // Retry without country filter (user may have picked countries that have no programs in DB)
      const allPrograms = await getActiveMastersPrograms(categoryFilter)
      const matches = scoreAndRankPrograms(allPrograms, profile)
      return NextResponse.json({ matches, total: matches.length })
    }

    const matches = scoreAndRankPrograms(programs, profile)

    // Save session asynchronously — don't block response
    saveMatchSession({
      email: email?.trim() || null,
      extracted_profile: profile,
      matched_programs: matches,
      is_registered: !!email?.trim(),
    }).catch(console.error)

    return NextResponse.json({ matches, total: matches.length })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error("Match search error:", msg)
    return NextResponse.json({ error: `Search failed: ${msg}` }, { status: 500 })
  }
}
