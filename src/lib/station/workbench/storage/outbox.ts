import type { IDBPIndex } from "idb";
import type { OutboxRecord, StationDatabaseSchema } from "@/lib/station/workbench/storage/database";

type StateIndex = IDBPIndex<StationDatabaseSchema, ["outbox"], "outbox", "by-state-sequence", "readonly">;
/** The query may run inside an existing readonly or readwrite transaction. */
export interface StationOutboxReader {
  index(name: "by-state-sequence"): Pick<StateIndex, "getAll">;
}
export interface StationOutboxQuery {
  ownerId: string;
  generationId: string;
  /** Omit only for dependency discovery, which needs every unacknowledged operation. */
  limit?: number;
}
const states = ["pending", "blocked", "conflicted"] as const;

/** Read only requested owner/generation/state prefixes at the IDB boundary.
 * At most 3 * limit rows are materialized for a bounded query; trimming after
 * merging produces the earliest global limit without scanning acknowledged rows.
 * The caller owns transaction completion and stored-record/domain validation. */
export async function readStationOutbox(store: StationOutboxReader, query: StationOutboxQuery): Promise<OutboxRecord[]> {
  const { ownerId, generationId, limit } = query;
  if ([ownerId, generationId].some((id) => typeof id !== "string" || !id || id.trim() !== id)) {
    throw new TypeError("Outbox queries require nonempty unpadded owner and generation IDs");
  }
  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0 || limit > 0xffff_ffff)) {
    throw new RangeError("Outbox query limit must be a positive unsigned 32-bit integer");
  }
  // IDB getAll count is an unsigned long; never coerce an invalid limit to zero.
  const count = limit;
  const index = store.index("by-state-sequence");
  const groups = await Promise.all(states.map((state) => {
    const range = IDBKeyRange.bound([ownerId, generationId, state], [ownerId, generationId, state, []]);
    return count === undefined ? index.getAll(range) : index.getAll(range, count);
  }));
  const rows = groups.flat().sort((a, b) => a.localSequence - b.localSequence
    // Match IDB's primary-key tie order; avoid locale-dependent pagination.
    || (a.operationId < b.operationId ? -1 : a.operationId > b.operationId ? 1 : 0));
  return limit === undefined ? rows : rows.slice(0, limit);
}
