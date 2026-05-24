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
  primaryHref: string
  secondaryCta?: string
  secondaryHref?: string
  dismissible: boolean
}> = {
  rag_limit: {
    icon: <Sparkles className="h-7 w-7 text-blue-600" />,
    title: "You've used your 3 free AI queries",
    desc: "Upgrade to Pro to keep chatting with ScholarAssist AI — 15 queries every month from just $5.",
    primaryCta: "Upgrade to Pro — from $5/mo",
    primaryHref: "/pricing",
    secondaryCta: "Create free account",
    secondaryHref: "/auth/signup",
    dismissible: true,
  },
  // CV evaluation is Mentorship-only. Both Free and Pro users see this when
  // they hit /evaluate without student tier. Direct them to /mentorship.
  cv_block: {
    icon: <Lock className="h-7 w-7 text-blue-600" />,
    title: "CV Evaluation is exclusive to Mentorship Program members",
    desc: "Get a personalized review of your CV & academic transcript inside the Complete Mentorship Program — €150 for 30 sessions and lifelong career support.",
    primaryCta: "Learn about the Mentorship Program",
    primaryHref: "/mentorship",
    secondaryCta: "Already enrolled? Sign in",
    secondaryHref: "/auth/login",
    dismissible: true,
  },
  cv_limit: {
    icon: <Sparkles className="h-7 w-7 text-blue-600" />,
    title: "Monthly CV evaluation limit reached (3/3)",
    desc: "Mentorship students get 3 CV & Transcript evaluations per month. Your quota resets on the 1st.",
    primaryCta: "Back to dashboard",
    primaryHref: "/account",
    dismissible: true,
  },
  session: {
    icon: <Clock className="h-7 w-7 text-blue-600" />,
    title: "Your free session has ended",
    desc: "You've used your 10 minutes of free browsing today. Sign up for free or upgrade to Pro for unlimited access. Resets in 24 hours.",
    primaryCta: "Upgrade to Pro — from $5/mo",
    primaryHref: "/pricing",
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
            href={cfg.primaryHref}
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
