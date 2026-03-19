import { NextRequest, NextResponse } from "next/server"
import { semanticSearch } from "@/lib/pinecone"
import { getOpportunities } from "@/lib/supabase"
import { ragQuery } from "@/lib/claude"
import { adminSupabase } from "@/lib/supabase"

export const runtime = "nodejs"
export const maxDuration = 30

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { query, nationality, field, degree_level, mode = "semantic" } = body

    if (!query || typeof query !== "string" || query.trim().length < 2) {
      return NextResponse.json({ error: "Query too short" }, { status: 400 })
    }

    const cleanQuery = query.trim().slice(0, 300)

    if (mode === "rag") {
      // -------------------------------------------------------
      // RAG mode: vector search → Claude Sonnet answer
      // -------------------------------------------------------

      // 1. Vector search (Pinecone)
      const vectorFilter: Record<string, unknown> = {}
      if (nationality) {
        vectorFilter["eligible_nations"] = { $in: [nationality, "ALL", "DEVELOPING"] }
      }

      const vectorResults = await semanticSearch(cleanQuery, 20, vectorFilter)
      const vectorIds = vectorResults.map((r) => r.id)

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
      const allIds = [...new Set([...vectorIds, ...keywordIds])].slice(0, 20)

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

      return NextResponse.json({
        mode: "rag",
        answer: ragResponse.answer,
        sources: ragResponse.sources,
        total: opportunities.length,
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
