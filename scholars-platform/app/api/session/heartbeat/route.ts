import { NextRequest, NextResponse } from "next/server"
import { updateSessionSeconds } from "@/lib/tier"

export async function POST(req: NextRequest) {
  try {
    const sessionId = req.cookies.get("sa_sid")?.value
    if (!sessionId) return NextResponse.json({ ok: false })

    const { seconds } = await req.json()
    if (typeof seconds !== "number" || seconds < 0) {
      return NextResponse.json({ ok: false })
    }

    await updateSessionSeconds(sessionId, Math.floor(seconds))
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false })
  }
}
