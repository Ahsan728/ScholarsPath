import { adminSupabase } from "@/lib/supabase"
import { PaymentsClient } from "./PaymentsClient"

export interface PaymentRow {
  id: string
  user_id: string | null
  email: string
  plan: "monthly" | "semi" | "annual"
  amount_usd: number
  method: "bank" | "bkash" | "paypal" | "wise"
  transaction_id: string | null
  receipt_path: string | null
  receipt_signed_url: string | null
  notes: string | null
  status: "pending" | "approved" | "rejected"
  admin_note: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
}

interface Props {
  searchParams: { tab?: string }
}

const TABS = [
  { key: "pending",  label: "Pending"  },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
] as const

export const dynamic = "force-dynamic"

export default async function AdminPaymentsPage({ searchParams }: Props) {
  const tab = (TABS.find(t => t.key === searchParams.tab)?.key ?? "pending") as PaymentRow["status"]

  const { data, error } = await adminSupabase
    .from("payment_requests")
    .select("*")
    .eq("status", tab)
    .order("created_at", { ascending: false })
    .limit(100)

  const rows: PaymentRow[] = []
  for (const r of (data ?? []) as PaymentRow[]) {
    let signed: string | null = null
    if (r.receipt_path) {
      const { data: u } = await adminSupabase.storage
        .from("receipts")
        .createSignedUrl(r.receipt_path, 60 * 60) // 1 hour validity
      signed = u?.signedUrl ?? null
    }
    rows.push({ ...r, receipt_signed_url: signed })
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Payment Requests</h1>
        <p className="text-sm text-gray-400 mt-1">
          Verify bank/bKash/PayPal/Wise receipts. Approving grants Pro tier
          and extends the user's <code className="bg-gray-800 px-1.5 py-0.5 rounded text-xs text-blue-300">current_period_end</code> by the plan duration.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800 mb-5">
        {TABS.map(t => (
          <a
            key={t.key}
            href={`/admin/payments?tab=${t.key}`}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? "border-blue-500 text-white"
                : "border-transparent text-gray-400 hover:text-white"
            }`}
          >
            {t.label}
          </a>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-900/30 border border-red-800 px-4 py-3 text-sm text-red-300">
          {error.message}
        </div>
      )}

      <PaymentsClient rows={rows} tab={tab} />
    </div>
  )
}
