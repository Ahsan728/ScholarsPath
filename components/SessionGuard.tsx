"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { UpgradeModal } from "./UpgradeModal"

const LIMIT_SECONDS = 10 * 60  // 10 minutes
const HEARTBEAT_MS  = 30_000   // sync to server every 30s
const STORAGE_KEY   = "sa_sess_s"   // seconds used today
const STORAGE_DATE  = "sa_sess_d"   // date string YYYY-MM-DD

// Pages users MUST be able to reach even after the free session expires:
// auth (signup/login), pricing (see plans), upgrade (submit payment),
// mentorship (learn about the program), admin (the admin panel),
// and all API routes (heartbeats, form submits, etc.).
const EXEMPT_PREFIXES = ["/auth", "/pricing", "/upgrade", "/mentorship", "/admin", "/api"]

function isExemptPath(path: string | null): boolean {
  if (!path) return false
  return EXEMPT_PREFIXES.some(p => path === p || path.startsWith(p + "/"))
}

interface Props {
  isPro: boolean
}

export function SessionGuard({ isPro }: Props) {
  const pathname = usePathname()
  const [blocked, setBlocked] = useState(false)
  const secondsRef  = useRef(0)
  const activeRef   = useRef(true)
  const tickRef     = useRef<ReturnType<typeof setInterval>>()
  const beatRef     = useRef<ReturnType<typeof setInterval>>()

  useEffect(() => {
    if (isPro) return
    // Skip the timer entirely on exempt paths — counter keeps its stored value
    // in localStorage and resumes when user navigates back to a gated page.
    if (isExemptPath(pathname)) return

    const today = new Date().toISOString().split("T")[0]
    const storedDate = localStorage.getItem(STORAGE_DATE)
    const storedSecs = parseInt(localStorage.getItem(STORAGE_KEY) ?? "0", 10)

    if (storedDate !== today) {
      localStorage.setItem(STORAGE_DATE, today)
      localStorage.setItem(STORAGE_KEY, "0")
      secondsRef.current = 0
    } else {
      secondsRef.current = storedSecs
      if (storedSecs >= LIMIT_SECONDS) {
        setBlocked(true)
        return
      }
    }

    function onVisibility() {
      activeRef.current = document.visibilityState === "visible"
    }
    document.addEventListener("visibilitychange", onVisibility)

    tickRef.current = setInterval(() => {
      if (!activeRef.current) return
      secondsRef.current += 1
      localStorage.setItem(STORAGE_KEY, String(secondsRef.current))
      if (secondsRef.current >= LIMIT_SECONDS) {
        setBlocked(true)
        clearInterval(tickRef.current)
        clearInterval(beatRef.current)
      }
    }, 1_000)

    beatRef.current = setInterval(async () => {
      try {
        await fetch("/api/session/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seconds: secondsRef.current }),
        })
      } catch {}
    }, HEARTBEAT_MS)

    return () => {
      clearInterval(tickRef.current)
      clearInterval(beatRef.current)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [isPro, pathname])

  // Even if the timer expired, never render the blocking overlay on exempt pages.
  if (!blocked || isExemptPath(pathname)) return null
  return <UpgradeModal reason="session" />
}
