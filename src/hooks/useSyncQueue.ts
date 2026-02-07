/**
 * useSyncQueue Hook
 *
 * Background processor for the sync/retry queue. Periodically attempts to
 * upload queued QSO log entries to external services (eQSL, Club Log),
 * respecting online/offline status, exponential backoff, and retry limits.
 *
 * Features:
 * - Polls every 10 seconds to process pending queue items
 * - Respects nextRetryAt timestamps (exponential backoff)
 * - Skips processing when the browser is offline (navigator.onLine)
 * - Reads log entries from IndexedDB, generates ADIF, and uploads
 * - Removes items on success; schedules next retry on failure
 * - Marks items as "failed" once retryCount reaches maxRetries
 * - Exposes retryAll() to force immediate re-processing of failed items
 *
 * @example
 * ```tsx
 * function App() {
 *   const { isOnline, pendingCount, failedCount, isProcessing, retryAll } =
 *     useSyncQueue();
 *
 *   return (
 *     <div>
 *       {!isOnline && <span>Offline</span>}
 *       {pendingCount > 0 && <span>{pendingCount} pending uploads</span>}
 *       {failedCount > 0 && <button onClick={retryAll}>Retry all</button>}
 *     </div>
 *   );
 * }
 * ```
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useSyncQueueStore } from "@/stores/syncQueueStore";
import type { QueueItem } from "@/stores/syncQueueStore";
import { useUserStore } from "@/stores/userStore";
import { getLogEntry } from "@/lib/db/logStore";
import { generateADIF } from "@/lib/utils/adifParser";
import { uploadToEqsl, uploadToClublog } from "@/lib/api/logUpload";
import type { LogEntry } from "@/lib/db/types";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Interval between automatic processing runs (ms) */
const POLL_INTERVAL_MS = 10_000;

// =============================================================================
// HOOK
// =============================================================================

export interface UseSyncQueueReturn {
  /** Whether the browser currently has network connectivity */
  isOnline: boolean;
  /** Number of items in "pending" or "retrying" status */
  pendingCount: number;
  /** Number of items that have exhausted all retries */
  failedCount: number;
  /** Whether the processor is currently uploading */
  isProcessing: boolean;
}

/**
 * Background sync queue processor hook.
 *
 * Mount this once near the root of the app (e.g. in a layout component).
 * It will automatically process queued uploads on a 10-second timer and
 * whenever the browser transitions from offline to online.
 */
export function useSyncQueue(): UseSyncQueueReturn {
  // ---------------------------------------------------------------------------
  // Online / offline tracking
  // ---------------------------------------------------------------------------
  const setOnline = useSyncQueueStore((s) => s.setOnline);
  const isOnline = useSyncQueueStore((s) => s.isOnline);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [setOnline]);

  // ---------------------------------------------------------------------------
  // Processing state
  // ---------------------------------------------------------------------------
  const [isProcessing, setIsProcessing] = useState(false);
  const processingRef = useRef(false);

  // ---------------------------------------------------------------------------
  // Derived counts from the queue
  // ---------------------------------------------------------------------------
  const items = useSyncQueueStore((s) => s.items);

  const pendingCount = items.filter(
    (item) => item.status === "pending" || item.status === "retrying",
  ).length;

  const failedCount = items.filter((item) => item.status === "failed").length;

  // ---------------------------------------------------------------------------
  // Core processing logic
  // ---------------------------------------------------------------------------
  const processQueue = useCallback(async () => {
    // Guard: skip if offline or already processing
    if (!navigator.onLine || processingRef.current) {
      return;
    }

    const { items, markRetrying, markSuccess, markFailed } =
      useSyncQueueStore.getState();
    const now = Date.now();

    // Find actionable items: pending/retrying whose nextRetryAt has passed
    const actionable = items.filter((item) => {
      if (item.status !== "pending" && item.status !== "retrying") return false;
      if (item.nextRetryAt && new Date(item.nextRetryAt).getTime() > now) {
        return false;
      }
      return true;
    });

    if (actionable.length === 0) {
      return;
    }

    processingRef.current = true;
    setIsProcessing(true);

    try {
      for (const item of actionable) {
        await processItem(item, markRetrying, markSuccess, markFailed);
      }
    } finally {
      processingRef.current = false;
      setIsProcessing(false);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Timer-based polling
  // ---------------------------------------------------------------------------
  useEffect(() => {
    // Run once on mount
    processQueue();

    const intervalId = setInterval(processQueue, POLL_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [processQueue]);

  // ---------------------------------------------------------------------------
  // Trigger processing when coming back online
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (isOnline) {
      processQueue();
    }
  }, [isOnline, processQueue]);

  return {
    isOnline,
    pendingCount,
    failedCount,
    isProcessing,
  };
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

/**
 * Process a single queue item: fetch entries, generate ADIF, upload.
 */
async function processItem(
  item: QueueItem,
  markRetrying: (id: string) => void,
  markSuccess: (id: string) => void,
  markFailed: (id: string, error: string) => void,
): Promise<void> {
  // 1. Check credentials before marking as retrying — avoids stuck "retrying" state
  const { serviceCredentials } = useUserStore.getState();
  if (item.service === "eqsl" && !serviceCredentials.eqsl) return;
  if (item.service === "clublog" && !serviceCredentials.clublog) return;

  // Mark as retrying so UI can show progress
  markRetrying(item.id);

  try {
    // 2. Read log entries from IndexedDB
    const entries: LogEntry[] = [];
    for (const entryId of item.entryIds) {
      const entry = await getLogEntry(entryId);
      if (entry) {
        entries.push(entry);
      }
    }

    if (entries.length === 0) {
      // All entries have been deleted — remove the queue item
      markSuccess(item.id);
      return;
    }

    // 3. Generate ADIF from the entries
    const adifContent = generateADIF(entries);

    // 4. Upload to the appropriate service
    let result: { success: boolean; message: string };

    if (item.service === "eqsl") {
      result = await uploadToEqsl(adifContent, serviceCredentials.eqsl!);
    } else if (item.service === "clublog") {
      result = await uploadToClublog(adifContent, serviceCredentials.clublog!);
    } else {
      // Exhaustive guard — fail immediately for unknown service types
      markFailed(item.id, `Unsupported service: ${item.service as string}`);
      return;
    }

    // 5. Handle result
    if (result.success) {
      markSuccess(item.id);
    } else {
      markFailed(item.id, result.message);
    }
  } catch (error) {
    markFailed(
      item.id,
      error instanceof Error ? error.message : "Unknown error occurred",
    );
  }
}
