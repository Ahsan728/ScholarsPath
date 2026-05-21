import { adminSupabase } from "@/lib/supabase"
import { calculateCost } from "@/lib/tier"

async function getStats() {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const weekStart  = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [
    { count: totalUsers },
    { count: proUsers },
    { count: newUsersWeek },
    { data: monthUsage },
    { data: todayUsage },
    { data: recentRuns },
  ] = await Promise.all([
    adminSupabase.from("users").select("*", { count: "exact", head: true }),
    adminSupabase.from("subscriptions").select("*", { count: "exact", head: true }).eq("tier", "pro"),
    adminSupabase.from("users").select("*", { count: "exact", head: true }).gte("created_at", weekStart),
    adminSupabase.from("api_usage_log").select("feature,input_tokens,output_tokens,cost_usd,model").gte("created_at", monthStart),
    adminSupabase.from("api_usage_log").select("feature,cost_usd").gte("created_at", todayStart),
    adminSupabase.from("pipeline_runs").select("*").order("ran_at", { ascending: false }).limit(5),
  ])

  const monthCost  = (monthUsage ?? []).reduce((s: number, r: any) => s + parseFloat(r.cost_usd ?? 0), 0)
  const todayCost  = (todayUsage ?? []).reduce((s: number, r: any) => s + parseFloat(r.cost_usd ?? 0), 0)
  const ragMonth   = (monthUsage ?? []).filter((r: any) => r.feature === "rag_chat").length
  const cvMonth    = (monthUsage ?? []).filter((r: any) => r.feature === "cv_evaluate").length
  const ragToday   = (todayUsage ?? []).filter((r: any) => r.feature === "rag_chat").length
  const cvToday    = (todayUsage ?? []).filter((r: any) => r.feature === "cv_evaluate").length

  return {
    totalUsers: totalUsers ?? 0,
    proUsers: proUsers ?? 0,
    newUsersWeek: newUsersWeek ?? 0,
    monthCost,
    todayCost,
    ragMonth,
    cvMonth,
    ragToday,
    cvToday,
    recentRuns: recentRuns ?? [],
    monthRevenue: (proUsers ?? 0) * 2.50,
  }
}

function Stat({ label, value, sub, color = "blue" }: { label: string; value: string; sub?: string; color?: string }) {
  const colors: Record<string, string> = {
    blue: "bg-blue-900/40 border-blue-700/50 text-blue-300",
    green: "bg-green-900/40 border-green-700/50 text-green-300",
    yellow: "bg-yellow-900/40 border-yellow-700/50 text-yellow-300",
    red: "bg-red-900/40 border-red-700/50 text-red-300",
  }
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-2xl font-bold mt-1 text-white">{value}</p>
      {sub && <p className="text-xs mt-1 opacity-60">{sub}</p>}
    </div>
  )
}

export default async function AdminDashboard() {
  const s = await getStats()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Analytics Dashboard</h1>
        <p className="text-sm text-gray-400 mt-1">Real-time cost, token usage, and user metrics</p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Stat label="Total Users" value={s.totalUsers.toLocaleString()} sub={`+${s.newUsersWeek} this week`} color="blue" />
        <Stat label="Pro Users" value={s.proUsers.toLocaleString()} sub={`$${s.monthRevenue.toFixed(2)}/mo revenue`} color="green" />
        <Stat label="Cost This Month" value={`$${s.monthCost.toFixed(4)}`} sub={`$${s.todayCost.toFixed(4)} today`} color="yellow" />
        <Stat label="Margin" value={`$${(s.monthRevenue - s.monthCost).toFixed(2)}`} sub={`${s.monthRevenue > 0 ? ((1 - s.monthCost / s.monthRevenue) * 100).toFixed(0) : 100}% margin`} color="green" />
      </div>

      {/* API Usage */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4 uppercase tracking-wide">AI Chat (RAG)</h2>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Calls this month</span>
              <span className="font-mono text-white">{s.ragMonth}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Calls today</span>
              <span className="font-mono text-white">{s.ragToday}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Est. cost/call</span>
              <span className="font-mono text-white">~$0.009</span>
            </div>
            <div className="flex justify-between text-sm border-t border-gray-800 pt-3">
              <span className="text-gray-400">Monthly cost</span>
              <span className="font-mono text-yellow-400">${(s.ragMonth * 0.009).toFixed(4)}</span>
            </div>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4 uppercase tracking-wide">CV + Transcript Eval</h2>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Calls this month</span>
              <span className="font-mono text-white">{s.cvMonth}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Calls today</span>
              <span className="font-mono text-white">{s.cvToday}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Est. cost/call</span>
              <span className="font-mono text-white">~$0.12</span>
            </div>
            <div className="flex justify-between text-sm border-t border-gray-800 pt-3">
              <span className="text-gray-400">Monthly cost</span>
              <span className="font-mono text-yellow-400">${(s.cvMonth * 0.12).toFixed(4)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Budget Tracker */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-8">
        <h2 className="text-sm font-semibold text-gray-300 mb-4 uppercase tracking-wide">Monthly Budget Tracker</h2>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Revenue</p>
            <p className="text-xl font-bold text-green-400">${s.monthRevenue.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-gray-500">AI Costs</p>
            <p className="text-xl font-bold text-yellow-400">${s.monthCost.toFixed(4)}</p>
          </div>
          <div>
            <p className="text-gray-500">Net Profit</p>
            <p className="text-xl font-bold text-white">${(s.monthRevenue - s.monthCost).toFixed(2)}</p>
          </div>
        </div>
        <div className="mt-4 h-2 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-yellow-500 rounded-full"
            style={{ width: `${Math.min(100, (s.monthCost / Math.max(s.monthRevenue, 0.01)) * 100).toFixed(1)}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 mt-1.5">Cost as % of revenue</p>
      </div>

      {/* Recent Pipeline Runs */}
      {s.recentRuns.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4 uppercase tracking-wide">Recent Crawl Runs</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
                  <th className="pb-2 pr-4">Type</th>
                  <th className="pb-2 pr-4">Processed</th>
                  <th className="pb-2 pr-4">New</th>
                  <th className="pb-2 pr-4">Claude calls</th>
                  <th className="pb-2 pr-4">Cost</th>
                  <th className="pb-2">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {s.recentRuns.map((r: any) => (
                  <tr key={r.id}>
                    <td className="py-2 pr-4 text-blue-400 font-medium">{r.run_type}</td>
                    <td className="py-2 pr-4 text-white">{r.items_processed}</td>
                    <td className="py-2 pr-4 text-green-400">+{r.items_new}</td>
                    <td className="py-2 pr-4 text-gray-300">{r.claude_calls}</td>
                    <td className="py-2 pr-4 text-yellow-400">${parseFloat(r.cost_usd ?? 0).toFixed(4)}</td>
                    <td className="py-2 text-gray-500 text-xs">{new Date(r.ran_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
