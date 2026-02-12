/**
 * useNetAlerts — Background scheduler for net session reminders.
 * Checks subscribed nets' schedules at regular intervals and fires
 * toast notifications at 10/5/3 minutes before start.
 * Respects per-subscription alert preferences.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useNetStore } from "@/stores/netStore";
import {
  getMinutesUntilNext,
  getNextSessionTime,
} from "@/lib/utils/netSchedule";
import type { NetSchedule } from "@/types/net";

// ── Constants ───────────────────────────────────────────────────────────────

/** Interval between schedule checks (30 seconds) */
const CHECK_INTERVAL_MS = 30_000;

/** Alert windows in minutes — checked from largest to smallest */
const ALERT_WINDOWS = [
  { minutes: 10, key: "alert10min" as const },
  { minutes: 5, key: "alert5min" as const },
  { minutes: 3, key: "alert3min" as const },
] as const;

// ── Types ───────────────────────────────────────────────────────────────────

/** A pending net alert that the consuming component can render */
export interface NetAlert {
  /** Unique net identifier */
  netId: string;
  /** Human-readable net name */
  netName: string;
  /** How many minutes before the session this alert was triggered */
  minutesBefore: number;
  /** The net's frequency string (e.g., "146.520 MHz") */
  frequency: string;
  /** The net's recurrence schedule */
  schedule: NetSchedule;
}

/** Options for the useNetAlerts hook */
export interface UseNetAlertsOptions {
  /**
   * Enable or disable alert monitoring.
   * When false, no new alerts will be generated and the interval is cleared.
   * @default true
   */
  enabled?: boolean;
}

/** Return type for the useNetAlerts hook */
export interface UseNetAlertsReturn {
  /** Alerts that have fired and haven't been dismissed */
  pendingAlerts: NetAlert[];
  /** Dismiss a specific alert by netId + minutesBefore */
  dismissAlert: (netId: string, minutesBefore: number) => void;
  /** Dismiss all pending alerts */
  dismissAll: () => void;
}

// ── Hook Implementation ────────────────────────────────────────────────────

/**
 * Background scheduler that monitors subscribed nets and produces alert
 * entries before upcoming sessions.
 *
 * Checks every 30 seconds whether any subscribed net's next session is
 * within 10, 5, or 3 minutes. Respects each subscription's per-window
 * alert preferences (alert10min, alert5min, alert3min).
 *
 * Alerts are de-duplicated using a Set of `${netId}-${window}` keys.
 * The fired-alert set is automatically reset when a net's next session
 * time changes (i.e., the session has started and the schedule rolls
 * over to the next occurrence).
 *
 * @param options - Configuration options
 * @returns Pending alerts array and dismiss helpers
 *
 * @example
 * ```tsx
 * function NetAlertBanner() {
 *   const { pendingAlerts, dismissAlert } = useNetAlerts();
 *
 *   return (
 *     <>
 *       {pendingAlerts.map((a) => (
 *         <div key={`${a.netId}-${a.minutesBefore}`}>
 *           {a.netName} starts in {a.minutesBefore} minutes on {a.frequency}
 *           <button onClick={() => dismissAlert(a.netId, a.minutesBefore)}>
 *             Dismiss
 *           </button>
 *         </div>
 *       ))}
 *     </>
 *   );
 * }
 * ```
 */
export function useNetAlerts(
  options: UseNetAlertsOptions = {},
): UseNetAlertsReturn {
  const { enabled = true } = options;

  // ── State ───────────────────────────────────────────────────────────────

  const [pendingAlerts, setPendingAlerts] = useState<NetAlert[]>([]);

  // ── Refs ────────────────────────────────────────────────────────────────

  /** Set of fired alert keys (`${netId}-${minuteWindow}`) to prevent duplicates */
  const firedRef = useRef<Set<string>>(new Set());

  /**
   * Track the last-seen next-session time per net.
   * When this changes, it means the schedule rolled over and we should
   * reset fired alerts for that net.
   */
  const lastSessionTimeRef = useRef<Map<string, number>>(new Map());

  // ── Callbacks ───────────────────────────────────────────────────────────

  /** Dismiss a single alert */
  const dismissAlert = useCallback((netId: string, minutesBefore: number) => {
    setPendingAlerts((prev) =>
      prev.filter(
        (a) => !(a.netId === netId && a.minutesBefore === minutesBefore),
      ),
    );
  }, []);

  /** Dismiss all pending alerts */
  const dismissAll = useCallback(() => {
    setPendingAlerts([]);
  }, []);

  // ── Effects ─────────────────────────────────────────────────────────────

  /**
   * On mount, ensure subscriptions are loaded from the backend.
   */
  useEffect(() => {
    if (!enabled) return;
    useNetStore.getState().fetchMySubscriptions();
  }, [enabled]);

  /**
   * Main check interval — runs every 30 seconds while enabled.
   */
  useEffect(() => {
    if (!enabled) return;

    const check = () => {
      const { subscriptions, nets, fetchNets } = useNetStore.getState();

      // If nets haven't been loaded yet, trigger a fetch
      if (nets.length === 0) {
        fetchNets();
        return;
      }

      const newAlerts: NetAlert[] = [];

      for (const sub of subscriptions) {
        // Find the matching net
        const net = nets.find((n) => n.id === sub.netId);
        if (!net?.schedule) continue;

        // Compute next session time
        const nextTime = getNextSessionTime(net.schedule);
        if (!nextTime) continue;

        const nextTimeMs = nextTime.getTime();
        const prevTimeMs = lastSessionTimeRef.current.get(net.id);

        // If the next session time changed (schedule rolled over),
        // clear fired alerts for this net
        if (prevTimeMs !== undefined && prevTimeMs !== nextTimeMs) {
          for (const window of ALERT_WINDOWS) {
            firedRef.current.delete(`${net.id}-${window.minutes}`);
          }
        }
        lastSessionTimeRef.current.set(net.id, nextTimeMs);

        // Compute minutes until next session
        const minutesUntil = getMinutesUntilNext(net.schedule);
        if (minutesUntil === null) continue;

        // Check each alert window
        for (const window of ALERT_WINDOWS) {
          // Skip if this subscription doesn't want this window
          if (!sub[window.key]) continue;

          const alertKey = `${net.id}-${window.minutes}`;

          // Skip if already fired
          if (firedRef.current.has(alertKey)) continue;

          // Fire if within the window
          if (minutesUntil <= window.minutes) {
            firedRef.current.add(alertKey);
            newAlerts.push({
              netId: net.id,
              netName: net.name,
              minutesBefore: window.minutes,
              frequency: net.frequency,
              schedule: net.schedule,
            });
          }
        }
      }

      // Append new alerts to pending list (avoid duplicates by key)
      if (newAlerts.length > 0) {
        setPendingAlerts((prev) => {
          const existingKeys = new Set(
            prev.map((a) => `${a.netId}-${a.minutesBefore}`),
          );
          const toAdd = newAlerts.filter(
            (a) => !existingKeys.has(`${a.netId}-${a.minutesBefore}`),
          );
          if (toAdd.length === 0) return prev;
          return [...prev, ...toAdd];
        });
      }
    };

    // Run immediately, then on interval
    check();
    const intervalId = setInterval(check, CHECK_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [enabled]);

  // ── Return ──────────────────────────────────────────────────────────────

  return {
    pendingAlerts,
    dismissAlert,
    dismissAll,
  };
}

export default useNetAlerts;
