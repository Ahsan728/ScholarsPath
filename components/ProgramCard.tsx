"use client"

import Link from "next/link"
import type { MastersProgram } from "@/types"
import { SaveProgramButton } from "@/components/SaveProgramButton"

const countryFlags: Record<string, string> = {
  Germany: "🇩🇪", France: "🇫🇷", Italy: "🇮🇹", Netherlands: "🇳🇱",
  Sweden: "🇸🇪", Belgium: "🇧🇪", Spain: "🇪🇸", Poland: "🇵🇱",
  Denmark: "🇩🇰", Finland: "🇫🇮", Austria: "🇦🇹", Norway: "🇳🇴",
  Switzerland: "🇨🇭", Portugal: "🇵🇹", "Czech Republic": "🇨🇿",
  Hungary: "🇭🇺", Ireland: "🇮🇪", Greece: "🇬🇷", Europe: "🇪🇺",
  "United Kingdom": "🇬🇧", USA: "🇺🇸", Canada: "🇨🇦", Japan: "🇯🇵",
}

const levelColors: Record<string, string> = {
  bachelor: "bg-green-100 text-green-800",
  master: "bg-blue-100 text-blue-800",
  language: "bg-orange-100 text-orange-800",
}

const categoryLabels: Record<string, string> = {
  cs_ai: "CS / AI",
  engineering: "Engineering",
  architecture: "Architecture",
  business: "Business",
  science: "Science",
  environment: "Environment",
  health: "Health",
  agriculture: "Agriculture",
  arts: "Arts & Design",
  social: "Social Sciences",
  languages: "Languages",
}

interface Props {
  program: MastersProgram
  savedIds?: Set<string>
}

export default function ProgramCard({ program, savedIds }: Props) {
  const flag = countryFlags[program.country] ?? "🌍"
  const level = program.level ?? "master"
  const levelLabel = level.charAt(0).toUpperCase() + level.slice(1)
  const isFree = program.tuition_usd_year === null || program.tuition_usd_year === 0
  const tuitionText = isFree
    ? "Free / Regulated"
    : `€${program.tuition_usd_year!.toLocaleString()}/yr`

  const isEmjm = program.program_type === "erasmus_mundus_joint"
  // Multi-country flag display for EMJM
  const emjmFlags = isEmjm && program.consortium_countries?.length
    ? program.consortium_countries.slice(0, 4).map(c => countryFlags[c] ?? "🌍").join(" ")
    : null

  return (
    <div className={`rounded-xl shadow-sm hover:shadow-md transition-shadow flex flex-col h-full ${
      isEmjm
        ? "bg-blue-50 border-2 border-blue-500 ring-1 ring-blue-200"
        : "bg-white border border-gray-200"
    }`}>
      {/* Header */}
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap flex-1">
          {isEmjm ? (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-600 text-white inline-flex items-center gap-1">
              ✨ Erasmus Mundus
            </span>
          ) : (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${levelColors[level] ?? levelColors.master}`}>
              {levelLabel}
            </span>
          )}
          {program.scholarship_available && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800">
              {isEmjm ? "Fully funded" : "Scholarship"}
            </span>
          )}
          </div>
          {savedIds && <SaveProgramButton programId={program.id} initialSaved={savedIds.has(program.id)} />}
        </div>

        <p className="text-sm text-gray-500 mb-1">
          {emjmFlags ? (
            <>
              {emjmFlags} <span className="text-blue-700">Multi-country consortium</span>
            </>
          ) : (
            <>
              {flag} {program.city}, {program.country}
              {program.qs_ranking && (
                <span className="ml-2 text-xs text-gray-400">QS #{program.qs_ranking}</span>
              )}
            </>
          )}
        </p>

        <h3 className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2">
          {isEmjm && program.consortium_universities?.length
            ? program.consortium_universities.slice(0, 2).join(" + ") + (program.consortium_universities.length > 2 ? " + " + (program.consortium_universities.length - 2) + " more" : "")
            : program.university}
        </h3>
        <p className={`font-medium text-sm mt-0.5 line-clamp-2 ${isEmjm ? "text-blue-800" : "text-blue-700"}`}>
          {program.program_name}
        </p>
      </div>

      {/* Badges */}
      <div className="px-4 pb-3 flex flex-wrap gap-1.5">
        {program.category && (
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
            {categoryLabels[program.category] ?? program.category}
          </span>
        )}
        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
          {program.duration_years}yr
        </span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${isFree ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
          {tuitionText}
        </span>
        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
          {program.language}
        </span>
        {program.ielts_min && (
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
            IELTS {program.ielts_min}+
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="mt-auto px-4 pb-4 flex gap-2">
        <Link
          href={`/programs/${program.id}`}
          className="flex-1 text-center text-xs font-medium py-2 rounded-lg border border-blue-600 text-blue-600 hover:bg-blue-50 transition-colors"
        >
          Learn More
        </Link>
        <a
          href={program.apply_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 text-center text-xs font-medium py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          Apply
        </a>
      </div>
    </div>
  )
}
