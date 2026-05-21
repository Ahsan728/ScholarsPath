import { NextRequest, NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase"
import { format, addDays, parseISO, differenceInDays } from "date-fns"

// This route is called by GitHub Actions cron every day
// GET /api/alerts?secret=CRON_SECRET

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret")
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const today = new Date()
  const todayStr = format(today, "yyyy-MM-dd")

  // Find opportunities with deadlines in 30, 14, 7, 1 days
  const alertWindows = [
    { days: 30, type: "deadline_30d" },
    { days: 14, type: "deadline_14d" },
    { days: 7, type: "deadline_7d" },
    { days: 1, type: "deadline_1d" },
  ]

  const stats = { checked: 0, alerts_sent: 0, errors: 0 }

  for (const window of alertWindows) {
    const targetDate = format(addDays(today, window.days), "yyyy-MM-dd")

    // Get opportunities with this deadline
    const { data: opps } = await adminSupabase
      .from("opportunities")
      .select("id, title, deadline, apply_url")
      .eq("deadline", targetDate)
      .eq("status", "open")

    if (!opps?.length) continue

    stats.checked += opps.length

    // For each opportunity, find users who have bookmarked it or have matching profiles
    for (const opp of opps) {
      // Check if alert already sent
      const { data: existing } = await adminSupabase
        .from("alerts")
        .select("id")
        .eq("opportunity_id", opp.id)
        .eq("alert_type", window.type)
        .not("sent_at", "is", null)
        .single()

      if (existing) continue

      // Get bookmarking users
      const { data: bookmarks } = await adminSupabase
        .from("bookmarks")
        .select("user_id")
        .eq("opportunity_id", opp.id)

      if (!bookmarks?.length) continue

      for (const { user_id } of bookmarks) {
        // Get user email
        const { data: user } = await adminSupabase
          .from("users")
          .select("email, full_name, digest_frequency")
          .eq("id", user_id)
          .single()

        if (!user || user.digest_frequency === "never") continue

        // Send email via Brevo
        try {
          await sendBrevoEmail({
            to: user.email,
            name: user.full_name ?? "Scholar",
            subject: `⏰ Deadline in ${window.days} day${window.days > 1 ? "s" : ""}: ${opp.title}`,
            body: `
              <h2>Deadline Reminder</h2>
              <p>Hi ${user.full_name ?? "Scholar"},</p>
              <p>The deadline for <strong>${opp.title}</strong> is in <strong>${window.days} day${window.days > 1 ? "s" : ""}</strong> (${targetDate}).</p>
              <p><a href="${opp.apply_url}" style="background:#2563eb;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:12px;">Apply Now</a></p>
              <p style="margin-top:16px;font-size:12px;color:#666;">
                You're receiving this because you bookmarked this opportunity on ScholarAssist.<br>
                <a href="https://scholars.ahsansuny.com/dashboard">Manage your alerts</a>
              </p>
            `,
          })

          // Mark alert as sent
          await adminSupabase.from("alerts").upsert({
            user_id,
            opportunity_id: opp.id,
            alert_type: window.type,
            channel: "email",
            sent_at: new Date().toISOString(),
          })

          stats.alerts_sent++
        } catch (e) {
          stats.errors++
          console.error("Alert send error:", e)
        }
      }
    }
  }

  return NextResponse.json({ ok: true, date: todayStr, ...stats })
}

async function sendBrevoEmail({
  to, name, subject, body,
}: {
  to: string
  name: string
  subject: string
  body: string
}) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: "ScholarAssist", email: "noreply@scholars.ahsansuny.com" },
      to: [{ email: to, name }],
      subject,
      htmlContent: body,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Brevo error: ${err}`)
  }
}
