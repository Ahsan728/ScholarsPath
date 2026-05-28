// Single source of truth for known aggregator/scam domains. Imported by:
//   - lib/supabase.ts (filters opportunity rendering on server queries)
//   - app/api/admin/feedback/auto-resolve/route.ts
//   - app/api/admin/sources/process/route.ts (Discoverer auto-process)
//
// Mirrors crawlers/aggregator_hosts.py. Both files read the same JSON so
// the list lives in exactly one place. Add new domains by editing
// data/aggregator_hosts.json; both languages pick it up automatically.

import aggregatorHostsData from "@/data/aggregator_hosts.json"

export const AGGREGATOR_HOSTS: Set<string> = new Set(
  (aggregatorHostsData as { hosts: string[] }).hosts
)

export function isAggregatorHost(url: string): boolean {
  if (!url) return false
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "")
    if (AGGREGATOR_HOSTS.has(host)) return true
    for (const blocked of Array.from(AGGREGATOR_HOSTS)) {
      if (host.endsWith("." + blocked)) return true
    }
    return false
  } catch {
    return false
  }
}
