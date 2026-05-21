import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/"

  if (code) {
    const response = NextResponse.redirect(new URL(next, req.url))
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get:    (n: string) => req.cookies.get(n)?.value,
          set:    (n: string, v: string, o: any) => response.cookies.set(n, v, o),
          remove: (n: string) => response.cookies.delete(n),
        },
      }
    )
    await supabase.auth.exchangeCodeForSession(code)
    return response
  }

  return NextResponse.redirect(new URL("/auth/login", req.url))
}
