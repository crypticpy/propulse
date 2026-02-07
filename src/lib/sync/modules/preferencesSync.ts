/**
 * Preferences sync module — Tier 1 (Eager)
 *
 * Syncs the `user_preferences` table (single JSONB blob per user).
 * The entire preferences object is stored as a `preferences` JSONB column.
 * A `version` column tracks the schema version (currently 14).
 *
 * Note: Radios are currently stored inside `preferences.radios[]`.
 * A future migration will extract them to the `user_radios` table.
 */

import { getSupabase } from "@/lib/supabase";
import { useUserStore } from "@/stores/userStore";
import type { SyncModule, SyncableTable } from "../types";
import type { UserPreferences } from "@/types/user";
import type { Json } from "@/types/supabase";

/** Current preferences schema version — must match userStore persist version */
const PREFERENCES_VERSION = 14;

export const preferencesSync: SyncModule = {
  name: "preferences",
  tier: "eager",
  tables: ["user_preferences"] as SyncableTable[],

  async pull(userId: string, since: string | null): Promise<string | null> {
    const supabase = getSupabase();

    let query = supabase
      .from("user_preferences")
      .select("*")
      .eq("user_id", userId);

    if (since) {
      query = query.gt("updated_at", since);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      throw new Error(`Preferences pull failed: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    // Server has newer preferences — merge into local store
    const serverPrefs = data.preferences as Record<string, unknown> | null;
    if (
      serverPrefs &&
      typeof serverPrefs === "object" &&
      !Array.isArray(serverPrefs)
    ) {
      const state = useUserStore.getState();
      const localUpdatedAt = since;

      // Last-write-wins on `updated_at`
      if (!localUpdatedAt || data.updated_at > localUpdatedAt) {
        // Strip `station` — the store type is `Omit<UserPreferences, "station">`.
        // Also strip any keys that aren't valid UserPreferences to prevent
        // stale server data from injecting unexpected properties.
        const { station: _station, ...prefsWithoutStation } =
          serverPrefs as Partial<UserPreferences> & {
            station?: unknown;
          };

        useUserStore.setState({
          preferences: {
            ...state.preferences,
            ...prefsWithoutStation,
          },
        });
      }
    }

    return data.updated_at;
  },

  async push(userId: string): Promise<void> {
    const supabase = getSupabase();
    const { preferences } = useUserStore.getState();

    const { error } = await supabase.from("user_preferences").upsert(
      {
        user_id: userId,
        preferences: preferences as unknown as Json,
        version: PREFERENCES_VERSION,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (error) {
      throw new Error(`Preferences push failed: ${error.message}`);
    }
  },
};
