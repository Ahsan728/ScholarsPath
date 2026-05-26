"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Search, MessageSquareWarning, GraduationCap, Receipt } from "lucide-react"
import type { UserRow } from "./page"

interface Props {
  initial: UserRow[]
}

const TIER_COLORS: Record<string, string> = {
  free:    "bg-gray-700 text-gray-200 border-gray-600",
  pro:     "bg-blue-900/50 text-blue-200 border-blue-800",
  student: "bg-purple-900/50 text-purple-200 border-purple-800",
}

export function UsersClient({ initial }: Props) {
  const [q, setQ] = useState("")
  const [tierFilter, setTierFilter] = useState<string>("all")
  const [onboardedOnly, setOnboardedOnly] = useState(false)

  const countries = useMemo(() => {
    const set = new Set<string>()
    for (const u of initial) if (u.nationality) set.add(u.nationality)
    return Array.from(set).sort()
  }, [initial])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return initial.filter(u => {
      if (tierFilter !== "all" && u.tier !== tierFilter) return false
      if (onboardedOnly && !u.onboarded) return false
      if (!needle) return true
      const hay = `${u.email ?? ""} ${u.full_name ?? ""} ${u.nationality ?? ""}`.toLowerCase()
      return hay.includes(needle)
    })
  }, [initial, q, tierFilter, onboardedOnly])

  if (initial.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
        <p className="text-sm text-gray-500">No users yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex items-center gap-2 flex-wrap text-xs">
        <Search className="h-3 w-3 text-gray-500" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search email / name / country…"
          className="flex-1 min-w-[200px] bg-gray-950 border border-gray-700 rounded px-2 py-1 text-white placeholder-gray-500"
        />
        <select
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value)}
          className="bg-gray-950 border border-gray-700 rounded px-2 py-1 text-gray-200"
        >
          <option value="all">All tiers</option>
          <option value="free">Free</option>
          <option value="pro">Pro</option>
          <option value="student">Student</option>
        </select>
        <label className="inline-flex items-center gap-1 text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={onboardedOnly}
            onChange={(e) => setOnboardedOnly(e.target.checked)}
            className="rounded"
          />
          Onboarded only
        </label>
        <span className="text-gray-500 ml-auto">
          Showing {filtered.length} of {initial.length}
        </span>
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-950 text-xs uppercase text-gray-500 border-b border-gray-800">
            <tr>
              <th className="text-left px-4 py-2.5">User</th>
              <th className="text-left px-4 py-2.5">Tier</th>
              <th className="text-left px-4 py-2.5">Profile</th>
              <th className="text-left px-4 py-2.5">Activity</th>
              <th className="text-left px-4 py-2.5">Joined</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => (
              <tr key={u.id} className="border-b border-gray-800/60 last:border-0 hover:bg-gray-950/30 align-top">
                <td className="px-4 py-3 max-w-xs">
                  <Link href={`/admin/users/${u.id}`} className="block hover:opacity-80">
                    <p className="text-white font-medium">
                      {u.full_name || <span className="text-gray-500 italic">(no name)</span>}
                    </p>
                    <p className="text-xs text-blue-400 break-all hover:underline">{u.email}</p>
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${TIER_COLORS[u.tier] ?? TIER_COLORS.free}`}>
                    {u.tier}
                  </span>
                  {u.is_mentorship_student && (
                    <span className="ml-1 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-300 inline-block">
                      mentorship
                    </span>
                  )}
                  {u.current_period_end && (
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      until {new Date(u.current_period_end).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-gray-300 max-w-xs">
                  {u.nationality && <p>🌐 {u.nationality}</p>}
                  {u.degree_level && <p className="text-gray-500">{u.degree_level}{u.gpa ? ` · GPA ${u.gpa}` : ""}</p>}
                  {u.field_of_study && u.field_of_study.length > 0 && (
                    <p className="text-gray-500 truncate">{u.field_of_study.slice(0, 3).join(", ")}</p>
                  )}
                  {!u.onboarded && (
                    <p className="text-[10px] text-amber-400">not onboarded</p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2 flex-wrap text-[11px]">
                    {u.feedback_count > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-orange-300 bg-orange-900/30 px-1.5 py-0.5 rounded">
                        <MessageSquareWarning className="h-3 w-3" /> {u.feedback_count}
                      </span>
                    )}
                    {u.acceptances_count > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-purple-300 bg-purple-900/30 px-1.5 py-0.5 rounded">
                        <GraduationCap className="h-3 w-3" /> {u.acceptances_count}
                      </span>
                    )}
                    {u.payment_count > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-green-300 bg-green-900/30 px-1.5 py-0.5 rounded">
                        <Receipt className="h-3 w-3" /> {u.payment_count}
                      </span>
                    )}
                    {u.feedback_count + u.acceptances_count + u.payment_count === 0 && (
                      <span className="text-gray-600 text-[10px]">—</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                  {new Date(u.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
