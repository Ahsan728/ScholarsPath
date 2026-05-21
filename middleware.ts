import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname
  let response = NextResponse.next({ request })

  // ── Set session-ID cookie for free-tier tracking ─────────
  if (!request.cookies.get("sa_sid")?.value) {
    const sid = crypto.randomUUID()
    response.cookies.set("sa_sid", sid, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365, // 1 year
      path: "/",
    })
  }

  // ── Admin route protection ────────────────────────────────
  if (path.startsWith("/admin") && !path.startsWith("/admin/login")) {
    const adminCookie = request.cookies.get("admin_auth")?.value
    if (adminCookie !== process.env.ADMIN_SECRET) {
      return NextResponse.redirect(new URL("/admin/login", request.url))
    }
    return response
  }

  // ── Account + Evaluate: require Supabase auth ─────────────
  if (path.startsWith("/account") || path.startsWith("/evaluate")) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return request.cookies.get(name)?.value },
          set(name: string, value: string, options: any) { response.cookies.set(name, value, options) },
          remove(name: string) { response.cookies.delete(name) },
        },
      }
    )
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      const loginUrl = new URL("/auth/login", request.url)
      loginUrl.searchParams.set("redirect", path)
      return NextResponse.redirect(loginUrl)
    }
  }

  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|svg|ico)$).*)",
  ],
}
