import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { adminSupabase } from "@/lib/supabase"
import { Navbar } from "@/components/Navbar"
import { SessionGuard } from "@/components/SessionGuard"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "ScholarAssist — Find Scholarships, PhD Positions & Fellowships",
  description:
    "AI-powered platform for Bangladeshi and global students to find fully funded scholarships, PhD positions, postdocs, fellowships, and grants worldwide. Personalised, nationality-aware results.",
  keywords: "scholarship Bangladesh, PhD position, fellowship, fully funded, DAAD, Chevening, EURAXESS",
  openGraph: {
    title: "ScholarAssist — Find Your Next Scholarship",
    description: "Discover 1000+ scholarships, PhDs, and fellowships — filtered for you.",
    url: "https://scholars.ahsansuny.com",
    siteName: "ScholarAssist",
    type: "website",
  },
}

async function getIsPro(): Promise<boolean> {
  try {
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get: (n: string) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
    )
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return false
    const { data } = await adminSupabase
      .from("subscriptions")
      .select("tier")
      .eq("user_id", session.user.id)
      .single()
    // Student tier (Mentorship Program) gets the same Pro-equivalent
    // session privilege — no 10-minute lockout.
    return data?.tier === "pro" || data?.tier === "student"
  } catch {
    return false
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const isPro = await getIsPro()

  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-50 text-gray-900 min-h-screen`}>
        <Navbar />
        <SessionGuard isPro={isPro} />
        <main>{children}</main>
        <footer className="mt-16 border-t bg-white py-8 text-center text-sm text-gray-500">
          <p>© 2026 ScholarAssist by Ahsan Suny · scholars.ahsansuny.com</p>
          <p className="mt-1">Helping students worldwide find fully funded opportunities</p>
        </footer>
      </body>
    </html>
  )
}
