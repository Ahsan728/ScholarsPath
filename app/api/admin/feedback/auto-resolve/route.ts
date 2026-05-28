import { NextRequest, NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase"
import { AGGREGATOR_HOSTS } from "@/lib/aggregatorHosts"

// Zero-cost batch auto-resolver.
//
// Rule: if a pending feedback is `broken_link` AND has an evidence_url AND
// targets apply_url or source_url, then:
//   1. HEAD the evidence URL — must return 2xx
//   2. Final host must NOT be a known aggregator
//   3. Host tokens must overlap with the university name (loose match)
// If all three pass, copy evidence_url into the program field and mark the
// feedback resolved with an automatic admin_note. No LLM, no human required.
//
// Anything that fails the gates is left untouched for manual / AI review.

// AGGREGATOR_HOSTS now imported from lib/aggregatorHosts.ts (single source
// of truth: data/aggregator_hosts.json). Add new domains there, not here.

const STOP_WORDS = new Set([
  "the", "of", "and", "university", "universite", "universita",
  "universidad", "universitat", "universidade", "universiteit",
  "uniwersytet", "egyetem", "polytechnic", "institute", "school",
  "college", "technische", "hochschule",
])

function tokensFromUni(name: string): Set<string> {
  if (!name) return new Set()
  const toks = (name.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter(t => t.length > 2 && !STOP_WORDS.has(t))
  return new Set(toks)
}

function tokensFromHost(host: string): Set<string> {
  const skip = new Set(["www", "com", "org", "net", "edu", "ac", "uk", "eu", "de", "fr", "it", "es"])
  return new Set((host.match(/[a-z0-9]+/g) ?? []).filter(t => !skip.has(t)))
}

function domainRelates(host: string, uni: string): boolean {
  if (!host) return false
  const uniTok = tokensFromUni(uni)
  if (uniTok.size === 0) return true
  const hostTok = tokensFromHost(host)
  for (const t of Array.from(uniTok)) {
    if (t.length < 4) continue
    for (const h of Array.from(hostTok)) {
      if (t === h || t.includes(h) || h.includes(t)) return true
    }
  }
  return false
}

function ensureAdmin(req: NextRequest): NextResponse | null {
  if (req.cookies.get("admin_auth")?.value !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return null
}

async function checkUrl(url: string): Promise<{ ok: boolean; finalUrl: string; status: number; reason?: string }> {
  try {
    let r = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (ScholarAssistBot/1.0)" },
      signal: AbortSignal.timeout(12000),
    })
    // some servers reject HEAD
    if (r.status === 405 || r.status === 403 || r.status === 400) {
      r = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: { "User-Agent": "Mozilla/5.0 (ScholarAssistBot/1.0)" },
        signal: AbortSignal.timeout(15000),
      })
    }
    return { ok: r.ok, finalUrl: r.url, status: r.status }
  } catch (e: any) {
    return { ok: false, finalUrl: url, status: 0, reason: e.message }
  }
}

export async function POST(req: NextRequest) {
  const denied = ensureAdmin(req); if (denied) return denied

  const started = Date.now()
  const { data: run } = await adminSupabase.from("crawler_runs").insert({
    crawler: "feedback_auto_resolver",
    status: "running",
    host: "vercel",
  }).select("id").single()
  const runId = (run as any)?.id ?? null

  // Pull eligible pending feedback
  const { data: pending } = await adminSupabase
    .from("program_feedback")
    .select("id, program_id, issue_type, field, suggested_value, evidence_url, notes")
    .eq("status", "pending")
    .eq("issue_type", "broken_link")
    .not("evidence_url", "is", null)
    .in("field", ["apply_url", "source_url"])
    .limit(500)

  const rows = pending ?? []
  const programIds = Array.from(new Set(rows.map(r => r.program_id)))

  const { data: progs } = await adminSupabase
    .from("masters_programs")
    .select("id, university, apply_url, source_url")
    .in("id", programIds.length ? programIds : ["00000000-0000-0000-0000-000000000000"])
  const progMap = new Map((progs ?? []).map((p: any) => [p.id, p]))

  const results: Array<{
    id: string; applied?: boolean; reason: string;
    field?: string; old?: string; new?: string;
  }> = []
  let applied = 0
  let skipped = 0

  for (const fb of rows) {
    const prog = progMap.get(fb.program_id)
    if (!prog) { results.push({ id: fb.id, reason: "program not found" }); skipped++; continue }

    const candidate = (fb.suggested_value || fb.evidence_url || "").trim()
    if (!candidate || !candidate.startsWith("http")) {
      results.push({ id: fb.id, reason: "no usable URL" }); skipped++; continue
    }

    const field = fb.field as "apply_url" | "source_url"
    const currentValue = prog[field] ?? ""
    if (candidate === currentValue) {
      results.push({ id: fb.id, reason: "candidate equals current value" }); skipped++; continue
    }

    const check = await checkUrl(candidate)
    if (!check.ok) {
      results.push({ id: fb.id, reason: `evidence URL ${check.status || "unreachable"}: ${check.reason ?? ""}` })
      skipped++; continue
    }

    let host = ""
    try { host = new URL(check.finalUrl).hostname.toLowerCase().replace(/^www\./, "") } catch { /* */ }
    if (!host || AGGREGATOR_HOSTS.has(host)) {
      results.push({ id: fb.id, reason: `final host is aggregator: ${host}` }); skipped++; continue
    }
    if (!domainRelates(host, prog.university || "")) {
      results.push({ id: fb.id, reason: `host '${host}' doesn't match university '${prog.university}'` })
      skipped++; continue
    }

    // GREEN: apply
    const finalToWrite = check.finalUrl  // store the post-redirect canonical URL
    const { error: updErr } = await adminSupabase
      .from("masters_programs")
      .update({
        [field]: finalToWrite,
        url_status: "ok",
        url_http_code: check.status,
        url_final_url: finalToWrite,
        url_checked_at: new Date().toISOString(),
        url_check_error: null,
      })
      .eq("id", prog.id)
    if (updErr) {
      results.push({ id: fb.id, reason: `program update failed: ${updErr.message}` })
      skipped++; continue
    }

    await adminSupabase.from("program_feedback").update({
      status: "resolved",
      admin_note: `Auto-resolved: evidence URL validated (HTTP ${check.status}, host ${host}) and applied to ${field}.`,
      reviewed_at: new Date().toISOString(),
      reviewed_by: "auto-resolver",
    }).eq("id", fb.id)

    results.push({ id: fb.id, applied: true, reason: "applied", field, old: currentValue, new: finalToWrite })
    applied++
  }

  const summary = {
    eligible: rows.length, applied, skipped,
    skip_reasons: results.filter(r => !r.applied).reduce((m: any, r) => {
      const k = r.reason.split(":")[0]; m[k] = (m[k] ?? 0) + 1; return m
    }, {}),
  }

  if (runId) {
    await adminSupabase.from("crawler_runs").update({
      status: "completed",
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - started,
      items_total: rows.length,
      items_processed: rows.length,
      items_ok: applied,
      items_skipped: skipped,
      summary,
    }).eq("id", runId)
  }

  return NextResponse.json({ ok: true, applied, skipped, total: rows.length, results })
}
