import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CollectorConfig } from "./types.js";

let client: SupabaseClient | null = null;

export function getDb(config: CollectorConfig): SupabaseClient {
  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return client;
}
