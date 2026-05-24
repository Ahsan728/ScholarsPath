"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { GraduationCap, ChevronDown, Menu, X, Crown, Sparkles } from "lucide-react"
import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase-browser"
import type { UserTier } from "@/types"

const OPPORTUNITY_LINKS = [
  { href: "/?type=scholarship", label: "Scholarships" },
  { href: "/?type=phd", label: "PhD Positions" },
  { href: "/?type=fellowship", label: "Fellowships" },
  { href: "/?type=internship", label: "Internships" },
  { href: "/?for=BD", label: "For BD Students" },
]

const PROGRAM_LINKS = [
  { href: "/programs?level=bachelor", label: "Bachelor Programs" },
  { href: "/programs?level=master", label: "Master Programs" },
  { href: "/programs?level=language", label: "Language Programs" },
]

interface AuthUser {
  id: string
  email: string
  name?: string
  tier: UserTier
}

// Tier badge styling (tiny pill next to user initials)
function TierBadge({ tier }: { tier: UserTier }) {
  if (tier === "student") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-purple-100 text-purple-700 text-[10px] font-bold px-1.5 py-0.5">
        <Sparkles className="h-2.5 w-2.5" /> STUDENT
      </span>
    )
  }
  if (tier === "pro") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold px-1.5 py-0.5">
        <Crown className="h-2.5 w-2.5" /> PRO
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-500 text-[10px] font-bold px-1.5 py-0.5">
      FREE
    </span>
  )
}

export function Navbar() {
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [opportunitiesOpen, setOpportunitiesOpen] = useState(false)
  const [programsOpen, setProgramsOpen] = useState(false)
  const [userDropOpen, setUserDropOpen] = useState(false)
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)

  // Fetch tier from a lightweight API endpoint that hits subscriptions table.
  async function loadTier(userId: string): Promise<UserTier> {
    try {
      const r = await fetch(`/api/auth/me`, { cache: "no-store" })
      if (!r.ok) return "free"
      const j = await r.json()
      return (j.tier as UserTier) ?? "free"
    } catch { return "free" }
  }

  useEffect(() => {
    let mounted = true

    async function refreshAuth() {
      const { data } = await supabase.auth.getUser()
      if (!mounted) return
      if (data.user) {
        const tier = await loadTier(data.user.id)
        if (!mounted) return
        setAuthUser({
          id: data.user.id,
          email: data.user.email ?? "",
          name: data.user.user_metadata?.full_name,
          tier,
        })
      } else {
        setAuthUser(null)
      }
    }

    refreshAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      // Re-fetch on every auth change. Includes SIGNED_OUT which sets authUser to null.
      refreshAuth()
      // Refresh server-rendered parts of the layout (e.g., SessionGuard isPro).
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "TOKEN_REFRESHED") {
        router.refresh()
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [router])

  function closeAll() {
    setOpportunitiesOpen(false)
    setProgramsOpen(false)
    setMobileOpen(false)
    setUserDropOpen(false)
  }

  async function handleSignOut() {
    closeAll()
    // Client signOut clears cookies (because we use createBrowserClient).
    // onAuthStateChange will fire SIGNED_OUT → setAuthUser(null) + router.refresh().
    await supabase.auth.signOut()
    router.push("/")
    router.refresh()
  }

  const initials = authUser
    ? (authUser.name ?? authUser.email)[0].toUpperCase()
    : "?"

  const displayName = authUser
    ? (authUser.name?.split(" ")[0] ?? authUser.email.split("@")[0])
    : ""

  const isStudent = authUser?.tier === "student"

  return (
    <nav className="sticky top-0 z-50 border-b bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 font-bold text-blue-700" onClick={closeAll}>
          <GraduationCap className="h-6 w-6" />
          <span>ScholarAssist</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1 text-sm text-gray-600">
          {/* Opportunities dropdown */}
          <div className="relative" onMouseLeave={() => setOpportunitiesOpen(false)}>
            <button
              onMouseEnter={() => { setOpportunitiesOpen(true); setProgramsOpen(false) }}
              className="flex items-center gap-1 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors font-medium"
            >
              Opportunities <ChevronDown className="h-3.5 w-3.5 mt-0.5" />
            </button>
            {opportunitiesOpen && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-gray-200 rounded-xl shadow-lg py-1">
                {OPPORTUNITY_LINKS.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={closeAll}
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-blue-700"
                  >
                    {l.label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Programs dropdown */}
          <div className="relative" onMouseLeave={() => setProgramsOpen(false)}>
            <button
              onMouseEnter={() => { setProgramsOpen(true); setOpportunitiesOpen(false) }}
              className="flex items-center gap-1 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors font-medium"
            >
              Programs <ChevronDown className="h-3.5 w-3.5 mt-0.5" />
            </button>
            {programsOpen && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-gray-200 rounded-xl shadow-lg py-1">
                {PROGRAM_LINKS.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={closeAll}
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-blue-700"
                  >
                    {l.label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Mentorship link */}
          <Link
            href="/mentorship"
            onClick={closeAll}
            className="px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors font-medium"
          >
            Mentorship
          </Link>

          {/* Pricing link — always visible so logged-in free users can find it */}
          <Link
            href="/pricing"
            onClick={closeAll}
            className="px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors font-medium"
          >
            Pricing
          </Link>

          {/* Smart Match CTA */}
          <Link
            href="/match"
            onClick={closeAll}
            className="ml-2 rounded-full bg-blue-600 px-4 py-1.5 font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            Smart Match
          </Link>

          {/* Auth UI */}
          {authUser ? (
            <div className="relative ml-2" onMouseLeave={() => setUserDropOpen(false)}>
              <button
                onMouseEnter={() => setUserDropOpen(true)}
                onClick={() => setUserDropOpen((v) => !v)}
                className="flex items-center gap-2 pl-2 pr-2.5 py-1 rounded-full border border-gray-200 hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700"
              >
                <div className="h-7 w-7 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                  {initials}
                </div>
                <div className="flex flex-col items-start leading-tight">
                  <span className="max-w-[80px] truncate text-xs">{displayName}</span>
                  <TierBadge tier={authUser.tier} />
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
              </button>
              {userDropOpen && (
                <div className="absolute top-full right-0 mt-1 w-48 bg-white border border-gray-200 rounded-xl shadow-lg py-1">
                  <Link href="/account" onClick={closeAll} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    Account
                  </Link>
                  {isStudent && (
                    <Link href="/evaluate" onClick={closeAll} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                      CV Evaluation
                    </Link>
                  )}
                  <Link href="/pricing" onClick={closeAll} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    Pricing
                  </Link>
                  <Link href="/mentorship" onClick={closeAll} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    Mentorship
                  </Link>
                  <div className="border-t border-gray-100 mt-1 pt-1">
                    <button
                      onClick={handleSignOut}
                      className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 ml-2">
              <Link
                href="/auth/login"
                onClick={closeAll}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Login
              </Link>
              <Link
                href="/auth/signup"
                onClick={closeAll}
                className="px-3 py-1.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                Sign Up
              </Link>
            </div>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 rounded-lg hover:bg-gray-100"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t bg-white px-4 py-3 space-y-1">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-2 pt-1 pb-0.5">Opportunities</p>
          {OPPORTUNITY_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={closeAll}
              className="block px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
            >
              {l.label}
            </Link>
          ))}
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-2 pt-3 pb-0.5">Programs</p>
          {PROGRAM_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={closeAll}
              className="block px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="/mentorship"
            onClick={closeAll}
            className="block px-3 py-2 rounded-lg text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 mt-3"
          >
            🎯 Mentorship Program
          </Link>
          <Link
            href="/pricing"
            onClick={closeAll}
            className="block px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
          >
            Pricing
          </Link>
          <div className="pt-3 pb-1">
            <Link
              href="/match"
              onClick={closeAll}
              className="block w-full text-center rounded-full bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
            >
              Smart Match
            </Link>
          </div>

          {/* Mobile auth section */}
          <div className="border-t border-gray-100 pt-3 pb-1 space-y-1">
            {authUser ? (
              <>
                <div className="flex items-center gap-2 px-3 py-2">
                  <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-700 text-sm font-bold flex items-center justify-center">
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{authUser.name ?? authUser.email}</p>
                    {authUser.name && <p className="text-xs text-gray-400 truncate">{authUser.email}</p>}
                  </div>
                  <TierBadge tier={authUser.tier} />
                </div>
                <Link href="/account" onClick={closeAll} className="block px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                  Account
                </Link>
                {isStudent && (
                  <Link href="/evaluate" onClick={closeAll} className="block px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                    CV Evaluation
                  </Link>
                )}
                <button
                  onClick={handleSignOut}
                  className="block w-full text-left px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <div className="flex gap-2">
                <Link
                  href="/auth/login"
                  onClick={closeAll}
                  className="flex-1 text-center rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Login
                </Link>
                <Link
                  href="/auth/signup"
                  onClick={closeAll}
                  className="flex-1 text-center rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Sign Up
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  )
}
