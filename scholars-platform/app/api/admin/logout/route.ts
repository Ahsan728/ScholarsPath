import { NextResponse } from "next/server"

export async function POST() {
  const res = NextResponse.redirect(new URL("/admin/login", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"))
  res.cookies.delete("admin_auth")
  return res
}
