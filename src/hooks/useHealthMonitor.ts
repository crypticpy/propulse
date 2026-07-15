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
import { DATA_SOURCE_REGISTRY } from "@/lib/dataSourceRegistry";
import type { DataSourceId } from "@/lib/dataSourceRegistry";
import {
  SOLAR_QUERY_KEYS,
  SOLAR_SOURCE_IDS,
  SOLAR_SOURCE_POLICIES,
} from "@/lib/solar/sourcePolicies";
import { useDataSourceStatus } from "@/stores/dataSourceStatusStore";
import { useBridge } from "@/hooks/useBridge";
import { useSettingsStore } from "@/stores/settingsStore";
import { evaluateStaleness } from "@/lib/errors/classifyError";

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
  ...SOLAR_SOURCE_IDS.map((sourceId) => ({
    name: SOLAR_SOURCE_POLICIES[sourceId].label,
    queryKey: SOLAR_QUERY_KEYS[sourceId],
    staleThreshold: SOLAR_SOURCE_POLICIES[sourceId].softTtlMs,
    sourceId,
  })),
];

/** How often (ms) the snapshot is recomputed */
const REFRESH_INTERVAL = 30_000;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useHealthMonitor(): HealthSnapshot {
  const queryClient = useQueryClient();
  const bridgeEnabled = useSettingsStore((state) => state.bridgeEnabled);
  const bridge = useBridge({ enabled: bridgeEnabled });
  const dataSourceStatuses = useDataSourceStatus((s) => s.sources);
  const updateStaleness = useDataSourceStatus((s) => s.updateStaleness);

  // Tick counter drives periodic re-derivation of the snapshot
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    for (const [sourceId, status] of Object.entries(dataSourceStatuses)) {
      if (!status?.observedAt) continue;
      updateStaleness(
        sourceId as DataSourceId,
        evaluateStaleness(sourceId as DataSourceId, status.observedAt).level,
      );
    }
  }, [dataSourceStatuses, tick, updateStaleness]);

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
            status: dataUpdatedAt > 0 ? ("degraded" as const) : ("error" as const),
            lastUpdated: (sourceStatus.observedAt ?? dataUpdatedAt) || undefined,
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
          const freshnessTime = sourceStatus?.observedAt ?? dataUpdatedAt;
          const age = now - freshnessTime;
          if (age <= svc.staleThreshold) {
            return {
              name: svc.name,
              status: "healthy" as const,
              lastUpdated: freshnessTime,
              sourceId: svc.sourceId,
              provider: registryEntry?.provider,
            };
          }
          return {
            name: svc.name,
            status: "degraded" as const,
            lastUpdated: freshnessTime,
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

    const allServices = queryCacheServices;

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
