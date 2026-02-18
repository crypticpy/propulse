/**
 * Hook for FT8 time synchronization monitoring.
 *
 * Checks clock sync on mount and every 5 minutes while the decoder is active.
 * Returns the latest sync result for display in the decoder panel.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { checkTimeSync, type TimeSyncResult } from "@/lib/ft8/timeSyncCheck";

/** Check interval: 5 minutes */
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

export interface UseFt8TimeSyncResult {
  /** Latest sync check result (null until first check completes) */
  syncResult: TimeSyncResult | null;
  /** True while a check is in progress */
  checking: boolean;
  /** Manually trigger a sync check */
  recheckNow: () => void;
}

export function useFt8TimeSync(active: boolean): UseFt8TimeSyncResult {
  const [syncResult, setSyncResult] = useState<TimeSyncResult | null>(null);
  const [checking, setChecking] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const doCheck = useCallback(async () => {
    setChecking(true);
    try {
      const result = await checkTimeSync();
      setSyncResult(result);
    } catch {
      // Silently fail — stale result is better than no result
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (!active) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Initial check
    doCheck();

    // Periodic checks
    intervalRef.current = setInterval(doCheck, CHECK_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [active, doCheck]);

  return { syncResult, checking, recheckNow: doCheck };
}
