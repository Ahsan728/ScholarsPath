import { Pinecone } from "@pinecone-database/pinecone"

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! })

const INDEX_NAME = process.env.PINECONE_INDEX_NAME ?? "scholars-opportunities"

export function getPineconeIndex() {
  return pc.index(INDEX_NAME)
}

// ============================================================
// EMBEDDING — HuggingFace Inference API (free tier)
// Model: sentence-transformers/all-MiniLM-L6-v2 (384 dims)
// ============================================================

export async function embedText(text: string): Promise<number[]> {
  const hfToken = process.env.HUGGINGFACE_API_TOKEN

  const response = await fetch(
    "https://api-inference.huggingface.co/models/sentence-transformers/all-MiniLM-L6-v2",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${hfToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: text }),
    }
  )

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`HuggingFace embedding error: ${err}`)
  }

  const result = await response.json()
  // HF returns nested array for batch or flat array for single
  return Array.isArray(result[0]) ? result[0] : result
}

// ============================================================
// UPSERT VECTOR
// ============================================================

export async function upsertVector(
  id: string,
  text: string,
  metadata: Record<string, string | string[] | number | boolean | null>
): Promise<void> {
  const index = getPineconeIndex()
  const vector = await embedText(text)

  await index.upsert([
    {
      id,
      values: vector,
      metadata: {
        ...metadata,
        // Pinecone metadata values must be string | number | boolean | string[]
        eligible_nations: Array.isArray(metadata.eligible_nations)
          ? (metadata.eligible_nations as string[])
          : [],
        host_country: Array.isArray(metadata.host_country)
          ? (metadata.host_country as string[])
          : [],
        field_of_study: Array.isArray(metadata.field_of_study)
          ? (metadata.field_of_study as string[])
          : [],
      },
    },
  ])
}

// ============================================================
// SEMANTIC SEARCH
// ============================================================

export interface VectorSearchResult {
  id: string
  score: number
  metadata: Record<string, unknown>
}

export async function semanticSearch(
  query: string,
  topK = 20,
  filter?: Record<string, unknown>
): Promise<VectorSearchResult[]> {
  const index = getPineconeIndex()
  const queryVector = await embedText(query)

  const results = await index.query({
    vector: queryVector,
    topK,
    includeMetadata: true,
    filter,
  })

  return (results.matches ?? []).map((m) => ({
    id: m.id,
    score: m.score ?? 0,
    metadata: (m.metadata ?? {}) as Record<string, unknown>,
  }))
}

// ============================================================
// DELETE VECTOR
// ============================================================

export async function deleteVector(id: string): Promise<void> {
  const index = getPineconeIndex()
  await index.deleteOne(id)
}
