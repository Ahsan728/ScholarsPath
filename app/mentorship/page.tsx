import Link from "next/link"
import { Sparkles, CheckCircle2, Users, Calendar, FileText, MessageCircle, Mail, ArrowRight, Award } from "lucide-react"

// Static landing page for the Complete Mentorship Program.
// Source: https://www.ahsansuny.com/complete-mentorship-program

const APPLY_FORM_URL = "https://www.ahsansuny.com/complete-mentorship-program"
const WHATSAPP_URL   = "https://wa.me/34613593236"
const MENTOR_EMAIL   = "mentors.career.abroad26@gmail.com"

const MODULES = [
  { title: "Profile Building",        desc: "CV, transcripts, research narrative" },
  { title: "Academic Emailing",       desc: "Outreach to professors and labs" },
  { title: "SOP & Motivation Letters",desc: "Frameworks, drafts, feedback rounds" },
  { title: "University Applications", desc: "Plan A/B/C shortlist, deadlines, trackers" },
  { title: "Scholarships",            desc: "Eligibility mapping, fully funded options" },
  { title: "Visa Preparation",        desc: "Financial docs, interview prep" },
]

const BONUSES = [
  "SOP book + PDF resources",
  "Curated university list",
  "Curated scholarship list",
  "Sample successful applications",
  "Email & SOP templates",
  "Application trackers",
  "Mock interview preparation",
]

const FAQS = [
  {
    q: "Can I pay in installments?",
    a: "Yes — installment plans are available. Message the mentor on WhatsApp to set this up.",
  },
  {
    q: "How do I pay €150 from Bangladesh?",
    a: "Easiest is bKash Send Money or local bank transfer. Equivalent in BDT will be calculated at the current rate. WhatsApp the mentor and we'll guide you through it.",
  },
  {
    q: "What if my CGPA is below the minimum?",
    a: "Masters minimum is 2.80 CGPA, Bachelors minimum is 4.5 GPA (HSC). If you're close, message us — we may still accept based on overall profile and research/work experience.",
  },
  {
    q: "Is this a service that applies for me?",
    a: "No. The Complete Mentorship Program is student-led with mentor support — you handle the applications yourself, and mentors review, advise, and guide you at every step. This builds lasting skills, unlike agency-based services.",
  },
  {
    q: "What do I get on ScholarAssist after enrolling?",
    a: "Mentorship students automatically get Pro-level access on ScholarAssist (unlimited browsing, 15 AI Chat queries/month) PLUS exclusive access to CV & Transcript Evaluation — 3 evaluations per month, not available to regular Pro subscribers.",
  },
]

export default function MentorshipPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-700 via-indigo-700 to-purple-800 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.1),transparent_50%)]" />
        <div className="relative max-w-4xl mx-auto px-6 py-16 sm:py-20 text-center">
          <div className="inline-flex items-center gap-2 bg-white/15 rounded-full px-4 py-1.5 mb-5 text-xs font-medium">
            <Sparkles className="h-3.5 w-3.5" /> Complete Mentorship Program
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-4 leading-tight">
            End-to-end guidance for one full application cycle
          </h1>
          <p className="text-base sm:text-lg text-blue-100 max-w-2xl mx-auto mb-3">
            30 structured sessions with 6 mentors across USA &amp; Europe. Apply yourself — with mentors by your side.
          </p>
          <p className="text-sm text-blue-200 italic mb-7" lang="bn">
            নিজের হাতে অ্যাপ্লাই করুন — মেন্টররা থাকবেন পাশে
          </p>

          <div className="inline-flex items-baseline gap-2 bg-white/20 rounded-full px-5 py-2 mb-7">
            <span className="text-3xl font-extrabold">€150</span>
            <span className="text-sm text-blue-100">·  installments available</span>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href={APPLY_FORM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-white text-blue-700 font-semibold rounded-xl px-6 py-3 text-sm hover:bg-blue-50 transition-colors"
            >
              Apply now <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-green-500 text-white font-semibold rounded-xl px-6 py-3 text-sm hover:bg-green-600 transition-colors"
            >
              <MessageCircle className="h-4 w-4" /> WhatsApp the Mentor
            </a>
          </div>
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-6 py-12 space-y-12">
        {/* What you get */}
        <section>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">What you get inside</h2>
          <p className="text-sm text-gray-500 mb-6">
            30 sessions across 6 modules — 10 recorded + 20 live weekend sessions (Zoom / Google Meet).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {MODULES.map((m, i) => (
              <div key={m.title} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-700 font-bold text-sm shrink-0">
                    {i + 1}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-0.5">{m.title}</h3>
                    <p className="text-sm text-gray-500">{m.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Format + Mentors row */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="h-5 w-5 text-blue-600" />
              <h3 className="font-bold text-gray-900">Format &amp; duration</h3>
            </div>
            <ul className="text-sm text-gray-600 space-y-1.5">
              <li>• 10 recorded sessions (watch anytime)</li>
              <li>• 20 live weekend sessions via Zoom / Google Meet</li>
              <li>• Covers one full application cycle</li>
              <li>• Lifetime access to the recorded library</li>
            </ul>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-3">
              <Users className="h-5 w-5 text-blue-600" />
              <h3 className="font-bold text-gray-900">The mentors</h3>
            </div>
            <p className="text-sm text-gray-600">
              <strong>6 mentors</strong> based in USA and Europe with successful international application backgrounds. Each module is led by the mentor most experienced in that area.
            </p>
          </div>
        </section>

        {/* Bonus materials */}
        <section className="bg-white rounded-2xl border border-gray-200 p-7">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="h-5 w-5 text-blue-600" />
            <h2 className="text-xl font-bold text-gray-900">Bonus materials included</h2>
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm text-gray-700">
            {BONUSES.map((b) => (
              <li key={b} className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Eligibility */}
        <section className="bg-amber-50 border border-amber-200 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-3">
            <Award className="h-5 w-5 text-amber-700" />
            <h2 className="text-xl font-bold text-amber-900">Eligibility</h2>
          </div>
          <ul className="text-sm text-amber-900 space-y-1.5">
            <li>• <strong>Masters applicants:</strong> minimum 2.80 CGPA (undergraduate)</li>
            <li>• <strong>Bachelors applicants:</strong> minimum 4.5 GPA (HSC level)</li>
            <li>• Self-motivated — you want to handle your own applications with expert support, not have an agency do it for you</li>
          </ul>
        </section>

        {/* Platform perk callout — the integration piece */}
        <section className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-2xl p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 shrink-0">
              <Sparkles className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold mb-2">Bonus: free Pro access on ScholarAssist</h2>
              <p className="text-sm text-blue-100 mb-4">
                Mentorship students get free Pro access on this platform
                (unlimited browsing, 15 AI Chat queries/month) PLUS
                <strong className="text-white"> exclusive CV &amp; Transcript Evaluation</strong> — 3 evaluations per month,
                a feature not available to regular Pro subscribers.
              </p>
              <p className="text-sm text-blue-100">
                After you enroll, your email is added to our student allowlist.
                Sign up at <Link href="/auth/signup" className="font-semibold text-white underline">/auth/signup</Link> with the same email you used for enrollment, and Pro features unlock automatically.
              </p>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="text-center bg-white rounded-2xl border border-gray-200 p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Investment</h2>
          <p className="text-5xl font-extrabold text-blue-600 mb-1">€150</p>
          <p className="text-sm text-gray-500 mb-6">One full application cycle · installment plans available</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href={APPLY_FORM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-blue-600 text-white font-semibold rounded-xl px-6 py-3 text-sm hover:bg-blue-700 transition-colors"
            >
              Apply now <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-green-500 text-white font-semibold rounded-xl px-6 py-3 text-sm hover:bg-green-600 transition-colors"
            >
              <MessageCircle className="h-4 w-4" /> WhatsApp the Mentor
            </a>
          </div>
        </section>

        {/* FAQ */}
        <section>
          <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">Frequently asked questions</h2>
          <div className="space-y-5">
            {FAQS.map((f) => (
              <div key={f.q} className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="font-semibold text-gray-900 mb-1.5">{f.q}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Contact footer */}
        <section className="bg-gray-900 text-gray-100 rounded-2xl p-7 text-center">
          <h2 className="text-lg font-bold mb-3">Get in touch</h2>
          <div className="flex flex-col sm:flex-row gap-4 justify-center text-sm">
            <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 hover:text-blue-300">
              <MessageCircle className="h-4 w-4" /> WhatsApp: +34 613593236
            </a>
            <a href={`mailto:${MENTOR_EMAIL}`} className="inline-flex items-center gap-2 hover:text-blue-300">
              <Mail className="h-4 w-4" /> {MENTOR_EMAIL}
            </a>
          </div>
        </section>
      </div>
    </div>
  )
}
