/**
 * Supabase client singleton — lazily initialized
 *
 * The client is only created on first access via `getSupabase()`.
 * This supports "anonymous/no-account mode" where Supabase is never
 * initialized until the user explicitly signs in.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/supabase";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined;

/** Whether Supabase is configured in the current environment */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

let client: SupabaseClient<Database> | null = null;

/**
 * Returns the Supabase client singleton, creating it on first call.
 *
 * @throws {Error} If VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY are not set
 */
export function getSupabase(): SupabaseClient<Database> {
  if (client) {
    return client;
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.",
    );
  }

  client = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      storageKey: "propulse-auth-token",
    },
  });

  return client;
}
