import { GraduationCap, Globe } from "lucide-react"
import { adminSupabase } from "@/lib/supabase"

// Server component: renders an anonymous stats badge for one program.
// Shows nothing if there are no rows yet. Names are never exposed —
// only counts and medians.

const countryFlags: Record<string, string> = {
  Bangladesh: "🇧🇩", India: "🇮🇳", Pakistan: "🇵🇰", "Sri Lanka": "🇱🇰",
  Nepal: "🇳🇵", Indonesia: "🇮🇩", Vietnam: "🇻🇳", Philippines: "🇵🇭",
  Nigeria: "🇳🇬", Egypt: "🇪🇬", Kenya: "🇰🇪", Morocco: "🇲🇦",
}

interface Props {
  programId: string
}

function median(nums: number[]): number | null {
  const a = nums.filter(n => Number.isFinite(n)).sort((x, y) => x - y)
  if (a.length === 0) return null
  const mid = Math.floor(a.length / 2)
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2
}

export async function AcceptanceBadge({ programId }: Props) {
  const { data: rows } = await adminSupabase
    .from("student_acceptances")
    .select("country, status, intake_year, gpa, gpa_scale, ielts_score, publications_count")
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

  // Profile aggregates — only show when we have enough data points (>=2)
  // to avoid implicitly de-anonymising single entries.
  const gpasOn4 = accepted
    .filter(r => r.gpa != null && r.gpa_scale != null && r.gpa_scale > 0)
    .map(r => Number(r.gpa) * (4.0 / Number(r.gpa_scale)))   // normalise to /4
  const ieltses = accepted.filter(r => r.ielts_score != null).map(r => Number(r.ielts_score))
  const pubs    = accepted.filter(r => r.publications_count != null).map(r => Number(r.publications_count))

  const medGpa   = gpasOn4.length >= 2 ? median(gpasOn4)   : null
  const medIelts = ieltses.length >= 2 ? median(ieltses)   : null
  const medPubs  = pubs.length >= 2    ? median(pubs)      : null

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

          {(medGpa !== null || medIelts !== null || medPubs !== null) && (
            <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-purple-200">
              {medGpa !== null && (
                <Stat label="Median GPA"     value={`${medGpa.toFixed(2)}/4`} note={`n=${gpasOn4.length}`} />
              )}
              {medIelts !== null && (
                <Stat label="Median IELTS"   value={medIelts.toFixed(1)}     note={`n=${ieltses.length}`} />
              )}
              {medPubs !== null && (
                <Stat label="Median pubs"    value={String(medPubs)}         note={`n=${pubs.length}`} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="bg-white border border-purple-200 rounded-lg p-2 text-center">
      <p className="text-[10px] uppercase text-purple-500 font-bold">{label}</p>
      <p className="text-sm font-semibold text-purple-900">{value}</p>
      <p className="text-[10px] text-purple-400">{note}</p>
    </div>
  )
}
