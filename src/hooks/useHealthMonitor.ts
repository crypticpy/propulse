/**
 * useHealthMonitor - Aggregates health status across all data services
 *
 * Reads from the TanStack Query cache to determine the health of each
 * monitored service without triggering duplicate fetches. Also checks
 * the Bridge WebSocket connection state.
 *
 * Re-derives the health snapshot every 30 seconds via an internal timer.
 */

import { useState, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/hooks/useSolarData";
import { useBridge } from "@/hooks/useBridge";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ServiceStatus =
  | "healthy"
  | "degraded"
  | "error"
  | "loading"
  | "idle";

export interface ServiceHealth {
  name: string;
  status: ServiceStatus;
  lastUpdated: number | undefined; // timestamp ms
  errorMessage?: string;
}

export interface HealthSnapshot {
  overall: "green" | "yellow" | "red";
  services: ServiceHealth[];
  bridgeConnected: boolean;
  bridgeState: string; // "connected" | "connecting" | "disconnected" | "error"
  bridgeError: string | null;
  bridgeReconnectCount: number;
  bridgeReconnectIn: number | null;
  activeErrors: number;
  lastRefresh: number; // when this snapshot was computed
}

// ---------------------------------------------------------------------------
// Service configuration
// ---------------------------------------------------------------------------

interface ServiceConfig {
  name: string;
  queryKey: readonly string[];
  /** Maximum age (ms) before data is considered degraded */
  staleThreshold: number;
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const MONITORED_SERVICES: ServiceConfig[] = [
  {
    name: "K-Index",
    queryKey: QUERY_KEYS.kIndex,
    staleThreshold: 5 * MINUTE,
  },
  {
    name: "Solar Flux",
    queryKey: QUERY_KEYS.solarFlux,
    staleThreshold: 8 * HOUR,
  },
  {
    name: "Magnetometer",
    queryKey: QUERY_KEYS.magnetometer,
    staleThreshold: 5 * MINUTE,
  },
  {
    name: "Flare Probabilities",
    queryKey: QUERY_KEYS.probabilities,
    staleThreshold: 12 * HOUR,
  },
  {
    name: "Sunspot Numbers",
    queryKey: QUERY_KEYS.sunspots,
    staleThreshold: 12 * HOUR,
  },
];

/** How often (ms) the snapshot is recomputed */
const REFRESH_INTERVAL = 30_000;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useHealthMonitor(): HealthSnapshot {
  const queryClient = useQueryClient();
  const bridge = useBridge({ enabled: false });

  // Tick counter drives periodic re-derivation of the snapshot
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, []);

  const snapshot = useMemo<HealthSnapshot>(() => {
    const now = Date.now();

    // ------ Evaluate each service from the query cache ------
    const services: ServiceHealth[] = MONITORED_SERVICES.map((svc) => {
      const queryState = queryClient.getQueryState(svc.queryKey);

      if (!queryState) {
        return {
          name: svc.name,
          status: "idle" as const,
          lastUpdated: undefined,
        };
      }

      const { status, dataUpdatedAt, fetchStatus, error } = queryState;

      // Currently fetching with no prior data
      if (
        (status === "pending" || fetchStatus === "fetching") &&
        dataUpdatedAt === 0
      ) {
        return {
          name: svc.name,
          status: "loading" as const,
          lastUpdated: undefined,
        };
      }

      // Error state
      if (status === "error") {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        return {
          name: svc.name,
          status: "error" as const,
          lastUpdated: dataUpdatedAt || undefined,
          errorMessage: message,
        };
      }

      // Has data — check freshness
      if (status === "success" || dataUpdatedAt > 0) {
        const age = now - dataUpdatedAt;
        if (age <= svc.staleThreshold) {
          return {
            name: svc.name,
            status: "healthy" as const,
            lastUpdated: dataUpdatedAt,
          };
        }
        return {
          name: svc.name,
          status: "degraded" as const,
          lastUpdated: dataUpdatedAt,
        };
      }

      return {
        name: svc.name,
        status: "idle" as const,
        lastUpdated: undefined,
      };
    });

    // ------ Bridge state ------
    const bridgeConnected = bridge.connected;
    const bridgeState = bridge.state;
    const bridgeError = bridge.error;
    const bridgeReconnectCount = bridge.reconnectCount;
    const bridgeReconnectIn = bridge.reconnectIn;

    // ------ Derive overall health ------
    const activeErrors = services.filter((s) => s.status === "error").length;
    const hasDegraded = services.some((s) => s.status === "degraded");

    let overall: "green" | "yellow" | "red" = "green";
    if (activeErrors > 0) {
      overall = "red";
    } else if (hasDegraded) {
      overall = "yellow";
    }

    return {
      overall,
      services,
      bridgeConnected,
      bridgeState,
      bridgeError,
      bridgeReconnectCount,
      bridgeReconnectIn,
      activeErrors,
      lastRefresh: now,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tick,
    queryClient,
    bridge.state,
    bridge.connected,
    bridge.error,
    bridge.reconnectCount,
    bridge.reconnectIn,
  ]);

  return snapshot;
}

export default useHealthMonitor;
