import { adminSupabase } from "@/lib/supabase"

export async function StatsBar() {
  try {
    const [{ count: total }, { count: open }, { count: bd }] = await Promise.all([
      adminSupabase.from("opportunities").select("*", { count: "exact", head: true }),
      adminSupabase
        .from("opportunities")
        .select("*", { count: "exact", head: true })
        .eq("status", "open"),
      adminSupabase
        .from("opportunities")
        .select("*", { count: "exact", head: true })
        .or('eligible_nations.cs.{"BD"},eligible_nations.cs.{"ALL"},eligible_nations.cs.{"DEVELOPING"}'),
    ])

    return (
      <div className="mb-6 flex flex-wrap gap-4 text-sm text-gray-600">
        <span>
          <strong className="text-gray-900">{(total ?? 0).toLocaleString()}</strong> total
        </span>
        <span>·</span>
        <span>
          <strong className="text-green-700">{(open ?? 0).toLocaleString()}</strong> open now
        </span>
        <span>·</span>
        <span>
          <strong className="text-blue-700">{(bd ?? 0).toLocaleString()}</strong> for BD students
        </span>
      </div>
    )
  } catch {
    return null
  }
}
