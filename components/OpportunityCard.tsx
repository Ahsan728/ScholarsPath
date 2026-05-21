"use client"

import Link from "next/link"
import { differenceInDays, format, parseISO } from "date-fns"
import { MapPin, Calendar, BookOpen, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Opportunity } from "@/types"

interface Props {
  opportunity: Opportunity
  featured?: boolean
}

const TYPE_COLORS: Record<string, string> = {
  scholarship: "badge-scholarship",
  phd:         "badge-phd",
  postdoc:     "badge-postdoc",
  fellowship:  "badge-fellowship",
  grant:       "badge-grant",
  internship:  "badge-internship",
  exchange:    "badge-exchange",
  bursary:     "badge-bursary",
}

export function OpportunityCard({ opportunity: opp, featured }: Props) {
  const deadlineDays = opp.deadline
    ? differenceInDays(parseISO(opp.deadline), new Date())
    : null

  const isUrgent = deadlineDays !== null && deadlineDays <= 14 && deadlineDays >= 0
  const isPast = deadlineDays !== null && deadlineDays < 0

  const deadlineLabel = isPast
    ? "Deadline passed"
    : deadlineDays === 0
    ? "Due today!"
    : deadlineDays === 1
    ? "1 day left"
    : deadlineDays !== null
    ? `${deadlineDays}d left`
    : opp.status === "rolling"
    ? "Rolling"
    : "No deadline"

  const eligibleLabel =
    opp.eligible_nations.includes("ALL")
      ? "All"
      : opp.eligible_nations.includes("DEVELOPING")
      ? "Developing countries"
      : opp.eligible_nations.slice(0, 3).join(", ") +
        (opp.eligible_nations.length > 3 ? ` +${opp.eligible_nations.length - 3}` : "")

  return (
    <Link href={`/opportunities/${opp.id}`}>
      <article
        className={cn(
          "group relative flex h-full flex-col rounded-xl border bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
          featured && "border-yellow-200 bg-yellow-50/30",
          isPast && "opacity-60"
        )}
      >
        {/* Type + funding badges */}
        <div className="mb-3 flex flex-wrap gap-1.5">
          <span className={`badge ${TYPE_COLORS[opp.type] ?? "badge-scholarship"}`}>
            {opp.type.toUpperCase()}
          </span>
          {opp.funding_type === "full" && (
            <span className="badge badge-full">Fully Funded</span>
          )}
          {opp.funding_type === "partial" && (
            <span className="badge badge-partial">Partial</span>
          )}
          {isUrgent && !isPast && (
            <span className="badge badge-urgent">🔥 Urgent</span>
          )}
          {featured && (
            <span className="badge bg-yellow-100 text-yellow-700">⭐ Featured</span>
          )}
        </div>

        {/* Title */}
        <h3 className="mb-2 line-clamp-2 text-base font-semibold leading-snug text-gray-900 group-hover:text-blue-700">
          {opp.title}
        </h3>

        {/* Description */}
        <p className="mb-3 line-clamp-2 text-sm text-gray-500">
          {opp.description || "Click to view details."}
        </p>

        {/* Meta row */}
        <div className="mt-auto space-y-1.5">
          {opp.host_country.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              {opp.host_country.join(", ")}
            </div>
          )}

          {opp.field_of_study.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <BookOpen className="h-3.5 w-3.5 shrink-0" />
              {opp.field_of_study.slice(0, 2).join(", ")}
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              {opp.deadline
                ? format(parseISO(opp.deadline), "dd MMM yyyy")
                : "No deadline"}
            </div>

            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                isUrgent && !isPast
                  ? "bg-red-100 text-red-700"
                  : isPast
                  ? "bg-gray-100 text-gray-500"
                  : "bg-blue-50 text-blue-700"
              )}
            >
              {deadlineLabel}
            </span>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t pt-2 text-xs text-gray-400">
            <span>
              For: <span className="font-medium text-gray-600">{eligibleLabel}</span>
            </span>
            <ArrowRight className="h-3.5 w-3.5" />
          </div>
        </div>
      </article>
    </Link>
  )
}
