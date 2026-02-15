/**
 * useSpotAlerts — Spot monitoring hook
 *
 * Subscribes to new spots via Supabase realtime or periodic polling,
 * evaluates them against user-defined alert rules, and dispatches
 * notifications. Includes deduplication and rate limiting.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  evaluateSpot,
  dispatchAlert,
  type SpotLike,
  type AlertMatch,
} from "@/lib/alerts/alertEngine";
import { getEnabledAlertRules } from "@/lib/db/alertStore";
import { addAlertHistoryEntry, wasRecentlyAlerted } from "@/lib/db/alertStore";
import {
  isSupabaseConfigured,
  querySpotHistory,
  subscribeToSpots,
} from "@/lib/supabase";
import type { SpotHistoryRow } from "@/lib/supabase";
import type { AlertRule } from "@/lib/db/types";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Dedup window: same callsign+band within 5 minutes */
const DEDUP_WINDOW_MS = 5 * 60 * 1000;

/** Max alerts per minute (rate limit) */
const MAX_ALERTS_PER_MINUTE = 10;

/** Polling interval for spot_history when realtime not available */
const POLL_INTERVAL_MS = 15_000;

/** Max alert history entries to keep in memory */
const MAX_IN_MEMORY_ALERTS = 50;

// ─── Types ──────────────────────────────────────────────────────────────────

interface UseSpotAlertsResult {
  /** Recent alert matches (most recent first, capped at 50) */
  alerts: AlertMatch[];
  /** Whether monitoring is active */
  isMonitoring: boolean;
  /** Number of enabled rules currently loaded */
  ruleCount: number;
  /** Start monitoring for spot alerts */
  startMonitoring: () => void;
  /** Stop monitoring for spot alerts */
  stopMonitoring: () => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Generate a dedup key from callsign + band */
function dedupKey(callsign: string, band: string): string {
  return `${callsign.toUpperCase()}::${band.toLowerCase()}`;
}

/** Convert a Supabase spot_history row to SpotLike */
function rowToSpotLike(row: SpotHistoryRow): SpotLike {
  return {
    callsign: row.tx_call,
    frequency: row.frequency,
    mode: row.mode,
    band: row.band,
    snr: row.snr ?? undefined,
    source: row.source,
    grid: row.tx_grid ?? undefined,
  };
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useSpotAlerts(): UseSpotAlertsResult {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [alerts, setAlerts] = useState<AlertMatch[]>([]);
  const [rules, setRules] = useState<AlertRule[]>([]);

  // Refs for dedup and rate limiting
  const dedupMapRef = useRef<Map<string, number>>(new Map());
  const rateCounterRef = useRef<{ count: number; windowStart: number }>({
    count: 0,
    windowStart: Date.now(),
  });
  const realtimeSubRef = useRef<{ unsubscribe: () => void } | null>(null);
  const lastPollTimeRef = useRef<string | undefined>(undefined);

  // ── Load enabled rules ──
  useEffect(() => {
    if (!isMonitoring) return;

    let cancelled = false;

    async function loadRules(): Promise<void> {
      try {
        const enabledRules = await getEnabledAlertRules();
        if (!cancelled) {
          setRules(enabledRules);
        }
      } catch {
        // IDB not available — silently continue with no rules
      }
    }

    loadRules();

    // Re-load rules every 30 seconds to pick up changes
    const interval = setInterval(loadRules, 30_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isMonitoring]);

  // ── Process a single spot ──
  const processSpot = useCallback(
    async (spot: SpotLike) => {
      if (rules.length === 0) return;

      // Rate limiting check
      const now = Date.now();
      const rc = rateCounterRef.current;
      if (now - rc.windowStart >= 60_000) {
        rc.count = 0;
        rc.windowStart = now;
      }
      if (rc.count >= MAX_ALERTS_PER_MINUTE) return;

      // Evaluate against rules
      const matches = evaluateSpot(spot, rules);
      if (matches.length === 0) return;

      for (const match of matches) {
        // Dedup: same callsign+band within window
        const dk = dedupKey(spot.callsign, spot.band);
        const lastSeen = dedupMapRef.current.get(dk);
        if (lastSeen && now - lastSeen < DEDUP_WINDOW_MS) continue;

        // Double-check IDB for more persistent dedup
        const spotId = `${spot.callsign}-${spot.band}-${spot.frequency}`;
        try {
          const recentlyAlerted = await wasRecentlyAlerted(
            match.rule.id,
            spotId,
            DEDUP_WINDOW_MS,
          );
          if (recentlyAlerted) continue;
        } catch {
          // IDB unavailable — rely on in-memory dedup only
        }

        // Rate limit check again (could have changed during await)
        if (rateCounterRef.current.count >= MAX_ALERTS_PER_MINUTE) break;

        // Record dedup
        dedupMapRef.current.set(dk, now);
        rateCounterRef.current.count++;

        // Dispatch notification
        dispatchAlert(match);

        // Persist to IDB history
        try {
          await addAlertHistoryEntry({
            ruleId: match.rule.id,
            ruleName: match.rule.name,
            spotId,
            callsign: spot.callsign,
            frequency: spot.frequency,
            band: spot.band,
            mode: spot.mode,
            triggeredAt: match.matchedAt,
            dismissed: false,
          });
        } catch {
          // IDB write failed — alert still dispatched, just not persisted
        }

        // Add to in-memory list
        setAlerts((prev) => [match, ...prev].slice(0, MAX_IN_MEMORY_ALERTS));
      }
    },
    [rules],
  );

  // ── Supabase realtime subscription ──
  useEffect(() => {
    if (!isMonitoring || !isSupabaseConfigured) return;

    try {
      const sub = subscribeToSpots((row: SpotHistoryRow) => {
        const spot = rowToSpotLike(row);
        processSpot(spot);
      });
      realtimeSubRef.current = sub;
    } catch {
      // Supabase not available — fall back to polling
    }

    return () => {
      if (realtimeSubRef.current) {
        realtimeSubRef.current.unsubscribe();
        realtimeSubRef.current = null;
      }
    };
  }, [isMonitoring, processSpot]);

  // ── Polling fallback (TanStack Query) ──
  useQuery({
    queryKey: ["spotAlerts", "poll"],
    queryFn: async () => {
      if (!isSupabaseConfigured || !isMonitoring || rules.length === 0) {
        return [];
      }

      try {
        // Query recent spots across all bands
        const rows = await querySpotHistory(
          "%", // all bands
          50,
          lastPollTimeRef.current,
        );

        if (rows.length > 0) {
          // Update the watermark
          lastPollTimeRef.current = rows[0].spotted_at;

          // Process each new spot
          for (const row of rows) {
            const spot = rowToSpotLike(row);
            await processSpot(spot);
          }
        }

        return rows;
      } catch {
        return [];
      }
    },
    enabled: isMonitoring && isSupabaseConfigured && !realtimeSubRef.current,
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: POLL_INTERVAL_MS - 1000,
    retry: 1,
  });

  // ── Cleanup dedup map periodically ──
  useEffect(() => {
    if (!isMonitoring) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const map = dedupMapRef.current;
      for (const [key, timestamp] of map) {
        if (now - timestamp > DEDUP_WINDOW_MS) {
          map.delete(key);
        }
      }
    }, 60_000);

    return () => clearInterval(interval);
  }, [isMonitoring]);

  // ── Control functions ──
  const startMonitoring = useCallback(() => {
    setIsMonitoring(true);
  }, []);

  const stopMonitoring = useCallback(() => {
    setIsMonitoring(false);

    // Cleanup realtime subscription
    if (realtimeSubRef.current) {
      realtimeSubRef.current.unsubscribe();
      realtimeSubRef.current = null;
    }
  }, []);

  return {
    alerts,
    isMonitoring,
    ruleCount: rules.length,
    startMonitoring,
    stopMonitoring,
  };
}
