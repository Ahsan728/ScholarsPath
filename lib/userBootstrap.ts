import { adminSupabase } from "@/lib/supabase"

/**
 * Ensures a row exists in `public.users` for the given Supabase Auth user.
 *
 * Why this exists:
 *   Supabase Auth creates rows in `auth.users` automatically, but our schema
 *   has a separate `public.users` table with the same UUID as primary key.
 *   Several other tables (subscriptions, payment_requests, bookmarks)
 *   have foreign keys referencing `public.users(id)`. Without a matching
 *   row, any insert into those tables fails with:
 *     "violates foreign key constraint ..._user_id_fkey"
 *
 * Idempotent: safe to call on every signup/login.
 * Should be called early in auth flows BEFORE any FK-dependent insert.
 */
export async function ensureUserRow(authUser: {
  id: string
  email?: string | null
  user_metadata?: { full_name?: string | null } | null
}): Promise<void> {
  if (!authUser.email) return

  // Use upsert so concurrent calls don't race. We never overwrite full_name
  // if it was set later (e.g., user edited their profile) — `ignoreDuplicates`
  // would skip the row entirely. Instead we use onConflict to keep existing.
  await adminSupabase
    .from("users")
    .upsert(
      {
        id: authUser.id,
        email: authUser.email,
        full_name: authUser.user_metadata?.full_name ?? null,
      },
      { onConflict: "id", ignoreDuplicates: true }
    )
}
