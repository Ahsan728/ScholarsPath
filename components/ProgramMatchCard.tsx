import { CheckCircle, AlertTriangle, ExternalLink, Trophy } from "lucide-react"
import type { ProgramMatch } from "@/types"

const countryFlags: Record<string, string> = {
  Germany: "🇩🇪",
  USA: "🇺🇸",
  Canada: "🇨🇦",
  Netherlands: "🇳🇱",
  Sweden: "🇸🇪",
  France: "🇫🇷",
  Belgium: "🇧🇪",
  Poland: "🇵🇱",
  Italy: "🇮🇹",
  Spain: "🇪🇸",
}

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 80
      ? "bg-green-500"
      : score >= 60
      ? "bg-blue-500"
      : score >= 40
      ? "bg-yellow-500"
      : "bg-red-400"

  const textColor =
    score >= 80
      ? "text-green-700"
      : score >= 60
      ? "text-blue-700"
      : score >= 40
      ? "text-yellow-700"
      : "text-red-600"

  return (
    <div className="flex items-center gap-2">
      <div className="relative h-2 flex-1 rounded-full bg-gray-100">
        <div
          className={`h-2 rounded-full ${color} transition-all`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={`text-sm font-bold ${textColor}`}>{score}%</span>
    </div>
  )
}

export function ProgramMatchCard({ match, rank }: { match: ProgramMatch; rank: number }) {
  const { program, fit_score, reasons, concerns, recommendation } = match
  const flag = countryFlags[program.country] ?? "🌍"

  return (
    <div className="flex flex-col rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="mb-0.5 flex items-center gap-1.5 text-xs text-gray-500">
            <span>{flag}</span>
            <span>
              {program.city}, {program.country}
            </span>
            {program.qs_ranking && (
              <>
                <span>·</span>
                <Trophy className="h-3 w-3 text-amber-500" />
                <span>QS #{program.qs_ranking}</span>
              </>
            )}
          </div>
          <h3 className="font-semibold leading-tight text-gray-900">{program.university}</h3>
          <p className="text-sm text-blue-700">{program.program_name}</p>
        </div>
        <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
          #{rank}
        </span>
      </div>

      {/* Fit score */}
      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
          <span>Fit score</span>
        </div>
        <ScoreBar score={fit_score} />
      </div>

      {/* Badges */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
          {Array.isArray(program.field_of_study) ? program.field_of_study[0] : program.field_of_study}
        </span>
        <span className="rounded-full bg-gray-50 px-2 py-0.5 text-xs text-gray-600">
          {program.duration_years}yr
        </span>
        {program.tuition_usd_year === null || program.tuition_usd_year === 0 ? (
          <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700">Free tuition</span>
        ) : (
          <span className="rounded-full bg-gray-50 px-2 py-0.5 text-xs text-gray-600">
            ${program.tuition_usd_year.toLocaleString()}/yr
          </span>
        )}
        {program.scholarship_available && (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
            Scholarship
          </span>
        )}
        {program.gre_required && (
          <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs text-orange-700">
            GRE needed
          </span>
        )}
      </div>

      {/* Reasons */}
      {reasons.length > 0 && (
        <ul className="mb-2 space-y-1">
          {reasons.slice(0, 2).map((r, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-gray-700">
              <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-500" />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Concerns */}
      {concerns.length > 0 && (
        <ul className="mb-3 space-y-1">
          {concerns.slice(0, 2).map((c, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-gray-500">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
              <span>{c}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Recommendation */}
      <p className="mb-4 text-xs italic text-gray-500">"{recommendation}"</p>

      {/* Apply button */}
      <div className="mt-auto">
        <a
          href={program.apply_url || "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          Apply Now
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  )
}
