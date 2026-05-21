import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"

export async function POST(req: NextRequest) {
  const response = NextResponse.redirect(new URL("/", req.url))
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
  await supabase.auth.signOut()
  return response
}
