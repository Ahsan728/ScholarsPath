import Anthropic from "@anthropic-ai/sdk"
import { adminSupabase } from "@/lib/supabase"

// Provider-agnostic structured-extraction wrapper for API routes.
//
// Routes JSON-extraction to Anthropic Haiku or OpenAI gpt-4o-mini, enforces
// per-run budget caps via crawler_runs.cost_usd, schema-validates output,
// and records actual cost back to the run row.
//
// Mirrors crawlers/ai/extract.py so the budget-tracking semantics are
// identical across server-side TS and Python crawler workers.

type Provider = "anthropic" | "openai"

interface CostRate { in: number; out: number }  // USD per 1M tokens

const COST: Record<Provider, Record<string, CostRate>> = {
  anthropic: {
    "claude-haiku-4-5":  { in: 0.80, out: 4.00 },
    "claude-sonnet-4-6": { in: 3.00, out: 15.00 },
  },
  openai: {
    "gpt-4o-mini": { in: 0.15, out: 0.60 },
    "gpt-4o":      { in: 2.50, out: 10.00 },
  },
}

const DEFAULT_MODEL: Record<Provider, string> = {
  anthropic: "claude-haiku-4-5",
  openai:    "gpt-4o-mini",
}

// Default provider is Anthropic — the openai package is optional and only
// installed if you explicitly want to route Discoverer traffic to OpenAI.
// To enable: `npm install openai` and set provider: "openai" on the call.
export const DEFAULT_PROVIDER: Provider = "anthropic"

export class BudgetExceeded extends Error {
  constructor(message: string) { super(message); this.name = "BudgetExceeded" }
}

export class SchemaInvalid extends Error {
  constructor(message: string) { super(message); this.name = "SchemaInvalid" }
}

interface ExtractOpts {
  prompt: string
  runId: string
  maxUsdPerRun: number
  provider?: Provider
  model?: string
  maxTokens?: number
  expectedKeys?: string[]
  estimatedCost?: number
}

async function getCurrentRunCost(runId: string): Promise<number> {
  const { data } = await adminSupabase
    .from("crawler_runs")
    .select("cost_usd")
    .eq("id", runId)
    .maybeSingle()
  return Number((data as any)?.cost_usd ?? 0)
}

async function addRunCost(runId: string, deltaUsd: number, tokIn: number, tokOut: number): Promise<void> {
  const { data } = await adminSupabase
    .from("crawler_runs")
    .select("cost_usd, tokens_in, tokens_out")
    .eq("id", runId)
    .maybeSingle()
  const row = (data as any) ?? {}
  await adminSupabase.from("crawler_runs").update({
    cost_usd:   Number((Number(row.cost_usd ?? 0) + deltaUsd).toFixed(4)),
    tokens_in:  (row.tokens_in  ?? 0) + tokIn,
    tokens_out: (row.tokens_out ?? 0) + tokOut,
  }).eq("id", runId)
}

export async function assertBudget(runId: string, estimatedCost: number, maxUsdPerRun: number): Promise<void> {
  if (maxUsdPerRun <= 0) return  // 0 = unlimited
  const spent = await getCurrentRunCost(runId)
  if (spent + estimatedCost > maxUsdPerRun) {
    throw new BudgetExceeded(
      `run ${runId}: would spend $${(spent + estimatedCost).toFixed(4)}, cap is $${maxUsdPerRun.toFixed(2)}`
    )
  }
}

async function callAnthropic(prompt: string, model: string, maxTokens: number): Promise<{ text: string; tokIn: number; tokOut: number }> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const r = await client.messages.create({
    model,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  })
  const text = r.content[0]?.type === "text" ? r.content[0].text : ""
  return { text, tokIn: r.usage?.input_tokens ?? 0, tokOut: r.usage?.output_tokens ?? 0 }
}

async function callOpenAI(prompt: string, model: string, maxTokens: number): Promise<{ text: string; tokIn: number; tokOut: number }> {
  // OpenAI is optional — only used if explicitly opted into via provider: "openai".
  // We use a dynamic require() wrapped in try/catch so the build doesn't fail
  // when the openai package isn't installed.
  let OpenAI: any
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("openai")
    OpenAI = mod.default || mod.OpenAI || mod
  } catch {
    throw new Error(
      "OpenAI provider requested but 'openai' package is not installed. " +
      "Run 'npm install openai' or switch to provider: 'anthropic'."
    )
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
  const r = await client.chat.completions.create({
    model,
    max_tokens: maxTokens,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "Reply only with valid JSON. No prose, no markdown fences." },
      { role: "user", content: prompt },
    ],
  })
  return {
    text:   r.choices[0]?.message?.content ?? "",
    tokIn:  r.usage?.prompt_tokens     ?? 0,
    tokOut: r.usage?.completion_tokens ?? 0,
  }
}

export async function extractJson<T = any>(opts: ExtractOpts): Promise<T> {
  const provider     = opts.provider     ?? DEFAULT_PROVIDER
  const model        = opts.model        ?? DEFAULT_MODEL[provider]
  const maxTokens    = opts.maxTokens    ?? 2000
  const estimated    = opts.estimatedCost ?? 0.01
  const expectedKeys = opts.expectedKeys ?? []

  if (!COST[provider]?.[model]) throw new Error(`unknown ${provider} model: ${model}`)

  await assertBudget(opts.runId, estimated, opts.maxUsdPerRun)

  const { text, tokIn, tokOut } =
    provider === "anthropic"
      ? await callAnthropic(opts.prompt, model, maxTokens)
      : await callOpenAI(opts.prompt, model, maxTokens)

  const rate = COST[provider][model]
  const cost = (tokIn * rate.in + tokOut * rate.out) / 1_000_000
  await addRunCost(opts.runId, cost, tokIn, tokOut)

  const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/gm, "").trim()
  const m = cleaned.match(/\{[\s\S]*\}/)
  if (!m) throw new SchemaInvalid(`no JSON object in response: ${text.slice(0, 200)}`)
  let data: any
  try { data = JSON.parse(m[0]) }
  catch (e: any) { throw new SchemaInvalid(`JSON parse failed: ${e.message}`) }
  for (const k of expectedKeys) {
    if (!(k in data)) throw new SchemaInvalid(`missing expected key '${k}'`)
  }
  return data as T
}
