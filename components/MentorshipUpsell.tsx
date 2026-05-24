import Link from "next/link"
import { Sparkles, ArrowRight } from "lucide-react"
import type { UserTier } from "@/types"

interface Props {
  // Customize the secondary message based on what tier they currently have.
  userTier?: UserTier
}

/**
 * Shown on /evaluate (and triggered by UpgradeModal) when a non-student user
 * tries to access CV/Transcript evaluation. CV evaluation is reserved for
 * Mentorship Program enrollees only — Free AND Pro users get this card.
 */
export function MentorshipUpsell({ userTier }: Props) {
  const isPaidPro = userTier === "pro"

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="bg-gradient-to-br from-blue-600 to-indigo-700 px-8 py-10 text-center">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-white/20 mb-4">
          <Sparkles className="h-7 w-7 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">
          CV & Transcript Evaluation is exclusive to Mentorship Program members
        </h1>
        <p className="text-blue-100 text-sm max-w-md mx-auto">
          Get a personalized assessment of your CV and academic transcript matched
          against masters programs and scholarships — available only to students
          enrolled in our Complete Mentorship Program.
        </p>
      </div>

      <div className="px-8 py-8 space-y-6">
        <div className="rounded-xl bg-blue-50 border border-blue-100 p-5">
          <h2 className="text-sm font-semibold text-blue-900 mb-2">What you get inside the program</h2>
          <ul className="space-y-1.5 text-sm text-blue-800/90">
            <li>• 30 structured sessions across 6 modules (Profile, Emailing, SOP, Applications, Scholarships, Visa)</li>
            <li>• 6 mentors based in USA and Europe</li>
            <li>• Personalized Plan A/B/C university shortlist</li>
            <li>• <strong>3 CV &amp; Transcript evaluations per month on this platform</strong></li>
            <li>• SOP framework, templates, mock interview prep, sample successful applications</li>
          </ul>
        </div>

        <div className="flex flex-col gap-3">
          <Link
            href="/mentorship"
            className="block w-full rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition-colors text-center inline-flex items-center justify-center gap-2"
          >
            Learn about the Mentorship Program
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/auth/login"
            className="block w-full rounded-xl border border-gray-300 px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors text-center"
          >
            Already enrolled? Sign in with your registered email
          </Link>
        </div>

        {isPaidPro && (
          <p className="text-xs text-center text-gray-500 leading-relaxed pt-2">
            You're a Pro subscriber — thank you for supporting ScholarAssist!
            CV evaluation is a separate, high-touch service that complements our human mentorship offering.
            Pro keeps the AI Chat and unlimited browsing humming; Mentorship adds the personalized review.
          </p>
        )}
      </div>
    </div>
  )
}
