import { NextRequest, NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { adminSupabase } from "@/lib/supabase"

// On-demand AI assistant for the admin /admin/feedback queue.
// Reads the feedback's evidence_url, asks Haiku to extract a structured
// correction (field + suggested value + confidence), and stores it in
// program_feedback.ai_analysis. Admin still reviews + clicks "Apply".
//
// Cost: ~$0.005-0.015 per analyse (Haiku 4.5). One run logged to crawler_runs.

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const ALLOWED_FIELDS = [
  "apply_url", "source_url", "tuition_usd_year", "duration_years",
  "ielts_min", "gpa_min", "deadline", "intake", "language",
  "scholarship_available", "description",
] as const

function ensureAdmin(req: NextRequest): NextResponse | null {
  if (req.cookies.get("admin_auth")?.value !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return null
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureAdmin(req); if (denied) return denied

  const runStart = Date.now()
  let runId: string | null = null
  try {
    // ---- Log run start ---------------------------------------------------
    const { data: run } = await adminSupabase.from("crawler_runs").insert({
      crawler: "feedback_analyzer",
      status: "running",
      params: { feedback_id: params.id },
      host: "vercel",
    }).select("id").single()
    runId = (run as any)?.id ?? null

    // ---- Fetch feedback + program ---------------------------------------
    const { data: fb, error: fbErr } = await adminSupabase
      .from("program_feedback")
      .select("id, program_id, issue_type, field, current_value, suggested_value, evidence_url, notes")
      .eq("id", params.id)
      .maybeSingle()
    if (fbErr || !fb) return NextResponse.json({ error: "Feedback not found" }, { status: 404 })

    const { data: prog } = await adminSupabase
      .from("masters_programs")
      .select("id, program_name, university, country, apply_url, source_url, tuition_usd_year, duration_years, ielts_min, gpa_min, deadline, intake, language, scholarship_available, description")
      .eq("id", fb.program_id)
      .maybeSingle()
    if (!prog) return NextResponse.json({ error: "Program not found" }, { status: 404 })

    if (!fb.evidence_url) {
      return NextResponse.json({ error: "No evidence URL on this feedback" }, { status: 400 })
    }

    // ---- Fetch evidence page --------------------------------------------
    let evidenceText = ""
    try {
      const r = await fetch(fb.evidence_url, {
        headers: { "User-Agent": "Mozilla/5.0 (ScholarAssistBot/1.0)" },
        signal: AbortSignal.timeout(15000),
      })
      if (!r.ok) {
        await finishRun(runId, "failed", { message: `evidence fetch ${r.status}` })
        return NextResponse.json({ error: `Evidence URL returned ${r.status}` }, { status: 400 })
      }
      const html = await r.text()
      evidenceText = stripHtml(html).slice(0, 12000)
    } catch (e: any) {
      await finishRun(runId, "failed", { message: `evidence fetch: ${e.message}` })
      return NextResponse.json({ error: `Could not fetch evidence URL: ${e.message}` }, { status: 400 })
    }

    // ---- Ask Haiku -------------------------------------------------------
    const prompt = `You are helping an admin verify a user-submitted correction for a master's program listing.

PROGRAM IN DATABASE:
- Name: ${prog.program_name}
- University: ${prog.university}
- Country: ${prog.country}
- Current values:
  apply_url: ${prog.apply_url ?? "(empty)"}
  tuition_usd_year: ${prog.tuition_usd_year ?? "(empty)"}
  duration_years: ${prog.duration_years ?? "(empty)"}
  ielts_min: ${prog.ielts_min ?? "(empty)"}
  gpa_min: ${prog.gpa_min ?? "(empty)"}
  deadline: ${prog.deadline ?? "(empty)"}
  intake: ${prog.intake ?? "(empty)"}
  language: ${prog.language ?? "(empty)"}
  scholarship_available: ${prog.scholarship_available ?? "(empty)"}

USER REPORTED:
- Issue type: ${fb.issue_type}
- Field they flagged: ${fb.field ?? "(none)"}
- Notes: ${fb.notes}
- Their suggested value: ${fb.suggested_value ?? "(none)"}

EVIDENCE PAGE (cleaned text from ${fb.evidence_url}):
${evidenceText}

Your job: read the evidence page and decide if you can extract a clear, factual correction. Reply with ONLY valid JSON, no prose:

{
  "field": "<one of: apply_url, source_url, tuition_usd_year, duration_years, ielts_min, gpa_min, deadline, intake, language, scholarship_available, description, or null if unsure>",
  "suggested_value": "<the corrected value from the evidence page, or null>",
  "confidence": <0.0 to 1.0>,
  "evidence_quote": "<short verbatim snippet from the evidence page supporting the correction, max 200 chars>",
  "reasoning": "<1-2 sentences explaining your decision>"
}

Rules:
- Numeric fields (tuition_usd_year, duration_years, ielts_min, gpa_min): return a number.
- scholarship_available: return true or false.
- If the evidence is ambiguous or doesn't address the reported issue, set field=null, confidence<0.4.
- Be conservative — admin can override, but a wrong "high confidence" suggestion is worse than null.`

    const aiStart = Date.now()
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    })
    const text = response.content[0].type === "text" ? response.content[0].text : "{}"
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    let analysis: any = {}
    if (jsonMatch) {
      try { analysis = JSON.parse(jsonMatch[0]) } catch { /* leave empty */ }
    }
    if (analysis.field && !ALLOWED_FIELDS.includes(analysis.field)) {
      analysis.field = null
    }

    // cost: Haiku 4.5 = $0.80/$4 per M
    const tokIn  = response.usage?.input_tokens ?? 0
    const tokOut = response.usage?.output_tokens ?? 0
    const cost = (tokIn * 0.80 / 1_000_000) + (tokOut * 4.00 / 1_000_000)

    // ---- Persist ---------------------------------------------------------
    const aiAnalysis = {
      ...analysis,
      model: "claude-haiku-4-5",
      analyzed_at: new Date().toISOString(),
      latency_ms: Date.now() - aiStart,
      cost_usd: Number(cost.toFixed(6)),
      tokens_in: tokIn,
      tokens_out: tokOut,
    }
    const updates: any = { ai_analysis: aiAnalysis }
    // Auto-fill suggested_value / field if missing AND confidence is reasonable
    if (analysis.confidence >= 0.6 && analysis.field) {
      if (!fb.field)           updates.field           = analysis.field
      if (!fb.suggested_value) updates.suggested_value = String(analysis.suggested_value ?? "")
    }
    await adminSupabase.from("program_feedback").update(updates).eq("id", fb.id)

    await finishRun(runId, "completed", {
      tokens_in: tokIn, tokens_out: tokOut, cost_usd: cost,
      summary: {
        confidence: analysis.confidence ?? null,
        field: analysis.field ?? null,
        had_evidence_text: evidenceText.length,
      },
      items_ok: 1,
    })

    return NextResponse.json({ ok: true, analysis: aiAnalysis })
  } catch (e: any) {
    await finishRun(runId, "failed", { message: e.message })
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

async function finishRun(
  runId: string | null,
  status: "completed" | "failed",
  opts: {
    message?: string
    tokens_in?: number
    tokens_out?: number
    cost_usd?: number
    summary?: any
    items_ok?: number
  }
) {
  if (!runId) return
  await adminSupabase.from("crawler_runs").update({
    status,
    finished_at: new Date().toISOString(),
    items_total: 1,
    items_processed: 1,
    items_ok: opts.items_ok ?? 0,
    items_failed: status === "failed" ? 1 : 0,
    tokens_in: opts.tokens_in ?? 0,
    tokens_out: opts.tokens_out ?? 0,
    cost_usd: opts.cost_usd ? Number(opts.cost_usd.toFixed(4)) : 0,
    summary: opts.summary ?? null,
    error_message: opts.message ?? null,
  }).eq("id", runId)
}
