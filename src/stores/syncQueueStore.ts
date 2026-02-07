/**
 * Zustand store for sync/retry queue management
 *
 * Queues failed QSO uploads to external services (eQSL, Club Log) and
 * tracks retry state so the background processor can auto-retry when
 * the browser comes back online.
 *
 * Persists to localStorage with key 'propulse-sync-queue'.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// =============================================================================
// TYPES
// =============================================================================

/** Supported external upload services */
export type SyncService = "eqsl" | "clublog";

/** Lifecycle status of a queued upload */
export type SyncStatus = "pending" | "retrying" | "failed";

/**
 * A single queued upload item
 */
export interface QueueItem {
  /** Unique identifier (UUID) */
  id: string;
  /** Target upload service */
  service: SyncService;
  /** Log entry IDs to upload */
  entryIds: string[];
  /** ISO timestamp when the item was first queued */
  createdAt: string;
  /** Number of retry attempts so far */
  retryCount: number;
  /** Maximum retries before marking as failed */
  maxRetries: number;
  /** Human-readable error from the most recent failure */
  lastError: string | null;
  /** Current lifecycle status */
  status: SyncStatus;
  /** ISO timestamp for the next retry attempt (exponential backoff) */
  nextRetryAt: string | null;
}

/** Default maximum number of retries per queue item */
const DEFAULT_MAX_RETRIES = 5;

/**
 * Compute the next retry delay using exponential backoff.
 * Formula: min(30000 * 2^retryCount, 300000) ms — caps at 5 minutes.
 */
function computeNextRetryAt(retryCount: number): string {
  const delayMs = Math.min(30_000 * Math.pow(2, retryCount), 300_000);
  return new Date(Date.now() + delayMs).toISOString();
}

// =============================================================================
// STORE
// =============================================================================

/**
 * Sync queue store state and actions
 */
interface SyncQueueState {
  /** Ordered list of queued upload items */
  items: QueueItem[];
  /** Whether the browser currently has network connectivity */
  isOnline: boolean;
  /** ISO timestamp of the last successful sync */
  lastSyncAt: string | null;

  // -- Actions --

  /** Add a new pending upload to the queue */
  enqueue: (service: SyncService, entryIds: string[]) => void;
  /** Mark an item as currently retrying */
  markRetrying: (id: string) => void;
  /** Mark an item as successfully uploaded (removes from queue) */
  markSuccess: (id: string) => void;
  /** Mark an item as failed — increments retry count and schedules next retry */
  markFailed: (id: string, error: string) => void;
  /** Remove a single item from the queue */
  removeItem: (id: string) => void;
  /** Remove all failed items from the queue */
  clearFailed: () => void;
  /** Reset all failed items to pending for immediate retry */
  retryAll: () => void;
  /** Update the online status flag */
  setOnline: (online: boolean) => void;
}

/** localStorage key for sync queue persistence */
const STORAGE_KEY = "propulse-sync-queue";

/**
 * Sync queue store with localStorage persistence
 *
 * @example
 * ```tsx
 * const { items, enqueue, removeItem } = useSyncQueueStore();
 *
 * // Queue a failed upload for retry
 * enqueue("eqsl", ["entry-1", "entry-2"]);
 *
 * // Remove a completed item
 * removeItem(item.id);
 * ```
 */
export const useSyncQueueStore = create<SyncQueueState>()(
  persist(
    (set) => ({
      items: [],
      isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
      lastSyncAt: null,

      enqueue: (service, entryIds) => {
        const newItem: QueueItem = {
          id: crypto.randomUUID(),
          service,
          entryIds,
          createdAt: new Date().toISOString(),
          retryCount: 0,
          maxRetries: DEFAULT_MAX_RETRIES,
          lastError: null,
          status: "pending",
          nextRetryAt: null,
        };

        set((state) => ({
          items: [...state.items, newItem],
        }));
      },

      markRetrying: (id) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, status: "retrying" as const } : item,
          ),
        })),

      markSuccess: (id) =>
        set((state) => ({
          items: state.items.filter((item) => item.id !== id),
          lastSyncAt: new Date().toISOString(),
        })),

      markFailed: (id, error) =>
        set((state) => ({
          items: state.items.map((item) => {
            if (item.id !== id) return item;

            const nextRetryCount = item.retryCount + 1;
            const isFailed = nextRetryCount >= item.maxRetries;

            return {
              ...item,
              retryCount: nextRetryCount,
              lastError: error,
              status: isFailed ? ("failed" as const) : ("pending" as const),
              nextRetryAt: isFailed ? null : computeNextRetryAt(nextRetryCount),
            };
          }),
        })),

      removeItem: (id) =>
        set((state) => ({
          items: state.items.filter((item) => item.id !== id),
        })),

      clearFailed: () =>
        set((state) => ({
          items: state.items.filter((item) => item.status !== "failed"),
        })),

      retryAll: () =>
        set((state) => ({
          items: state.items.map((item) =>
            item.status === "failed"
              ? {
                  ...item,
                  status: "pending" as const,
                  retryCount: 0,
                  lastError: null,
                  nextRetryAt: null,
                }
              : item,
          ),
        })),

      setOnline: (online) => set({ isOnline: online }),
    }),
    {
      name: STORAGE_KEY,
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        items: state.items,
        lastSyncAt: state.lastSyncAt,
      }),
      migrate: (persisted, version) => {
        // v1 -> v2: rename queue -> items and adapt shape
        if (version < 2) {
          const old = persisted as Record<string, unknown>;
          const legacyQueue = Array.isArray(old.queue)
            ? (old.queue as Record<string, unknown>[])
            : [];

          const items: QueueItem[] = legacyQueue.map((raw) => ({
            id: (raw.id as string) ?? crypto.randomUUID(),
            service: (raw.service as SyncService) ?? "eqsl",
            entryIds: Array.isArray(raw.entryIds)
              ? (raw.entryIds as string[])
              : [],
            createdAt: (raw.createdAt as string) ?? new Date().toISOString(),
            retryCount: typeof raw.retryCount === "number" ? raw.retryCount : 0,
            maxRetries:
              typeof raw.maxRetries === "number"
                ? raw.maxRetries
                : DEFAULT_MAX_RETRIES,
            lastError:
              typeof raw.errorMessage === "string" ? raw.errorMessage : null,
            status: (raw.status as SyncStatus) ?? "pending",
            nextRetryAt: null,
          }));

          return { items, lastSyncAt: null };
        }
        return persisted as { items: QueueItem[]; lastSyncAt: string | null };
      },
    },
  ),
);
