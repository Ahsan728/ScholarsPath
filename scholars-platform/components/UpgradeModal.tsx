"use client"

import Link from "next/link"
import { Sparkles, Lock, Clock } from "lucide-react"

export type UpgradeReason = "rag_limit" | "cv_block" | "cv_limit" | "session"

interface Props {
  reason: UpgradeReason
  onClose?: () => void
}

const CONFIG: Record<UpgradeReason, {
  icon: React.ReactNode
  title: string
  desc: string
  primaryCta: string
  secondaryCta?: string
  secondaryHref?: string
  dismissible: boolean
}> = {
  rag_limit: {
    icon: <Sparkles className="h-7 w-7 text-blue-600" />,
    title: "You've used your 3 free AI queries",
    desc: "Upgrade to Pro to keep chatting with ScholarAssist AI — 15 queries every month for just $2.50.",
    primaryCta: "Upgrade to Pro — $2.50/mo",
    secondaryCta: "Create free account",
    secondaryHref: "/auth/signup",
    dismissible: true,
  },
  cv_block: {
    icon: <Lock className="h-7 w-7 text-blue-600" />,
    title: "You've used your 1 free CV evaluation",
    desc: "Upgrade to Pro for 3 CV & Transcript evaluations every month — get matched to programs and scholarships based on your actual academic profile.",
    primaryCta: "Upgrade to Pro — $2.50/mo",
    dismissible: true,
  },
  cv_limit: {
    icon: <Sparkles className="h-7 w-7 text-blue-600" />,
    title: "Monthly CV evaluation limit reached (3/3)",
    desc: "Your Pro plan includes 3 CV & Transcript evaluations per month. Your quota resets on the 1st.",
    primaryCta: "Manage Subscription",
    dismissible: true,
  },
  session: {
    icon: <Clock className="h-7 w-7 text-blue-600" />,
    title: "Your free session has ended",
    desc: "You've used your 10 minutes of free browsing today. Sign up for free or upgrade to Pro for unlimited access. Resets in 24 hours.",
    primaryCta: "Upgrade to Pro — $2.50/mo",
    secondaryCta: "Create free account",
    secondaryHref: "/auth/signup",
    dismissible: false,
  },
}

export function UpgradeModal({ reason, onClose }: Props) {
  const cfg = CONFIG[reason]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={cfg.dismissible ? onClose : undefined}
      />

      {/* Card */}
      <div className="relative z-10 w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8 text-center">
        <div className="mb-4 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
            {cfg.icon}
          </div>
        </div>

        <h2 className="mb-2 text-xl font-bold text-gray-900">{cfg.title}</h2>
        <p className="mb-6 text-sm leading-relaxed text-gray-500">{cfg.desc}</p>

        <div className="flex flex-col gap-3">
          <Link
            href="/pricing"
            className="block w-full rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            {cfg.primaryCta}
          </Link>

          {cfg.secondaryCta && cfg.secondaryHref && (
            <Link
              href={cfg.secondaryHref}
              className="block w-full rounded-xl border border-gray-300 px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {cfg.secondaryCta}
            </Link>
          )}

          {cfg.dismissible && onClose && (
            <button
              onClick={onClose}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Maybe later
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
