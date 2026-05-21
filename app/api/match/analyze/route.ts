import { NextRequest, NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { getActiveMastersPrograms, saveMatchSession } from "@/lib/match"

export const runtime = "nodejs"
export const maxDuration = 60

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const cvFile = formData.get("cv") as File | null
    const transcriptFile = formData.get("transcript") as File | null
    const email = (formData.get("email") as string | null)?.trim() || null

    if (!cvFile) {
      return NextResponse.json({ error: "CV file is required" }, { status: 400 })
    }
    if (cvFile.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "CV file too large (max 10 MB)" }, { status: 400 })
    }
    if (cvFile.type !== "application/pdf") {
      return NextResponse.json({ error: "CV must be a PDF file" }, { status: 400 })
    }

    // Convert CV to base64
    const cvBuffer = await cvFile.arrayBuffer()
    const cvBase64 = Buffer.from(cvBuffer).toString("base64")

    // Optional transcript
    let transcriptBase64: string | null = null
    if (transcriptFile && transcriptFile.size > 0) {
      if (transcriptFile.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: "Transcript file too large (max 10 MB)" }, { status: 400 })
      }
      const transcriptBuffer = await transcriptFile.arrayBuffer()
      transcriptBase64 = Buffer.from(transcriptBuffer).toString("base64")
    }

    // Fetch all active programs from DB
    const programs = await getActiveMastersPrograms()
    if (programs.length === 0) {
      return NextResponse.json({ error: "No programs available. Please try again later." }, { status: 503 })
    }

    // Build programs context string
    const programsContext = programs
      .map(
        (p, i) =>
          `[${i + 1}] ${p.university} — ${p.program_name} (${p.country}, ${p.city})
   Category: ${p.category} | Field: ${Array.isArray(p.field_of_study) ? p.field_of_study.join(", ") : p.field_of_study} | Duration: ${p.duration_years} year(s)
   Language: ${p.language} | GPA min: ${p.gpa_min ?? "Not specified"} /${p.gpa_scale} | GRE: ${p.gre_required ? "Required" : "Not required"}
   IELTS min: ${p.ielts_min ?? "Not required"} | Tuition: ${p.tuition_usd_year ? `$${p.tuition_usd_year.toLocaleString()}/yr` : "Free / low-cost"}
   Scholarship: ${p.scholarship_available ? "Available" : "None"} | QS Ranking: ${p.qs_ranking ?? "Unranked"}
   Intake: ${p.intake ?? "N/A"} | Deadline: ${p.deadline ?? "Rolling"}
   Requirements: ${Array.isArray(p.requirements) ? p.requirements.join("; ") : "N/A"}
   Description: ${p.description}`
      )
      .join("\n\n")

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    // Build content blocks — Claude natively reads PDFs as document blocks
    const content: Anthropic.MessageParam["content"] = [
      {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: cvBase64,
        },
        title: "Student CV / Resume",
      } as any,
    ]

    if (transcriptBase64) {
      content.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: transcriptBase64,
        },
        title: "Academic Transcript",
      } as any)
    }

    content.push({
      type: "text",
      text: `Analyze the student's CV${transcriptBase64 ? " and transcript" : ""} above, then match them with the best-fit Masters programs from the list below.

Available Masters Programs:
${programsContext}

Return ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "student_profile": {
    "name": "string or null",
    "current_degree": "e.g. B.Sc. in Computer Science",
    "field": "e.g. Computer Science",
    "gpa": 3.7,
    "gpa_scale": 4.0,
    "university": "University name",
    "graduation_year": 2024,
    "skills": ["Python", "Machine Learning"],
    "work_experience_years": 1,
    "english_proficiency": "IELTS 7.0 or null",
    "gre_score": "320 or null",
    "career_goals": "brief description or null"
  },
  "matches": [
    {
      "program_index": 1,
      "fit_score": 87,
      "reasons": ["Strong CS background aligns with curriculum", "GPA exceeds the minimum requirement"],
      "concerns": ["Highly competitive intake", "No scholarship listed"],
      "recommendation": "Excellent fit — strong technical profile matches this research-heavy program"
    }
  ]
}

Rules:
- Return 8–10 best matches sorted by fit_score descending (100 = perfect fit, 0 = poor fit)
- program_index corresponds to the [N] numbers in the program list above
- Consider: field alignment, GPA vs minimum, language requirement, GRE requirement, scholarship availability, career goals, QS ranking
- Be honest about concerns — if GRE is required and student hasn't mentioned it, flag it
- If transcript is provided, use GPA from there if more accurate than CV`,
    })

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      messages: [{ role: "user", content }],
    })

    const raw = response.content[0].type === "text" ? response.content[0].text : ""
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error("Claude did not return valid JSON")
    }

    const parsed = JSON.parse(jsonMatch[0])
    const { student_profile, matches } = parsed

    if (!student_profile || !Array.isArray(matches)) {
      throw new Error("Unexpected response structure from Claude")
    }

    // Map program indices → actual program objects
    const programMatches = matches
      .map((m: { program_index: number; fit_score: number; reasons: string[]; concerns: string[]; recommendation: string }) => ({
        program: programs[m.program_index - 1] ?? null,
        fit_score: m.fit_score,
        reasons: m.reasons ?? [],
        concerns: m.concerns ?? [],
        recommendation: m.recommendation ?? "",
      }))
      .filter((m) => m.program !== null)

    // Save session (fire-and-forget if it fails, don't block response)
    const session = await saveMatchSession({
      email,
      extracted_profile: student_profile,
      matched_programs: programMatches,
      is_registered: !!email,
    })

    return NextResponse.json({
      session_id: session?.id ?? null,
      profile: student_profile,
      matches: programMatches,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error("Match analyze error:", msg)
    return NextResponse.json(
      { error: `Analysis failed: ${msg}` },
      { status: 500 }
    )
  }
}
