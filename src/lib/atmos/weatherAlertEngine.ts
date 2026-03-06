/**
 * Weather Alert Engine — reactive hook that monitors weather and space-weather
 * conditions and fires WeatherAlertItem notifications.
 *
 * Monitors:
 *  - RIM composite score (degraded < 50, critical < 25)
 *  - New Severe / Extreme NWS alerts in user's region
 *  - Kp index exceeding user-configured threshold (default 5)
 *  - New tropical cyclone advisories
 *
 * Each alert type has a 15-minute cooldown to avoid spam.
 * Browser notifications are sent via `showWeatherNotification()` when the tab
 * is hidden (document.visibilityState !== "visible").
 */

import { useRef, useEffect, useState, useCallback } from "react";
import { useRIM } from "@/hooks/useRIM";
import { useWeatherAlerts } from "@/hooks/useWeatherAlerts";
import { useKIndex } from "@/hooks/useSolarData";
import { useTropicalCyclones } from "@/hooks/useTropicalCyclones";
import { useSettingsStore } from "@/stores/settingsStore";
import {
  isNotificationPermissionGranted,
  isNotificationSupported,
} from "@/lib/utils/notifications";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from "@/types/user";

// =============================================================================
// TYPES
// =============================================================================

export type WeatherAlertType =
  | "rim-degraded"
  | "rim-critical"
  | "nws-severe"
  | "kp-storm"
  | "tropical-advisory";

export type WeatherAlertSeverity = "info" | "warning" | "critical";

export interface WeatherAlertItem {
  /** Unique alert ID based on type + trigger value */
  id: string;
  /** Alert category */
  type: WeatherAlertType;
  /** Visual severity for UI styling */
  severity: WeatherAlertSeverity;
  /** Short human-readable title */
  title: string;
  /** Descriptive body text */
  message: string;
  /** Unix-ms timestamp of when the alert was created */
  timestamp: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Minimum interval between alerts of the same type (ms) */
const COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes

/** Maximum number of alerts retained in the active list */
const MAX_ACTIVE_ALERTS = 10;

/** How long an alert stays in the active list before being pruned (ms) */
const ALERT_TTL_MS = 5 * 60 * 1000; // 5 minutes

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Build a deterministic alert ID from the type and a discriminator value.
 * This prevents duplicate alerts for the same condition within a cycle.
 */
function makeAlertId(type: WeatherAlertType, discriminator: string): string {
  return `weather-${type}-${discriminator}`;
}

/**
 * Show a browser Notification when the document is hidden.
 * Kept intentionally simple — full Notification plumbing lives in
 * `@/lib/utils/notifications`; we just need a minimal push here.
 */
function showWeatherNotification(title: string, body: string): void {
  if (typeof document === "undefined") return;
  if (document.visibilityState === "visible") return;
  if (!isNotificationSupported() || !isNotificationPermissionGranted()) return;

  try {
    const notification = new Notification(title, {
      body,
      icon: "/favicon.ico",
      tag: `propulse-weather-${Date.now()}`,
      requireInteraction: false,
    });
    // Auto-close after 12 seconds
    setTimeout(() => notification.close(), 12_000);
  } catch {
    // Silently swallow — notifications are best-effort
  }
}

// =============================================================================
// HOOK
// =============================================================================

/**
 * useWeatherAlertEngine
 *
 * Reactive hook that monitors RIM scores, NWS alerts, Kp index, and tropical
 * cyclone advisories. Returns an array of active `WeatherAlertItem` objects
 * for consumption by the toast UI.
 *
 * @param enabled - Master toggle; when false, no monitoring occurs.
 * @returns Currently active weather alerts (newest first, max 10).
 *
 * @example
 * ```tsx
 * function AtmosAlerts() {
 *   const alerts = useWeatherAlertEngine();
 *   return alerts.map(a => <Toast key={a.id} alert={a} />);
 * }
 * ```
 */
export function useWeatherAlertEngine(enabled = true): WeatherAlertItem[] {
  // -------------------------------------------------------------------------
  // Data sources
  // -------------------------------------------------------------------------
  const { rimResult } = useRIM();
  const { alerts: nwsAlerts } = useWeatherAlerts(enabled);
  const kIndexQuery = useKIndex();
  const { cyclones } = useTropicalCyclones(enabled);

  // User notification preferences (for Kp threshold)
  const notifications: NotificationPreferences =
    useSettingsStore((s) => s.notifications) ??
    DEFAULT_NOTIFICATION_PREFERENCES;

  // -------------------------------------------------------------------------
  // Refs (survive across renders without causing re-renders)
  // -------------------------------------------------------------------------

  /** Cooldown tracker: maps alert type to the timestamp it was last fired */
  const cooldownRef = useRef<Record<string, number>>({});

  /** Set of alert IDs that have already been emitted (avoids duplicates) */
  const seenIdsRef = useRef<Set<string>>(new Set());

  /** Set of NWS alert IDs that have already been processed */
  const seenNwsIdsRef = useRef<Set<string>>(new Set());

  /** Set of tropical cyclone IDs that have already been processed */
  const seenCycloneIdsRef = useRef<Set<string>>(new Set());

  // -------------------------------------------------------------------------
  // Active alert state
  // -------------------------------------------------------------------------
  const [activeAlerts, setActiveAlerts] = useState<WeatherAlertItem[]>([]);

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /** Returns true if the given alert type is still in cooldown. */
  const isInCooldown = useCallback((type: WeatherAlertType): boolean => {
    const lastFired = cooldownRef.current[type];
    if (!lastFired) return false;
    return Date.now() - lastFired < COOLDOWN_MS;
  }, []);

  /** Emit a new alert: track in refs, push to state, and fire browser notif. */
  const emitAlert = useCallback(
    (alert: WeatherAlertItem) => {
      if (seenIdsRef.current.has(alert.id)) return;
      if (isInCooldown(alert.type)) return;

      // Record cooldown and mark as seen
      cooldownRef.current[alert.type] = Date.now();
      seenIdsRef.current.add(alert.id);

      // Push to state (newest first, capped)
      setActiveAlerts((prev) => {
        const next = [alert, ...prev].slice(0, MAX_ACTIVE_ALERTS);
        return next;
      });

      // Fire browser notification when tab is in background
      showWeatherNotification(alert.title, alert.message);
    },
    [isInCooldown],
  );

  // -------------------------------------------------------------------------
  // Effect: Monitor RIM composite score
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!enabled || !rimResult) return;

    const composite = rimResult.composite;

    if (composite < 25) {
      emitAlert({
        id: makeAlertId("rim-critical", `${Math.floor(composite)}`),
        type: "rim-critical",
        severity: "critical",
        title: "RIM Critical",
        message: `Radio Impact Model score dropped to ${Math.round(composite)}/100. Severe degradation expected across HF bands.`,
        timestamp: Date.now(),
      });
    } else if (composite < 50) {
      emitAlert({
        id: makeAlertId("rim-degraded", `${Math.floor(composite / 5) * 5}`),
        type: "rim-degraded",
        severity: "warning",
        title: "RIM Degraded",
        message: `Radio Impact Model score is ${Math.round(composite)}/100. HF propagation conditions are degraded.`,
        timestamp: Date.now(),
      });
    }
  }, [enabled, rimResult, emitAlert]);

  // -------------------------------------------------------------------------
  // Effect: Monitor NWS alerts (Severe / Extreme)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!enabled || nwsAlerts.length === 0) return;

    for (const nws of nwsAlerts) {
      if (nws.severity !== "Severe" && nws.severity !== "Extreme") continue;
      if (seenNwsIdsRef.current.has(nws.id)) continue;

      seenNwsIdsRef.current.add(nws.id);

      const severity: WeatherAlertSeverity =
        nws.severity === "Extreme" ? "critical" : "warning";

      emitAlert({
        id: makeAlertId("nws-severe", nws.id),
        type: "nws-severe",
        severity,
        title: nws.event,
        message: `${nws.headline || nws.event} — ${nws.areaDesc}`,
        timestamp: Date.now(),
      });
    }
  }, [enabled, nwsAlerts, emitAlert]);

  // -------------------------------------------------------------------------
  // Effect: Monitor Kp index
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!enabled || !kIndexQuery.data?.length) return;

    const latest = kIndexQuery.data[kIndexQuery.data.length - 1];
    const kp = latest.kp_index;
    const threshold = notifications.stormAlertKpThreshold ?? 5;

    if (kp >= threshold) {
      emitAlert({
        id: makeAlertId("kp-storm", `kp${Math.floor(kp)}`),
        type: "kp-storm",
        severity: kp >= 7 ? "critical" : "warning",
        title: `Kp ${Math.round(kp)} Geomagnetic Storm`,
        message: `The planetary Kp index has reached ${kp.toFixed(1)}, indicating ${kp >= 7 ? "severe" : "active"} geomagnetic storm conditions. HF propagation may be disrupted.`,
        timestamp: Date.now(),
      });
    }
  }, [
    enabled,
    kIndexQuery.data,
    notifications.stormAlertKpThreshold,
    emitAlert,
  ]);

  // -------------------------------------------------------------------------
  // Effect: Monitor tropical cyclone advisories
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!enabled || cyclones.length === 0) return;

    for (const cyclone of cyclones) {
      if (seenCycloneIdsRef.current.has(cyclone.id)) continue;

      seenCycloneIdsRef.current.add(cyclone.id);

      emitAlert({
        id: makeAlertId("tropical-advisory", cyclone.id),
        type: "tropical-advisory",
        severity: "info",
        title: `Tropical Advisory: ${cyclone.name}`,
        message: `${cyclone.name} (${cyclone.basin === "atlantic" ? "Atlantic" : "Pacific"}) — ${cyclone.category} with max winds ${cyclone.maxWind} kt. Monitor for potential infrastructure and propagation impacts.`,
        timestamp: Date.now(),
      });
    }
  }, [enabled, cyclones, emitAlert]);

  // -------------------------------------------------------------------------
  // Effect: Prune stale alerts from the active list
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(() => {
      const cutoff = Date.now() - ALERT_TTL_MS;
      setActiveAlerts((prev) => {
        const next = prev.filter((a) => a.timestamp > cutoff);
        return next.length === prev.length ? prev : next;
      });
    }, 30_000); // check every 30 seconds

    return () => clearInterval(interval);
  }, [enabled]);

  // -------------------------------------------------------------------------
  // Return empty array when disabled
  // -------------------------------------------------------------------------
  if (!enabled) return [];

  return activeAlerts;
}
