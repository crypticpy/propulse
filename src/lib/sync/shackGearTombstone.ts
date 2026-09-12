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
  table: GearDeletionTable,
  pendingKeys: ReadonlySet<string>,
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
    // A local deletion is queued for this record (e.g. deleted offline,
    // then logout/login raced the initial pull ahead of the eager push).
    // Keep it out of the merge without acking it — the still-pending push
    // will tombstone it on the server (#326).
    if (pendingKeys.has(gearDeletionKey({ table, recordId: getRecordId(row) }))) {
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

/**
 * `table:recordId` key set for the syncing owner's queued intents, for
 * pull-merge exclusion. Scoped to `userId` so a pending deletion queued
 * under one account never suppresses another account's active server row
 * (e.g. after using the shared local store across accounts) (#326).
 */
export function pendingGearDeletionKeys(
  pending: readonly PendingGearDeletion[],
  userId: string,
): Set<string> {
  return new Set(
    pending
      .filter((deletion) => deletion.ownerId === userId)
      .map(gearDeletionKey),
  );
}

export async function pushPendingGearDeletions(
  userId: string,
  pending: readonly PendingGearDeletion[],
): Promise<string[]> {
  // Only push (and ack) intents owned by the account currently syncing.
  // Intents queued under a different account stay queued untouched (#326).
  const ownedPending = pending.filter((deletion) => deletion.ownerId === userId);
  if (ownedPending.length === 0) {
    return [];
  }

  const supabase = getSupabase();
  const now = new Date().toISOString();
  const acknowledged: string[] = [];

  for (const deletion of ownedPending) {
    const payload = { deleted_at: now, updated_at: now };
    const idColumn = deletion.table === "user_radios" ? "instance_id" : "id";
    let error: { message: string } | null = null;
    let data: unknown[] | null = null;

    switch (deletion.table) {
      case "user_radios": {
        ({ data, error } = await supabase
          .from("user_radios")
          .update(payload)
          .eq("user_id", userId)
          .eq("instance_id", deletion.recordId)
          .select("instance_id"));
        break;
      }
      case "antennas":
      case "feedlines":
      case "accessories":
      case "station_presets": {
        ({ data, error } = await supabase
          .from(deletion.table)
          .update(payload)
          .eq("user_id", userId)
          .eq("id", deletion.recordId)
          .select("id"));
        break;
      }
      default: {
        ({ data, error } = await untypedFrom(deletion.table)
          .update(payload)
          .eq("user_id", userId)
          .eq("id", deletion.recordId)
          .select("id"));
        break;
      }
    }

    if (error) {
      throw new Error(
        `[shackSync] Gear deletion push failed for ${gearDeletionKey(deletion)}: ${error.message}`,
      );
    }

    if (data && data.length > 0) {
      acknowledged.push(gearDeletionKey(deletion));
      continue;
    }

    // PostgREST reports no error when an update matches zero rows (e.g. RLS
    // scoped the row to a different user, or a race already removed it), so
    // a bare `error === null` check would silently drop the intent without
    // ever tombstoning the row. Confirm the row is genuinely gone for this
    // user before acking; if it still exists, leave the intent pending (#326).
    const { data: existing, error: checkError } = await untypedFrom(
      deletion.table,
    )
      .select(idColumn)
      .eq("user_id", userId)
      .eq(idColumn, deletion.recordId)
      .maybeSingle();

    if (checkError) {
      throw new Error(
        `[shackSync] Gear deletion verify failed for ${gearDeletionKey(deletion)}: ${checkError.message}`,
      );
    }

    if (!existing) {
      acknowledged.push(gearDeletionKey(deletion));
    }
  }

  return acknowledged;
}
