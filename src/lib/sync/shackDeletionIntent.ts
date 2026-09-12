/** Owner-scoped legacy gear deletion intents persisted until server ack. */

/** Client-side mirror of server tombstone retention (#1078). */
export const GEAR_DELETION_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export type GearDeletionTable =
  | "user_radios"
  | "antennas"
  | "feedlines"
  | "accessories"
  | "station_presets"
  | "inline_components"
  | "station_chains"
  | "custom_radios";

export interface PendingGearDeletion {
  table: GearDeletionTable;
  /** Local record id (`instance_id` for user_radios). */
  recordId: string;
  requestedAt: string;
  /**
   * Signed-in user id that requested the deletion, recorded at enqueue
   * time. Prevents an offline deletion queued under one account from being
   * pushed (and silently lost) under a different signed-in account (#326).
   */
  ownerId: string;
}

/** Server-acknowledged deletion retained for restore guard (#1078). */
export interface AcknowledgedGearDeletion {
  table: GearDeletionTable;
  recordId: string;
  acknowledgedAt: string;
  ownerId: string;
}

export function gearDeletionKey(
  deletion: Pick<PendingGearDeletion, "table" | "recordId">,
): string {
  return `${deletion.table}:${deletion.recordId}`;
}

export function parseGearDeletionKey(key: string): {
  table: GearDeletionTable;
  recordId: string;
} {
  const separator = key.indexOf(":");
  if (separator <= 0) {
    throw new Error(`Invalid gear deletion key: ${key}`);
  }
  return {
    table: key.slice(0, separator) as GearDeletionTable,
    recordId: key.slice(separator + 1),
  };
}

export function enqueueGearDeletionIntent(
  pending: ReadonlyArray<PendingGearDeletion>,
  ownerId: string,
  table: GearDeletionTable,
  recordId: string,
  requestedAt = new Date().toISOString(),
): PendingGearDeletion[] {
  const key = gearDeletionKey({ table, recordId });
  if (
    pending.some(
      (entry) => gearDeletionKey(entry) === key && entry.ownerId === ownerId,
    )
  ) {
    return [...pending];
  }
  return [...pending, { table, recordId, requestedAt, ownerId }];
}

export function enqueueGearDeletionIntents(
  pending: ReadonlyArray<PendingGearDeletion>,
  ownerId: string,
  entries: ReadonlyArray<Pick<PendingGearDeletion, "table" | "recordId">>,
  requestedAt = new Date().toISOString(),
): PendingGearDeletion[] {
  let next = [...pending];
  for (const entry of entries) {
    next = enqueueGearDeletionIntent(
      next,
      ownerId,
      entry.table,
      entry.recordId,
      requestedAt,
    );
  }
  return next;
}

export function removeAcknowledgedGearDeletions(
  pending: ReadonlyArray<PendingGearDeletion>,
  acknowledgedKeys: ReadonlySet<string> | readonly string[],
  ownerId: string,
): PendingGearDeletion[] {
  const ack =
    acknowledgedKeys instanceof Set
      ? acknowledgedKeys
      : new Set(acknowledgedKeys);
  return pending.filter(
    (entry) => !(ack.has(gearDeletionKey(entry)) && entry.ownerId === ownerId),
  );
}
