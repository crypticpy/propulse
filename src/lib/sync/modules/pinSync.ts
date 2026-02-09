/**
 * Pin sync module — Tier 3 (Lazy)
 *
 * Syncs the `map_pins` table. Immediate push on CRUD, full pull on load.
 * Pins are saved globe locations with categories and optional expiration.
 */

import { getSupabase } from "@/lib/supabase";
import { usePinStore } from "@/stores/pinStore";
import type { MapPin } from "@/types/pin";
import type { SyncModule, SyncableTable, WriteQueueEntry } from "../types";
import type { Tables, TablesInsert } from "@/types/supabase";

function rowToPin(row: Tables<"map_pins">): MapPin {
  return {
    id: row.id,
    lat: row.lat,
    lon: row.lon,
    grid: row.grid,
    name: row.name ?? undefined,
    color: row.color ?? undefined,
    category: (row.category as MapPin["category"]) ?? "custom",
    notes: row.notes ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    createdAt: row.created_at,
  };
}

function pinToRow(pin: MapPin, userId: string): TablesInsert<"map_pins"> {
  return {
    id: pin.id,
    user_id: userId,
    lat: pin.lat,
    lon: pin.lon,
    grid: pin.grid,
    name: pin.name ?? null,
    color: pin.color ?? null,
    category: pin.category ?? "custom",
    notes: pin.notes ?? null,
    expires_at: pin.expiresAt ?? null,
    created_at: pin.createdAt,
  };
}

export const pinSync: SyncModule = {
  name: "pins",
  tier: "lazy",
  tables: ["map_pins"] as SyncableTable[],

  async pull(userId: string, _since: string | null): Promise<string | null> {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("map_pins")
      .select("*")
      .eq("user_id", userId);

    if (error) {
      throw new Error(`Pins pull failed: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return null;
    }

    const serverPins = data.map(rowToPin);
    const state = usePinStore.getState();

    // Merge: server wins for matching IDs, local-only preserved
    const serverIdSet = new Set(serverPins.map((p) => p.id));
    const localOnly = state.pins.filter((p) => !serverIdSet.has(p.id));
    const merged = [...serverPins, ...localOnly];

    usePinStore.setState({ pins: merged });

    let maxTs: string | null = null;
    for (const row of data) {
      if (!maxTs || row.created_at > maxTs) maxTs = row.created_at;
    }
    return maxTs;
  },

  async push(userId: string): Promise<void> {
    const supabase = getSupabase();
    const { pins } = usePinStore.getState();

    if (pins.length > 0) {
      const rows = pins.map((p) => pinToRow(p, userId));
      const { error } = await supabase
        .from("map_pins")
        .upsert(rows, { onConflict: "user_id,id" });

      if (error) {
        throw new Error(`Pins push failed: ${error.message}`);
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
          .from("map_pins")
          .upsert({ ...data, user_id: userId } as TablesInsert<"map_pins">, {
            onConflict: "id",
          });
        if (!error) processed.push(entry.queueId);
      } else if (entry.operation === "delete") {
        const { error } = await supabase
          .from("map_pins")
          .delete()
          .eq("user_id", userId)
          .eq("id", entry.data.id as string);
        if (!error) processed.push(entry.queueId);
      }
    }

    return processed;
  },
};
