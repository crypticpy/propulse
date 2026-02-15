/**
 * useEqslSync -- React hook for eQSL upload and download operations
 *
 * Provides reactive state for uploading QSOs to eQSL.cc and downloading
 * inbox confirmations with automatic matching against the local log.
 */

import { useState, useCallback, useRef } from "react";
import type { LogEntry } from "@/lib/db/types";
import {
  uploadToEqsl,
  downloadEqslInbox,
  matchEqslConfirmations,
} from "@/lib/sync/eqslSync";
import type {
  EqslUploadResult,
  EqslInboxResult,
  QslUpdate,
} from "@/lib/sync/eqslSync";
import { updateLogEntry } from "@/lib/db/logStore";

// -- Types ------------------------------------------------------------------

export interface EqslDownloadResult {
  /** Whether the download and matching completed successfully */
  success: boolean;
  /** Number of confirmations received from eQSL inbox */
  confirmationsReceived: number;
  /** Number of local QSOs that were updated */
  matchedCount: number;
  /** Number of confirmations that could not be matched locally */
  unmatchedCount: number;
  /** Human-readable status message */
  message: string;
}

export interface UseEqslSyncResult {
  /** Upload selected entries to eQSL */
  upload: (entries: LogEntry[]) => Promise<EqslUploadResult>;
  /** Download inbox confirmations and match against local log */
  download: (since?: string) => Promise<EqslDownloadResult>;
  /** Whether an upload operation is in progress */
  uploading: boolean;
  /** Whether a download operation is in progress */
  downloading: boolean;
  /** ISO timestamp of the last successful sync */
  lastSync: string | null;
  /** Error message from the most recent operation */
  error: string | null;
  /** Result of the most recent upload */
  lastUploadResult: EqslUploadResult | null;
  /** Result of the most recent download */
  lastDownloadResult: EqslDownloadResult | null;
}

// -- Persistence key --------------------------------------------------------

const LAST_SYNC_KEY = "propulse-eqsl-last-sync";

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
    // localStorage unavailable -- skip
  }
}

// -- Hook -------------------------------------------------------------------

export function useEqslSync(): UseEqslSyncResult {
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(getStoredLastSync);
  const [error, setError] = useState<string | null>(null);
  const [lastUploadResult, setLastUploadResult] =
    useState<EqslUploadResult | null>(null);
  const [lastDownloadResult, setLastDownloadResult] =
    useState<EqslDownloadResult | null>(null);

  // Guard against concurrent operations
  const uploadingRef = useRef(false);
  const downloadingRef = useRef(false);

  /**
   * Upload entries to eQSL.cc.
   */
  const upload = useCallback(
    async (entries: LogEntry[]): Promise<EqslUploadResult> => {
      if (uploadingRef.current) {
        return {
          success: false,
          qsoCount: 0,
          message: "An upload is already in progress",
        };
      }

      uploadingRef.current = true;
      setUploading(true);
      setError(null);

      try {
        const result = await uploadToEqsl(entries);
        setLastUploadResult(result);

        if (!result.success) {
          setError(result.message);
        } else {
          const nowIso = new Date().toISOString();
          setLastSync(nowIso);
          storeLastSync(nowIso);
        }

        return result;
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Unknown error during eQSL upload";
        const result: EqslUploadResult = {
          success: false,
          qsoCount: 0,
          message,
        };
        setError(message);
        setLastUploadResult(result);
        return result;
      } finally {
        setUploading(false);
        uploadingRef.current = false;
      }
    },
    [],
  );

  /**
   * Download inbox confirmations from eQSL and match against local log.
   */
  const download = useCallback(
    async (since?: string): Promise<EqslDownloadResult> => {
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
        // Step 1: Download inbox
        const inboxResult: EqslInboxResult = await downloadEqslInbox(since);

        if (!inboxResult.success) {
          const result: EqslDownloadResult = {
            success: false,
            confirmationsReceived: 0,
            matchedCount: 0,
            unmatchedCount: 0,
            message: inboxResult.message,
          };
          setError(inboxResult.message);
          setLastDownloadResult(result);
          return result;
        }

        if (inboxResult.confirmations.length === 0) {
          const result: EqslDownloadResult = {
            success: true,
            confirmationsReceived: 0,
            matchedCount: 0,
            unmatchedCount: 0,
            message: "No new confirmations from eQSL",
          };
          setLastDownloadResult(result);
          const nowIso = new Date().toISOString();
          setLastSync(nowIso);
          storeLastSync(nowIso);
          return result;
        }

        // Step 2: Match confirmations against local log
        const { updates, matchedCount, unmatchedCount } =
          await matchEqslConfirmations(inboxResult.confirmations);

        // Step 3: Apply updates to IndexedDB
        await applyEqslUpdates(updates);

        // Step 4: Record sync timestamp
        const nowIso = new Date().toISOString();
        setLastSync(nowIso);
        storeLastSync(nowIso);

        const result: EqslDownloadResult = {
          success: true,
          confirmationsReceived: inboxResult.confirmations.length,
          matchedCount,
          unmatchedCount,
          message: buildDownloadMessage(
            inboxResult.confirmations.length,
            matchedCount,
            unmatchedCount,
          ),
        };
        setLastDownloadResult(result);
        return result;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error during eQSL sync";
        const result: EqslDownloadResult = {
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

// -- Internal Helpers -------------------------------------------------------

/**
 * Apply eQSL status updates to IndexedDB entries.
 */
async function applyEqslUpdates(updates: QslUpdate[]): Promise<void> {
  // Group updates by entry ID
  const grouped = new Map<string, Record<string, unknown>>();

  for (const update of updates) {
    const existing = grouped.get(update.id) ?? {};

    if (update.field === "eqsl") {
      existing.eqsl = update.value === "true";
    } else {
      existing[update.field] = update.value;
    }

    grouped.set(update.id, existing);
  }

  for (const [id, fields] of grouped) {
    try {
      await updateLogEntry(id, fields as Partial<LogEntry>);
    } catch (err) {
      console.error(`[eqslSync] Failed to update entry ${id}:`, err);
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
    `${received} confirmation${received !== 1 ? "s" : ""} received from eQSL`,
  );

  if (matched > 0) {
    parts.push(`${matched} QSO${matched !== 1 ? "s" : ""} updated`);
  }

  if (unmatched > 0) {
    parts.push(`${unmatched} could not be matched to local log`);
  }

  return parts.join(". ") + ".";
}
