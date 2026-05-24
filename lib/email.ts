/**
 * Brevo email helper. Used by:
 *  - /api/alerts (daily deadline emails)
 *  - /api/payments/submit (payment received confirmation)
 *  - /api/admin/payments/[id]/approve (payment approved)
 *  - /api/admin/payments/[id]/reject (payment rejected)
 *
 * Free tier: 300 emails/day. Configure BREVO_API_KEY in env.
 * Sender domain `scholars.ahsansuny.com` must be verified in Brevo dashboard.
 */
export interface SendEmailParams {
  to: string
  name?: string
  subject: string
  html: string
  // Defaults to ScholarAssist's no-reply address; override only for special cases.
  fromName?: string
  fromEmail?: string
}

export async function sendBrevoEmail({
  to,
  name,
  subject,
  html,
  fromName = "ScholarAssist",
  fromEmail = "noreply@scholars.ahsansuny.com",
}: SendEmailParams): Promise<void> {
  if (!process.env.BREVO_API_KEY) {
    console.warn("[email] BREVO_API_KEY not set — skipping email to", to)
    return
  }

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: fromName, email: fromEmail },
      to: [{ email: to, name: name ?? to }],
      subject,
      htmlContent: html,
    }),
  })

  if (!res.ok) {
    const errBody = await res.text().catch(() => "")
    throw new Error(`Brevo send failed (${res.status}): ${errBody.slice(0, 300)}`)
  }
}

/**
 * Minimal HTML email shell — keeps a consistent look across all our system emails.
 * Pass plain HTML body, get a wrapped email ready to send.
 */
export function emailLayout(opts: { heading: string; bodyHtml: string; ctaText?: string; ctaUrl?: string }): string {
  const cta = opts.ctaText && opts.ctaUrl
    ? `<p style="margin:28px 0;">
         <a href="${opts.ctaUrl}" style="background:#2563eb;color:#fff;padding:11px 22px;border-radius:8px;font-weight:600;font-size:14px;text-decoration:none;display:inline-block;">${opts.ctaText}</a>
       </p>`
    : ""
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;line-height:1.55;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;">
      <h1 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#111827;">${opts.heading}</h1>
      <div style="font-size:14px;color:#374151;">${opts.bodyHtml}</div>
      ${cta}
    </div>
    <p style="margin:20px 0 0;text-align:center;font-size:12px;color:#9ca3af;">ScholarAssist · scholars.ahsansuny.com</p>
  </div>
</body></html>`
}
