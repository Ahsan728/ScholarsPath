import { NextRequest, NextResponse } from "next/server"
import { updateMatchSessionEmail } from "@/lib/match"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { session_id, email } = body

    if (!session_id || typeof session_id !== "string") {
      return NextResponse.json({ error: "session_id is required" }, { status: 400 })
    }
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "email is required" }, { status: 400 })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 })
    }

    await updateMatchSessionEmail(session_id, email.trim().toLowerCase())
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Match register error:", error)
    return NextResponse.json({ error: "Registration failed. Please try again." }, { status: 500 })
  }
}
