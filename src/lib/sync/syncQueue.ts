/**
 * QSO-specific sync queue with optimistic UI and batch coalescing.
 *
 * Wraps the existing WriteQueue pattern with QSO-specific enhancements:
 * - Optimistic UI: immediately reflect changes in local state
 * - Batch coalescing: group multiple rapid edits to the same entry
 * - Priority queue: new QSOs > edits > deletes
 * - Max 2000 entries (same as existing WriteQueue limit)
 *
 * Storage key: 'propulse-qso-sync-queue'
 */

import type { SyncableTable } from "./types";
import { getDeviceId } from "./deviceId";

// ─── Constants ──────────────────────────────────────────────────────────────

const STORAGE_KEY = "propulse-qso-sync-queue";
const MAX_ENTRIES = 2000;

/** Coalesce window: rapid edits within 2 seconds are merged */
const COALESCE_WINDOW_MS = 2_000;

// ─── Types ──────────────────────────────────────────────────────────────────

/** Priority levels: lower number = higher priority */
type QSOOperationPriority = 0 | 1 | 2;

const PRIORITY_MAP: Record<QSOQueueOperation, QSOOperationPriority> = {
  create: 0,
  update: 1,
  delete: 2,
};

/** QSO-specific operation types (more granular than WriteQueue's upsert/delete) */
export type QSOQueueOperation = "create" | "update" | "delete";

/** QSO sync queue entry */
export interface QSOQueueEntry {
  /** Unique queue entry ID */
  queueId: string;
  /** Always 'log_entries' for QSO queue */
  table: SyncableTable;
  /** QSO-specific operation type */
  operation: QSOQueueOperation;
  /** The log entry ID this queue entry refers to */
  entryId: string;
  /** Row data for the operation */
  data: Record<string, unknown>;
  /** Device that created this entry */
  deviceId: string;
  /** ISO timestamp of when the entry was first enqueued */
  createdAt: string;
  /** ISO timestamp of most recent update (for coalescing) */
  lastUpdatedAt: string;
  /** Number of times this entry has been coalesced (edits merged) */
  coalesceCount: number;
  /** Number of failed push attempts */
  retryCount: number;
  /** Current status */
  status: "pending" | "failed";
  /** Priority: 0 = create, 1 = update, 2 = delete */
  priority: QSOOperationPriority;
}

// ─── Callbacks ──────────────────────────────────────────────────────────────

/** Callback for optimistic UI updates */
export type OptimisticCallback = (
  entryId: string,
  operation: QSOQueueOperation,
  data: Record<string, unknown>,
) => void;

// ─── QSOSyncQueue ──────────────────────────────────────────────────────────

export class QSOSyncQueue {
  private entries: QSOQueueEntry[] = [];
  private deviceId: string;
  private optimisticCallbacks: OptimisticCallback[] = [];

  constructor() {
    this.deviceId = getDeviceId();
    this.load();
  }

  // ─── Public API ───────────────────────────────────────────────────

  /**
   * Enqueue a QSO operation.
   * Applies optimistic UI callback immediately, then queues for sync.
   *
   * @param entryId - The log entry ID
   * @param operation - create, update, or delete
   * @param data - Row data for the operation
   */
  enqueue(
    entryId: string,
    operation: QSOQueueOperation,
    data: Record<string, unknown>,
  ): void {
    const now = new Date().toISOString();

    // Fire optimistic UI callbacks immediately
    for (const cb of this.optimisticCallbacks) {
      try {
        cb(entryId, operation, data);
      } catch {
        // Non-fatal — optimistic callback failure shouldn't block queue
      }
    }

    // Check for coalescing: if there's a recent entry for the same entryId
    const existingIdx = this.entries.findIndex(
      (e) =>
        e.entryId === entryId &&
        e.status === "pending" &&
        this.isWithinCoalesceWindow(e.lastUpdatedAt),
    );

    if (existingIdx !== -1) {
      const existing = this.entries[existingIdx];

      // Coalesce: merge update data into existing entry
      if (operation === "delete") {
        // Delete supersedes any previous operation
        existing.operation = "delete";
        existing.data = data;
        existing.priority = PRIORITY_MAP.delete;
      } else if (existing.operation === "create" && operation === "update") {
        // Keep as create but merge the updated data
        existing.data = { ...existing.data, ...data };
      } else {
        // Merge data for updates
        existing.data = { ...existing.data, ...data };
        existing.operation = operation;
        existing.priority = PRIORITY_MAP[operation];
      }

      existing.lastUpdatedAt = now;
      existing.coalesceCount++;
      this.save();
      return;
    }

    // Deduplicate: remove any existing entry for the same entryId
    this.entries = this.entries.filter(
      (e) => !(e.entryId === entryId && e.status === "pending"),
    );

    // Enforce max size
    if (this.entries.length >= MAX_ENTRIES) {
      // Remove oldest failed first, then oldest pending
      const failedIdx = this.entries.findIndex((e) => e.status === "failed");
      if (failedIdx !== -1) {
        this.entries.splice(failedIdx, 1);
      } else {
        // Remove lowest priority (highest number) entry
        const lowestPriorityIdx = this.entries.reduce(
          (maxIdx, entry, idx) =>
            entry.priority > this.entries[maxIdx].priority ? idx : maxIdx,
          0,
        );
        this.entries.splice(lowestPriorityIdx, 1);
      }
    }

    // Add new entry
    this.entries.push({
      queueId: crypto.randomUUID(),
      table: "log_entries",
      operation,
      entryId,
      data,
      deviceId: this.deviceId,
      createdAt: now,
      lastUpdatedAt: now,
      coalesceCount: 0,
      retryCount: 0,
      status: "pending",
      priority: PRIORITY_MAP[operation],
    });

    this.save();
  }

  /**
   * Get all pending entries, sorted by priority (creates first, then updates, then deletes).
   */
  getEntries(): QSOQueueEntry[] {
    return [...this.entries]
      .filter((e) => e.status === "pending")
      .sort((a, b) => a.priority - b.priority);
  }

  /** Get all entries including failed ones */
  getAllEntries(): QSOQueueEntry[] {
    return [...this.entries];
  }

  /** Get count of pending entries */
  getPendingCount(): number {
    return this.entries.filter((e) => e.status === "pending").length;
  }

  /** Get count of failed entries */
  getFailedCount(): number {
    return this.entries.filter((e) => e.status === "failed").length;
  }

  /** Get total entry count */
  get size(): number {
    return this.entries.length;
  }

  /**
   * Flush: remove processed entries by queue IDs.
   * Called after successful sync push.
   */
  flush(processedQueueIds: string[]): void {
    if (processedQueueIds.length === 0) return;
    const idSet = new Set(processedQueueIds);
    this.entries = this.entries.filter((e) => !idSet.has(e.queueId));
    this.save();
  }

  /** Mark an entry as failed */
  markFailed(queueId: string): void {
    const entry = this.entries.find((e) => e.queueId === queueId);
    if (entry) {
      entry.status = "failed";
      entry.retryCount++;
      this.save();
    }
  }

  /** Retry a specific failed entry */
  retry(queueId: string): void {
    const entry = this.entries.find((e) => e.queueId === queueId);
    if (entry && entry.status === "failed") {
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

  /** Clear all entries */
  clear(): void {
    this.entries = [];
    this.save();
  }

  /** Register an optimistic UI callback */
  onOptimisticUpdate(callback: OptimisticCallback): () => void {
    this.optimisticCallbacks.push(callback);
    return () => {
      this.optimisticCallbacks = this.optimisticCallbacks.filter(
        (cb) => cb !== callback,
      );
    };
  }

  /** Check if there's a pending entry for a given log entry ID */
  hasPendingForEntry(entryId: string): boolean {
    return this.entries.some(
      (e) => e.entryId === entryId && e.status === "pending",
    );
  }

  // ─── Private Helpers ──────────────────────────────────────────────

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
        "[QSOSyncQueue] localStorage full, queue persisted in memory only",
      );
    }
  }

  /** Check if a timestamp is within the coalesce window */
  private isWithinCoalesceWindow(isoTimestamp: string): boolean {
    const ts = new Date(isoTimestamp).getTime();
    return Date.now() - ts < COALESCE_WINDOW_MS;
  }
}
