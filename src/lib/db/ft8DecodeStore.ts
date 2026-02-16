/**
 * IndexedDB CRUD operations for FT8/FT4 decode records.
 *
 * All writes use single transactions for atomicity — if a browser crash
 * occurs mid-write, the transaction is rolled back (no partial data).
 */

import { getDB } from "./index";
import type { Ft8Decode } from "./types";

export type { Ft8Decode };

/**
 * Batch-insert decoded messages into IndexedDB.
 * Primary hot path — called every 15s (FT8) or 7.5s (FT4) decode cycle.
 */
export async function addFt8Decodes(decodes: Ft8Decode[]): Promise<void> {
  if (decodes.length === 0) return;
  const db = await getDB();
  const tx = db.transaction("ft8Decodes", "readwrite");
  for (const d of decodes) {
    tx.store.put(d);
  }
  await tx.done;
}

/**
 * Get recent decodes sorted by timestamp descending (newest first).
 * Uses the by-timestamp index with a reverse cursor for efficiency.
 */
export async function getRecentFt8Decodes(
  limit = 500,
  offset = 0,
): Promise<Ft8Decode[]> {
  const db = await getDB();
  const tx = db.transaction("ft8Decodes", "readonly");
  const index = tx.store.index("by-timestamp");
  const results: Ft8Decode[] = [];

  let cursor = await index.openCursor(null, "prev");
  let skipped = 0;

  while (cursor) {
    if (skipped < offset) {
      skipped++;
      cursor = await cursor.continue();
      continue;
    }
    results.push(cursor.value);
    if (results.length >= limit) break;
    cursor = await cursor.continue();
  }

  return results;
}

/**
 * Get total decode count.
 */
export async function getFt8DecodeCount(): Promise<number> {
  const db = await getDB();
  return db.count("ft8Decodes");
}

/**
 * Delete decodes older than the given number of days.
 * Returns the number of deleted entries.
 */
export async function pruneFt8Decodes(olderThanDays: number): Promise<number> {
  const db = await getDB();
  const cutoff = new Date(
    Date.now() - olderThanDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  const tx = db.transaction("ft8Decodes", "readwrite");
  const index = tx.store.index("by-timestamp");
  let cursor = await index.openCursor(IDBKeyRange.upperBound(cutoff));
  let deleted = 0;

  while (cursor) {
    await cursor.delete();
    deleted++;
    cursor = await cursor.continue();
  }

  await tx.done;
  return deleted;
}

/**
 * Get all decodes (for full sync push). Returns in ascending timestamp order.
 */
export async function getAllFt8Decodes(): Promise<Ft8Decode[]> {
  const db = await getDB();
  return db.getAllFromIndex("ft8Decodes", "by-timestamp");
}
