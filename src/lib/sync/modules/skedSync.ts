/**
 * Sked sync module — Tier 3 (Lazy)
 *
 * Syncs the `skeds` table. Immediate push on CRUD, full pull on load.
 * Skeds are scheduled QSOs with propagation window recommendations.
 */

import { getSupabase } from "@/lib/supabase";
import { useSkedStore } from "@/stores/skedStore";
import type { Sked, SkedWindow } from "@/stores/skedStore";
import type { SyncModule, SyncableTable, WriteQueueEntry } from "../types";
import type { Tables, TablesInsert } from "@/types/supabase";
import type { Json } from "@/types/supabase";

function rowToSked(row: Tables<"skeds">): Sked {
  return {
    id: row.id,
    targetCallsign: row.target_callsign,
    targetLat: row.target_lat ?? undefined,
    targetLon: row.target_lon ?? undefined,
    preferredBand: row.preferred_band,
    preferredMode: row.preferred_mode,
    dateRange: row.date_range as unknown as [string, string],
    recommendedWindows:
      (row.recommended_windows as unknown as SkedWindow[]) ?? [],
    status: row.status as Sked["status"],
    createdAt: row.created_at,
    reminderFired: row.reminder_fired,
    notes: row.notes ?? undefined,
  };
}

function skedToRow(sked: Sked, userId: string): TablesInsert<"skeds"> {
  return {
    id: sked.id,
    user_id: userId,
    target_callsign: sked.targetCallsign,
    target_lat: sked.targetLat ?? null,
    target_lon: sked.targetLon ?? null,
    preferred_band: sked.preferredBand,
    preferred_mode: sked.preferredMode,
    date_range: sked.dateRange as unknown as Json,
    recommended_windows: sked.recommendedWindows as unknown as Json,
    status: sked.status,
    created_at: sked.createdAt,
    reminder_fired: sked.reminderFired ?? false,
    notes: sked.notes ?? null,
  };
}

export const skedSync: SyncModule = {
  name: "skeds",
  tier: "lazy",
  tables: ["skeds"] as SyncableTable[],

  async pull(userId: string, _since: string | null): Promise<string | null> {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("skeds")
      .select("*")
      .eq("user_id", userId);

    if (error) {
      throw new Error(`Skeds pull failed: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return null;
    }

    const serverSkeds = data.map(rowToSked);
    const state = useSkedStore.getState();

    // Merge: server wins for matching IDs, local-only preserved
    const serverIdSet = new Set(serverSkeds.map((s) => s.id));
    const localOnly = state.skeds.filter((s) => !serverIdSet.has(s.id));
    const merged = [...serverSkeds, ...localOnly];

    useSkedStore.setState({ skeds: merged });

    let maxTs: string | null = null;
    for (const row of data) {
      if (!maxTs || row.created_at > maxTs) maxTs = row.created_at;
    }
    return maxTs;
  },

  async push(userId: string): Promise<void> {
    const supabase = getSupabase();
    const { skeds } = useSkedStore.getState();

    if (skeds.length > 0) {
      const rows = skeds.map((s) => skedToRow(s, userId));
      const { error } = await supabase
        .from("skeds")
        .upsert(rows, { onConflict: "id" });

      if (error) {
        throw new Error(`Skeds push failed: ${error.message}`);
      }
    }

    // Note: No orphan deletion — deletions handled via processQueue with
    // explicit delete operations from the write queue.
  },

  async processQueue(
    userId: string,
    entries: WriteQueueEntry[],
  ): Promise<string[]> {
    const supabase = getSupabase();
    const processed: string[] = [];

    for (const entry of entries) {
      if (entry.operation === "upsert") {
        const { user_id: _uid, ...data } = entry.data as Record<
          string,
          unknown
        > & { user_id?: unknown };
        const { error } = await supabase
          .from("skeds")
          .upsert({ ...data, user_id: userId } as TablesInsert<"skeds">, {
            onConflict: "id",
          });
        if (!error) processed.push(entry.queueId);
      } else if (entry.operation === "delete") {
        const { error } = await supabase
          .from("skeds")
          .delete()
          .eq("user_id", userId)
          .eq("id", entry.data.id as string);
        if (!error) processed.push(entry.queueId);
      }
    }

    return processed;
  },
};
