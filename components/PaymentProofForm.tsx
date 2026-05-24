"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Upload, Check } from "lucide-react"
import { supabase } from "@/lib/supabase-browser"

type Method = "bank" | "bkash" | "paypal" | "wise"

const METHOD_LABELS: { value: Method; label: string }[] = [
  { value: "bkash",  label: "bKash" },
  { value: "bank",   label: "Bank" },
  { value: "paypal", label: "PayPal" },
  { value: "wise",   label: "Wise" },
]

interface Props {
  plan: "monthly" | "semi" | "annual"
  amountUsd: number
  userEmail: string
}

export function PaymentProofForm({ plan, amountUsd, userEmail }: Props) {
  const router = useRouter()
  const [method, setMethod] = useState<Method>("bkash")
  const [txnId, setTxnId] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [notes, setNotes] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!txnId.trim()) { setError("Transaction ID is required."); return }
    if (!file) { setError("Please upload your payment receipt."); return }
    if (file.size > 5 * 1024 * 1024) { setError("Receipt file too large (max 5 MB)."); return }

    setBusy(true)
    try {
      // 1. Get current user (need user_id for the upload path)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Please sign in again.")

      // 2. Upload receipt to Storage bucket `receipts` under {user_id}/...
      const safeName = file.name.replace(/[^\w.\-]/g, "_").slice(-80)
      const path = `${user.id}/${Date.now()}-${safeName}`
      const { error: upErr } = await supabase.storage
        .from("receipts")
        .upload(path, file, { upsert: false, contentType: file.type })
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`)

      // 3. POST metadata to the API
      const res = await fetch("/api/payments/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          amount_usd: amountUsd,
          method,
          transaction_id: txnId.trim(),
          receipt_path: path,
          notes: notes.trim() || null,
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || "Submission failed")

      setDone(true)
      // Brief pause so the success state is visible, then redirect
      setTimeout(() => router.push("/account?payment=pending"), 1500)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="text-center py-8">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-green-100 mb-4">
          <Check className="h-7 w-7 text-green-600" />
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-1">Payment proof received</h3>
        <p className="text-sm text-gray-500">We verify within 24 hours. You'll get an email once your Pro access is active.</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Payment method</label>
        <div className="grid grid-cols-4 gap-2">
          {METHOD_LABELS.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setMethod(m.value)}
              className={`text-sm font-medium rounded-lg border px-3 py-2 transition-colors ${
                method === m.value
                  ? "bg-blue-600 border-blue-600 text-white"
                  : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Transaction ID / bKash TrxID
        </label>
        <input
          type="text"
          value={txnId}
          onChange={(e) => setTxnId(e.target.value)}
          placeholder={method === "bkash" ? "e.g., 8AB3K4XYZ7" : "e.g., transaction reference"}
          required
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Receipt screenshot or PDF
        </label>
        <label className="relative flex items-center justify-center gap-2 w-full border-2 border-dashed border-gray-300 rounded-xl px-4 py-6 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors">
          <Upload className="h-4 w-4 text-gray-400" />
          <span className="text-sm text-gray-600">
            {file ? file.name : "Click to upload (max 5 MB)"}
          </span>
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Note (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Anything we should know? (e.g., 'paid in BDT', 'name on bank slip is different')"
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
        Submitting as <strong className="text-gray-700">{userEmail}</strong>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {busy ? "Submitting…" : "Submit payment proof"}
      </button>
    </form>
  )
}
