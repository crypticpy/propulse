/**
 * Browser notification utilities for PropUlse
 * Handles notification permissions and display for DX spot alerts
 */

import type { LiveSpot } from "../../types/livespot";

/** Track active notifications for cleanup */
const activeNotifications = new Set<Notification>();

/**
 * Check if the Notification API is supported in the current browser
 * @returns true if browser supports notifications
 */
export function isNotificationSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    typeof Notification !== "undefined"
  );
}

/**
 * Check if notification permission has been granted
 * @returns true if notifications are permitted
 */
export function isNotificationPermissionGranted(): boolean {
  if (!isNotificationSupported()) {
    return false;
  }
  return Notification.permission === "granted";
}

/**
 * Check if notification permission has been denied
 * @returns true if notifications have been explicitly denied
 */
export function isNotificationPermissionDenied(): boolean {
  if (!isNotificationSupported()) {
    return false;
  }
  return Notification.permission === "denied";
}

/**
 * Get the current notification permission state
 * @returns 'granted', 'denied', 'default', or 'unsupported'
 */
export function getNotificationPermissionState():
  | NotificationPermission
  | "unsupported" {
  if (!isNotificationSupported()) {
    return "unsupported";
  }
  return Notification.permission;
}

/**
 * Request permission to show notifications
 * Returns the permission status after the request
 * @returns Promise resolving to the permission state
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) {
    console.warn("Notifications are not supported in this browser");
    return "denied";
  }

  // If already granted or denied, return current state
  if (Notification.permission !== "default") {
    return Notification.permission;
  }

  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (error) {
    // Some browsers throw errors on permission request
    console.error("Error requesting notification permission:", error);
    return "denied";
  }
}

/**
 * Default notification options for spot alerts
 */
const DEFAULT_NOTIFICATION_OPTIONS: NotificationOptions = {
  icon: "/favicon.ico",
  badge: "/favicon.ico",
  tag: "propulse-spot-alert",
  requireInteraction: false,
  silent: false,
};

/**
 * Show a browser notification
 * @param title - Notification title
 * @param options - Optional notification settings
 * @returns The Notification object or null if failed
 */
export function showNotification(
  title: string,
  options?: NotificationOptions,
): Notification | null {
  if (!isNotificationPermissionGranted()) {
    console.warn("Notification permission not granted");
    return null;
  }

  try {
    const notification = new Notification(title, {
      ...DEFAULT_NOTIFICATION_OPTIONS,
      ...options,
    });

    // Track this notification
    activeNotifications.add(notification);

    // Remove from tracking when closed
    notification.onclose = () => {
      activeNotifications.delete(notification);
    };

    // Auto-close notification after 10 seconds
    setTimeout(() => {
      notification.close();
      activeNotifications.delete(notification);
    }, 10000);

    return notification;
  } catch (error) {
    console.error("Error showing notification:", error);
    return null;
  }
}

/**
 * Format frequency for display (e.g., 14074 -> "14.074 MHz")
 */
function formatFrequency(frequencyKHz: number): string {
  const mhz = frequencyKHz / 1000;
  return `${mhz.toFixed(3)} MHz`;
}

/**
 * Show a notification for a DX spot alert
 * @param spot - The LiveSpot that triggered the alert
 * @param ruleName - Name of the alert rule that matched
 * @returns The Notification object or null if failed
 */
export function showSpotNotification(
  spot: LiveSpot,
  ruleName: string,
): Notification | null {
  const title = `DX Alert: ${spot.dx}`;

  // Build notification body with spot details
  const bodyParts: string[] = [
    `Rule: ${ruleName}`,
    `Frequency: ${formatFrequency(spot.frequency)}`,
  ];

  if (spot.band) {
    bodyParts.push(`Band: ${spot.band}`);
  }

  if (spot.mode) {
    bodyParts.push(`Mode: ${spot.mode}`);
  }

  if (spot.snr !== undefined) {
    bodyParts.push(`SNR: ${spot.snr} dB`);
  }

  if (spot.spotter) {
    bodyParts.push(`Spotter: ${spot.spotter}`);
  }

  const body = bodyParts.join("\n");

  // Use unique tag per spot to allow multiple notifications
  const tag = `propulse-spot-${spot.id}`;

  const notification = showNotification(title, {
    body,
    tag,
    data: {
      spotId: spot.id,
      ruleName,
      frequency: spot.frequency,
      callsign: spot.dx,
    },
  });

  if (notification) {
    // Handle notification click - could be used to focus window/select spot
    notification.onclick = () => {
      // Focus the window if it's not already focused
      if (typeof window !== "undefined") {
        window.focus();
      }
      notification.close();

      // Dispatch a custom event that the app can listen to
      if (typeof window !== "undefined") {
        const event = new CustomEvent("propulse:spot-notification-clicked", {
          detail: {
            spotId: spot.id,
            callsign: spot.dx,
            frequency: spot.frequency,
          },
        });
        window.dispatchEvent(event);
      }
    };
  }

  return notification;
}

/**
 * Close all active PropUlse notifications
 */
export function closeAllNotifications(): void {
  for (const notification of activeNotifications) {
    notification.close();
  }
  activeNotifications.clear();
}

/**
 * Check if the page is currently visible
 * Useful for deciding whether to show notifications
 * @returns true if the page is visible
 */
export function isPageVisible(): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  return document.visibilityState === "visible";
}

/**
 * Show notification only if the page is not visible
 * Useful for avoiding redundant alerts when user is already viewing the app
 * @param spot - The LiveSpot that triggered the alert
 * @param ruleName - Name of the alert rule that matched
 * @returns The Notification object or null if page is visible or failed
 */
export function showSpotNotificationIfHidden(
  spot: LiveSpot,
  ruleName: string,
): Notification | null {
  if (isPageVisible()) {
    return null;
  }
  return showSpotNotification(spot, ruleName);
}
