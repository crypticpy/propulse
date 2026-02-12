/**
 * Persistent offline write queue.
 *
 * Stores pending Supabase writes in localStorage so they survive
 * page refreshes and browser restarts. Deduplicates by (table, data.id)
 * keeping only the most recent entry.
 *
 * Storage key: 'propulse-sync-queue'
 * Max entries: 500
 */

import type { SyncableTable, WriteQueueEntry } from "./types";

const STORAGE_KEY = "propulse-sync-queue";
const MAX_ENTRIES = 500;

export class WriteQueue {
  private entries: WriteQueueEntry[] = [];

  constructor() {
    this.load();
  }

  /** Load queue from localStorage */
  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.entries = Array.isArray(parsed) ? parsed : [];
      }
    } catch {
      this.entries = [];
    }
  }

  /** Persist queue to localStorage */
  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries));
    } catch {
      console.warn(
        "[WriteQueue] localStorage full, queue persisted in memory only",
      );
    }
  }

  /** Add an entry, deduplicating by (table, data.id) */
  enqueue(
    table: SyncableTable,
    operation: "upsert" | "delete",
    data: Record<string, unknown>,
  ): void {
    const dataId = data.id as string | undefined;

    // Deduplicate: remove existing entry for same (table, id)
    if (dataId) {
      this.entries = this.entries.filter(
        (e) => !(e.table === table && (e.data.id as string) === dataId),
      );
    }

    // Enforce max size — drop oldest failed first, then oldest pending
    if (this.entries.length >= MAX_ENTRIES) {
      const failedIdx = this.entries.findIndex((e) => e.status === "failed");
      if (failedIdx !== -1) {
        this.entries.splice(failedIdx, 1);
      } else {
        // No failed entries — drop oldest pending as last resort
        this.entries.shift();
      }
    }

    this.entries.push({
      queueId: crypto.randomUUID(),
      table,
      operation,
      data,
      timestamp: new Date().toISOString(),
      retryCount: 0,
      status: "pending",
    });

    this.save();
  }

  /** Remove entries by queue IDs (after successful push) */
  dequeue(queueIds: string[]): void {
    if (queueIds.length === 0) return;
    const idSet = new Set(queueIds);
    this.entries = this.entries.filter((e) => !idSet.has(e.queueId));
    this.save();
  }

  /** Get all pending entries */
  getPending(): WriteQueueEntry[] {
    return this.entries.filter((e) => e.status === "pending");
  }

  /** Get pending entries for specific tables */
  getPendingForTables(tables: SyncableTable[]): WriteQueueEntry[] {
    const tableSet = new Set<string>(tables);
    return this.entries.filter(
      (e) => e.status === "pending" && tableSet.has(e.table),
    );
  }

  /** Get all failed entries */
  getFailed(): WriteQueueEntry[] {
    return this.entries.filter((e) => e.status === "failed");
  }

  /** Mark an entry as failed and increment retry count */
  markFailed(queueId: string): void {
    const entry = this.entries.find((e) => e.queueId === queueId);
    if (entry) {
      entry.status = "failed";
      entry.retryCount++;
      this.save();
    }
  }

  /** Reset a failed entry back to pending for retry */
  retry(queueId: string): void {
    const entry = this.entries.find((e) => e.queueId === queueId);
    if (entry) {
      entry.status = "pending";
      this.save();
    }
  }

  /** Retry all failed entries */
  retryAll(): void {
    let changed = false;
    for (const entry of this.entries) {
      if (entry.status === "failed") {
        entry.status = "pending";
        changed = true;
      }
    }
    if (changed) this.save();
  }

  /** Get total number of entries (pending + failed) */
  get size(): number {
    return this.entries.length;
  }

  /** Get count of pending entries */
  get pendingCount(): number {
    return this.entries.filter((e) => e.status === "pending").length;
  }

  /** Clear all entries */
  clear(): void {
    this.entries = [];
    this.save();
  }

  /** Get all entries (for debugging) */
  getAll(): WriteQueueEntry[] {
    return [...this.entries];
  }
}
