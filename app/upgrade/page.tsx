import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { getExchangeRates, formatPrice, isFallbackRates } from "@/lib/exchangeRates"
import { PaymentProofForm } from "@/components/PaymentProofForm"

type Plan = "monthly" | "semi" | "annual"

const PLAN_INFO: Record<Plan, { label: string; usd: number; per: string }> = {
  monthly: { label: "Pro Monthly",   usd: 5,  per: "for 1 month" },
  semi:    { label: "Pro 6 Months",  usd: 25, per: "for 6 months" },
  annual:  { label: "Pro Annual",    usd: 50, per: "for 1 year" },
}

async function getCurrentUserEmail(): Promise<string | null> {
  try {
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get: (n: string) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
    )
    const { data: { session } } = await supabase.auth.getSession()
    return session?.user?.email ?? null
  } catch { return null }
}

export const dynamic = "force-dynamic"

export default async function UpgradePage({ searchParams }: { searchParams: { plan?: string } }) {
  const planKey = (searchParams.plan ?? "monthly") as Plan
  if (!PLAN_INFO[planKey]) redirect("/pricing")
  const plan = PLAN_INFO[planKey]

  const email = await getCurrentUserEmail()
  if (!email) {
    redirect(`/auth/login?redirect=${encodeURIComponent("/upgrade?plan=" + planKey)}`)
  }

  const rates = await getExchangeRates()
  const price = formatPrice(plan.usd, rates)
  const ratesAreFallback = isFallbackRates(rates)

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 mb-6">
          <div className="text-center mb-5">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">{plan.label}</p>
            <p className="mt-1 text-4xl font-extrabold text-gray-900">{price.usd}</p>
            <p className="text-sm text-gray-500 mt-1">{plan.per}</p>
            {!ratesAreFallback && (
              <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
                <span className="inline-block bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1 rounded-full">{price.usd} USD</span>
                <span className="inline-block bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1 rounded-full">{price.eur} EUR</span>
                <span className="inline-block bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1 rounded-full">{price.bdt} BDT</span>
              </div>
            )}
          </div>

          <div className="bg-amber-50 border-l-4 border-amber-400 px-4 py-3 rounded-r text-sm text-amber-800">
            ⚠️ <strong>How this works:</strong> Pay using any method below, then submit the receipt at the bottom of this page. Admin verifies within 24 hours and your account is upgraded.
          </div>
        </div>

        {/* Payment methods */}
        <div className="space-y-4 mb-6">
          {/* Bank */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-bold text-blue-700 mb-3 border-b border-gray-100 pb-2">🏦 Bank Transfer (Bangladesh) — pay in BDT</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
              <KV label="Bank" value="NRB Commercial Bank" />
              <KV label="Branch" value="OR Nizam Road Branch" />
              <KV label="Account Number" value="011831400000041" />
              <KV label="Account Name" value="Shahmiraj Ehesan" />
              <KV label="SWIFT" value="NRBBBDDHORN" />
              {!ratesAreFallback && <KV label="Amount" value={price.bdt} highlight />}
            </div>
          </div>

          {/* bKash */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-bold text-blue-700 mb-3 border-b border-gray-100 pb-2">📱 bKash — Send Money (BDT)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
              <KV label="Name" value="Shahmiraj Ehesan" />
              <KV label="bKash Number" value="01806293786" />
              {!ratesAreFallback && <KV label="Amount" value={price.bdt} highlight />}
            </div>
            <p className="text-xs text-gray-500 mt-3">Use <strong>"Send Money"</strong>, not "Payment".</p>
          </div>

          {/* PayPal */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-bold text-blue-700 mb-3 border-b border-gray-100 pb-2">💳 PayPal (USD or EUR)</h3>
            <div className="text-sm text-gray-700 mb-3">
              Send <strong>{price.usd}</strong>{!ratesAreFallback && <> (or {price.eur})</>} to:
            </div>
            <a
              href={`https://www.paypal.com/paypalme/ahsan7280/${plan.usd}USD`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-blue-600 text-white text-sm font-semibold rounded-lg px-5 py-2.5 hover:bg-blue-700"
            >
              💰 Pay via PayPal ({price.usd})
            </a>
          </div>

          {/* Wise */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-bold text-blue-700 mb-3 border-b border-gray-100 pb-2">🔵 Wise (USD or EUR)</h3>
            <a
              href="https://wise.com/pay/me/mdshahnauzea"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-emerald-500 text-white text-sm font-semibold rounded-lg px-5 py-2.5 hover:bg-emerald-600"
            >
              🔵 Pay via Wise ({price.usd})
            </a>
            <p className="text-xs text-gray-500 mt-3">Cheaper international transfers than bank wire.</p>
          </div>
        </div>

        {/* Submit proof form */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          <h2 className="text-lg font-bold text-gray-900 mb-2">Submit payment proof</h2>
          <p className="text-sm text-gray-500 mb-6">
            After sending the payment, fill this form. We verify within 24 hours and email you when your Pro access is active.
          </p>
          <PaymentProofForm plan={planKey} amountUsd={plan.usd} userEmail={email!} />
        </div>

        {/* Rates footer */}
        <p className="text-center text-xs text-gray-400 mt-6">
          {ratesAreFallback
            ? "EUR/BDT amounts will update shortly — USD is the canonical price"
            : `Exchange rates updated ${rates.asOf.toISOString().slice(0, 10)} from open.er-api.com`}
        </p>
      </div>
    </div>
  )
}

function KV({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between gap-3 py-0.5">
      <span className="text-gray-500">{label}:</span>
      <span className={highlight ? "text-blue-700 font-bold" : "text-gray-900 font-semibold"}>{value}</span>
    </div>
  )
}
