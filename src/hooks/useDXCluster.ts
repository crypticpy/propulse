/**
 * Hook for DX Cluster data
 *
 * Two-tier data source with automatic fallback:
 * 1. Primary: Bridge WebSocket (`cluster.spot` messages via ProPulse Bridge)
 * 2. Fallback: REST proxy (`/api/spots/dxcluster` Vercel Edge Function)
 *
 * Also owns the cluster link itself: it mirrors the bridge's `cluster.status`
 * broadcast into `dxStore` and exposes connect/disconnect over the socket it
 * already holds, so cluster controls can live on any surface without opening a
 * second bridge connection.
 *
 * Uses TanStack Query for REST data refresh with automatic caching.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchClusterFeed } from "@/lib/api/dxcluster";
import { useBridge } from "@/hooks/useBridge";
import { useClusterLink } from "@/hooks/useClusterLink";
import {
  clusterObservedAt,
  clusterRequestWindow,
  filterClusterAge,
} from "@/lib/dx/clusterHistory";
import {
  CLUSTER_BRIDGE_FUTURE_TOLERANCE_MS,
  filterBridgeSpotAge,
  mergeClusterBridgeSpot,
  readClusterBridgeSpot,
} from "@/lib/hamclock/clusterBridge";
import { spotFeedState } from "@/lib/map/spotAge";
import { useUserStore } from "@/stores/userStore";
import {
  useDXStore,
  type DXSpotSource,
  type ClusterLinkStatus,
} from "@/stores/dxStore";
import type { DXSpot, DXClusterFilters } from "@/types/dxcluster";
import type { BridgeMessage } from "@/types/bridge";

// Query key constants for cache management
export const DX_QUERY_KEYS = {
  spots: ["dx", "spots"] as const,
  restSpots: ["dx", "rest-spots"] as const,
} as const;

// Time constants
const SECOND = 1000;

export interface UseDXClusterOptions {
  /** Disable every public cluster transport and withhold cached public rows. */
  enabled?: boolean;
}

const connectedBridgeOwners = new Set<symbol>();

/**
 * Coordinate source fallback across every mounted DX consumer. Each consumer
 * owns its own bridge socket, while spotSource is intentionally shared. A
 * never-connected observer has no ownership to release, and the last real
 * owner schedules demotion after React finishes same-commit effect handoffs.
 */
export function useSharedBridgeSourceOwnership(
  dataEnabled: boolean,
  bridgeConnected: boolean,
): void {
  const ownerRef = useRef<symbol | null>(null);
  if (!ownerRef.current) ownerRef.current = Symbol("dx-bridge-owner");

  useEffect(() => {
    if (!dataEnabled || !bridgeConnected) return;
    const owner = ownerRef.current!;
    connectedBridgeOwners.add(owner);

    return () => {
      if (!connectedBridgeOwners.delete(owner)) return;
      queueMicrotask(() => {
        // Another observer may have acquired ownership during the same React
        // commit. Only the genuinely last disconnected owner triggers REST.
        if (connectedBridgeOwners.size > 0) return;
        const dxState = useDXStore.getState();
        if (dxState.spotSource === "bridge") {
          dxState.setSpotSource("rest");
        }
      });
    };
  }, [bridgeConnected, dataEnabled]);
}

/**
 * Filter spots based on criteria
 */
function filterSpots(
  spots: DXSpot[],
  filters: DXClusterFilters,
  futureToleranceMs = 0,
): DXSpot[] {
  let filtered = [...spots];

  // Filter by bands
  if (filters.bands && filters.bands.length > 0) {
    const allowed = new Set(filters.bands.map((band) => band.toLowerCase()));
    filtered = filtered.filter(
      (spot) => spot.band && allowed.has(spot.band.toLowerCase()),
    );
  }

  // Filter by modes
  if (filters.modes && filters.modes.length > 0) {
    filtered = filtered.filter(
      (spot) => spot.mode && filters.modes!.includes(spot.mode),
    );
  }

  // Filter by max age
  if (filters.maxAge && filters.maxAge > 0) {
    const cutoff = Date.now() - filters.maxAge * 60 * SECOND;
    filtered = filtered.filter((spot) => {
      const t =
        spot.time instanceof Date
          ? spot.time.getTime()
          : new Date(spot.time).getTime();
      return t >= cutoff && t <= Date.now() + futureToleranceMs;
    });
  }

  // Filter by search text
  if (filters.searchText && filters.searchText.trim().length > 0) {
    const search = filters.searchText.toLowerCase().trim();
    filtered = filtered.filter(
      (spot) =>
        spot.dx.toLowerCase().includes(search) ||
        spot.spotter.toLowerCase().includes(search) ||
        spot.comment.toLowerCase().includes(search) ||
        spot.dxGrid?.toLowerCase().includes(search),
    );
  }

  // Filter by grid locator (matches either spotter or DX grid, prefix match)
  if (filters.gridFilter && filters.gridFilter.trim().length >= 2) {
    const gridSearch = filters.gridFilter.toUpperCase().trim();
    filtered = filtered.filter((spot) => {
      const spotterGrid = spot.spotterGrid?.toUpperCase() || "";
      const dxGrid = spot.dxGrid?.toUpperCase() || "";
      return (
        spotterGrid.startsWith(gridSearch) || dxGrid.startsWith(gridSearch)
      );
    });
  }

  return filtered;
}

/**
 * Hook to fetch and manage DX Cluster spots
 *
 * Uses a two-tier fallback system:
 * 1. Bridge WebSocket (real-time cluster spots via local bridge)
 * 2. REST proxy (Vercel Edge Function polling)
 */
export function useDXCluster(
  externalFilters?: DXClusterFilters,
  options: UseDXClusterOptions = {},
) {
  const dataEnabled = options.enabled ?? true;
  const queryClient = useQueryClient();
  const {
    spots,
    setSpots,
    setClusterFeed,
    filters: storeFilters,
    maxSpots,
    spotSource,
    setClusterStatus,
  } = useDXStore();

  // Bridge connection for real-time cluster spots (only when enabled)
  const bridgeEnabled = useUserStore(
    (s) => s.preferences.bridgeEnabled ?? false,
  );
  const ingestBridgeMessage = useCallback((message: BridgeMessage) => {
    if (!dataEnabled || message.type !== "cluster.spot") return;
    const now = Date.now();
    const spot = readClusterBridgeSpot(message.payload, now);
    if (!spot) return;
    useDXStore.setState((state) => {
      if (filterBridgeSpotAge([spot], state.filters.maxAge, now).length === 0) return state;
      return {
        spots: mergeClusterBridgeSpot(
          state.spotSource === "bridge" ? state.spots : [],
          spot,
          state.filters.maxAge,
          state.maxSpots,
          now,
        ),
        spotSource: "bridge",
      };
    });
  }, [dataEnabled]);
  const {
    connected: bridgeConnected,
    lastMessage,
    send: bridgeSend,
  } = useBridge({
    enabled: dataEnabled && bridgeEnabled,
    onMessage: ingestBridgeMessage,
  });
  useSharedBridgeSourceOwnership(dataEnabled, bridgeConnected);

  // Use external filters if provided, otherwise use store filters
  const filters = externalFilters || storeFilters;

  // The existing age choices select a supported source-history window, and the
  // request scope (contract, row cap, window) keys the cache so one window's
  // rows are never reused for another.
  const requestWindow = clusterRequestWindow(filters.maxAge);
  const restScope = `${maxSpots}:${requestWindow}`;

  // Only a default consumer speaks for the shared wall snapshot. External
  // filters and disabled consumers read without publishing.
  const publishesSnapshot = dataEnabled && externalFilters === undefined;

  // Cached rows expire on the wall's ten-second clock rather than on refetch.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!dataEnabled) return;
    const tick = () => {
      const at = Date.now();
      setNow(at);
      // Prune on a tick only: the snapshot present at mount stays whole, so a
      // failed refresh still shows its last good rows.
      if (!publishesSnapshot) return;
      useDXStore.setState((state) => {
        if (state.spotSource === "bridge") return state;
        const eligible = filterClusterAge(state.spots, state.filters.maxAge, at);
        return eligible.length === state.spots.length ? state : { spots: eligible };
      });
    };
    const timer = window.setInterval(tick, 10_000);
    return () => window.clearInterval(timer);
  }, [dataEnabled, publishesSnapshot]);

  // ─── Tier 1: Bridge WebSocket ─────────────────────────────────────────────

  // Mirror the bridge's cluster link status into the store. Without this the
  // bridge's `cluster.status` broadcast was dropped on the floor and cluster
  // UI could never move past "Connecting...".
  useEffect(() => {
    if (
      !dataEnabled ||
      !lastMessage ||
      lastMessage.type !== "cluster.status"
    ) {
      return;
    }
    setClusterStatus(lastMessage.payload as ClusterLinkStatus);
  }, [dataEnabled, lastMessage, setClusterStatus]);

  // A bridge that *drops* takes the cluster link with it, whatever it last
  // reported. Only an observed connected → disconnected transition counts:
  // `bridgeConnected` starts false on every mount and `useBridge` opens a
  // socket per hook instance, so clearing on a bare `!bridgeConnected` let any
  // newly-mounted consumer (navigating to /map, for one) wipe a perfectly
  // valid status. The bridge does not replay `cluster.status` to new clients,
  // so nothing would have put it back.
  const sawBridgeConnectedRef = useRef(false);
  useEffect(() => {
    if (bridgeConnected) {
      sawBridgeConnectedRef.current = true;
      return;
    }
    if (sawBridgeConnectedRef.current) {
      sawBridgeConnectedRef.current = false;
      setClusterStatus(null);
    }
  }, [bridgeConnected, setClusterStatus]);

  // ─── Tier 2: REST proxy ───────────────────────────────────────────────────

  const restQuery = useQuery({
    queryKey: [...DX_QUERY_KEYS.restSpots, "feed-v1", maxSpots, requestWindow],
    queryFn: () => fetchClusterFeed(maxSpots, requestWindow),
    enabled: dataEnabled && spotSource !== "bridge",
    staleTime: 30 * SECOND,
    refetchInterval: 30 * SECOND,
    retry: 2,
  });
  const metadata = restQuery.data?.metadata;
  const restSpots = useMemo(
    () => filterClusterAge(restQuery.data?.spots ?? [], filters.maxAge, now),
    [restQuery.data, filters.maxAge, now],
  );

  // Publish REST only while REST still owns the source. A bridge packet can
  // arrive between this render and this effect, and must win that race.
  const publishedScopeRef = useRef(restScope);
  useEffect(() => {
    if (!publishesSnapshot) return;
    const scopeChanged = publishedScopeRef.current !== restScope;
    publishedScopeRef.current = restScope;
    // A valid response — including an empty one — replaces the rows, and a new
    // scope clears them. A failed request publishes nothing, so the last good
    // snapshot survives while `feedState` reports the failure.
    if (!scopeChanged && restQuery.data === undefined) return;
    const rows = restQuery.data?.spots ?? [];
    useDXStore.setState((state) => state.spotSource === "bridge"
      ? state
      : { spots: rows, spotSource: "rest" });
  }, [publishesSnapshot, restScope, restQuery.data, spotSource]);

  // Expire a quiet bridge snapshot on the same cadence as the passive tile.
  useEffect(() => {
    if (!publishesSnapshot || spotSource !== "bridge") return;
    const expire = () => useDXStore.setState((state) => {
      if (state.spotSource !== "bridge") return state;
      const eligible = filterBridgeSpotAge(state.spots, state.filters.maxAge, Date.now());
      return eligible.length === state.spots.length ? state : { spots: eligible };
    });
    expire();
    const timer = window.setInterval(expire, 10_000);
    return () => window.clearInterval(timer);
  }, [publishesSnapshot, spotSource]);

  // Bridge reports live in the shared store; REST rows come from this
  // consumer's own scoped request, so an external filter reads its own window
  // without disturbing the wall snapshot.
  const allSpots = useMemo<DXSpot[]>(() => {
    if (!dataEnabled) return [];
    return spotSource === "bridge" ? spots : restSpots;
  }, [dataEnabled, spotSource, spots, restSpots]);

  // Apply filters to spots
  const filteredSpots = dataEnabled
    ? filterSpots(allSpots, filters, spotSource === "bridge" ? CLUSTER_BRIDGE_FUTURE_TOLERANCE_MS : 0)
    : [];

  // Source state travels with the rows: a request that failed after a cached
  // read stays STALE, an initial failure is UNAVAILABLE, and a disconnected
  // observer never relabels a live owner's transport.
  const sourceState = spotSource === "bridge"
    ? !dataEnabled
      ? "OFF"
      : bridgeConnected || connectedBridgeOwners.size > 0 ? "BRIDGE" : "BRIDGE OFF"
    : spotFeedState(metadata, dataEnabled, restQuery.isLoading, restQuery.isError, now);
  const feedState = useMemo(() => ({
    state: sourceState,
    windowMinutes: spotSource === "bridge" ? null : metadata?.windowMinutes ?? requestWindow,
    fetchedAt: spotSource === "bridge" ? null : metadata?.fetchedAt ?? null,
    observedAt: spotSource === "bridge"
      ? clusterObservedAt(spots)
      : metadata?.observedAt ?? null,
  }), [sourceState, spotSource, metadata, requestWindow, spots]);
  useEffect(() => {
    if (!publishesSnapshot) return;
    if (spotSource === "bridge" && !bridgeConnected && connectedBridgeOwners.size > 0) return;
    setClusterFeed(feedState);
  }, [publishesSnapshot, spotSource, bridgeConnected, feedState, setClusterFeed]);

  // ─── Cluster link control ─────────────────────────────────────────────────

  const { clusterConnect, clusterDisconnect } = useClusterLink(
    bridgeSend,
    bridgeConnected,
  );

  // Manual refetch
  const refetch = useCallback(() => {
    if (!dataEnabled) return;
    if (spotSource === "bridge") {
      setSpots([]);
    }
    queryClient.invalidateQueries({ queryKey: DX_QUERY_KEYS.restSpots });
  }, [dataEnabled, queryClient, setSpots, spotSource]);

  // Determine loading state
  const isLoading =
    dataEnabled && spotSource === "rest" ? restQuery.isLoading : false;
  const isFetching =
    dataEnabled && spotSource === "rest" ? restQuery.isFetching : false;
  const error = dataEnabled && spotSource === "rest" ? restQuery.error : null;
  const isError = dataEnabled && spotSource === "rest" && restQuery.isError;

  // Retrieval time is server evidence, not the client cache's update time.
  const timestamp = spotSource === "bridge" ? feedState.observedAt : feedState.fetchedAt;
  const lastUpdated = dataEnabled && timestamp !== null ? new Date(timestamp) : null;

  return {
    spots: filteredSpots,
    allSpots,
    feedState,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
    lastUpdated,
    /** Current data source tier: "bridge" | "rest" */
    source: spotSource satisfies DXSpotSource,
    /** Whether the local bridge WebSocket is up (cluster control needs it) */
    bridgeConnected,
    /** Ask the bridge to attach to a cluster node. Returns false if not sent. */
    clusterConnect,
    /** Ask the bridge to drop the cluster link. Returns false if not sent. */
    clusterDisconnect,
  };
}

/**
 * Hook to get spot statistics
 */
export function useDXSpotStats() {
  const { spots } = useDXStore();

  const stats = {
    total: spots.length,
    byBand: {} as Record<string, number>,
    byMode: {} as Record<string, number>,
    topEntity: undefined as string | undefined,
  };

  // Count by band
  for (const spot of spots) {
    if (spot.band) {
      stats.byBand[spot.band] = (stats.byBand[spot.band] || 0) + 1;
    }
    if (spot.mode) {
      stats.byMode[spot.mode] = (stats.byMode[spot.mode] || 0) + 1;
    }
  }

  return stats;
}

/**
 * Hook for a single selected spot
 */
export function useSelectedSpot() {
  return useDXStore();
}
