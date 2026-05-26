import { adminSupabase } from "@/lib/supabase"
import type { MastersProgram, StudentSearchProfile, ProgramMatch, ProgramFilters } from "@/types"

const EUROPEAN_COUNTRIES = [
  "Germany", "France", "Italy", "Netherlands", "Sweden", "Belgium", "Spain",
  "Poland", "Denmark", "Austria", "Finland", "Norway", "Switzerland", "Portugal",
  "Ireland", "Czech Republic", "Hungary", "Greece", "Romania", "Bulgaria",
  "Croatia", "Estonia", "Latvia", "Lithuania", "Luxembourg", "Malta", "Slovakia",
  "Slovenia", "Cyprus", "Europe",
]

// ============================================================
// DB QUERIES
// ============================================================

export async function getActiveMastersPrograms(
  category?: string,
  countries?: string[]
): Promise<MastersProgram[]> {
  const countryFilter = countries && countries.length > 0 ? countries : EUROPEAN_COUNTRIES

  let q = adminSupabase
    .from("masters_programs")
    .select("*")
    .eq("is_active", true)
    .in("country", countryFilter)

  if (category && category !== "all") q = q.eq("category", category)

  const { data, error } = await q.order("qs_ranking", { ascending: true, nullsFirst: false })
  if (error) throw new Error(`Failed to fetch programs: ${error.message}`)
  return (data ?? []) as MastersProgram[]
}

export async function getActivePrograms(filters: ProgramFilters = {}): Promise<{ programs: MastersProgram[]; total: number }> {
  const {
    level, category, country, free_only, scholarship_only, emjm_only,
    query, page = 1, limit = 24,
  } = filters

  let q = adminSupabase
    .from("masters_programs")
    .select("*", { count: "exact" })
    .eq("is_active", true)

  // When emjm_only is on, country filter is intentionally ignored — EMJM
  // programs are multi-country consortia and our country column only
  // stores the "primary" country. They'd be missed by an .in('country', …).
  if (!emjm_only) {
    const countryFilter = country && country.length > 0 ? country : EUROPEAN_COUNTRIES
    q = q.in("country", countryFilter)
  }

  if (level && level !== "all") q = q.eq("level", level)
  if (category && category !== "all") q = q.eq("category", category)
  if (free_only) q = q.or("tuition_usd_year.is.null,tuition_usd_year.eq.0")
  if (scholarship_only) q = q.eq("scholarship_available", true)
  if (emjm_only) q = q.eq("program_type", "erasmus_mundus_joint")
  if (query) q = q.ilike("program_name", `%${query}%`)

  const from = (page - 1) * limit
  // Pin EMJM to the top of the default listing — they're always more
  // prestigious + funded; users should see them first when no specific
  // filter is applied.
  q = q.range(from, from + limit - 1)
       .order("program_type", { ascending: false })  // 'erasmus_mundus_joint' > 'standard'
       .order("qs_ranking",   { ascending: true, nullsFirst: false })

  const { data, error, count } = await q
  if (error) throw new Error(`Failed to fetch programs: ${error.message}`)
  return { programs: (data ?? []) as MastersProgram[], total: count ?? 0 }
}

export async function saveMatchSession(params: {
  email: string | null
  extracted_profile: StudentSearchProfile
  matched_programs: ProgramMatch[]
  is_registered: boolean
}): Promise<{ id: string } | null> {
  const { data, error } = await adminSupabase
    .from("match_sessions")
    .insert({
      email: params.email,
      extracted_profile: params.extracted_profile,
      matched_programs: params.matched_programs,
      is_registered: params.is_registered,
    })
    .select("id")
    .single()

  if (error) {
    console.error("Failed to save match session:", error)
    return null
  }
  return data
}

export async function updateMatchSessionEmail(
  sessionId: string,
  email: string
): Promise<void> {
  await adminSupabase
    .from("match_sessions")
    .update({ email, is_registered: true })
    .eq("id", sessionId)
}

// ============================================================
// SCORING ENGINE — zero API cost
// ============================================================

// Keywords that map each dropdown choice to a DB category
const SUBJECT_TO_CATEGORY: Record<string, string> = {
  "Computer Science / AI / Data Science": "cs_ai",
  "Software Engineering": "cs_ai",
  "Information Technology": "cs_ai",
  "Electrical / Electronics Engineering": "engineering",
  "Mechanical Engineering": "engineering",
  "Civil / Structural Engineering": "engineering",
  "Chemical Engineering": "engineering",
  "Finance / Economics / Business": "business",
  "Management / MBA": "business",
  "Accounting / Banking": "business",
  "Physics": "science",
  "Chemistry": "science",
  "Biology / Biomedical Sciences": "science",
}

const FIELD_KEYWORDS: Record<string, string[]> = {
  cs_ai: ["computer", "software", "ai", "data", "information", "computing", "machine", "algorithm", "cyber", "network"],
  engineering: ["electrical", "electronic", "mechanical", "civil", "structural", "chemical", "manufacturing", "automotive", "embedded", "power"],
  business: ["finance", "business", "economics", "management", "commerce", "accounting", "banking", "investment", "fintech", "marketing"],
  science: ["physics", "chemistry", "biology", "biochemistry", "molecular", "biomedical", "photonics", "quantum", "materials", "ecology"],
}

/** Normalize any GPA scale to 4.0 */
function toGPA4(gpa: number, scale: number): number {
  return Math.min(4.0, (gpa / scale) * 4.0)
}

/** Convert TOEFL iBT to approximate IELTS band */
function toeflToIELTS(toefl: number): number {
  if (toefl >= 110) return 8.0
  if (toefl >= 102) return 7.5
  if (toefl >= 94) return 7.0
  if (toefl >= 79) return 6.5
  if (toefl >= 60) return 6.0
  return 5.5
}

function getIELTS(profile: StudentSearchProfile): number | null {
  if (profile.english_type === "none" || !profile.english_score) return null
  if (profile.english_type === "ielts") return profile.english_score
  return toeflToIELTS(profile.english_score)
}

/** 0–40: field alignment score */
function fieldScore(program: MastersProgram, profile: StudentSearchProfile): { pts: number; reason: string | null } {
  const studentCategory = SUBJECT_TO_CATEGORY[profile.bachelor_subject] ?? profile.category
  const programCategory = program.category

  // Same top-level category
  if (studentCategory === programCategory || profile.category === "all") {
    // Check keyword overlap with program's field_of_study array
    const keywords = FIELD_KEYWORDS[studentCategory] ?? []
    const programFields = (Array.isArray(program.field_of_study) ? program.field_of_study : [program.field_of_study])
      .map((f) => f.toLowerCase())

    const hasKeyword = keywords.some((kw) =>
      programFields.some((pf) => pf.includes(kw)) ||
      profile.bachelor_subject.toLowerCase().includes(kw)
    )

    if (hasKeyword) return { pts: 40, reason: `Strong field alignment with ${profile.bachelor_subject}` }
    return { pts: 30, reason: `Broad field alignment (${programCategory})` }
  }

  return { pts: 0, reason: null }
}

/** 0–30: GPA eligibility */
function gpaScore(program: MastersProgram, profile: StudentSearchProfile): { pts: number; concern: string | null } {
  const gpa4 = toGPA4(profile.gpa, profile.gpa_scale)

  if (!program.gpa_min) return { pts: 20, concern: null }

  const programGpa4 = toGPA4(program.gpa_min, program.gpa_scale)
  const gap = programGpa4 - gpa4

  if (gap <= 0) return { pts: 30, concern: null }
  if (gap <= 0.2) return { pts: 20, concern: `GPA slightly below minimum (${program.gpa_min}/${program.gpa_scale} required)` }
  if (gap <= 0.5) return { pts: 10, concern: `GPA below minimum by ${gap.toFixed(1)} points (${program.gpa_min}/${program.gpa_scale} required)` }
  return { pts: 0, concern: `GPA significantly below minimum — ${program.gpa_min}/${program.gpa_scale} required` }
}

/** 0–20: language requirement */
function langScore(program: MastersProgram, profile: StudentSearchProfile): { pts: number; concern: string | null } {
  const ielts = getIELTS(profile)

  if (!program.ielts_min) return { pts: 15, concern: null }
  if (!ielts) return { pts: 8, concern: `IELTS ${program.ielts_min} (or TOEFL equivalent) required — not specified` }

  const gap = program.ielts_min - ielts
  if (gap <= 0) return { pts: 20, concern: null }
  if (gap <= 0.5) return { pts: 12, concern: `IELTS ${program.ielts_min} required (you have ${ielts.toFixed(1)})` }
  return { pts: 0, concern: `English score below minimum — IELTS ${program.ielts_min} required` }
}

/** 0–10: country preference bonus */
function countryScore(program: MastersProgram, profile: StudentSearchProfile): number {
  if (profile.countries.length === 0) return 5 // neutral
  return profile.countries.includes(program.country) ? 10 : 0
}

export function scoreAndRankPrograms(
  programs: MastersProgram[],
  profile: StudentSearchProfile
): ProgramMatch[] {
  const results = programs.map((program): ProgramMatch & { _score: number } => {
    const field = fieldScore(program, profile)
    const gpa = gpaScore(program, profile)
    const lang = langScore(program, profile)
    const country = countryScore(program, profile)

    const total = field.pts + gpa.pts + lang.pts + country
    const gpa4 = toGPA4(profile.gpa, profile.gpa_scale)
    const programGpa4 = program.gpa_min ? toGPA4(program.gpa_min, program.gpa_scale) : 0

    const reasons: string[] = []
    const concerns: string[] = []

    if (field.reason) reasons.push(field.reason)
    if (gpa.pts >= 30) reasons.push(`GPA meets requirement (${gpa4.toFixed(2)}/4.0 ≥ ${programGpa4.toFixed(2)})`)
    if (lang.pts === 20) reasons.push("English proficiency meets requirement")
    if (program.scholarship_available) reasons.push("Scholarship / funding available")
    if (program.tuition_usd_year === null || program.tuition_usd_year === 0) reasons.push("No tuition fees")
    if (profile.countries.includes(program.country)) reasons.push(`${program.country} is in your preferred countries`)

    if (gpa.concern) concerns.push(gpa.concern)
    if (lang.concern) concerns.push(lang.concern)
    if (program.gre_required) concerns.push("GRE test required")
    if (!program.scholarship_available && program.tuition_usd_year && program.tuition_usd_year > 15000) {
      concerns.push(`High tuition ($${program.tuition_usd_year.toLocaleString()}/yr) — check funding options`)
    }

    let recommendation = ""
    if (total >= 80) recommendation = "Excellent match — strong likelihood of admission"
    else if (total >= 60) recommendation = "Good match — worth applying with strong SOP"
    else if (total >= 40) recommendation = "Possible match — address gaps in your application"
    else recommendation = "Stretch target — consider improving profile before applying"

    return {
      program,
      fit_score: Math.min(100, total),
      reasons,
      concerns,
      recommendation,
      _score: total,
    }
  })

  return results
    .filter((r) => r.fit_score >= 20) // drop extremely poor fits
    .sort((a, b) => b._score - a._score)
    .slice(0, 10)
    .map(({ _score: _, ...rest }) => rest)
}
