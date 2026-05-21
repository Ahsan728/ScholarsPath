import Link from "next/link"
import { Check, X } from "lucide-react"

const FREE_FEATURES = [
  { text: "Browse all opportunities & programs", ok: true },
  { text: "Keyword search & filters", ok: true },
  { text: "AI Chat — 3 queries (lifetime)", ok: true },
  { text: "Smart Match form (CGPA/IELTS)", ok: true },
  { text: "CV + Transcript Evaluation — 1 time", ok: true },
  { text: "Save up to 20 bookmarks", ok: true },
  { text: "10 minutes browsing per 24 hours", ok: false },
  { text: "Deadline email alerts", ok: false },
  { text: "Weekly opportunity digest", ok: false },
]

const PRO_FEATURES = [
  { text: "Unlimited browsing", ok: true },
  { text: "AI Chat — 15 queries/month", ok: true },
  { text: "Smart Match form (unlimited)", ok: true },
  { text: "CV + Transcript Evaluation — 3×/month", ok: true },
  { text: "Unlimited bookmarks", ok: true },
  { text: "Deadline email alerts", ok: true },
  { text: "Weekly opportunity digest", ok: true },
  { text: "Priority support", ok: true },
]

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-4xl px-4 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">Simple, transparent pricing</h1>
          <p className="mt-3 text-lg text-gray-500">Start free. Upgrade when you need more.</p>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {/* Free */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
            <div className="mb-6">
              <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Free</p>
              <p className="mt-2 text-4xl font-extrabold text-gray-900">$0</p>
              <p className="text-sm text-gray-400 mt-1">Forever free</p>
            </div>
            <ul className="space-y-3 mb-8">
              {FREE_FEATURES.map((f) => (
                <li key={f.text} className="flex items-start gap-3">
                  {f.ok ? (
                    <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  ) : (
                    <X className="h-4 w-4 text-gray-300 mt-0.5 shrink-0" />
                  )}
                  <span className={`text-sm ${f.ok ? "text-gray-700" : "text-gray-400"}`}>{f.text}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/auth/signup"
              className="block w-full text-center rounded-xl border border-gray-300 px-6 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Get started free
            </Link>
          </div>

          {/* Pro */}
          <div className="bg-blue-600 rounded-2xl shadow-lg p-8 text-white relative overflow-hidden">
            <div className="absolute top-4 right-4 bg-yellow-400 text-yellow-900 text-xs font-bold px-2.5 py-1 rounded-full">
              Most Popular
            </div>
            <div className="mb-6">
              <p className="text-sm font-semibold text-blue-200 uppercase tracking-wide">Pro</p>
              <p className="mt-2 text-4xl font-extrabold">$2.50</p>
              <p className="text-sm text-blue-200 mt-1">per month</p>
            </div>
            <ul className="space-y-3 mb-8">
              {PRO_FEATURES.map((f) => (
                <li key={f.text} className="flex items-start gap-3">
                  <Check className="h-4 w-4 text-blue-200 mt-0.5 shrink-0" />
                  <span className="text-sm text-blue-50">{f.text}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/auth/signup?plan=pro"
              className="block w-full text-center rounded-xl bg-white px-6 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50 transition-colors"
            >
              Start Pro — $2.50/mo
            </Link>
            <p className="text-xs text-blue-200 text-center mt-3">Cancel anytime</p>
          </div>
        </div>

        {/* FAQ */}
        <div className="mt-16 max-w-2xl mx-auto space-y-6">
          <h2 className="text-xl font-bold text-gray-900 text-center mb-8">Frequently asked questions</h2>
          {[
            ["Can I cancel anytime?", "Yes — cancel from your account dashboard. You keep Pro access until the end of the billing period."],
            ["What payment methods are accepted?", "We accept all major credit/debit cards and PayPal via our secure payment gateway."],
            ["Is the free plan really free?", "Yes, forever. No credit card required. You get 3 AI queries and 1 CV evaluation to try the platform."],
            ["What happens when my 10-minute session ends?", "Your session resets every 24 hours. Upgrade to Pro for unlimited browsing time."],
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
