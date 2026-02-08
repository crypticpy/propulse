/**
 * DXCC sync module -- Tier 1 (Eager)
 *
 * Syncs DXCC worked entities to the `dxcc_worked` Supabase table.
 * Uses full-blob push (no processQueue). Server wins for matching
 * entity+band+mode combos; local-only entries are preserved.
 */

import { getSupabase } from "@/lib/supabase";
import { useDXCCStore } from "@/stores/dxccStore";
import type { DXCCWorkedEntry } from "@/stores/dxccStore";
import type { SyncModule, SyncableTable } from "../types";

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Return the latest ISO timestamp from a list. Returns null if empty.
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

/**
 * Composite key for deduplication: entity+band+mode.
 */
function entryKey(entry: DXCCWorkedEntry): string {
  return `${entry.entityId}:${entry.band}:${entry.mode}`;
}

// ── Inline row type ─────────────────────────────────────────────────────────

interface DXCCWorkedRow {
  id?: string;
  user_id: string;
  entity_id: number;
  band: string;
  mode: string;
  callsign: string;
  worked_at: string;
  confirmed: boolean;
  confirmation_method: string | null;
  created_at?: string;
  updated_at?: string;
}

// ── Local -> Supabase row mapper ────────────────────────────────────────────

function entryToRow(entry: DXCCWorkedEntry, userId: string): DXCCWorkedRow {
  return {
    user_id: userId,
    entity_id: entry.entityId,
    band: entry.band,
    mode: entry.mode,
    callsign: entry.callsign,
    worked_at: entry.timestamp,
    confirmed: entry.confirmed,
    confirmation_method: entry.confirmationMethod ?? null,
    updated_at: new Date().toISOString(),
  };
}

// ── Supabase row -> Local type mapper ───────────────────────────────────────

function rowToEntry(row: {
  entity_id: number;
  band: string;
  mode: string;
  callsign: string;
  worked_at: string;
  confirmed: boolean;
  confirmation_method: string | null;
}): DXCCWorkedEntry {
  return {
    entityId: row.entity_id,
    band: row.band as DXCCWorkedEntry["band"],
    mode: row.mode as DXCCWorkedEntry["mode"],
    callsign: row.callsign,
    timestamp: row.worked_at,
    confirmed: row.confirmed,
    confirmationMethod: row.confirmation_method ?? undefined,
  };
}

// ── Sync Module ─────────────────────────────────────────────────────────────

export const dxccSync: SyncModule = {
  name: "dxcc",
  tier: "eager",
  tables: ["dxcc_worked"] as SyncableTable[],

  // ── Pull ────────────────────────────────────────────────────────────────

  async pull(userId: string, since: string | null): Promise<string | null> {
    const supabase = getSupabase();
    const timestamps: string[] = [];

    // Table not yet in generated Supabase types — cast through `any`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase as any)
      .from("dxcc_worked")
      .select("*")
      .eq("user_id", userId);
    if (since) {
      query = query.gt("updated_at", since);
    }
    const { data: rows, error } = (await query) as {
      data: DXCCWorkedRow[] | null;
      error: { message: string } | null;
    };
    if (error) {
      throw new Error(`DXCC pull failed: ${error.message}`);
    }

    if (rows && rows.length > 0) {
      const serverEntries = rows.map(rowToEntry);
      for (const row of rows) {
        timestamps.push(row.updated_at!);
      }

      // Server wins for matching entity+band+mode combos, preserve local-only
      const state = useDXCCStore.getState();
      const serverKeySet = new Set(serverEntries.map(entryKey));
      const localOnly = state.workedEntries.filter(
        (e) => !serverKeySet.has(entryKey(e)),
      );
      const mergedEntries = [...serverEntries, ...localOnly];

      // Rebuild derived Sets
      const workedEntityIds = new Set(mergedEntries.map((e) => e.entityId));
      const confirmedEntityIds = new Set(
        mergedEntries.filter((e) => e.confirmed).map((e) => e.entityId),
      );

      useDXCCStore.setState({
        workedEntries: mergedEntries,
        workedEntityIds,
        confirmedEntityIds,
      });
    }

    return maxTimestamp(timestamps);
  },

  // ── Push ────────────────────────────────────────────────────────────────

  async push(userId: string): Promise<void> {
    const supabase = getSupabase();
    const { workedEntries } = useDXCCStore.getState();

    if (workedEntries.length > 0) {
      const rows = workedEntries.map((e) => entryToRow(e, userId));
      // Table not yet in generated Supabase types — cast through `any`
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("dxcc_worked")
        .upsert(rows, { onConflict: "user_id,entity_id,band,mode" });

      if (error) {
        throw new Error(
          `DXCC push failed: ${(error as { message: string }).message}`,
        );
      }
    }
  },
};
