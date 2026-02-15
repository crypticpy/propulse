/**
 * useLotwSync — React hook for LoTW upload and download operations
 *
 * Provides reactive state for uploading QSOs to LoTW (via ADIF + TQSL)
 * and downloading confirmations with automatic matching.
 */

import { useState, useCallback, useRef } from "react";
import type { LogEntry } from "@/lib/db/types";
import {
  uploadToLotw,
  downloadLotwConfirmations,
  matchLotwConfirmations,
} from "@/lib/sync/lotwSync";
import type {
  LotwUploadResult,
  LotwDownloadResult,
  QslStatusUpdate,
} from "@/lib/sync/lotwSync";
import { updateLogEntry } from "@/lib/db/logStore";

// ── Types ────────────────────────────────────────────────────────────────────

export interface UseLotwSyncResult {
  /** Generate ADIF from selected entries for TQSL signing */
  upload: (entries: LogEntry[]) => LotwUploadResult;
  /** Download confirmations from LoTW and match against local log */
  download: (since?: string) => Promise<LotwDownloadResult>;
  /** Whether an upload operation is in progress */
  uploading: boolean;
  /** Whether a download operation is in progress */
  downloading: boolean;
  /** ISO timestamp of the last successful sync */
  lastSync: string | null;
  /** Error message from the most recent operation */
  error: string | null;
  /** Result of the most recent upload */
  lastUploadResult: LotwUploadResult | null;
  /** Result of the most recent download */
  lastDownloadResult: LotwDownloadResult | null;
}

// ── Persistence key ─────────────────────────────────────────────────────────

const LAST_SYNC_KEY = "propulse-lotw-last-sync";

function getStoredLastSync(): string | null {
  try {
    return localStorage.getItem(LAST_SYNC_KEY);
  } catch {
    return null;
  }
}

function storeLastSync(iso: string): void {
  try {
    localStorage.setItem(LAST_SYNC_KEY, iso);
  } catch {
    // localStorage unavailable — skip
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useLotwSync(): UseLotwSyncResult {
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(getStoredLastSync);
  const [error, setError] = useState<string | null>(null);
  const [lastUploadResult, setLastUploadResult] =
    useState<LotwUploadResult | null>(null);
  const [lastDownloadResult, setLastDownloadResult] =
    useState<LotwDownloadResult | null>(null);

  // Guard against concurrent downloads
  const downloadingRef = useRef(false);

  /**
   * Upload: Generate an ADIF file for TQSL signing.
   * This is synchronous (file download) so uploading state is brief.
   */
  const upload = useCallback((entries: LogEntry[]): LotwUploadResult => {
    setUploading(true);
    setError(null);

    try {
      const result = uploadToLotw(entries);
      setLastUploadResult(result);

      if (!result.success) {
        setError(result.message);
      }

      return result;
    } finally {
      setUploading(false);
    }
  }, []);

  /**
   * Download: Fetch confirmations from LoTW and match against local log.
   * Applies matched updates to IndexedDB.
   */
  const download = useCallback(
    async (since?: string): Promise<LotwDownloadResult> => {
      // Prevent concurrent downloads
      if (downloadingRef.current) {
        return {
          success: false,
          confirmationsReceived: 0,
          matchedCount: 0,
          unmatchedCount: 0,
          message: "A download is already in progress",
        };
      }

      downloadingRef.current = true;
      setDownloading(true);
      setError(null);

      try {
        // Step 1: Download confirmations from LoTW
        const { confirmations, error: dlError } =
          await downloadLotwConfirmations(since);

        if (dlError) {
          const result: LotwDownloadResult = {
            success: false,
            confirmationsReceived: 0,
            matchedCount: 0,
            unmatchedCount: 0,
            message: dlError,
          };
          setError(dlError);
          setLastDownloadResult(result);
          return result;
        }

        if (confirmations.length === 0) {
          const result: LotwDownloadResult = {
            success: true,
            confirmationsReceived: 0,
            matchedCount: 0,
            unmatchedCount: 0,
            message: "No new confirmations from LoTW",
          };
          setLastDownloadResult(result);
          // Still update lastSync to avoid re-fetching
          const nowIso = new Date().toISOString();
          setLastSync(nowIso);
          storeLastSync(nowIso);
          return result;
        }

        // Step 2: Match confirmations against local log
        const { updates, matchedCount, unmatchedCount } =
          await matchLotwConfirmations(confirmations);

        // Step 3: Apply updates to IndexedDB
        await applyQslUpdates(updates);

        // Step 4: Record sync timestamp
        const nowIso = new Date().toISOString();
        setLastSync(nowIso);
        storeLastSync(nowIso);

        const result: LotwDownloadResult = {
          success: true,
          confirmationsReceived: confirmations.length,
          matchedCount,
          unmatchedCount,
          message: buildDownloadMessage(
            confirmations.length,
            matchedCount,
            unmatchedCount,
          ),
        };
        setLastDownloadResult(result);
        return result;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error during LoTW sync";
        const result: LotwDownloadResult = {
          success: false,
          confirmationsReceived: 0,
          matchedCount: 0,
          unmatchedCount: 0,
          message,
        };
        setError(message);
        setLastDownloadResult(result);
        return result;
      } finally {
        setDownloading(false);
        downloadingRef.current = false;
      }
    },
    [],
  );

  return {
    upload,
    download,
    uploading,
    downloading,
    lastSync,
    error,
    lastUploadResult,
    lastDownloadResult,
  };
}

// ── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Apply QSL status updates to IndexedDB entries.
 * Groups updates by entry ID and applies them in a single updateLogEntry call per entry.
 */
async function applyQslUpdates(updates: QslStatusUpdate[]): Promise<void> {
  // Group updates by entry ID
  const grouped = new Map<string, Record<string, unknown>>();

  for (const update of updates) {
    const existing = grouped.get(update.id) ?? {};

    if (update.field === "lotw") {
      existing.lotw = update.value === "true";
    } else {
      existing[update.field] = update.value;
    }

    grouped.set(update.id, existing);
  }

  // Apply each group
  for (const [id, fields] of grouped) {
    try {
      await updateLogEntry(id, fields as Partial<LogEntry>);
    } catch (err) {
      console.error(`[lotwSync] Failed to update entry ${id}:`, err);
      // Continue with remaining updates
    }
  }
}

/** Build a human-readable summary message for download results */
function buildDownloadMessage(
  received: number,
  matched: number,
  unmatched: number,
): string {
  const parts: string[] = [];

  parts.push(
    `${received} confirmation${received !== 1 ? "s" : ""} received from LoTW`,
  );

  if (matched > 0) {
    parts.push(`${matched} QSO${matched !== 1 ? "s" : ""} updated`);
  }

  if (unmatched > 0) {
    parts.push(`${unmatched} could not be matched to local log`);
  }

  return parts.join(". ") + ".";
}
