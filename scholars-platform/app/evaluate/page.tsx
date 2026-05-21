import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { adminSupabase } from "@/lib/supabase"
import { redirect } from "next/navigation"
import EvaluateClient from "./EvaluateClient"
import type { UserTier } from "@/types"

async function getEvalData() {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n: string) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  )
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null

  const currentMonth = new Date().getMonth() + 1
  const [{ data: user }, { data: sub }] = await Promise.all([
    adminSupabase
      .from("users")
      .select("cv_eval_used,cv_eval_month,cv_eval_reset_month")
      .eq("id", session.user.id)
      .single(),
    adminSupabase
      .from("subscriptions")
      .select("tier")
      .eq("user_id", session.user.id)
      .single(),
  ])

  const tier = (sub?.tier as UserTier) ?? "free"
  const isPro = tier === "pro"
  const cvUsed = isPro
    ? (user?.cv_eval_reset_month === currentMonth ? (user?.cv_eval_month ?? 0) : 0)
    : (user?.cv_eval_used ? 1 : 0)
  const cvLimit = isPro ? 3 : 1

  return { tier, cvUsed, cvLimit }
}

export default async function EvaluatePage() {
  const data = await getEvalData()
  if (!data) redirect("/auth/login?redirect=/evaluate")

  return (
    <div className="min-h-screen bg-gray-50">
      <EvaluateClient tier={data.tier} cvUsed={data.cvUsed} cvLimit={data.cvLimit} />
    </div>
  )
}
