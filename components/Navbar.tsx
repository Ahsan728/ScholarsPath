"use client"

import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"
import { GraduationCap, Search, Menu, X, Crown, Sparkles, ChevronDown } from "lucide-react"
import { useState, useEffect, useRef } from "react"
import { supabase } from "@/lib/supabase-browser"
import type { UserTier } from "@/types"

interface AuthUser {
  id: string
  email: string
  name?: string
  tier: UserTier
}

function TierBadge({ tier }: { tier: UserTier }) {
  if (tier === "student") return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-purple-100 text-purple-700 text-[10px] font-bold px-1.5 py-0.5">
      <Sparkles className="h-2.5 w-2.5" /> STUDENT
    </span>
  )
  if (tier === "pro") return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold px-1.5 py-0.5">
      <Crown className="h-2.5 w-2.5" /> PRO
    </span>
  )
  return <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-500 text-[10px] font-bold px-1.5 py-0.5">FREE</span>
}

const NAV_LINKS = [
  { href: "/programs", label: "Programs" },
  { href: "/programs?emjm_only=true", label: "Erasmus Mundus", highlight: true },
  { href: "/?type=scholarship", label: "Scholarships" },
]

export function Navbar() {
  const router = useRouter()
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [userDropOpen, setUserDropOpen] = useState(false)
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  async function loadTier(): Promise<UserTier> {
    try {
      const r = await fetch("/api/auth/me", { cache: "no-store" })
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
        const tier = await loadTier()
        if (!mounted) return
        setAuthUser({ id: data.user.id, email: data.user.email ?? "", name: data.user.user_metadata?.full_name, tier })
      } else {
        setAuthUser(null)
      }
    }
    refreshAuth()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      refreshAuth()
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "TOKEN_REFRESHED") router.refresh()
    })
    return () => { mounted = false; subscription.unsubscribe() }
  }, [router])

  function closeAll() { setMobileOpen(false); setUserDropOpen(false); setSearchOpen(false) }

  async function handleSignOut() {
    closeAll()
    await supabase.auth.signOut()
    router.push("/")
    router.refresh()
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (searchQuery.trim()) {
      router.push(`/programs?q=${encodeURIComponent(searchQuery.trim())}`)
      closeAll()
    }
  }

  useEffect(() => { if (searchOpen && searchRef.current) searchRef.current.focus() }, [searchOpen])

  const initials = authUser ? (authUser.name ?? authUser.email)[0].toUpperCase() : "?"
  const displayName = authUser ? (authUser.name?.split(" ")[0] ?? authUser.email.split("@")[0]) : ""
  const isStudent = authUser?.tier === "student"

  return (
    <nav className="sticky top-0 z-50 border-b bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-1 px-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 font-bold text-blue-700 shrink-0" onClick={closeAll}>
          <GraduationCap className="h-6 w-6" />
          <span className="hidden sm:inline">ScholarAssist</span>
        </Link>

        {/* Desktop search bar */}
        <form onSubmit={handleSearch} className="hidden md:flex items-center flex-1 max-w-md mx-4">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search 7,500+ programs..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-full bg-gray-50 focus:bg-white focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none transition-all"
            />
          </div>
        </form>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-0.5 text-sm ml-auto">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={closeAll}
              className={`px-3 py-2 rounded-lg font-medium transition-colors ${
                link.highlight
                  ? "text-blue-700 hover:bg-blue-50"
                  : pathname === link.href.split("?")[0]
                    ? "text-blue-700 bg-blue-50"
                    : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {link.highlight && <span className="mr-1">✨</span>}
              {link.label}
            </Link>
          ))}

          {/* Smart Match CTA */}
          <Link
            href="/match"
            onClick={closeAll}
            className="ml-1 rounded-full bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-1.5 text-sm font-semibold text-white hover:from-blue-700 hover:to-blue-800 transition-all shadow-sm hover:shadow"
          >
            Smart Match
          </Link>

          {/* Auth */}
          {authUser ? (
            <div className="relative ml-2" onMouseLeave={() => setUserDropOpen(false)}>
              <button
                onMouseEnter={() => setUserDropOpen(true)}
                onClick={() => setUserDropOpen((v) => !v)}
                className="flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-full border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                <div className="h-7 w-7 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                  {initials}
                </div>
                <span className="text-xs font-medium text-gray-700 max-w-[70px] truncate hidden lg:inline">{displayName}</span>
                <ChevronDown className="h-3 w-3 text-gray-400" />
              </button>
              {userDropOpen && (
                <div className="absolute top-full right-0 mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 z-50">
                  <div className="px-4 py-2 border-b border-gray-100">
                    <p className="text-sm font-medium text-gray-900 truncate">{authUser.name ?? authUser.email}</p>
                    <div className="mt-1"><TierBadge tier={authUser.tier} /></div>
                  </div>
                  <Link href="/account" onClick={closeAll} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">My Account</Link>
                  <Link href="/programs" onClick={closeAll} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Browse Programs</Link>
                  {isStudent && (
                    <Link href="/evaluate" onClick={closeAll} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">CV Evaluation</Link>
                  )}
                  <Link href="/mentorship" onClick={closeAll} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Mentorship Program</Link>
                  <Link href="/pricing" onClick={closeAll} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Pricing & Plans</Link>
                  <div className="border-t border-gray-100 mt-1 pt-1">
                    <button onClick={handleSignOut} className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 ml-2">
              <Link href="/auth/login" onClick={closeAll}
                className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
                Login
              </Link>
              <Link href="/auth/signup" onClick={closeAll}
                className="px-3 py-1.5 text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 rounded-lg transition-colors">
                Sign Up
              </Link>
            </div>
          )}
        </div>

        {/* Mobile: search + hamburger */}
        <div className="flex items-center gap-1 ml-auto md:hidden">
          <button onClick={() => { setSearchOpen(s => !s); setMobileOpen(false) }}
            className="p-2 rounded-lg hover:bg-gray-100" aria-label="Search">
            <Search className="h-5 w-5 text-gray-600" />
          </button>
          <button onClick={() => { setMobileOpen(v => !v); setSearchOpen(false) }}
            className="p-2 rounded-lg hover:bg-gray-100" aria-label="Menu">
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile search bar (slide-down) */}
      {searchOpen && (
        <div className="md:hidden border-t bg-white px-4 py-3">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                ref={searchRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search programs..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-full bg-gray-50 focus:bg-white focus:border-blue-400 outline-none"
              />
            </div>
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-full">
              Go
            </button>
          </form>
        </div>
      )}

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t bg-white shadow-lg">
          <div className="px-4 py-4 space-y-1">
            {/* Primary nav */}
            <Link href="/programs" onClick={closeAll}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-800 hover:bg-gray-50">
              📚 All Programs <span className="ml-auto text-xs text-gray-400">7,500+</span>
            </Link>
            <Link href="/programs?emjm_only=true" onClick={closeAll}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-blue-700 hover:bg-blue-50">
              ✨ Erasmus Mundus <span className="ml-auto text-xs text-blue-400">Fully funded</span>
            </Link>
            <Link href="/?type=scholarship" onClick={closeAll}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-800 hover:bg-gray-50">
              🎓 Scholarships
            </Link>

            {/* CTA */}
            <div className="pt-2">
              <Link href="/match" onClick={closeAll}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-full bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold text-sm shadow-sm">
                🎯 Smart Match — Find Your Best Fit
              </Link>
            </div>

            {/* Secondary */}
            <div className="pt-3 border-t border-gray-100 space-y-1">
              <Link href="/mentorship" onClick={closeAll}
                className="block px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                Mentorship Program
              </Link>
              <Link href="/pricing" onClick={closeAll}
                className="block px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                Pricing & Plans
              </Link>
            </div>

            {/* Auth */}
            <div className="pt-3 border-t border-gray-100">
              {authUser ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-3 px-3 py-2">
                    <div className="h-9 w-9 rounded-full bg-blue-100 text-blue-700 text-sm font-bold flex items-center justify-center">
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{authUser.name ?? authUser.email}</p>
                      <TierBadge tier={authUser.tier} />
                    </div>
                  </div>
                  <Link href="/account" onClick={closeAll} className="block px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                    My Account
                  </Link>
                  {isStudent && (
                    <Link href="/evaluate" onClick={closeAll} className="block px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                      CV Evaluation
                    </Link>
                  )}
                  <button onClick={handleSignOut}
                    className="block w-full text-left px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50">
                    Sign Out
                  </button>
                </div>
              ) : (
                <div className="flex gap-2 pt-1">
                  <Link href="/auth/login" onClick={closeAll}
                    className="flex-1 text-center py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50">
                    Login
                  </Link>
                  <Link href="/auth/signup" onClick={closeAll}
                    className="flex-1 text-center py-2.5 rounded-lg bg-gray-900 text-sm font-semibold text-white hover:bg-gray-800">
                    Sign Up
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  )
}
