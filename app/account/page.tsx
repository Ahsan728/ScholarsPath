import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { adminSupabase } from "@/lib/supabase"
import Link from "next/link"
import { GraduationCap, Sparkles, FileText, Crown, LogOut, Clock, AlertCircle } from "lucide-react"
import type { UserTier } from "@/types"

interface AccountData {
  name: string
  email: string
  tier: UserTier
  ragUsed: number
  ragLimit: number
  cvUsed: number
  cvLimit: number
  periodEnd: string | null
  hasPendingPayment: boolean
}

async function getUser(): Promise<AccountData | null> {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n: string) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  )
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null

  const [{ data: user }, { data: sub }, { count: pendingCount }] = await Promise.all([
    adminSupabase.from("users").select("*").eq("id", session.user.id).single(),
    adminSupabase.from("subscriptions").select("tier,current_period_end").eq("user_id", session.user.id).single(),
    adminSupabase
      .from("payment_requests")
      .select("*", { count: "exact", head: true })
      .eq("user_id", session.user.id)
      .eq("status", "pending"),
  ])

  const tier = (sub?.tier as UserTier) ?? "free"
  const isPro = tier === "pro" || tier === "student"
  const isStudent = tier === "student"
  const currentMonth = new Date().getMonth() + 1

  const ragUsed = user?.rag_reset_month === currentMonth ? (user?.rag_queries_month ?? 0) : 0
  const cvUsed  = user?.cv_eval_reset_month === currentMonth ? (user?.cv_eval_month ?? 0) : 0

  return {
    name: user?.full_name ?? session.user.email ?? "",
    email: session.user.email ?? "",
    tier,
    ragUsed,
    ragLimit: isPro ? 15 : 3,
    cvUsed: isStudent ? cvUsed : 0,
    cvLimit: 3, // only shown to students; 3/month
    periodEnd: sub?.current_period_end ?? null,
    hasPendingPayment: (pendingCount ?? 0) > 0,
  }
}

export default async function AccountPage({ searchParams }: { searchParams: { payment?: string } }) {
  const user = await getUser()
  if (!user) return null

  const isPro = user.tier === "pro" || user.tier === "student"
  const isStudent = user.tier === "student"
  const justSubmittedPayment = searchParams.payment === "pending"

  const tierBadge = isStudent
    ? <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-600 px-3 py-1 text-xs font-semibold text-white"><Sparkles className="h-3 w-3" /> Mentorship Student</span>
    : user.tier === "pro"
      ? <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white"><Crown className="h-3 w-3" /> Pro</span>
      : <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">Free</span>

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-2xl px-4 py-10">
        {/* Pending payment banner */}
        {(user.hasPendingPayment || justSubmittedPayment) && (
          <div className="mb-6 rounded-xl bg-amber-50 border border-amber-200 px-5 py-4 flex items-start gap-3">
            <Clock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-900">Payment pending verification</p>
              <p className="text-xs text-amber-800 mt-0.5">
                We've received your payment proof. Admin verifies within 24 hours and you'll get an email
                the moment your Pro access is active.
              </p>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-xl font-bold">
            {user.name?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900 truncate">{user.name}</h1>
            <p className="text-sm text-gray-500 truncate">{user.email}</p>
          </div>
          <div className="ml-auto shrink-0">{tierBadge}</div>
        </div>

        {/* Subscription details */}
        {isPro && user.periodEnd && (
          <div className="mb-6 rounded-xl bg-white border border-gray-200 p-4 text-sm text-gray-600">
            {isStudent
              ? "Mentorship Program member — full access included."
              : `Pro access valid until ${new Date(user.periodEnd).toISOString().slice(0, 10)}`
            }
          </div>
        )}

        {/* Usage */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4 uppercase tracking-wide">Usage this month</h2>
          <div className="space-y-4">
            {/* RAG */}
            <div>
              <div className="flex items-center justify-between text-sm mb-1.5">
                <span className="flex items-center gap-1.5 text-gray-600"><Sparkles className="h-3.5 w-3.5 text-blue-500" /> AI Chat</span>
                <span className="font-mono text-gray-800">{user.ragUsed} / {user.ragLimit}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${user.ragUsed >= user.ragLimit ? "bg-red-500" : "bg-blue-500"}`}
                  style={{ width: `${Math.min(100, (user.ragUsed / Math.max(1, user.ragLimit)) * 100)}%` }}
                />
              </div>
              {!isPro && <p className="text-xs text-gray-400 mt-1">3 lifetime queries on free plan</p>}
            </div>

            {/* CV Eval (students only) */}
            {isStudent ? (
              <div>
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <span className="flex items-center gap-1.5 text-gray-600"><FileText className="h-3.5 w-3.5 text-indigo-500" /> CV Evaluation</span>
                  <span className="font-mono text-gray-800">{user.cvUsed} / {user.cvLimit}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${user.cvUsed >= user.cvLimit ? "bg-red-500" : "bg-indigo-500"}`}
                    style={{ width: `${Math.min(100, (user.cvUsed / Math.max(1, user.cvLimit)) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">3 PDF evaluations per month for Mentorship students</p>
              </div>
            ) : (
              <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-xs text-gray-500">
                <AlertCircle className="h-3.5 w-3.5 inline-block mr-1 -mt-0.5" />
                CV Evaluation is part of the{" "}
                <Link href="/mentorship" className="text-blue-600 font-medium hover:underline">
                  Mentorship Program
                </Link>.
              </div>
            )}
          </div>
        </div>

        {/* Upgrade CTA (free users only — not for Pro or Student) */}
        {!isPro && (
          <div className="bg-blue-600 rounded-2xl p-6 text-white mb-6">
            <div className="flex items-start gap-4">
              <Crown className="h-6 w-6 text-yellow-300 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold mb-1">Upgrade to Pro — from $5/mo</h3>
                <p className="text-sm text-blue-100 mb-4">
                  Get 15 AI Chat queries, unlimited browsing, and deadline email alerts. Choose monthly, 6 months, or annual.
                </p>
                <Link
                  href="/pricing"
                  className="inline-block rounded-xl bg-white px-5 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 transition-colors"
                >
                  View plans →
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm divide-y divide-gray-100">
          {isStudent && (
            <Link href="/evaluate" className="flex items-center gap-3 px-5 py-4 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
              <FileText className="h-4 w-4 text-indigo-500" />
              <span>CV + Transcript Evaluation</span>
              <span className="ml-auto text-xs text-gray-400">→</span>
            </Link>
          )}
          <Link href="/match" className="flex items-center gap-3 px-5 py-4 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
            <GraduationCap className="h-4 w-4 text-blue-500" />
            <span>Smart Match (CGPA/IELTS)</span>
            <span className="ml-auto text-xs text-gray-400">→</span>
          </Link>
          <Link href="/mentorship" className="flex items-center gap-3 px-5 py-4 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
            <Sparkles className="h-4 w-4 text-blue-500" />
            <span>Mentorship Program</span>
            <span className="ml-auto text-xs text-gray-400">→</span>
          </Link>
          <form action="/api/auth/signout" method="POST">
            <button className="flex items-center gap-3 w-full px-5 py-4 text-sm text-red-600 hover:bg-red-50 transition-colors">
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
