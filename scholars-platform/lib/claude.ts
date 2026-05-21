import Anthropic from "@anthropic-ai/sdk"
import type { Opportunity, RAGResponse } from "@/types"

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ============================================================
// RAG QUERY — Conversational scholarship search (Sonnet)
// ============================================================

export async function ragQuery(
  userQuery: string,
  relevantOpportunities: Opportunity[],
  userContext?: {
    nationality?: string[]
    field?: string[]
    degree_level?: string
  }
): Promise<RAGResponse> {
  const contextBlock = relevantOpportunities
    .slice(0, 5)
    .map(
      (o, i) => `[${i + 1}] ${o.title}
  Type: ${o.type} | Host: ${o.host_country.join(", ")} | Deadline: ${o.deadline ?? "Rolling"}
  Funding: ${o.funding_type ?? "N/A"} | Amount: ${o.amount_usd ? `$${o.amount_usd.toLocaleString()}` : "Not specified"}
  Eligible: ${o.eligible_nations.join(", ")}
  Degree: ${o.degree_level} | Field: ${o.field_of_study.join(", ") || "Any"}
  Description: ${o.description.slice(0, 300)}
  Apply: ${o.apply_url}`
    )
    .join("\n\n")

  const profileContext = userContext
    ? `Student profile: Nationality: ${userContext.nationality?.join(", ") || "Not specified"}, Field: ${userContext.field?.join(", ") || "Any"}, Level: ${userContext.degree_level || "Any"}`
    : ""

  const systemPrompt = `You are ScholarAssist, an AI assistant helping students find scholarships, PhD positions, grants, and fellowships worldwide. You are especially focused on opportunities for Bangladeshi and South Asian students.

Your role:
- Rank retrieved opportunities by relevance to the student's query
- Explain in 2–3 sentences why each opportunity is a good match
- Highlight: deadline urgency, funding amount, eligibility requirements
- Flag any nationality or residence restrictions clearly
- Suggest next steps (what documents to prepare, when to apply)
- NEVER invent opportunities not in the provided context
- Be direct and specific, not generic

${profileContext}`

  const userMessage = `Student query: "${userQuery}"

Retrieved opportunities:
${contextBlock}

Answer the student's query using only the opportunities above. Be specific and helpful.`

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  })

  const answer = response.content[0].type === "text" ? response.content[0].text : ""

  return {
    answer,
    sources: relevantOpportunities.slice(0, 5),
    query: userQuery,
  }
}

// ============================================================
// STREAM RAG QUERY — for streaming UI responses
// ============================================================

export async function* streamRagQuery(
  userQuery: string,
  relevantOpportunities: Opportunity[],
  userContext?: { nationality?: string[]; field?: string[]; degree_level?: string }
): AsyncGenerator<string> {
  const contextBlock = relevantOpportunities
    .slice(0, 5)
    .map(
      (o, i) => `[${i + 1}] ${o.title}
  Type: ${o.type} | Host: ${o.host_country.join(", ")} | Deadline: ${o.deadline ?? "Rolling"}
  Funding: ${o.funding_type ?? "N/A"} | Eligible: ${o.eligible_nations.join(", ")}
  Description: ${o.description.slice(0, 300)}`
    )
    .join("\n\n")

  const profileContext = userContext
    ? `Student: Nationality: ${userContext.nationality?.join(", ") || "?"}, Field: ${userContext.field?.join(", ") || "Any"}, Level: ${userContext.degree_level || "Any"}`
    : ""

  const stream = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    stream: true,
    system: `You are ScholarAssist, an AI assistant for scholarship search. ${profileContext} Only use provided opportunities. Be concise and helpful.`,
    messages: [
      {
        role: "user",
        content: `Query: "${userQuery}"\n\nOpportunities:\n${contextBlock}\n\nAnswer concisely.`,
      },
    ],
  })

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      yield event.delta.text
    }
  }
}

// ============================================================
// EXTRACTION — Claude Haiku for parsing raw scraped text
// (Used in Python pipeline via API call, this is the TS version
//  for server-side validation/re-extraction if needed)
// ============================================================

export async function extractOpportunityData(rawText: string): Promise<Partial<Opportunity>> {
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Extract structured scholarship/opportunity data from the following text. Return ONLY valid JSON with these fields:

{
  "title": "string",
  "type": "scholarship|grant|phd|postdoc|fellowship|internship|bursary|exchange",
  "host_country": ["ISO-2 codes"],
  "eligible_nations": ["ALL"] or ["BD","PK",...] or ["DEVELOPING"],
  "ineligible_nations": [],
  "field_of_study": ["field1","field2"],
  "degree_level": "undergraduate|masters|phd|postdoc|any",
  "funding_type": "full|partial|stipend|salary|null",
  "amount_usd": number or null,
  "currency": "string or null",
  "deadline": "YYYY-MM-DD or null",
  "description": "2-3 sentence summary",
  "eligibility_text": "eligibility requirements summary",
  "requirements": ["req1","req2"],
  "apply_url": "url or empty string",
  "is_scam": false
}

Raw text:
${rawText.slice(0, 3000)}`,
      },
    ],
  })

  const text = response.content[0].type === "text" ? response.content[0].text : "{}"
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return {}

  try {
    return JSON.parse(jsonMatch[0]) as Partial<Opportunity>
  } catch {
    return {}
  }
}
