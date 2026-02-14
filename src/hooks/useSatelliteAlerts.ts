/**
 * useSatelliteAlerts Hook
 *
 * Monitors tracked satellites for upcoming passes and dispatches
 * browser notifications when a pass is within the configured
 * lead time. Falls back to console logging when the Notification
 * API is not available or permission is denied.
 */

import { useEffect, useCallback, useRef, useState } from "react";
import { useSatellites } from "@/hooks/useSatellites";
import { useUserStore } from "@/stores/userStore";
import { useMapStore } from "@/stores/mapStore";
import { getSimplePassPrediction } from "@/lib/api/satellites";
import type { PassPrediction } from "@/types/satellite";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default alert lead time in minutes */
const DEFAULT_LEAD_TIME_MIN = 5;

/** How often to check for upcoming passes (ms) */
const CHECK_INTERVAL_MS = 30_000; // 30 seconds

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UseSatelliteAlertsResult {
  /** Whether browser notification permission is granted */
  alertsEnabled: boolean;
  /** Whether the Notification API is available */
  notificationSupported: boolean;
  /** Request browser notification permission */
  requestPermission: () => Promise<boolean>;
  /** Number of alerts sent this session */
  alertCount: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check if the Notification API is available.
 */
function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/**
 * Send a browser notification for an upcoming satellite pass.
 */
function sendNotification(
  satelliteName: string,
  pass: PassPrediction,
  minutesUntil: number,
): void {
  if (!isNotificationSupported()) return;
  if (Notification.permission !== "granted") return;

  try {
    const maxEl = Math.round(pass.maxEl);
    const body = `Pass in ${Math.round(minutesUntil)} min \u2014 max ${maxEl}\u00B0 elevation`;

    new Notification(`Satellite: ${satelliteName}`, {
      body,
      icon: "/favicon.ico",
      tag: `sat-pass-${satelliteName}`, // Prevents duplicate notifications
      requireInteraction: false,
    });
  } catch {
    // Notification constructor can throw in some environments
    console.warn(
      `[SatelliteAlerts] Failed to send notification for ${satelliteName}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Monitor tracked satellites for upcoming passes and dispatch alerts.
 *
 * Reads the satellite layer visibility from mapStore to determine which
 * satellites are actively tracked. When a pass is within the lead time,
 * sends a browser notification (if permitted).
 */
export function useSatelliteAlerts(): UseSatelliteAlertsResult {
  const { satellites } = useSatellites();
  const { station } = useUserStore();
  const satellitesLayerEnabled = useMapStore((s) => s.layers.satellites);

  const [alertsEnabled, setAlertsEnabled] = useState(
    () => isNotificationSupported() && Notification.permission === "granted",
  );
  const [alertCount, setAlertCount] = useState(0);

  // Track which passes we've already alerted for (by NORAD ID + AOS time)
  const alertedRef = useRef<Set<string>>(new Set());

  // Request notification permission
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isNotificationSupported()) return false;

    try {
      const result = await Notification.requestPermission();
      const granted = result === "granted";
      setAlertsEnabled(granted);
      return granted;
    } catch {
      return false;
    }
  }, []);

  // Periodic check for upcoming passes
  useEffect(() => {
    // Don't run if satellite layer is off, no station, or no satellites
    if (!satellitesLayerEnabled || !station || satellites.length === 0) {
      return;
    }

    const checkPasses = () => {
      const now = Date.now();

      for (const sat of satellites) {
        // Only check visible-category satellites that are currently below horizon
        // (we want to alert *before* they rise)
        try {
          const passes = getSimplePassPrediction(
            sat,
            station.lat,
            station.lon,
            new Date(),
            2, // Only check next 2 hours
          );

          for (const pass of passes) {
            const aosMs =
              pass.aos instanceof Date
                ? pass.aos.getTime()
                : new Date(pass.aos).getTime();

            const minutesUntil = (aosMs - now) / 60_000;

            // Only alert for upcoming passes within lead time
            if (minutesUntil <= 0 || minutesUntil > DEFAULT_LEAD_TIME_MIN) {
              continue;
            }

            // Check if we've already alerted for this pass
            const alertKey = `${sat.noradId}-${aosMs}`;
            if (alertedRef.current.has(alertKey)) continue;

            // Send alert
            alertedRef.current.add(alertKey);
            sendNotification(sat.name, pass, minutesUntil);
            setAlertCount((c) => c + 1);
          }
        } catch {
          // Skip satellites with propagation errors
        }
      }

      // Clean up old alert keys (older than 2 hours)
      const cutoff = now - 2 * 60 * 60 * 1000;
      for (const key of alertedRef.current) {
        const aosMs = parseInt(key.split("-").pop() || "0", 10);
        if (aosMs < cutoff) {
          alertedRef.current.delete(key);
        }
      }
    };

    // Check immediately, then on interval
    checkPasses();
    const intervalId = setInterval(checkPasses, CHECK_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [satellitesLayerEnabled, station, satellites]);

  return {
    alertsEnabled,
    notificationSupported: isNotificationSupported(),
    requestPermission,
    alertCount,
  };
}

export default useSatelliteAlerts;
