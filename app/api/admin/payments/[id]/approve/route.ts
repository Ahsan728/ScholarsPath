import { NextRequest, NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase"
import { sendBrevoEmail, emailLayout } from "@/lib/email"

// Note: at this point the payment_requests row already exists and its FK
// to users(id) is satisfied (we ensureUserRow in payments/submit), so the
// subscriptions upsert below is safe.

function ensureAdmin(req: NextRequest): NextResponse | null {
  if (req.cookies.get("admin_auth")?.value !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return null
}

// Maps plan → months to add. We extend from `max(now, current_period_end)`
// so a renewal before expiry stacks, instead of resetting the clock.
const PLAN_MONTHS: Record<string, number> = { monthly: 1, semi: 6, annual: 12 }

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureAdmin(req); if (denied) return denied

  const { id } = params

  // 1. Fetch the request
  const { data: pr, error: fetchErr } = await adminSupabase
    .from("payment_requests")
    .select("*")
    .eq("id", id)
    .single()
  if (fetchErr || !pr) {
    return NextResponse.json({ error: fetchErr?.message ?? "Not found" }, { status: 404 })
  }
  if (pr.status === "approved") {
    return NextResponse.json({ error: "Already approved" }, { status: 400 })
  }

  // 2. Compute new current_period_end. If existing end is in the future, extend
  //    from there. Otherwise extend from now.
  const months = PLAN_MONTHS[pr.plan] ?? 1
  const { data: existingSub } = await adminSupabase
    .from("subscriptions")
    .select("current_period_end")
    .eq("user_id", pr.user_id)
    .maybeSingle()
  const start = existingSub?.current_period_end
    ? new Date(Math.max(Date.now(), new Date(existingSub.current_period_end).getTime()))
    : new Date()
  const newEnd = new Date(start)
  newEnd.setMonth(newEnd.getMonth() + months)

  // 3. Upsert subscription as Pro
  const { error: upsertErr } = await adminSupabase
    .from("subscriptions")
    .upsert(
      {
        user_id: pr.user_id,
        tier: "pro",
        current_period_end: newEnd.toISOString(),
      },
      { onConflict: "user_id" }
    )
  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 })
  }

  // 4. Mark payment as approved
  await adminSupabase
    .from("payment_requests")
    .update({
      status: "approved",
      reviewed_at: new Date().toISOString(),
      reviewed_by: "admin",
    })
    .eq("id", id)

  // 5. Notify the user
  const planLabel = pr.plan === "monthly" ? "Pro Monthly" : pr.plan === "semi" ? "Pro 6 Months" : "Pro Annual"
  sendBrevoEmail({
    to: pr.email,
    subject: "✅ Your ScholarAssist Pro access is active",
    html: emailLayout({
      heading: "Payment approved — welcome to Pro!",
      bodyHtml: `
        <p>Your payment for the <strong>${planLabel}</strong> plan has been verified. Your Pro features are now unlocked:</p>
        <ul style="margin:12px 0;padding-left:20px;">
          <li>Unlimited browsing time</li>
          <li>15 AI Chat queries per month</li>
          <li>Deadline email alerts</li>
          <li>Weekly opportunity digest</li>
        </ul>
        <p>Your Pro access is valid until <strong>${newEnd.toISOString().slice(0, 10)}</strong>.</p>
      `,
      ctaText: "Open my account",
      ctaUrl: "https://scholars.ahsansuny.com/account",
    }),
  }).catch(e => console.warn("[payments/approve] email failed:", e))

  return NextResponse.json({ ok: true, current_period_end: newEnd.toISOString() })
}
