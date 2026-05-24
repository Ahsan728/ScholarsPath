import { NextRequest, NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { createServerClient } from "@supabase/ssr"
import { adminSupabase } from "@/lib/supabase"
import { checkCvEvalLimit, incrementCvEvalUsage, logApiUsage } from "@/lib/tier"
import { getActiveMastersPrograms } from "@/lib/match"

export const runtime = "nodejs"
export const maxDuration = 90

const MAX_FILE_SIZE = 10 * 1024 * 1024

async function getUserId(req: NextRequest): Promise<string | null> {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get: (n: string) => req.cookies.get(n)?.value, set: () => {}, remove: () => {} } }
    )
    const { data: { session } } = await supabase.auth.getSession()
    return session?.user?.id ?? null
  } catch { return null }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId(req)

    // ── Gate (STUDENT-TIER ONLY) ────────────────────────────
    // CV/Transcript evaluation is reserved for Mentorship Program members.
    // Free users and Pro subscribers both get blocked; only tier='student'
    // (allowlisted email) reaches the upload flow. See lib/tier.ts.
    const limit = await checkCvEvalLimit(userId)
    if (!limit.allowed) {
      // student_only takes precedence over any other reason — even if logged in.
      const reason = limit.student_only
        ? "mentorship_only"
        : !userId
          ? "login_required"
          : "monthly_limit_reached"
      return NextResponse.json(
        {
          error: reason,
          used: limit.used,
          limit: limit.limit,
          mentorship_url: "/mentorship",
          upgrade_url: "/pricing",
        },
        { status: !userId ? 401 : reason === "mentorship_only" ? 403 : 429 }
      )
    }

    // ── Parse files ───────────────────────────────────────────
    const formData = await req.formData()
    const cvFile = formData.get("cv") as File | null
    const transcriptFile = formData.get("transcript") as File | null

    if (!cvFile) return NextResponse.json({ error: "CV file is required" }, { status: 400 })
    if (cvFile.size > MAX_FILE_SIZE) return NextResponse.json({ error: "CV too large (max 10 MB)" }, { status: 400 })
    if (cvFile.type !== "application/pdf") return NextResponse.json({ error: "CV must be PDF" }, { status: 400 })

    const cvBase64 = Buffer.from(await cvFile.arrayBuffer()).toString("base64")
    let transcriptBase64: string | null = null
    if (transcriptFile && transcriptFile.size > 0) {
      if (transcriptFile.size > MAX_FILE_SIZE) return NextResponse.json({ error: "Transcript too large (max 10 MB)" }, { status: 400 })
      transcriptBase64 = Buffer.from(await transcriptFile.arrayBuffer()).toString("base64")
    }

    // ── Fetch context (top-50 programs + top-20 opportunities) ─
    const [programs, { data: oppData }] = await Promise.all([
      getActiveMastersPrograms(undefined, undefined),
      adminSupabase
        .from("opportunities")
        .select("id,title,type,host_country,eligible_nations,field_of_study,degree_level,funding_type,amount_usd,deadline,description,apply_url")
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(20),
    ])

    const top50 = programs.slice(0, 50)
    const opportunities = (oppData ?? []).slice(0, 20)

    const programsCtx = top50
      .map((p, i) =>
        `[P${i + 1}] ${p.university} — ${p.program_name} (${p.country})
   Category: ${p.category} | GPA min: ${p.gpa_min ?? "N/A"}/${p.gpa_scale} | IELTS: ${p.ielts_min ?? "N/A"}
   Tuition: ${p.tuition_usd_year ? `€${p.tuition_usd_year.toLocaleString()}/yr` : "Free"} | Scholarship: ${p.scholarship_available ? "Yes" : "No"} | QS: ${p.qs_ranking ?? "N/A"}`)
      .join("\n")

    const oppsCtx = opportunities
      .map((o: any, i: number) =>
        `[O${i + 1}] ${o.title} (${o.type.toUpperCase()}) — ${o.host_country.join(", ")}
   For: ${o.eligible_nations.includes("ALL") ? "All" : o.eligible_nations.join(", ")} | Deadline: ${o.deadline ?? "Rolling"}
   ${o.description?.slice(0, 150)}`)
      .join("\n")

    // ── Claude call ────────────────────────────────────────────
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const content: Anthropic.MessageParam["content"] = [
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: cvBase64 },
        title: "Student CV",
      } as any,
    ]
    if (transcriptBase64) {
      content.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: transcriptBase64 },
        title: "Academic Transcript",
      } as any)
    }
    content.push({
      type: "text",
      text: `Analyze this student's CV${transcriptBase64 ? " and transcript" : ""}.

--- PROGRAMS (top 50, European universities) ---
${programsCtx}

--- SCHOLARSHIPS & OPPORTUNITIES (top 20) ---
${oppsCtx}

Return ONLY valid JSON in this format:
{
  "profile_summary": "2-sentence plain-English summary of the student's background",
  "student_profile": {
    "name": "string or null",
    "current_degree": "e.g. B.Sc. Computer Science",
    "field": "e.g. Computer Science",
    "gpa": 3.7,
    "gpa_scale": 4.0,
    "university": "University name",
    "graduation_year": 2024,
    "skills": ["Python", "ML"],
    "work_experience_years": 1,
    "english_proficiency": "IELTS 7.0 or null",
    "career_goals": "brief or null"
  },
  "program_matches": [
    {
      "program_index": 1,
      "fit_score": 87,
      "reasons": ["Strong alignment", "GPA meets requirement"],
      "concerns": ["Competitive intake"],
      "recommendation": "Excellent fit"
    }
  ],
  "opportunity_matches": [
    {
      "opp_index": 1,
      "fit_score": 82,
      "reasons": ["Field match", "Nationality eligible"],
      "recommendation": "Strong match — apply before deadline"
    }
  ]
}

Rules:
- 5–8 program matches sorted by fit_score DESC
- 3–5 opportunity/scholarship matches sorted by fit_score DESC
- program_index = P-number; opp_index = O-number from lists above
- Be honest about concerns (GRE, GPA gaps, IELTS)`,
    })

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2500,
      messages: [{ role: "user", content }],
    })

    const raw = response.content[0].type === "text" ? response.content[0].text : ""
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error("Claude did not return valid JSON")
    const parsed = JSON.parse(jsonMatch[0])

    const { profile_summary, student_profile, program_matches, opportunity_matches } = parsed

    const mappedPrograms = (program_matches ?? [])
      .map((m: any) => ({
        program: top50[m.program_index - 1] ?? null,
        fit_score: m.fit_score,
        reasons: m.reasons ?? [],
        concerns: m.concerns ?? [],
        recommendation: m.recommendation ?? "",
      }))
      .filter((m: any) => m.program !== null)

    const mappedOpps = (opportunity_matches ?? [])
      .map((m: any) => ({
        ...opportunities[m.opp_index - 1],
        fit_score: m.fit_score,
        reasons: m.reasons ?? [],
        recommendation: m.recommendation ?? "",
      }))
      .filter((m: any) => m.id)

    // ── Increment usage + log ──────────────────────────────────
    // CV evaluation is student-tier only; only students reach this code path.
    if (userId) {
      await incrementCvEvalUsage(userId)
    }
    logApiUsage({
      feature: "cv_evaluate",
      userId,
      sessionId: req.cookies.get("sa_sid")?.value,
      model: "claude-sonnet-4-6",
      inputTokens: response.usage?.input_tokens ?? 12000,
      outputTokens: response.usage?.output_tokens ?? 1200,
    }).catch(console.warn)

    return NextResponse.json({
      profile_summary,
      student_profile,
      program_matches: mappedPrograms,
      opportunity_matches: mappedOpps,
      usage: { used: limit.used + 1, limit: limit.limit, is_pro: limit.is_pro },
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error("Evaluate error:", msg)
    return NextResponse.json({ error: `Evaluation failed: ${msg}` }, { status: 500 })
  }
}
