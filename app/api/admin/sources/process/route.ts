import { NextRequest, NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase"
import { extractJson, SchemaInvalid } from "@/lib/ai/extract"
import type { UserTier } from "@/types"

// POST: process one source URL — extract programs + opportunities via Haiku.
// Called automatically after adding a source, or manually via "Process" button.
//
// Body: { source_id: string }
//
// This runs server-side on Vercel (~15-30s). On hobby plan the 60s timeout
// is tight for pages with many programs. Pro plan handles it fine.

function ensureAdmin(req: NextRequest): NextResponse | null {
  if (req.cookies.get("admin_auth")?.value !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return null
}

function extractLinks(html: string, baseUrl: string): string {
  const linkRx = /<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi
  const seen = new Set<string>()
  const out: string[] = []
  let m
  while ((m = linkRx.exec(html)) !== null) {
    const href = m[1]
    const text = m[2].replace(/<[^>]+>/g, "").trim()
    if (!text || text.length < 3) continue
    const full = new URL(href, baseUrl).toString()
    if (seen.has(full)) continue
    seen.add(full)
    out.push(`  [${text.slice(0, 80)}](${full})`)
    if (out.length >= 150) break
  }
  return out.join("\n")
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(nav|header|footer|aside|form|svg)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
}

function buildPrompt(text: string, links: string, url: string, country: string | null): string {
  return `Analyse this page and extract TWO things:

1. **Opportunities**: scholarships, fellowships, grants, PhD positions, funding
2. **Programs**: English-taught bachelor's or master's degree programs

Reply with ONLY valid JSON:

{
  "opportunities": [
    {
      "type": "<scholarship | grant | phd | postdoc | fellowship | internship | bursary | assistantship | exchange>",
      "title": "<short distinctive name>",
      "description": "<1-3 sentences>",
      "country": "<full English country name>",
      "degree_level": "<undergraduate | masters | phd | postdoc | any | null>",
      "field_of_study": ["<broad field>"],
      "amount_text": "<verbatim funding string or null>",
      "funding_type": "<full | partial | stipend | salary | tuition_waiver | null>",
      "eligibility_text": "<short summary or null>",
      "deadline_text": "<verbatim or null>",
      "apply_url": "<direct link or null>"
    }
  ],
  "programs": [
    {
      "program_name": "<official name>",
      "university": "<university name>",
      "country": "<full English country name>",
      "city": "<city or null>",
      "level": "<bachelor | master>",
      "duration_years": <number or null>,
      "language": "<'English' or 'English, Spanish' etc.>",
      "field_of_study": ["<broad field>"],
      "ielts_min": <number or null>,
      "intake": "<e.g. 'Fall 2026' or null>",
      "apply_url": "<SPECIFIC program page link from the Links section — NOT the listing page>",
      "description": "<1-2 sentences or null>"
    }
  ]
}

Source URL: ${url}
Country hint: ${country || "unknown"}

Rules:
- For programs: ONLY English-taught or mixed-with-English. Skip non-English.
- apply_url: use the SPECIFIC program link from the Links section, not the listing URL.
- Return {"opportunities": [], "programs": []} if nothing usable.

Page text:
${text.slice(0, 12000)}

Links on this page:
${links.slice(0, 3000) || "(none)"}
`
}

import crypto from "crypto"

function fingerprint(name: string, country: string, level: string): string {
  const raw = `${name.toLowerCase().trim()}|${country.toLowerCase()}|${level}`
  return crypto.createHash("sha256").update(raw).digest("hex")
}

export async function POST(req: NextRequest) {
  const denied = ensureAdmin(req); if (denied) return denied

  const body = await req.json().catch(() => ({}))
  const sourceId: string = body.source_id
  if (!sourceId) return NextResponse.json({ error: "source_id required" }, { status: 400 })

  // Get source row
  const { data: source } = await adminSupabase
    .from("opportunity_sources").select("*").eq("id", sourceId).maybeSingle()
  if (!source) return NextResponse.json({ error: "Source not found" }, { status: 404 })

  // Create a crawler_runs row for observability
  const { data: runRow } = await adminSupabase.from("crawler_runs").insert({
    crawler: "source_auto_processor",
    status: "running",
    params: { source_id: sourceId, url: (source as any).url },
    host: "vercel",
  }).select("id").single()
  const runId = (runRow as any)?.id ?? crypto.randomUUID()

  const url = (source as any).url as string
  const country = (source as any).country as string | null

  try {
    // Fetch page
    const pageRes = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (ScholarAssistBot/1.0)", "Accept": "text/html" },
      signal: AbortSignal.timeout(15000),
    })
    if (!pageRes.ok) throw new Error(`Fetch failed: ${pageRes.status}`)
    const html = await pageRes.text()
    const links = extractLinks(html, url)
    const text = stripHtml(html)
    if (text.length < 100) throw new Error("Page has too little text")

    // LLM extraction
    const data = await extractJson<{
      opportunities: any[]; programs: any[]
    }>({
      prompt: buildPrompt(text, links, url, country),
      runId, maxUsdPerRun: 0.50, maxTokens: 6000,
      expectedKeys: ["opportunities", "programs"],
    })

    const opps = data.opportunities || []
    const progs = data.programs || []

    // Insert opportunities
    let oppsWritten = 0
    for (const opp of opps) {
      if (!opp.title) continue
      const { error } = await adminSupabase.from("discovered_opportunities").insert({
        source_id: sourceId, source_url: url, run_id: runId,
        prompt_version: "v1", type: opp.type || "scholarship",
        title: (opp.title || "").slice(0, 300),
        description: (opp.description || "").slice(0, 2000) || null,
        country: opp.country || country || "Unknown",
        degree_level: opp.degree_level || null,
        field_of_study: opp.field_of_study || [],
        amount_text: (opp.amount_text || "").slice(0, 300) || null,
        funding_type: opp.funding_type || null,
        eligibility_text: (opp.eligibility_text || "").slice(0, 1000) || null,
        deadline_text: (opp.deadline_text || "").slice(0, 200) || null,
        apply_url: opp.apply_url || null,
        last_seen_at: new Date().toISOString(),
      })
      if (!error) oppsWritten++
    }

    // Insert programs (dedup by fingerprint)
    let progsWritten = 0
    for (const p of progs) {
      const name = (p.program_name || "").trim()
      const pCountry = (p.country || country || "").trim()
      const lang = (p.language || "").trim()
      if (!name || !pCountry) continue
      if (lang && !lang.toLowerCase().includes("english")) continue

      const fp = fingerprint(name, pCountry, p.level || "master")

      // Check existing
      const { data: existing } = await adminSupabase
        .from("masters_programs").select("id").eq("fingerprint", fp).maybeSingle()
      if (existing) continue

      const { error } = await adminSupabase.from("masters_programs").insert({
        program_name: name.slice(0, 300),
        university: (p.university || "").slice(0, 300) || "Unknown University",
        country: pCountry,
        city: (p.city || "").trim() || pCountry,
        level: p.level || "master",
        duration_years: p.duration_years || 2,
        language: lang || "English",
        field_of_study: p.field_of_study || [],
        category: Array.isArray(p.field_of_study) && p.field_of_study[0]
          ? p.field_of_study[0].toLowerCase().replace(/ /g, "_").slice(0, 50)
          : "general",
        tuition_usd_year: null,
        ielts_min: p.ielts_min || null,
        gre_required: false, gpa_min: null, gpa_scale: 4.0,
        intake: p.intake || "Fall/Spring",
        deadline: null,
        scholarship_available: false,
        description: (p.description || `${name} at ${p.university || "university"}`).slice(0, 1000),
        requirements: [],
        apply_url: p.apply_url || url,
        source_url: url,
        source_name: "discoverer",
        is_active: true,
        fingerprint: fp,
      })
      if (!error) progsWritten++
    }

    // Mark source as crawled
    await adminSupabase.from("opportunity_sources").update({
      last_crawled_at: new Date().toISOString(), last_status: "ok",
    }).eq("id", sourceId)

    // Finish run
    await adminSupabase.from("crawler_runs").update({
      status: "completed", finished_at: new Date().toISOString(),
      items_total: opps.length + progs.length,
      items_ok: oppsWritten + progsWritten,
      summary: { opportunities: oppsWritten, programs: progsWritten,
                 opps_extracted: opps.length, progs_extracted: progs.length },
    }).eq("id", runId)

    return NextResponse.json({
      ok: true,
      opportunities: oppsWritten,
      programs: progsWritten,
      total_extracted: opps.length + progs.length,
    })
  } catch (e: any) {
    await adminSupabase.from("crawler_runs").update({
      status: "failed", finished_at: new Date().toISOString(),
      error_message: e.message?.slice(0, 500),
    }).eq("id", runId)
    await adminSupabase.from("opportunity_sources").update({
      last_crawled_at: new Date().toISOString(), last_status: "error",
    }).eq("id", sourceId)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
