import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { adminSupabase } from "@/lib/supabase"
import { sendBrevoEmail, emailLayout } from "@/lib/email"
import { ensureUserRow } from "@/lib/userBootstrap"

const PLAN_AMOUNTS: Record<string, number> = { monthly: 5, semi: 25, annual: 50 }
const VALID_METHODS = new Set(["bank", "bkash", "paypal", "wise"])

async function getUser(req: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n: string) => req.cookies.get(n)?.value, set: () => {}, remove: () => {} } }
  )
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user ?? null
}

export async function POST(req: NextRequest) {
  const user = await getUser(req)
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { plan, amount_usd, method, transaction_id, receipt_path, notes } = body

  // Validate
  if (!PLAN_AMOUNTS[plan]) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 })
  }
  if (Number(amount_usd) !== PLAN_AMOUNTS[plan]) {
    return NextResponse.json({ error: "Amount does not match selected plan" }, { status: 400 })
  }
  if (!VALID_METHODS.has(method)) {
    return NextResponse.json({ error: "Invalid payment method" }, { status: 400 })
  }
  if (!transaction_id || !receipt_path) {
    return NextResponse.json({ error: "Transaction ID and receipt are required" }, { status: 400 })
  }

  // Bootstrap public.users row if it doesn't exist yet.
  // Without this, the FK on payment_requests.user_id fails.
  await ensureUserRow(user)

  // Insert row
  const { data, error } = await adminSupabase
    .from("payment_requests")
    .insert({
      user_id: user.id,
      email: user.email ?? "(unknown)",
      plan,
      amount_usd: PLAN_AMOUNTS[plan],
      method,
      transaction_id: String(transaction_id).slice(0, 200),
      receipt_path: String(receipt_path).slice(0, 500),
      notes: notes ? String(notes).slice(0, 1000) : null,
      status: "pending",
    })
    .select("id")
    .single()

  if (error) {
    console.error("[payments/submit] insert failed:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Best-effort notifications (don't fail the request if email errors)
  const planLabel = plan === "monthly" ? "Pro Monthly" : plan === "semi" ? "Pro 6 Months" : "Pro Annual"

  // → User confirmation
  sendBrevoEmail({
    to: user.email!,
    subject: "We've received your payment — verifying now",
    html: emailLayout({
      heading: "Payment proof received",
      bodyHtml: `
        <p>Thanks! We've received your payment proof for the <strong>${planLabel}</strong> plan ($${PLAN_AMOUNTS[plan]}).</p>
        <p>Our admin will verify the transaction within 24 hours. You'll get another email the moment your Pro access is active.</p>
        <p style="color:#6b7280;font-size:13px;">Transaction ID: <code>${transaction_id}</code><br>Payment method: ${method}</p>
      `,
      ctaText: "View my account",
      ctaUrl: "https://scholars.ahsansuny.com/account",
    }),
  }).catch(e => console.warn("[payments/submit] user email failed:", e))

  // → Admin notification
  const adminEmail = process.env.PAYMENT_NOTIFY_EMAIL
  if (adminEmail) {
    sendBrevoEmail({
      to: adminEmail,
      subject: `New payment to verify: ${user.email} → ${planLabel}`,
      html: emailLayout({
        heading: "New payment proof to verify",
        bodyHtml: `
          <p><strong>${user.email}</strong> submitted proof for ${planLabel} ($${PLAN_AMOUNTS[plan]}).</p>
          <ul style="font-size:13px;color:#374151;">
            <li>Method: ${method}</li>
            <li>Transaction ID: <code>${transaction_id}</code></li>
            <li>Submitted at: ${new Date().toISOString()}</li>
            ${notes ? `<li>Note: ${notes}</li>` : ""}
          </ul>
        `,
        ctaText: "Open admin panel",
        ctaUrl: "https://scholars.ahsansuny.com/admin/payments",
      }),
    }).catch(e => console.warn("[payments/submit] admin email failed:", e))
  }

  return NextResponse.json({ ok: true, id: data?.id })
}
