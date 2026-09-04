/**
 * Logbook sync module — Tier 2 (Incremental)
 *
 * Syncs the `log_entries` table via delta sync with pagination.
 * Uses `updated_at > lastSyncedAt` for efficient pull.
 * Push via write queue with batch upsert (up to 100 per batch).
 * Supports soft deletes (deleted_at column in Supabase).
 *
 * Local storage: IndexedDB (propulse-db, logEntries store)
 * Max local entries: 50,000
 */

import { getSupabase } from "@/lib/supabase";
import { getDB } from "@/lib/db";
import { notifyLogEntries } from "@/lib/db/logStore";
import type { LogEntry } from "@/lib/db/types";
import type { SyncModule, SyncableTable, WriteQueueEntry } from "../types";
import type { Tables, TablesInsert } from "@/types/supabase";

/** Max entries per batch for push/pull pagination */
const BATCH_SIZE = 100;

/**
 * Map a Supabase log_entries row to a local LogEntry.
 * Returns null if the row represents a soft-deleted entry.
 */
function rowToLogEntry(row: Tables<"log_entries">): LogEntry | null {
  // Soft-deleted entries are returned so we can remove them locally
  if (row.deleted_at) return null;

  return {
    id: row.id,
    callsign: row.callsign,
    frequency: row.frequency ?? 0,
    mode: row.mode ?? "",
    band: row.band ?? "",
    date: row.date,
    timeOn: row.time_on,
    timeOff: row.time_off ?? undefined,
    rstSent: row.rst_sent ?? undefined,
    rstRcvd: row.rst_rcvd ?? undefined,
    grid: row.grid ?? undefined,
    name: row.name ?? undefined,
    qth: row.qth ?? undefined,
    notes: row.notes ?? undefined,
    qslSent: (row.qsl_sent as LogEntry["qslSent"]) ?? undefined,
    qslRcvd: (row.qsl_rcvd as LogEntry["qslRcvd"]) ?? undefined,
    lotw: row.lotw_status ?? undefined,
    eqsl: row.eqsl_status ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    stationCallsign: row.station_callsign ?? undefined,
    operatorCallsign: row.operator_callsign ?? undefined,
    isGuestEntry: row.is_guest_entry || undefined,
    guestSessionId: row.guest_session_id ?? undefined,
  };
}

/** Map a local LogEntry to a Supabase log_entries insert row */
function logEntryToRow(
  entry: LogEntry,
  userId: string,
): TablesInsert<"log_entries"> {
  return {
    id: entry.id,
    user_id: userId,
    callsign: entry.callsign,
    frequency: entry.frequency || null,
    mode: entry.mode || null,
    band: entry.band || null,
    date: entry.date,
    time_on: entry.timeOn,
    time_off: entry.timeOff ?? null,
    rst_sent: entry.rstSent ?? null,
    rst_rcvd: entry.rstRcvd ?? null,
    grid: entry.grid ?? null,
    name: entry.name ?? null,
    qth: entry.qth ?? null,
    notes: entry.notes ?? null,
    qsl_sent: entry.qslSent ?? null,
    qsl_rcvd: entry.qslRcvd ?? null,
    lotw_status: entry.lotw ?? null,
    eqsl_status: entry.eqsl ?? null,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
    station_callsign: entry.stationCallsign ?? null,
    operator_callsign: entry.operatorCallsign ?? null,
    is_guest_entry: entry.isGuestEntry ?? false,
    guest_session_id: entry.guestSessionId ?? null,
  };
}

export const logbookSync: SyncModule = {
  name: "logbook",
  tier: "incremental",
  tables: ["log_entries"] as SyncableTable[],

  async pull(userId: string, since: string | null): Promise<string | null> {
    const supabase = getSupabase();
    const db = await getDB();
    let maxTimestamp: string | null = since;
    let hasMore = true;
    let cursor = since;

    while (hasMore) {
      let query = supabase
        .from("log_entries")
        .select("*")
        .eq("user_id", userId)
        .order("updated_at", { ascending: true })
        .limit(BATCH_SIZE);

      if (cursor) {
        query = query.gt("updated_at", cursor);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(`Logbook pull failed: ${error.message}`);
      }

      if (!data || data.length === 0) {
        hasMore = false;
        break;
      }

      // Process each row
      const tx = db.transaction("logEntries", "readwrite");

      for (const row of data) {
        if (row.deleted_at) {
          // Soft delete: remove from local IndexedDB
          try {
            await tx.store.delete(row.id);
          } catch {
            // Entry may not exist locally — that's fine
          }
        } else {
          const localEntry = rowToLogEntry(row);
          if (localEntry) {
            // put() inserts or updates, preserving the server's data
            await tx.store.put(localEntry);
          }
        }

        // Track max timestamp for sync cursor
        if (!maxTimestamp || row.updated_at > maxTimestamp) {
          maxTimestamp = row.updated_at;
        }
      }

      await tx.done;
      notifyLogEntries();

      // Set cursor for next page
      cursor = data[data.length - 1].updated_at;

      // If we got fewer than BATCH_SIZE rows, we've reached the end
      hasMore = data.length === BATCH_SIZE;
    }

    return maxTimestamp;
  },

  async push(userId: string): Promise<void> {
    // Full push: read all local entries and upsert to Supabase in batches
    const db = await getDB();
    const supabase = getSupabase();
    const allEntries = await db.getAll("logEntries");

    for (let i = 0; i < allEntries.length; i += BATCH_SIZE) {
      const batch = allEntries.slice(i, i + BATCH_SIZE);
      const rows = batch.map((e) => logEntryToRow(e, userId));

      const { error } = await supabase
        .from("log_entries")
        .upsert(rows, { onConflict: "id" });

      if (error) {
        throw new Error(`Logbook push batch failed: ${error.message}`);
      }
    }
  },

  async processQueue(
    userId: string,
    entries: WriteQueueEntry[],
  ): Promise<string[]> {
    const supabase = getSupabase();
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
          return { ...data, user_id: userId } as TablesInsert<"log_entries">;
        });

        const { error } = await supabase
          .from("log_entries")
          .upsert(rows, { onConflict: "id" });

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
      const { error } = await supabase
        .from("log_entries")
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
