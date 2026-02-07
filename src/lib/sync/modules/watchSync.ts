/**
 * Watch sync module — Tier 3 (Lazy)
 *
 * Syncs the `watches` table. Immediate push on CRUD, full pull on load.
 * Watches track grids, entities, and callsign patterns for DX alerting.
 */

import { getSupabase } from "@/lib/supabase";
import { useWatchStore } from "@/stores/watchStore";
import type { WatchItem } from "@/stores/watchStore";
import type { SyncModule, SyncableTable, WriteQueueEntry } from "../types";
import type { Tables, TablesInsert } from "@/types/supabase";

function rowToWatch(row: Tables<"watches">): WatchItem {
  return {
    id: row.id,
    type: row.type as WatchItem["type"],
    pattern: row.pattern,
    name: row.name ?? undefined,
    createdAt: row.created_at,
    activityCount: row.activity_count,
    isActive: row.is_active,
  };
}

function watchToRow(watch: WatchItem, userId: string): TablesInsert<"watches"> {
  return {
    id: watch.id,
    user_id: userId,
    type: watch.type,
    pattern: watch.pattern,
    name: watch.name ?? null,
    created_at: watch.createdAt,
    activity_count: watch.activityCount,
    is_active: watch.isActive,
  };
}

export const watchSync: SyncModule = {
  name: "watches",
  tier: "lazy",
  tables: ["watches"] as SyncableTable[],

  async pull(userId: string, _since: string | null): Promise<string | null> {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("watches")
      .select("*")
      .eq("user_id", userId);

    if (error) {
      throw new Error(`Watches pull failed: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return null;
    }

    const serverWatches = data.map(rowToWatch);
    const state = useWatchStore.getState();

    // Build a map of local watches for preserving local-only fields
    const localMap = new Map(state.watches.map((w) => [w.id, w]));

    // Merge: server wins for matching IDs, but preserve local-only fields
    // (lastActivityAt is computed locally from spot matching, not stored on server)
    const mergedServer = serverWatches.map((sw) => {
      const local = localMap.get(sw.id);
      return local ? { ...sw, lastActivityAt: local.lastActivityAt } : sw;
    });

    const serverIdSet = new Set(serverWatches.map((w) => w.id));
    const localOnly = state.watches.filter((w) => !serverIdSet.has(w.id));
    const merged = [...mergedServer, ...localOnly];

    useWatchStore.setState({ watches: merged });

    // Return newest created_at as cursor (no updated_at on watches)
    let maxTs: string | null = null;
    for (const row of data) {
      if (!maxTs || row.created_at > maxTs) maxTs = row.created_at;
    }
    return maxTs;
  },

  async push(userId: string): Promise<void> {
    const supabase = getSupabase();
    const { watches } = useWatchStore.getState();

    if (watches.length > 0) {
      const rows = watches.map((w) => watchToRow(w, userId));
      const { error } = await supabase
        .from("watches")
        .upsert(rows, { onConflict: "id" });

      if (error) {
        throw new Error(`Watches push failed: ${error.message}`);
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
        // Strip any client-provided user_id to prevent spoofing
        const { user_id: _uid, ...data } = entry.data as Record<
          string,
          unknown
        > & { user_id?: unknown };
        const { error } = await supabase
          .from("watches")
          .upsert({ ...data, user_id: userId } as TablesInsert<"watches">, {
            onConflict: "id",
          });
        if (!error) processed.push(entry.queueId);
      } else if (entry.operation === "delete") {
        const { error } = await supabase
          .from("watches")
          .delete()
          .eq("user_id", userId)
          .eq("id", entry.data.id as string);
        if (!error) processed.push(entry.queueId);
      }
    }

    return processed;
  },
};
