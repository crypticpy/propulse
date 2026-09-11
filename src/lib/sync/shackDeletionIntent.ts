/** Owner-scoped legacy gear deletion intents persisted until server ack. */

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
}

export function gearDeletionKey(
  deletion: Pick<PendingGearDeletion, "table" | "recordId">,
): string {
  return `${deletion.table}:${deletion.recordId}`;
}

export function enqueueGearDeletionIntent(
  pending: ReadonlyArray<PendingGearDeletion>,
  table: GearDeletionTable,
  recordId: string,
  requestedAt = new Date().toISOString(),
): PendingGearDeletion[] {
  const key = gearDeletionKey({ table, recordId });
  if (pending.some((entry) => gearDeletionKey(entry) === key)) {
    return [...pending];
  }
  return [...pending, { table, recordId, requestedAt }];
}

export function enqueueGearDeletionIntents(
  pending: ReadonlyArray<PendingGearDeletion>,
  entries: ReadonlyArray<Pick<PendingGearDeletion, "table" | "recordId">>,
  requestedAt = new Date().toISOString(),
): PendingGearDeletion[] {
  let next = [...pending];
  for (const entry of entries) {
    next = enqueueGearDeletionIntent(
      next,
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
): PendingGearDeletion[] {
  const ack =
    acknowledgedKeys instanceof Set
      ? acknowledgedKeys
      : new Set(acknowledgedKeys);
  return pending.filter((entry) => !ack.has(gearDeletionKey(entry)));
}
