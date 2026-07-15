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
import { EXPANDED_QUERY_KEYS } from "@/hooks/useSolarExpanded";
import { DATA_SOURCE_REGISTRY } from "@/lib/dataSourceRegistry";
import type { DataSourceId } from "@/lib/dataSourceRegistry";
import { useDataSourceStatus } from "@/stores/dataSourceStatusStore";
import { useBridge } from "@/hooks/useBridge";
import { useSettingsStore } from "@/stores/settingsStore";

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
  /** Friendly message for display in expanded error views */
  userMessage?: string;
  /** True when the error originates from an external service */
  isUpstream?: boolean;
  /** Data provider name (e.g. "NOAA SWPC") */
  provider?: string;
  /** Registered data source identifier */
  sourceId?: DataSourceId;
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
  /** Registered data source identifier */
  sourceId: DataSourceId;
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const MONITORED_SERVICES: ServiceConfig[] = [
  // --- Satellite TLE ---
  {
    name: "Satellite TLE",
    queryKey: ["satellites", "tle"],
    staleThreshold: 3 * HOUR,
    sourceId: "celestrak-tle",
  },
  // --- Core solar hooks (useSolarData) ---
  {
    name: "K-Index",
    queryKey: QUERY_KEYS.kIndex,
    staleThreshold: 5 * MINUTE,
    sourceId: "noaa-k-index",
  },
  {
    name: "Solar Flux",
    queryKey: QUERY_KEYS.solarFlux,
    staleThreshold: 8 * HOUR,
    sourceId: "noaa-solar-flux",
  },
  {
    name: "Magnetometer",
    queryKey: QUERY_KEYS.magnetometer,
    staleThreshold: 5 * MINUTE,
    sourceId: "noaa-magnetometer",
  },
  {
    name: "Flare Probabilities",
    queryKey: QUERY_KEYS.probabilities,
    staleThreshold: 12 * HOUR,
    sourceId: "noaa-probabilities",
  },
  {
    name: "Sunspot Numbers",
    queryKey: QUERY_KEYS.sunspots,
    staleThreshold: 12 * HOUR,
    sourceId: "noaa-sunspots",
  },
  // --- Expanded solar hooks (useSolarExpanded) ---
  {
    name: "X-ray Flux",
    queryKey: EXPANDED_QUERY_KEYS.xrayFlux,
    staleThreshold: 10 * MINUTE,
    sourceId: "noaa-xray",
  },
  {
    name: "Proton Flux",
    queryKey: EXPANDED_QUERY_KEYS.protonFlux,
    staleThreshold: 10 * MINUTE,
    sourceId: "noaa-protons",
  },
  {
    name: "Dst Index",
    queryKey: EXPANDED_QUERY_KEYS.dstIndex,
    staleThreshold: 1 * HOUR,
    sourceId: "noaa-dst",
  },
  {
    name: "D-RAP",
    queryKey: EXPANDED_QUERY_KEYS.drap,
    staleThreshold: 30 * MINUTE,
    sourceId: "noaa-drap",
  },
  {
    name: "CME Analysis",
    queryKey: EXPANDED_QUERY_KEYS.cmeAnalysis,
    staleThreshold: 2 * HOUR,
    sourceId: "nasa-cme",
  },
  {
    name: "SFI Forecast",
    queryKey: EXPANDED_QUERY_KEYS.fluxForecast,
    staleThreshold: 8 * HOUR,
    sourceId: "noaa-flux-forecast",
  },
];

/** How often (ms) the snapshot is recomputed */
const REFRESH_INTERVAL = 30_000;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Data source IDs for sources fetched directly (no React Query). */
const DIRECT_FETCH_SOURCE_IDS: DataSourceId[] = [
  "swpc-scales",
  "swpc-alerts",
  "swpc-xray-latest",
  "swpc-solar-wind-mag",
  "swpc-solar-wind-plasma",
];

export function useHealthMonitor(): HealthSnapshot {
  const queryClient = useQueryClient();
  const bridgeEnabled = useSettingsStore((state) => state.bridgeEnabled);
  const bridge = useBridge({ enabled: bridgeEnabled });
  const dataSourceStatuses = useDataSourceStatus((s) => s.sources);

  // Tick counter drives periodic re-derivation of the snapshot
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, []);

  const snapshot = useMemo<HealthSnapshot>(() => {
    const now = Date.now();

    // ------ Evaluate each service from the query cache ------
    const queryCacheServices: ServiceHealth[] = MONITORED_SERVICES.map(
      (svc) => {
        // Exact match first, then prefix match (needed for satellite TLE
        // whose key includes variable enabledGroups array)
        const queryState =
          queryClient.getQueryState(svc.queryKey) ??
          queryClient
            .getQueryCache()
            .findAll({ queryKey: svc.queryKey as string[] })[0]?.state ??
          null;
        const sourceStatus = dataSourceStatuses[svc.sourceId];
        const registryEntry = DATA_SOURCE_REGISTRY[svc.sourceId];

        if (!queryState) {
          return {
            name: svc.name,
            status: "idle" as const,
            lastUpdated: undefined,
            sourceId: svc.sourceId,
            provider: registryEntry?.provider,
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
            sourceId: svc.sourceId,
            provider: registryEntry?.provider,
          };
        }

        // If the status store has a classified error, use its richer messages
        if (sourceStatus?.error) {
          return {
            name: svc.name,
            status: "error" as const,
            lastUpdated: dataUpdatedAt || undefined,
            errorMessage: sourceStatus.error.shortMessage,
            userMessage: sourceStatus.error.userMessage,
            isUpstream: sourceStatus.error.isUpstream,
            provider: registryEntry?.provider,
            sourceId: svc.sourceId,
          };
        }

        // Error state (fallback to raw query error)
        if (status === "error") {
          const message =
            error instanceof Error ? error.message : "Unknown error";
          return {
            name: svc.name,
            status: "error" as const,
            lastUpdated: dataUpdatedAt || undefined,
            errorMessage: message,
            sourceId: svc.sourceId,
            provider: registryEntry?.provider,
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
              sourceId: svc.sourceId,
              provider: registryEntry?.provider,
            };
          }
          return {
            name: svc.name,
            status: "degraded" as const,
            lastUpdated: dataUpdatedAt,
            sourceId: svc.sourceId,
            provider: registryEntry?.provider,
          };
        }

        return {
          name: svc.name,
          status: "idle" as const,
          lastUpdated: undefined,
          sourceId: svc.sourceId,
          provider: registryEntry?.provider,
        };
      },
    );

    // ------ Direct-fetch sources (no React Query, status from store) ------
    const directFetchServices: ServiceHealth[] = DIRECT_FETCH_SOURCE_IDS.map(
      (sid) => {
        const entry = DATA_SOURCE_REGISTRY[sid];
        const sourceStatus = dataSourceStatuses[sid];

        if (sourceStatus?.error) {
          return {
            name: entry.label,
            status: "error" as const,
            lastUpdated: sourceStatus.lastSuccess ?? undefined,
            errorMessage: sourceStatus.error.shortMessage,
            userMessage: sourceStatus.error.userMessage,
            isUpstream: sourceStatus.error.isUpstream,
            provider: entry.provider,
            sourceId: sid,
          };
        }

        return {
          name: entry.label,
          status: sourceStatus?.lastSuccess
            ? ("healthy" as const)
            : ("idle" as const),
          lastUpdated: sourceStatus?.lastSuccess ?? undefined,
          sourceId: sid,
          provider: entry.provider,
        };
      },
    );

    const allServices = [...queryCacheServices, ...directFetchServices];

    // ------ Bridge state ------
    const bridgeConnected = bridge.connected;
    const bridgeState = bridge.state;
    const bridgeError = bridge.error;
    const bridgeReconnectCount = bridge.reconnectCount;
    const bridgeReconnectIn = bridge.reconnectIn;

    // ------ Derive overall health ------
    const activeErrors = allServices.filter((s) => s.status === "error").length;
    const hasDegraded = allServices.some((s) => s.status === "degraded");

    let overall: "green" | "yellow" | "red" = "green";
    if (activeErrors > 0) {
      overall = "red";
    } else if (hasDegraded) {
      overall = "yellow";
    }

    return {
      overall,
      services: allServices,
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
    dataSourceStatuses,
  ]);

  return snapshot;
}

export default useHealthMonitor;
