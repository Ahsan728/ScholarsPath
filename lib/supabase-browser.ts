import { createBrowserClient } from "@supabase/ssr"

/**
 * Browser-side Supabase client.
 *
 * Uses createBrowserClient from @supabase/ssr (NOT plain createClient from
 * @supabase/supabase-js). The difference is critical:
 *
 *   - Plain createClient stores the session in localStorage only.
 *     The server-side middleware reads cookies and never sees the session,
 *     so users get redirected to /auth/login even when "logged in".
 *
 *   - createBrowserClient syncs the session to BOTH localStorage AND cookies,
 *     so middleware, server components, and API routes all see the same auth.
 *
 * Symptoms when this was wrong:
 *   - /account redirected to login despite being logged in
 *   - /upgrade redirected to login
 *   - Sign-out left navbar showing as logged in
 *   - Tier checks in middleware failed
 */
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
