import Link from "next/link"
import { Check, X, Sparkles, ArrowRight } from "lucide-react"
import { getExchangeRates, formatPrice, isFallbackRates } from "@/lib/exchangeRates"

const FREE_FEATURES = [
  { text: "Browse all opportunities & programs", ok: true },
  { text: "Keyword search & filters", ok: true },
  { text: "AI Chat — 3 queries (lifetime)", ok: true },
  { text: "Smart Match form (CGPA/IELTS)", ok: true },
  { text: "Save up to 20 bookmarks", ok: true },
  { text: "10 minutes browsing per 24 hours", ok: false },
  { text: "Deadline email alerts", ok: false },
  { text: "Weekly opportunity digest", ok: false },
]

const PRO_FEATURES = [
  "Unlimited browsing",
  "AI Chat — 15 queries/month",
  "Smart Match form (unlimited)",
  "Unlimited bookmarks",
  "Deadline email alerts",
  "Weekly opportunity digest",
  "Priority support",
]

interface Plan {
  key: "monthly" | "semi" | "annual"
  label: string
  usd: number
  per: string
  badge?: string
  highlight?: boolean
}

const PLANS: Plan[] = [
  { key: "monthly", label: "Monthly", usd: 5,  per: "/ month" },
  { key: "semi",    label: "6 Months", usd: 25, per: "/ 6 months", badge: "Save $5", highlight: true },
  { key: "annual",  label: "Annual",   usd: 50, per: "/ year",     badge: "Save $10" },
]

export const dynamic = "force-dynamic" // re-render with fresh rates on each visit

export default async function PricingPage() {
  const rates = await getExchangeRates()
  const ratesAreFallback = isFallbackRates(rates)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-4 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">Simple, transparent pricing</h1>
          <p className="mt-3 text-lg text-gray-500">Start free. Upgrade when you need more.</p>
        </div>

        {/* Free + Pro tiers row */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5 mb-10">
          {/* Free */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 lg:col-span-1">
            <div className="mb-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Free</p>
              <p className="mt-1 text-3xl font-extrabold text-gray-900">$0</p>
              <p className="text-xs text-gray-400 mt-0.5">Forever free</p>
            </div>
            <ul className="space-y-2 mb-6">
              {FREE_FEATURES.map((f) => (
                <li key={f.text} className="flex items-start gap-2">
                  {f.ok ? (
                    <Check className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
                  ) : (
                    <X className="h-3.5 w-3.5 text-gray-300 mt-0.5 shrink-0" />
                  )}
                  <span className={`text-xs ${f.ok ? "text-gray-700" : "text-gray-400"}`}>{f.text}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/auth/signup"
              className="block w-full text-center rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Get started free
            </Link>
          </div>

          {/* Three Pro plan cards */}
          {PLANS.map((plan) => {
            const price = formatPrice(plan.usd, rates)
            return (
              <div
                key={plan.key}
                className={`rounded-2xl p-6 relative overflow-hidden ${
                  plan.highlight
                    ? "bg-blue-600 text-white shadow-lg"
                    : "bg-white border border-gray-200 shadow-sm"
                }`}
              >
                {plan.badge && (
                  <div className={`absolute top-3 right-3 text-xs font-bold px-2 py-0.5 rounded-full ${
                    plan.highlight ? "bg-yellow-400 text-yellow-900" : "bg-green-100 text-green-700"
                  }`}>
                    {plan.badge}
                  </div>
                )}
                <div className="mb-5">
                  <p className={`text-xs font-semibold uppercase tracking-wide ${
                    plan.highlight ? "text-blue-200" : "text-blue-600"
                  }`}>
                    Pro {plan.label}
                  </p>
                  <p className={`mt-1 text-3xl font-extrabold ${plan.highlight ? "" : "text-gray-900"}`}>
                    {price.usd}
                  </p>
                  <p className={`text-xs mt-0.5 ${plan.highlight ? "text-blue-200" : "text-gray-400"}`}>
                    {plan.per}
                  </p>
                  {!ratesAreFallback && (
                    <p className={`text-xs mt-1 ${plan.highlight ? "text-blue-100/80" : "text-gray-500"}`}>
                      {price.eur} · {price.bdt}
                    </p>
                  )}
                </div>
                <ul className="space-y-2 mb-6">
                  {PRO_FEATURES.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${
                        plan.highlight ? "text-blue-200" : "text-green-500"
                      }`} />
                      <span className={`text-xs ${plan.highlight ? "text-blue-50" : "text-gray-700"}`}>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/upgrade?plan=${plan.key}`}
                  className={`block w-full text-center rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                    plan.highlight
                      ? "bg-white text-blue-700 hover:bg-blue-50"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  Choose {plan.label} →
                </Link>
              </div>
            )
          })}
        </div>

        {/* Exchange rate footnote */}
        <p className="text-center text-xs text-gray-400 mb-12">
          {ratesAreFallback
            ? "EUR/BDT prices updating shortly — USD is the canonical price"
            : `EUR/BDT updated from open.er-api.com · ${rates.asOf.toISOString().slice(0, 10)}`}
        </p>

        {/* Mentorship Program callout — separate, NOT bundled with Pro */}
        <div className="max-w-3xl mx-auto mb-16">
          <Link
            href="/mentorship"
            className="block rounded-2xl bg-gradient-to-br from-indigo-50 to-blue-50 border border-blue-200 p-7 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600/10 shrink-0">
                <Sparkles className="h-6 w-6 text-blue-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-lg font-bold text-gray-900">Mentorship Program</h3>
                  <span className="text-xs font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">€150</span>
                </div>
                <p className="text-sm text-gray-600 mb-2">
                  30 sessions with 6 mentors in USA & Europe — end-to-end guidance for one full application cycle.
                  Includes <strong>exclusive CV &amp; Transcript Evaluation</strong> on this platform (3/month).
                </p>
                <p className="text-sm font-semibold text-blue-700 inline-flex items-center gap-1">
                  Learn more <ArrowRight className="h-3.5 w-3.5" />
                </p>
              </div>
            </div>
          </Link>
        </div>

        {/* FAQ */}
        <div className="mt-8 max-w-2xl mx-auto space-y-6">
          <h2 className="text-xl font-bold text-gray-900 text-center mb-8">Frequently asked questions</h2>
          {[
            ["How do I pay?", "We accept bank transfer (Bangladesh), bKash (Send Money), PayPal, and Wise. After choosing a plan you'll see all options. Submit a payment receipt and we verify within 24 hours."],
            ["Can I get CV evaluation with Pro?", "CV & Transcript evaluation is exclusive to Mentorship Program students — it's a high-touch service that complements the human mentorship offering. Pro gives you AI Chat, unlimited browsing, and email alerts."],
            ["Is the free plan really free?", "Yes, forever. No credit card required. You get 3 AI queries and 10 minutes of browsing per day to try the platform."],
            ["Can I cancel anytime?", "Your plan runs for the period you paid (monthly/6 months/annual). When it ends, you simply don't renew — no auto-charge, since payments are manual."],
            ["I'm in Bangladesh — what do I pay?", `The canonical price is in USD. Today $5 ≈ ৳${Math.round(5 * rates.BDT)} via bKash Send Money. You'll see the live BDT amount when you choose a plan.`],
          ].map(([q, a]) => (
            <div key={q} className="border-b border-gray-200 pb-6">
              <p className="font-semibold text-gray-900 mb-1">{q}</p>
              <p className="text-sm text-gray-500">{a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
