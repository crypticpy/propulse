/**
 * Targets sync module — Tier 1 (Eager)
 *
 * Syncs the `saved_targets` table.
 * Each target represents a saved DX station the user wants to track.
 *
 * The local `SavedTarget` uses `name` for a friendly label, while the
 * server schema uses `callsign` as the required field and `name` as
 * an optional label. Both are synced.
 *
 * Note: `saved_targets` has no `updated_at` column, so pull is always
 * a full fetch. The sync cursor is derived from the newest `created_at`.
 */

import { getSupabase } from "@/lib/supabase";
import { useUserStore, type SavedTarget } from "@/stores/userStore";
import type { SyncModule, SyncableTable } from "../types";
import type { Tables, TablesInsert } from "@/types/supabase";

/**
 * Map a Supabase `saved_targets` row to a local `SavedTarget`.
 */
function rowToTarget(row: Tables<"saved_targets">): SavedTarget {
  return {
    id: row.id,
    name: row.callsign,
    lat: row.lat ?? 0,
    lon: row.lon ?? 0,
    grid: row.grid ?? undefined,
    createdAt: row.created_at,
  };
}

/**
 * Map a local `SavedTarget` to a Supabase `saved_targets` insert row.
 */
function targetToRow(
  target: SavedTarget,
  userId: string,
): TablesInsert<"saved_targets"> {
  return {
    id: target.id,
    user_id: userId,
    callsign: target.name,
    name: target.name,
    lat: target.lat,
    lon: target.lon,
    grid: target.grid ?? null,
    created_at: target.createdAt,
  };
}

/**
 * Return the latest timestamp from a list of ISO timestamps.
 */
function maxTimestamp(
  timestamps: (string | null | undefined)[],
): string | null {
  let max: string | null = null;
  for (const ts of timestamps) {
    if (ts && (!max || ts > max)) {
      max = ts;
    }
  }
  return max;
}

export const targetsSync: SyncModule = {
  name: "targets",
  tier: "eager",
  tables: ["saved_targets"] as SyncableTable[],

  async pull(userId: string, _since: string | null): Promise<string | null> {
    const supabase = getSupabase();

    // Always full pull — no `updated_at` column on `saved_targets`
    const { data, error } = await supabase
      .from("saved_targets")
      .select("*")
      .eq("user_id", userId);

    if (error) {
      throw new Error(`Targets pull failed: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return null;
    }

    const serverTargets = data.map(rowToTarget);
    const state = useUserStore.getState();

    // Merge strategy: server targets take precedence for matching IDs,
    // local-only targets are preserved (they may not have been pushed yet)
    const serverIdSet = new Set(serverTargets.map((t) => t.id));
    const localOnly = state.savedTargets.filter((t) => !serverIdSet.has(t.id));
    const merged = [...serverTargets, ...localOnly];

    useUserStore.setState({ savedTargets: merged });

    return maxTimestamp(data.map((r) => r.created_at));
  },

  async push(userId: string): Promise<void> {
    const supabase = getSupabase();
    const { savedTargets } = useUserStore.getState();

    if (savedTargets.length > 0) {
      const rows = savedTargets.map((t) => targetToRow(t, userId));

      const { error: upsertError } = await supabase
        .from("saved_targets")
        .upsert(rows, { onConflict: "id" });

      if (upsertError) {
        throw new Error(`Targets push failed: ${upsertError.message}`);
      }
    }

    // Note: No orphan deletion — another device may have added targets we
    // haven't pulled yet. Deletions handled via explicit write queue ops.
  },
};
