/**
 * FT8 decode sync module — Tier 2 (Incremental)
 *
 * Syncs the `ft8_decodes` table via delta sync with pagination.
 * Uses `updated_at > lastSyncedAt` for efficient pull.
 * Push via write queue with batch upsert (up to 100 per batch).
 * Supports soft deletes (deleted_at column in Supabase).
 *
 * Local storage: IndexedDB (propulse-db, ft8Decodes store)
 */

import { getSupabase } from "@/lib/supabase";
import { getDB } from "@/lib/db";
import { getAllFt8Decodes } from "@/lib/db/ft8DecodeStore";
import type { Ft8Decode } from "@/lib/db/types";
import type { SyncModule, SyncableTable, WriteQueueEntry } from "../types";

/** Max entries per batch for push/pull pagination */
const BATCH_SIZE = 100;

/** Supabase row shape (ft8_decodes not yet in generated types) */
type Ft8DecodeRow = Record<string, unknown>;

/**
 * Untyped Supabase `from()` helper — ft8_decodes is not in generated types yet.
 * Same pattern used by shackSync and imageSync.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untypedFrom = () => getSupabase().from("ft8_decodes" as any) as any;

/**
 * Map a Supabase ft8_decodes row to a local Ft8Decode.
 * Returns null if the row represents a soft-deleted entry.
 */
function rowToDecode(row: Ft8DecodeRow): Ft8Decode | null {
  if (row.deleted_at) return null;

  return {
    id: row.id as string,
    timestamp: row.timestamp as string,
    time: row.time as number,
    snr: row.snr as number,
    deltaTime: row.delta_time as number,
    deltaFrequency: row.delta_frequency as number,
    mode: row.mode as string,
    message: row.message as string,
    callsign: (row.callsign as string) ?? undefined,
    grid: (row.grid as string) ?? undefined,
    isCQ: (row.is_cq as boolean) ?? undefined,
    lowConfidence: row.low_confidence as boolean,
    frequencyHz: (row.frequency_hz as number) ?? undefined,
    band: (row.band as string) ?? undefined,
    myCallsign: (row.my_callsign as string) ?? undefined,
    instanceId: (row.instance_id as string) ?? undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/** Map a local Ft8Decode to a Supabase ft8_decodes insert row */
function decodeToRow(decode: Ft8Decode, userId: string): Ft8DecodeRow {
  return {
    id: decode.id,
    user_id: userId,
    timestamp: decode.timestamp,
    time: decode.time,
    snr: decode.snr,
    delta_time: decode.deltaTime,
    delta_frequency: decode.deltaFrequency,
    mode: decode.mode,
    message: decode.message,
    callsign: decode.callsign ?? null,
    grid: decode.grid ?? null,
    is_cq: decode.isCQ ?? null,
    low_confidence: decode.lowConfidence,
    frequency_hz: decode.frequencyHz ?? null,
    band: decode.band ?? null,
    my_callsign: decode.myCallsign ?? null,
    instance_id: decode.instanceId ?? null,
    created_at: decode.createdAt,
    updated_at: decode.updatedAt,
  };
}

export const ft8DecodeSync: SyncModule = {
  name: "ft8Decodes",
  tier: "incremental",
  tables: ["ft8_decodes"] as SyncableTable[],

  async pull(userId: string, since: string | null): Promise<string | null> {
    const db = await getDB();
    let maxTimestamp: string | null = since;
    let hasMore = true;
    let cursor = since;

    while (hasMore) {
      let query = untypedFrom()
        .select("*")
        .eq("user_id", userId)
        .order("updated_at", { ascending: true })
        .limit(BATCH_SIZE);

      if (cursor) {
        query = query.gt("updated_at", cursor);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(`FT8 decode pull failed: ${error.message}`);
      }

      if (!data || data.length === 0) {
        hasMore = false;
        break;
      }

      // Process each row
      const tx = db.transaction("ft8Decodes", "readwrite");

      for (const row of data as Ft8DecodeRow[]) {
        const rowId = row.id as string;

        if (row.deleted_at) {
          // Soft delete: remove from local IndexedDB
          try {
            await tx.store.delete(rowId);
          } catch {
            // Entry may not exist locally — that's fine
          }
        } else {
          const localDecode = rowToDecode(row);
          if (localDecode) {
            // put() inserts or updates, preserving the server's data
            await tx.store.put(localDecode);
          }
        }

        // Track max timestamp for sync cursor
        const updatedAt = row.updated_at as string;
        if (!maxTimestamp || updatedAt > maxTimestamp) {
          maxTimestamp = updatedAt;
        }
      }

      await tx.done;

      // Set cursor for next page
      const lastRow = data[data.length - 1] as Ft8DecodeRow;
      cursor = lastRow.updated_at as string;

      // If we got fewer than BATCH_SIZE rows, we've reached the end
      hasMore = data.length === BATCH_SIZE;
    }

    return maxTimestamp;
  },

  async push(userId: string): Promise<void> {
    // Full push: read all local decodes and upsert to Supabase in batches
    const allDecodes = await getAllFt8Decodes();

    for (let i = 0; i < allDecodes.length; i += BATCH_SIZE) {
      const batch = allDecodes.slice(i, i + BATCH_SIZE);
      const rows = batch.map((d) => decodeToRow(d, userId));

      const { error } = await untypedFrom().upsert(rows, { onConflict: "id" });

      if (error) {
        throw new Error(`FT8 decode push batch failed: ${error.message}`);
      }
    }
  },

  async processQueue(
    userId: string,
    entries: WriteQueueEntry[],
  ): Promise<string[]> {
    const processed: string[] = [];

    // Group by operation type
    const upserts = entries.filter((e) => e.operation === "upsert");
    const deletes = entries.filter((e) => e.operation === "delete");

    // Batch upserts
    if (upserts.length > 0) {
      for (let i = 0; i < upserts.length; i += BATCH_SIZE) {
        const batch = upserts.slice(i, i + BATCH_SIZE);
        const rows = batch.map((e) => {
          const { user_id: _uid, ...data } = e.data as Record<
            string,
            unknown
          > & { user_id?: unknown };
          return { ...data, user_id: userId };
        });

        const { error } = await untypedFrom().upsert(rows, {
          onConflict: "id",
        });

        if (!error) {
          for (const entry of batch) {
            processed.push(entry.queueId);
          }
        }
      }
    }

    // Process deletes as soft deletes (set deleted_at)
    for (const entry of deletes) {
      const entryId = entry.data.id as string;
      const now = new Date().toISOString();
      const { error } = await untypedFrom()
        .update({
          deleted_at: now,
          updated_at: now,
        })
        .eq("user_id", userId)
        .eq("id", entryId);

      if (!error) {
        processed.push(entry.queueId);
      }
    }

    return processed;
  },
};
