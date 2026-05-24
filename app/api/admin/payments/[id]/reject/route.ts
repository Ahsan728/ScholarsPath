import { NextRequest, NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase"
import { sendBrevoEmail, emailLayout } from "@/lib/email"

function ensureAdmin(req: NextRequest): NextResponse | null {
  if (req.cookies.get("admin_auth")?.value !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return null
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureAdmin(req); if (denied) return denied

  const { id } = params
  const body = await req.json().catch(() => ({}))
  const adminNote: string = (body.admin_note ?? "").trim()
  if (!adminNote) {
    return NextResponse.json({ error: "admin_note is required for rejection" }, { status: 400 })
  }

  const { data: pr, error: fetchErr } = await adminSupabase
    .from("payment_requests")
    .select("*")
    .eq("id", id)
    .single()
  if (fetchErr || !pr) {
    return NextResponse.json({ error: fetchErr?.message ?? "Not found" }, { status: 404 })
  }
  if (pr.status !== "pending") {
    return NextResponse.json({ error: `Cannot reject a ${pr.status} payment` }, { status: 400 })
  }

  await adminSupabase
    .from("payment_requests")
    .update({
      status: "rejected",
      admin_note: adminNote,
      reviewed_at: new Date().toISOString(),
      reviewed_by: "admin",
    })
    .eq("id", id)

  const planLabel = pr.plan === "monthly" ? "Pro Monthly" : pr.plan === "semi" ? "Pro 6 Months" : "Pro Annual"
  sendBrevoEmail({
    to: pr.email,
    subject: "Your payment proof needs another look",
    html: emailLayout({
      heading: "Payment proof rejected",
      bodyHtml: `
        <p>Hi! We weren't able to verify your payment for the <strong>${planLabel}</strong> plan ($${pr.amount_usd}).</p>
        <p style="background:#fef2f2;border-left:3px solid #f87171;padding:10px 14px;margin:14px 0;font-size:13px;color:#7f1d1d;">
          <strong>Admin note:</strong> ${adminNote}
        </p>
        <p>No charge has been applied to your account. You can submit another payment proof anytime — pick your plan again on the pricing page.</p>
      `,
      ctaText: "Pick a plan",
      ctaUrl: "https://scholars.ahsansuny.com/pricing",
    }),
  }).catch(e => console.warn("[payments/reject] email failed:", e))

  return NextResponse.json({ ok: true })
}
