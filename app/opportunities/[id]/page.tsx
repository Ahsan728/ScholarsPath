import { notFound } from "next/navigation"
import { format, differenceInDays, parseISO } from "date-fns"
import { ExternalLink, Calendar, MapPin, BookOpen, Users, DollarSign, ArrowLeft } from "lucide-react"
import { getOpportunityById } from "@/lib/supabase"
import type { Metadata } from "next"

interface Props {
  params: { id: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const opp = await getOpportunityById(params.id)
  if (!opp) return { title: "Not Found" }
  return {
    title: `${opp.title} — ScholarAssist`,
    description: opp.description.slice(0, 160),
  }
}

export default async function OpportunityDetailPage({ params }: Props) {
  const opp = await getOpportunityById(params.id)
  if (!opp) notFound()

  const deadlineDays = opp.deadline
    ? differenceInDays(parseISO(opp.deadline), new Date())
    : null

  const deadlineUrgent = deadlineDays !== null && deadlineDays <= 30
  const deadlinePast = deadlineDays !== null && deadlineDays < 0

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Back */}
      <a
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to opportunities
      </a>

      <div className="rounded-2xl border bg-white shadow-sm">
        {/* Header */}
        <div className="border-b p-6">
          <div className="mb-3 flex flex-wrap gap-2">
            <TypeBadge type={opp.type} />
            {opp.funding_type && <FundingBadge funding={opp.funding_type} />}
            {opp.status !== "open" && <StatusBadge status={opp.status} />}
            {opp.is_featured && (
              <span className="badge bg-yellow-100 text-yellow-800">⭐ Featured</span>
            )}
            {opp.is_verified && (
              <span className="badge bg-green-100 text-green-800">✓ Verified</span>
            )}
          </div>

          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">{opp.title}</h1>

          <p className="mt-2 text-gray-500">
            via <span className="font-medium text-gray-700">{opp.source_name}</span>
          </p>
        </div>

        {/* Key info grid */}
        <div className="grid gap-4 border-b p-6 sm:grid-cols-2 lg:grid-cols-3">
          {/* Deadline */}
          {opp.deadline && (
            <InfoCard
              icon={<Calendar className="h-5 w-5" />}
              label="Deadline"
              value={format(parseISO(opp.deadline), "dd MMM yyyy")}
              highlight={deadlineUrgent && !deadlinePast}
              danger={deadlinePast}
              sub={
                deadlinePast
                  ? "Deadline passed"
                  : deadlineDays !== null
                  ? `${deadlineDays} days remaining`
                  : undefined
              }
            />
          )}

          {/* Host country */}
          {opp.host_country.length > 0 && (
            <InfoCard
              icon={<MapPin className="h-5 w-5" />}
              label="Host Country"
              value={opp.host_country.join(", ")}
            />
          )}

          {/* Funding amount */}
          {opp.amount_usd && (
            <InfoCard
              icon={<DollarSign className="h-5 w-5" />}
              label="Funding"
              value={`$${opp.amount_usd.toLocaleString()} USD`}
            />
          )}

          {/* Degree level */}
          <InfoCard
            icon={<BookOpen className="h-5 w-5" />}
            label="Degree Level"
            value={opp.degree_level.charAt(0).toUpperCase() + opp.degree_level.slice(1)}
          />

          {/* Eligible nationalities */}
          <InfoCard
            icon={<Users className="h-5 w-5" />}
            label="Eligible Nationalities"
            value={
              opp.eligible_nations.includes("ALL")
                ? "All nationalities"
                : opp.eligible_nations.slice(0, 5).join(", ") +
                  (opp.eligible_nations.length > 5 ? ` +${opp.eligible_nations.length - 5} more` : "")
            }
          />

          {/* Field of study */}
          {opp.field_of_study.length > 0 && (
            <InfoCard
              icon={<BookOpen className="h-5 w-5" />}
              label="Field of Study"
              value={opp.field_of_study.slice(0, 3).join(", ")}
            />
          )}
        </div>

        {/* Description */}
        <div className="border-b p-6">
          <h2 className="mb-3 text-lg font-semibold">About this Opportunity</h2>
          <p className="leading-relaxed text-gray-700">{opp.description}</p>

          {opp.eligibility_text && (
            <>
              <h3 className="mb-2 mt-5 font-semibold text-gray-900">Eligibility</h3>
              <p className="leading-relaxed text-gray-700">{opp.eligibility_text}</p>
            </>
          )}
        </div>

        {/* Requirements */}
        {opp.requirements.length > 0 && (
          <div className="border-b p-6">
            <h2 className="mb-3 text-lg font-semibold">Requirements</h2>
            <ul className="space-y-1.5">
              {opp.requirements.map((req, i) => (
                <li key={i} className="flex items-start gap-2 text-gray-700">
                  <span className="mt-0.5 text-green-500">✓</span>
                  {req}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Ineligible nations warning */}
        {opp.ineligible_nations.length > 0 && (
          <div className="border-b p-6">
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              <strong>Not eligible for:</strong> {opp.ineligible_nations.join(", ")}
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="p-6">
          <a
            href={opp.apply_url || opp.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-8 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-blue-700 active:bg-blue-800"
          >
            Apply Now
            <ExternalLink className="h-4 w-4" />
          </a>
          <p className="mt-2 text-xs text-gray-400">
            Opens official application page in a new tab
          </p>

          {/* Source info */}
          <div className="mt-4 border-t pt-4 text-xs text-gray-400">
            Source:{" "}
            <a
              href={opp.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              {opp.source_name}
            </a>{" "}
            · Last updated: {format(new Date(opp.updated_at), "dd MMM yyyy")}
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Sub-components
// ============================================================

function TypeBadge({ type }: { type: string }) {
  return <span className={`badge badge-${type}`}>{type.toUpperCase()}</span>
}

function FundingBadge({ funding }: { funding: string }) {
  return <span className={`badge badge-${funding}`}>{funding} funding</span>
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    closed: "badge-closed",
    rolling: "badge-rolling",
    upcoming: "badge bg-gray-100 text-gray-700",
  }
  return <span className={`badge ${map[status] ?? ""}`}>{status}</span>
}

function InfoCard({
  icon, label, value, sub, highlight, danger,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  highlight?: boolean
  danger?: boolean
}) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? "border-orange-200 bg-orange-50" : danger ? "border-red-200 bg-red-50" : "bg-gray-50"}`}>
      <div className={`mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide ${highlight ? "text-orange-600" : danger ? "text-red-600" : "text-gray-500"}`}>
        {icon}
        {label}
      </div>
      <div className={`font-semibold ${highlight ? "text-orange-800" : danger ? "text-red-700 line-through" : "text-gray-900"}`}>
        {value}
      </div>
      {sub && <div className={`mt-0.5 text-xs ${highlight ? "text-orange-600" : "text-red-500"}`}>{sub}</div>}
    </div>
  )
}
