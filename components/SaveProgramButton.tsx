"use client"

import { Heart } from "lucide-react"
import { useState } from "react"

interface Props {
  programId: string
  initialSaved: boolean
}

export function SaveProgramButton({ programId, initialSaved }: Props) {
  const [saved, setSaved] = useState(initialSaved)
  const [busy, setBusy] = useState(false)

  async function toggle(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setBusy(true)
    try {
      const r = await fetch("/api/programs/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ program_id: programId }),
      })
      const j = await r.json()
      if (r.ok) setSaved(j.saved)
    } catch { /* silent */ }
    finally { setBusy(false) }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`p-1.5 rounded-full transition-all ${
        saved
          ? "text-red-500 bg-red-50 hover:bg-red-100"
          : "text-gray-400 bg-gray-50 hover:bg-gray-100 hover:text-red-400"
      } disabled:opacity-50`}
      title={saved ? "Unsave" : "Save for later"}
      aria-label={saved ? "Unsave program" : "Save program"}
    >
      <Heart className={`h-4 w-4 ${saved ? "fill-current" : ""}`} />
    </button>
  )
}
