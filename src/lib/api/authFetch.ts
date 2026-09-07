/**
 * Authenticated fetch wrapper for JWT-protected API routes.
 *
 * Automatically attaches the current Supabase session's access token
 * as a Bearer Authorization header. Falls through without auth in
 * local dev (when Supabase is not configured).
 */

import { isSupabaseConfigured, getSupabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";

/** Bound on how long authHeaders() waits for the initial session restore. */
const AUTH_READY_TIMEOUT_MS = 3_000;

/**
 * Resolves once the auth store has completed its initial session check
 * (or after a bounded timeout), so a cold page load or an in-flight token
 * refresh doesn't race authHeaders() into building a request with no
 * Authorization header. Reuses the auth store's own dedup'd initialize()
 * — the store already subscribes to onAuthStateChange and awaits
 * supabase.auth.getSession() — rather than a second session-restore path.
 * Genuinely anonymous sessions still resolve (initialize() completes with
 * no user) and fall through without a header.
 */
export function waitForAuthSession(): Promise<void> {
  if (!isSupabaseConfigured) return Promise.resolve();
  if (useAuthStore.getState().initialized) return Promise.resolve();

  return Promise.race([
    useAuthStore.getState().initialize(),
    new Promise<void>((resolve) => setTimeout(resolve, AUTH_READY_TIMEOUT_MS)),
  ]);
}

/**
 * Get the current Supabase access token, or null if unavailable.
 */
export async function getAccessToken(): Promise<string | null> {
  if (!isSupabaseConfigured) return null;

  try {
    await waitForAuthSession();
    const supabase = getSupabase();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Build a headers object that includes Authorization if a token is available.
 * Merges with any extra headers provided.
 */
export async function authHeaders(
  extra?: Record<string, string>,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = { ...extra };
  const token = await getAccessToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}
