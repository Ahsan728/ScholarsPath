"use client"

import { useEffect, useRef, useState } from "react"
import { UpgradeModal } from "./UpgradeModal"

const LIMIT_SECONDS = 10 * 60  // 10 minutes
const HEARTBEAT_MS  = 30_000   // sync to server every 30s
const STORAGE_KEY   = "sa_sess_s"   // seconds used today
const STORAGE_DATE  = "sa_sess_d"   // date string YYYY-MM-DD

interface Props {
  isPro: boolean
}

export function SessionGuard({ isPro }: Props) {
  const [blocked, setBlocked] = useState(false)
  const secondsRef  = useRef(0)
  const activeRef   = useRef(true)
  const tickRef     = useRef<ReturnType<typeof setInterval>>()
  const beatRef     = useRef<ReturnType<typeof setInterval>>()

  useEffect(() => {
    if (isPro) return

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
  }, [isPro])

  if (!blocked) return null
  return <UpgradeModal reason="session" />
}
