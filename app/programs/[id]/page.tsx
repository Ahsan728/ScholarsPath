import { notFound } from "next/navigation"
import Link from "next/link"
import { adminSupabase } from "@/lib/supabase"
import { ReportIssueButton } from "@/components/ReportIssueButton"
import type { MastersProgram } from "@/types"

const countryFlags: Record<string, string> = {
  Germany: "🇩🇪", France: "🇫🇷", Italy: "🇮🇹", Netherlands: "🇳🇱",
  Sweden: "🇸🇪", Belgium: "🇧🇪", Spain: "🇪🇸", Poland: "🇵🇱",
  Denmark: "🇩🇰", Finland: "🇫🇮", Austria: "🇦🇹", Norway: "🇳🇴",
  Switzerland: "🇨🇭", Portugal: "🇵🇹", "Czech Republic": "🇨🇿",
  Hungary: "🇭🇺", Ireland: "🇮🇪", Greece: "🇬🇷", Europe: "🇪🇺",
  "United Kingdom": "🇬🇧",
}

const levelColors: Record<string, string> = {
  bachelor: "bg-green-100 text-green-800",
  master: "bg-blue-100 text-blue-800",
  language: "bg-orange-100 text-orange-800",
}

async function getProgram(id: string): Promise<MastersProgram | null> {
  const { data, error } = await adminSupabase
    .from("masters_programs")
    .select("*")
    .eq("id", id)
    .single()
  if (error || !data) return null
  return data as MastersProgram
}

async function getRelatedPrograms(program: MastersProgram): Promise<MastersProgram[]> {
  const { data } = await adminSupabase
    .from("masters_programs")
    .select("*")
    .eq("university", program.university)
    .neq("id", program.id)
    .eq("is_active", true)
    .limit(3)
  return (data ?? []) as MastersProgram[]
}

export default async function ProgramDetailPage({ params }: { params: { id: string } }) {
  const program = await getProgram(params.id)
  if (!program) notFound()

  const related = await getRelatedPrograms(program)
  const flag = countryFlags[program.country] ?? "🌍"
  const level = program.level ?? "master"
  const levelLabel = level.charAt(0).toUpperCase() + level.slice(1)
  const isFree = program.tuition_usd_year === null || program.tuition_usd_year === 0

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Back link */}
        <Link href="/programs" className="text-sm text-blue-600 hover:underline mb-4 inline-block">
          ← Back to Programs
        </Link>

        {/* Header card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">
          <div className="flex flex-wrap gap-2 mb-3">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${levelColors[level] ?? levelColors.master}`}>
              {levelLabel}
            </span>
            {program.scholarship_available && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-800">
                Scholarship Available
              </span>
            )}
            {isFree && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-800">
                Free / Regulated Tuition
              </span>
            )}
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-1">{program.program_name}</h1>
          <p className="text-lg text-blue-700 font-medium mb-2">{program.university}</p>
          <p className="text-gray-500">
            {flag} {program.city}, {program.country}
            {program.qs_ranking && (
              <span className="ml-3 text-sm">· QS Ranking #{program.qs_ranking}</span>
            )}
          </p>

          <p className="mt-4 text-gray-700 leading-relaxed">{program.description}</p>

          {/* Key info grid */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <InfoBox label="Duration" value={`${program.duration_years} year${program.duration_years !== 1 ? "s" : ""}`} />
            <InfoBox label="Language" value={program.language} />
            <InfoBox
              label="Tuition / Year"
              value={isFree ? "Free / Regulated" : `€${program.tuition_usd_year!.toLocaleString()}`}
            />
            <InfoBox label="Intake" value={program.intake} />
          </div>

          {/* Apply CTA */}
          <div className="mt-6 flex gap-3 flex-wrap items-center">
            <a
              href={program.apply_url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors"
            >
              Apply Now →
            </a>
            {program.source_url && program.source_url !== program.apply_url && (
              <a
                href={program.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors"
              >
                Program Page
              </a>
            )}
            <div className="ml-auto">
              <ReportIssueButton program={{ id: program.id, program_name: program.program_name }} />
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Requirements */}
          {program.requirements && program.requirements.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <h2 className="font-bold text-gray-900 mb-3">Requirements</h2>
              <ul className="space-y-2">
                {program.requirements.map((req, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="text-green-500 mt-0.5">✓</span>
                    {req}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Eligibility at a glance */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <h2 className="font-bold text-gray-900 mb-3">Eligibility at a Glance</h2>
            <div className="space-y-2 text-sm text-gray-700">
              {program.ielts_min && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Min. IELTS</span>
                  <span className="font-medium">{program.ielts_min}</span>
                </div>
              )}
              {program.gpa_min && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Min. GPA</span>
                  <span className="font-medium">{program.gpa_min}/{program.gpa_scale}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">GRE Required</span>
                <span className="font-medium">{program.gre_required ? "Yes" : "No"}</span>
              </div>
              {program.deadline && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Deadline</span>
                  <span className="font-medium">{program.deadline}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">Fields</span>
                <span className="font-medium text-right">
                  {(Array.isArray(program.field_of_study) ? program.field_of_study : []).join(", ")}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Related programs from same university */}
        {related.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <h2 className="font-bold text-gray-900 mb-4">More from {program.university}</h2>
            <div className="space-y-3">
              {related.map((p) => (
                <Link
                  key={p.id}
                  href={`/programs/${p.id}`}
                  className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0 hover:text-blue-700 transition-colors"
                >
                  <span className="text-sm text-gray-800">{p.program_name}</span>
                  <span className="text-xs text-gray-500 ml-4 shrink-0">{p.level ?? "master"}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Smart Match CTA */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-2xl p-6 text-center">
          <h3 className="font-bold text-blue-900 mb-2">Not sure if this is the right fit?</h3>
          <p className="text-sm text-blue-700 mb-4">
            Use Smart Match to get personalized recommendations based on your GPA, IELTS score, and background.
          </p>
          <Link
            href="/match"
            className="inline-block px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors"
          >
            Try Smart Match →
          </Link>
        </div>
      </div>
    </div>
  )
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3 text-center">
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className="font-semibold text-gray-900 text-sm">{value}</p>
    </div>
  )
}
