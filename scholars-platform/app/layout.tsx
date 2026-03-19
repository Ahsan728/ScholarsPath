import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Navbar } from "@/components/Navbar"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "ScholarPath — Find Scholarships, PhD Positions & Fellowships",
  description:
    "AI-powered platform for Bangladeshi and global students to find fully funded scholarships, PhD positions, postdocs, fellowships, and grants worldwide. Personalised, nationality-aware results.",
  keywords: "scholarship Bangladesh, PhD position, fellowship, fully funded, DAAD, Chevening, EURAXESS",
  openGraph: {
    title: "ScholarPath — Find Your Next Scholarship",
    description: "Discover 1000+ scholarships, PhDs, and fellowships — filtered for you.",
    url: "https://scholars.ahsansuny.com",
    siteName: "ScholarPath",
    type: "website",
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-50 text-gray-900 min-h-screen`}>
        <Navbar />
        <main>{children}</main>
        <footer className="mt-16 border-t bg-white py-8 text-center text-sm text-gray-500">
          <p>© 2026 ScholarPath by Ahsan Suny · scholars.ahsansuny.com</p>
          <p className="mt-1">Helping students worldwide find fully funded opportunities</p>
        </footer>
      </body>
    </html>
  )
}
