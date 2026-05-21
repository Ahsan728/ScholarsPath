import { NextRequest, NextResponse } from "next/server"
import { semanticSearch } from "@/lib/pinecone"
import { getOpportunities } from "@/lib/supabase"
import { ragQuery } from "@/lib/claude"
import { adminSupabase } from "@/lib/supabase"
import { checkRagLimit, incrementRagUsage, logApiUsage } from "@/lib/tier"
import { createServerClient } from "@supabase/ssr"

export const runtime = "nodejs"
export const maxDuration = 30

async function getSessionUserId(req: NextRequest): Promise<string | null> {
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
    const body = await req.json()
    const { query, nationality, field, degree_level, mode = "semantic" } = body

    if (!query || typeof query !== "string" || query.trim().length < 2) {
      return NextResponse.json({ error: "Query too short" }, { status: 400 })
    }

    const cleanQuery = query.trim().slice(0, 300)

    if (mode === "rag") {
      // ── RAG gate ────────────────────────────────────────────
      const sessionId = req.cookies.get("sa_sid")?.value ?? "anonymous"
      const userId = await getSessionUserId(req)
      const limit = await checkRagLimit(sessionId, userId)
      if (!limit.allowed) {
        return NextResponse.json(
          { error: "limit_reached", used: limit.used, limit: limit.limit, upgrade_url: "/pricing" },
          { status: 429 }
        )
      }

      // -------------------------------------------------------
      // RAG mode: vector search → Claude Sonnet answer
      // Falls back to keyword-only if Pinecone/HuggingFace fails
      // -------------------------------------------------------

      // 1. Vector search (Pinecone) — best-effort
      const vectorFilter: Record<string, unknown> = {}
      if (nationality) {
        vectorFilter["eligible_nations"] = { $in: [nationality, "ALL", "DEVELOPING"] }
      }

      let vectorIds: string[] = []
      try {
        const vectorResults = await semanticSearch(cleanQuery, 20, vectorFilter)
        vectorIds = vectorResults.map((r) => r.id)
      } catch (vecErr) {
        console.warn("Vector search unavailable, using keyword fallback:", vecErr)
      }

      // 2. Keyword search (Supabase full-text)
      const keywordResults = await getOpportunities({
        query: cleanQuery,
        eligible_for: nationality,
        field: field ? [field] : undefined,
        degree_level: degree_level ? [degree_level] : undefined,
        limit: 20,
      })

      // 3. Merge: vector results + keyword results, deduplicate by id
      const keywordIds = keywordResults.opportunities.map((o) => o.id)
      const allIds = Array.from(new Set([...vectorIds, ...keywordIds])).slice(0, 20)

      // Fetch full opportunity records for merged IDs
      const { data: merged } = await adminSupabase
        .from("opportunities")
        .select("*")
        .in("id", allIds)
        .limit(20)

      const opportunities = merged ?? keywordResults.opportunities

      // 4. Claude RAG answer
      const ragResponse = await ragQuery(cleanQuery, opportunities as any, {
        nationality: nationality ? [nationality] : [],
        field: field ? [field] : [],
        degree_level,
      })

      // Log usage + increment counter (fire-and-forget)
      Promise.all([
        incrementRagUsage(sessionId, userId),
        logApiUsage({
          feature: "rag_chat",
          userId,
          sessionId,
          model: "claude-sonnet-4-6",
          inputTokens: 1400,   // estimated average
          outputTokens: 300,
        }),
      ]).catch(console.warn)

      return NextResponse.json({
        mode: "rag",
        answer: ragResponse.answer,
        sources: ragResponse.sources,
        total: opportunities.length,
        usage: { used: limit.used + 1, limit: limit.limit, is_pro: limit.is_pro },
      })
    } else {
      // -------------------------------------------------------
      // Semantic mode: pure vector search
      // -------------------------------------------------------
      const vectorResults = await semanticSearch(cleanQuery, 20)
      const ids = vectorResults.map((r) => r.id)

      const { data } = await adminSupabase
        .from("opportunities")
        .select("*")
        .in("id", ids)
        .limit(20)

      return NextResponse.json({
        mode: "semantic",
        opportunities: data ?? [],
        total: data?.length ?? 0,
      })
    }
  } catch (error) {
    console.error("Search API error:", error)
    return NextResponse.json(
      { error: "Search failed. Please try again." },
      { status: 500 }
    )
  }
}
