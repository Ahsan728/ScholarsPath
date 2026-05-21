import { adminSupabase } from "@/lib/supabase"
import type { UserTier, TierCheckResult } from "@/types"

// Pricing: Sonnet 4.6 input $3/M, output $15/M; Haiku 4.5 input $0.80/M, output $4/M
export function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  if (model.includes("haiku")) {
    return (inputTokens * 0.80 + outputTokens * 4.0) / 1_000_000
  }
  return (inputTokens * 3.0 + outputTokens * 15.0) / 1_000_000
}

export async function getUserTier(userId: string): Promise<UserTier> {
  const { data } = await adminSupabase
    .from("subscriptions")
    .select("tier")
    .eq("user_id", userId)
    .single()
  return (data?.tier as UserTier) ?? "free"
}

// ── RAG Chat ────────────────────────────────────────────────
// Free: 3 lifetime queries (session-based)
// Pro:  15 queries/month (user-based)

export async function checkRagLimit(
  sessionId: string,
  userId?: string | null
): Promise<TierCheckResult> {
  if (userId) {
    const tier = await getUserTier(userId)
    if (tier === "pro") {
      const { data: user } = await adminSupabase
        .from("users")
        .select("rag_queries_month, rag_reset_month")
        .eq("id", userId)
        .single()
      const currentMonth = new Date().getMonth() + 1
      const used = user?.rag_reset_month === currentMonth ? (user?.rag_queries_month ?? 0) : 0
      return { allowed: used < 15, used, limit: 15, is_pro: true }
    }
  }

  // Free / unauthenticated — lifetime 3 queries via session
  const { data } = await adminSupabase
    .from("rag_usage")
    .select("count")
    .eq("session_id", sessionId)
    .single()
  const used = data?.count ?? 0
  return { allowed: used < 3, used, limit: 3, is_pro: false }
}

export async function incrementRagUsage(
  sessionId: string,
  userId?: string | null
): Promise<void> {
  if (userId) {
    const tier = await getUserTier(userId)
    if (tier === "pro") {
      const currentMonth = new Date().getMonth() + 1
      const { data: user } = await adminSupabase
        .from("users")
        .select("rag_queries_month, rag_reset_month")
        .eq("id", userId)
        .single()
      const shouldReset = user?.rag_reset_month !== currentMonth
      await adminSupabase
        .from("users")
        .update({
          rag_queries_month: shouldReset ? 1 : (user?.rag_queries_month ?? 0) + 1,
          rag_reset_month: currentMonth,
        })
        .eq("id", userId)
      return
    }
  }

  // Session-based upsert
  const { data: existing } = await adminSupabase
    .from("rag_usage")
    .select("count")
    .eq("session_id", sessionId)
    .single()

  if (existing) {
    await adminSupabase
      .from("rag_usage")
      .update({ count: existing.count + 1 })
      .eq("session_id", sessionId)
  } else {
    await adminSupabase
      .from("rag_usage")
      .insert({ session_id: sessionId, count: 1 })
  }
}

// ── CV + Transcript Evaluation ──────────────────────────────
// Free: 1 lifetime (user must be logged in)
// Pro:  3/month

export async function checkCvEvalLimit(userId?: string | null): Promise<TierCheckResult> {
  if (!userId) {
    return { allowed: false, used: 0, limit: 0, is_pro: false }
  }

  const tier = await getUserTier(userId)
  const { data: user } = await adminSupabase
    .from("users")
    .select("cv_eval_used, cv_eval_month, cv_eval_reset_month")
    .eq("id", userId)
    .single()

  if (tier === "free") {
    const used = user?.cv_eval_used ? 1 : 0
    return { allowed: !user?.cv_eval_used, used, limit: 1, is_pro: false }
  }

  // Pro
  const currentMonth = new Date().getMonth() + 1
  const used = user?.cv_eval_reset_month === currentMonth ? (user?.cv_eval_month ?? 0) : 0
  return { allowed: used < 3, used, limit: 3, is_pro: true }
}

export async function incrementCvEvalUsage(userId: string, isPro: boolean): Promise<void> {
  if (isPro) {
    const currentMonth = new Date().getMonth() + 1
    const { data: user } = await adminSupabase
      .from("users")
      .select("cv_eval_month, cv_eval_reset_month")
      .eq("id", userId)
      .single()
    const shouldReset = user?.cv_eval_reset_month !== currentMonth
    await adminSupabase
      .from("users")
      .update({
        cv_eval_month: shouldReset ? 1 : (user?.cv_eval_month ?? 0) + 1,
        cv_eval_reset_month: currentMonth,
      })
      .eq("id", userId)
  } else {
    await adminSupabase
      .from("users")
      .update({ cv_eval_used: true })
      .eq("id", userId)
  }
}

// ── Usage Logging ───────────────────────────────────────────

export async function logApiUsage(params: {
  feature: "rag_chat" | "cv_evaluate" | "extraction"
  userId?: string | null
  sessionId?: string | null
  model: string
  inputTokens: number
  outputTokens: number
}): Promise<void> {
  const cost = calculateCost(params.model, params.inputTokens, params.outputTokens)
  try {
    await adminSupabase.from("api_usage_log").insert({
      feature: params.feature,
      user_id: params.userId ?? null,
      session_id: params.sessionId ?? null,
      model: params.model,
      input_tokens: params.inputTokens,
      output_tokens: params.outputTokens,
      cost_usd: cost,
    })
  } catch (err) {
    console.warn("Failed to log API usage:", err)
  }
}

// ── Session Time ────────────────────────────────────────────

export async function getSessionSeconds(sessionId: string): Promise<number> {
  const today = new Date().toISOString().split("T")[0]
  const { data } = await adminSupabase
    .from("session_usage")
    .select("seconds_used")
    .eq("session_id", sessionId)
    .eq("date", today)
    .single()
  return data?.seconds_used ?? 0
}

export async function updateSessionSeconds(
  sessionId: string,
  seconds: number
): Promise<void> {
  const today = new Date().toISOString().split("T")[0]
  const { data: existing } = await adminSupabase
    .from("session_usage")
    .select("seconds_used")
    .eq("session_id", sessionId)
    .eq("date", today)
    .single()

  if (existing) {
    await adminSupabase
      .from("session_usage")
      .update({ seconds_used: Math.max(existing.seconds_used, seconds) })
      .eq("session_id", sessionId)
      .eq("date", today)
  } else {
    await adminSupabase
      .from("session_usage")
      .insert({ session_id: sessionId, date: today, seconds_used: seconds })
  }
}
