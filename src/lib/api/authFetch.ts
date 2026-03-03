/**
 * Authenticated fetch wrapper for JWT-protected API routes.
 *
 * Automatically attaches the current Supabase session's access token
 * as a Bearer Authorization header. Falls through without auth in
 * local dev (when Supabase is not configured).
 */

import { isSupabaseConfigured, getSupabase } from "@/lib/supabase";

/**
 * Get the current Supabase access token, or null if unavailable.
 */
export async function getAccessToken(): Promise<string | null> {
  if (!isSupabaseConfigured) return null;

  try {
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
