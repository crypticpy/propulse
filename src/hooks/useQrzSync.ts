/**
 * useQrzSync -- React hook for QRZ.com logbook upload operations
 *
 * Provides reactive state for uploading QSOs to QRZ.com logbook.
 * QRZ does not support inbox/confirmation download -- only upload.
 */

import { useState, useCallback, useRef } from "react";
import type { LogEntry } from "@/lib/db/types";
import { uploadToQrz } from "@/lib/sync/qrzSync";
import type { QrzUploadResult } from "@/lib/sync/qrzSync";

// -- Types ------------------------------------------------------------------

export interface UseQrzSyncResult {
  /** Upload selected entries to QRZ.com logbook */
  upload: (entries: LogEntry[]) => Promise<QrzUploadResult>;
  /** Whether an upload operation is in progress */
  uploading: boolean;
  /** ISO timestamp of the last successful sync */
  lastSync: string | null;
  /** Error message from the most recent operation */
  error: string | null;
  /** Result of the most recent upload */
  lastUploadResult: QrzUploadResult | null;
}

// -- Persistence key --------------------------------------------------------

const LAST_SYNC_KEY = "propulse-qrz-last-sync";

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

export function useQrzSync(): UseQrzSyncResult {
  const [uploading, setUploading] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(getStoredLastSync);
  const [error, setError] = useState<string | null>(null);
  const [lastUploadResult, setLastUploadResult] =
    useState<QrzUploadResult | null>(null);

  const uploadingRef = useRef(false);

  /**
   * Upload entries to QRZ.com logbook.
   */
  const upload = useCallback(
    async (entries: LogEntry[]): Promise<QrzUploadResult> => {
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
        const result = await uploadToQrz(entries);
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
            : "Unknown error during QRZ upload";
        const result: QrzUploadResult = {
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

  return {
    upload,
    uploading,
    lastSync,
    error,
    lastUploadResult,
  };
}
