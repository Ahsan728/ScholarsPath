import { GraduationCap, Globe } from "lucide-react"
import { adminSupabase } from "@/lib/supabase"

// Server component: renders an anonymous stats badge for one program.
// Shows nothing if there are no rows yet. Names are never exposed.

const countryFlags: Record<string, string> = {
  Bangladesh: "🇧🇩", India: "🇮🇳", Pakistan: "🇵🇰", "Sri Lanka": "🇱🇰",
  Nepal: "🇳🇵", Indonesia: "🇮🇩", Vietnam: "🇻🇳", Philippines: "🇵🇭",
  Nigeria: "🇳🇬", Egypt: "🇪🇬", Kenya: "🇰🇪", Morocco: "🇲🇦",
}

interface Props {
  programId: string
}

export async function AcceptanceBadge({ programId }: Props) {
  const { data: rows } = await adminSupabase
    .from("student_acceptances")
    .select("country, status, intake_year")
    .eq("program_id", programId)
    .limit(500)

  if (!rows || rows.length === 0) return null

  const accepted = rows.filter(r => r.status === "accepted" || r.status === "enrolled")
  if (accepted.length === 0) return null

  // Country breakdown for the accepted/enrolled subset
  const byCountry: Record<string, number> = {}
  for (const r of accepted) {
    if (r.country) byCountry[r.country] = (byCountry[r.country] ?? 0) + 1
  }
  const topCountries = Object.entries(byCountry)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)

  return (
    <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-purple-100 inline-flex items-center justify-center shrink-0">
          <GraduationCap className="h-5 w-5 text-purple-700" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-purple-900">
            {accepted.length} student{accepted.length === 1 ? "" : "s"} accepted
          </p>
          <p className="text-xs text-purple-700 mt-0.5">
            Real applicants who reported their result. Anonymous aggregates only.
          </p>
          {topCountries.length > 0 && (
            <div className="flex gap-1.5 flex-wrap mt-2">
              {topCountries.map(([country, n]) => (
                <span
                  key={country}
                  className="inline-flex items-center gap-1 text-xs bg-white border border-purple-200 rounded-full px-2 py-0.5 text-purple-800"
                >
                  <span aria-hidden>{countryFlags[country] ?? <Globe className="h-3 w-3 inline" />}</span>
                  {country}: <strong>{n}</strong>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
