import { getSupabase } from "@/lib/supabase";
import {
  gearDeletionKey,
  type GearDeletionTable,
  type PendingGearDeletion,
} from "@/lib/sync/shackDeletionIntent";

type TombstoneRow = {
  updated_at: string;
  deleted_at?: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untypedFrom = (table: string) => getSupabase().from(table as any) as any;

export interface GearPullMergeResult<T> {
  merged: T[];
  removedIds: string[];
  timestamps: string[];
}

export function mergeGearPullRows<T extends { id: string }, TRow extends TombstoneRow>(
  rows: TRow[] | null | undefined,
  toLocal: (row: TRow) => T,
  getRecordId: (row: TRow) => string,
  currentLocal: readonly T[],
): GearPullMergeResult<T> | null {
  if (!rows || rows.length === 0) {
    return null;
  }

  const activeRows: TRow[] = [];
  const removedIds: string[] = [];
  const timestamps: string[] = [];

  for (const row of rows) {
    timestamps.push(row.updated_at);
    if (row.deleted_at) {
      removedIds.push(getRecordId(row));
      continue;
    }
    activeRows.push(row);
  }

  const serverItems = activeRows.map(toLocal);
  const removedSet = new Set(removedIds);
  const serverIdSet = new Set(serverItems.map((item) => item.id));
  const localOnly = currentLocal.filter(
    (item) => !serverIdSet.has(item.id) && !removedSet.has(item.id),
  );

  return {
    merged: [...serverItems, ...localOnly],
    removedIds,
    timestamps,
  };
}

export function pullAcknowledgementKeys(
  table: GearDeletionTable,
  removedIds: readonly string[],
): string[] {
  return removedIds.map((recordId) => gearDeletionKey({ table, recordId }));
}

export async function pushPendingGearDeletions(
  userId: string,
  pending: readonly PendingGearDeletion[],
): Promise<string[]> {
  if (pending.length === 0) {
    return [];
  }

  const supabase = getSupabase();
  const now = new Date().toISOString();
  const acknowledged: string[] = [];

  for (const deletion of pending) {
    const payload = { deleted_at: now, updated_at: now };
    let error: { message: string } | null = null;

    switch (deletion.table) {
      case "user_radios": {
        ({ error } = await supabase
          .from("user_radios")
          .update(payload)
          .eq("user_id", userId)
          .eq("instance_id", deletion.recordId));
        break;
      }
      case "antennas":
      case "feedlines":
      case "accessories":
      case "station_presets": {
        ({ error } = await supabase
          .from(deletion.table)
          .update(payload)
          .eq("user_id", userId)
          .eq("id", deletion.recordId));
        break;
      }
      default: {
        ({ error } = await untypedFrom(deletion.table)
          .update(payload)
          .eq("user_id", userId)
          .eq("id", deletion.recordId));
        break;
      }
    }

    if (error) {
      throw new Error(
        `[shackSync] Gear deletion push failed for ${gearDeletionKey(deletion)}: ${error.message}`,
      );
    }

    acknowledged.push(gearDeletionKey(deletion));
  }

  return acknowledged;
}
