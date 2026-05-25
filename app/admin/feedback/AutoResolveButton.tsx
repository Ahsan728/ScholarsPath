"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Zap, Loader2, X } from "lucide-react"

interface RunResult {
  ok: true
  applied: number
  skipped: number
  total: number
  results: Array<{
    id: string
    applied?: boolean
    reason: string
    field?: string
    old?: string
    new?: string
  }>
}

export function AutoResolveButton() {
  const router = useRouter()
  const [busy, setBusy]   = useState(false)
  const [result, setResult] = useState<RunResult | null>(null)

  async function run() {
    if (!confirm(
      "Auto-resolve will scan all PENDING broken_link feedback that has an evidence URL, " +
      "validate each URL (HTTP HEAD), check it matches the listed university, and if both " +
      "pass, update the program and mark the feedback resolved.\n\nNo AI cost. Continue?"
    )) return

    setBusy(true)
    try {
      const r = await fetch("/api/admin/feedback/auto-resolve", { method: "POST" })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setResult(j as RunResult)
      router.refresh()
    } catch (e: any) {
      alert(`Auto-resolve failed: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        onClick={run}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 px-3 py-2 text-xs font-medium text-white whitespace-nowrap"
        title="Validate evidence URLs and auto-apply safe broken_link fixes (no AI cost)"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
        Auto-resolve safe items
      </button>

      {result && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
              <h3 className="font-semibold text-white">Auto-resolve result</h3>
              <button onClick={() => setResult(null)} className="text-gray-500 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto">
              <div className="grid grid-cols-3 gap-3 mb-4">
                <Stat label="Eligible" value={result.total} color="text-gray-300" />
                <Stat label="Applied"  value={result.applied} color="text-green-400" />
                <Stat label="Skipped"  value={result.skipped} color="text-amber-400" />
              </div>

              {result.results.filter(r => r.applied).length > 0 && (
                <>
                  <h4 className="text-xs uppercase font-bold text-green-400 mb-2">Applied</h4>
                  <div className="space-y-1 mb-4">
                    {result.results.filter(r => r.applied).map((r, i) => (
                      <div key={i} className="text-xs bg-green-950/30 border border-green-900/40 rounded p-2">
                        <p className="font-mono text-green-300">{r.field}</p>
                        <p className="text-gray-500 truncate"><span className="text-red-400">−</span> {r.old || "(empty)"}</p>
                        <p className="text-gray-300 truncate"><span className="text-green-400">+</span> {r.new}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {result.results.filter(r => !r.applied).length > 0 && (
                <>
                  <h4 className="text-xs uppercase font-bold text-amber-400 mb-2">Skipped — review manually or with AI</h4>
                  <div className="space-y-1">
                    {result.results.filter(r => !r.applied).map((r, i) => (
                      <div key={i} className="text-xs text-gray-400 bg-gray-950/50 rounded px-2 py-1">
                        {r.reason}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-gray-950/50 border border-gray-800 rounded-lg p-3 text-center">
      <p className="text-[10px] uppercase text-gray-500">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  )
}
