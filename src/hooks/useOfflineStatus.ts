/**
 * useOfflineStatus Hook
 * Tracks online/offline status and connection information
 */

import { useState, useEffect, useCallback } from "react";

// Connection type from Navigator.connection (if available)
type ConnectionType =
  | "bluetooth"
  | "cellular"
  | "ethernet"
  | "none"
  | "wifi"
  | "wimax"
  | "other"
  | "unknown";

// Effective connection type
type EffectiveType = "slow-2g" | "2g" | "3g" | "4g";

// Navigator.connection interface (not standardized yet)
interface NetworkInformation {
  type?: ConnectionType;
  effectiveType?: EffectiveType;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
  addEventListener: (
    type: "change",
    listener: EventListenerOrEventListenerObject,
  ) => void;
  removeEventListener: (
    type: "change",
    listener: EventListenerOrEventListenerObject,
  ) => void;
}

// Extend Navigator interface
declare global {
  interface Navigator {
    connection?: NetworkInformation;
    mozConnection?: NetworkInformation;
    webkitConnection?: NetworkInformation;
  }
}

// Hook return type
export interface OfflineStatusReturn {
  /** Whether the browser reports as online */
  isOnline: boolean;
  /** Whether the browser reports as offline (inverse of isOnline) */
  isOffline: boolean;
  /** Last time the browser was online (null if always online) */
  lastOnline: Date | null;
  /** Connection type if available (wifi, 4g, etc.) */
  connectionType: string | null;
  /** Effective connection type (4g, 3g, 2g, slow-2g) */
  effectiveType: EffectiveType | null;
  /** Estimated downlink speed in Mbps */
  downlink: number | null;
  /** Estimated round-trip time in ms */
  rtt: number | null;
  /** Whether data saver mode is enabled */
  saveData: boolean;
}

/**
 * Get the network connection object (handles vendor prefixes)
 */
function getNetworkConnection(): NetworkInformation | null {
  if (typeof navigator === "undefined") return null;
  return (
    navigator.connection ||
    navigator.mozConnection ||
    navigator.webkitConnection ||
    null
  );
}

/**
 * Hook to track online/offline status and connection information
 */
export function useOfflineStatus(): OfflineStatusReturn {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [lastOnline, setLastOnline] = useState<Date | null>(null);
  const [connectionInfo, setConnectionInfo] = useState<{
    type: string | null;
    effectiveType: EffectiveType | null;
    downlink: number | null;
    rtt: number | null;
    saveData: boolean;
  }>(() => {
    const connection = getNetworkConnection();
    return {
      type: connection?.type || null,
      effectiveType: connection?.effectiveType || null,
      downlink: connection?.downlink || null,
      rtt: connection?.rtt || null,
      saveData: connection?.saveData || false,
    };
  });

  // Handle online event
  const handleOnline = useCallback(() => {
    setIsOnline(true);
  }, []);

  // Handle offline event
  const handleOffline = useCallback(() => {
    setIsOnline(false);
    setLastOnline(new Date());
  }, []);

  // Handle connection change
  const handleConnectionChange = useCallback(() => {
    const connection = getNetworkConnection();
    if (connection) {
      setConnectionInfo({
        type: connection.type || null,
        effectiveType: connection.effectiveType || null,
        downlink: connection.downlink || null,
        rtt: connection.rtt || null,
        saveData: connection.saveData || false,
      });
    }
  }, []);

  useEffect(() => {
    // Listen to online/offline events
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Listen to connection changes (if supported)
    const connection = getNetworkConnection();
    if (connection) {
      connection.addEventListener("change", handleConnectionChange);
    }

    // Cleanup
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);

      if (connection) {
        connection.removeEventListener("change", handleConnectionChange);
      }
    };
  }, [handleOnline, handleOffline, handleConnectionChange]);

  return {
    isOnline,
    isOffline: !isOnline,
    lastOnline,
    connectionType: connectionInfo.type,
    effectiveType: connectionInfo.effectiveType,
    downlink: connectionInfo.downlink,
    rtt: connectionInfo.rtt,
    saveData: connectionInfo.saveData,
  };
}

/**
 * Simple hook that just returns online/offline status
 * Lighter weight version for components that don't need connection details
 */
export function useIsOnline(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}
