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
import { CLUSTER_BRIDGE_FUTURE_TOLERANCE_MS, readClusterBridgeSpot, mergeClusterBridgeSpot } from "@/lib/dx/clusterBridge";
import { clusterObservedAt, clusterRequestWindow, filterClusterAge } from "@/lib/dx/clusterHistory";
import { spotFeedState } from "@/lib/map/spotAge";
import { useBridge } from "@/hooks/useBridge";
import { useClusterLink } from "@/hooks/useClusterLink";
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
function filterSpots(spots: DXSpot[], filters: DXClusterFilters): DXSpot[] {
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
    setClusterFeed,
    filters: storeFilters,
    maxSpots,
    spotSource,
    setClusterStatus,
  } = useDXStore();

  const [bridgeSpots, setBridgeSpots] = useState<DXSpot[]>([]);
  const [now, setNow] = useState(Date.now);
  const onMessage = useCallback((message: BridgeMessage) => {
    if (!dataEnabled) return;
    if (message.type === "cluster.status") {
      setClusterStatus(message.payload as ClusterLinkStatus);
      return;
    }
    if (message.type !== "cluster.spot") return;
    const receivedAt = Date.now();
    const spot = readClusterBridgeSpot(message.payload, receivedAt);
    if (!spot) return;
    setNow(receivedAt);
    if (externalFilters !== undefined) {
      setBridgeSpots(previous => mergeClusterBridgeSpot(previous, spot, 120, maxSpots, receivedAt));
      return;
    }
    // Merge against the current shared snapshot, never an observer's partial
    // buffer. Duplicate broadcasts to multiple sockets cannot erase history.
    useDXStore.setState(state => ({
      spotSource: "bridge",
      spots: mergeClusterBridgeSpot(state.spotSource === "bridge" ? state.spots : [], spot, state.filters.maxAge, state.maxSpots, receivedAt),
    }));
  }, [dataEnabled, externalFilters, maxSpots, setClusterStatus]);

  // Bridge connection for real-time cluster spots (only when enabled)
  const bridgeEnabled = useUserStore(
    (s) => s.preferences.bridgeEnabled ?? false,
  );
  const {
    connected: bridgeConnected,
    send: bridgeSend,
  } = useBridge({
    enabled: dataEnabled && bridgeEnabled,
    onMessage,
  });
  useSharedBridgeSourceOwnership(dataEnabled, bridgeConnected);
  const source = externalFilters !== undefined && bridgeConnected && bridgeSpots.length > 0 ? "bridge" : spotSource;

  // Use external filters if provided, otherwise use store filters
  const filters = externalFilters || storeFilters;
  const requestWindow = clusterRequestWindow(filters.maxAge);
  useEffect(() => {
    if (!dataEnabled) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(timer);
  }, [dataEnabled]);

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
    enabled: dataEnabled && source !== "bridge",
    staleTime: 30 * SECOND,
    refetchInterval: 30 * SECOND,
    retry: 2,
  });
  useEffect(() => {
    if (dataEnabled) setNow(Date.now());
  }, [dataEnabled, restQuery.dataUpdatedAt]);

  const restSpots = useMemo(() =>
    filterClusterAge(restQuery.data?.spots ?? [], filters.maxAge, now),
  [restQuery.data, filters.maxAge, now]);
  const allSpots = useMemo(() => !dataEnabled ? [] : source === "bridge"
    ? filterClusterAge(externalFilters !== undefined && bridgeSpots.length > 0 ? bridgeSpots : spots, filters.maxAge, now, CLUSTER_BRIDGE_FUTURE_TOLERANCE_MS) : restSpots,
  [dataEnabled, source, spots, externalFilters, bridgeSpots, filters.maxAge, now, restSpots]);

  const sourceState = source === "bridge"
    ? !dataEnabled ? "OFF" : (bridgeConnected || connectedBridgeOwners.size > 0) ? "BRIDGE" : "BRIDGE OFF"
    : spotFeedState(restQuery.data?.metadata, dataEnabled, restQuery.isLoading, restQuery.isError, now);
  const feedState = useMemo(() => ({
    state: sourceState,
    windowMinutes: source === "bridge" ? null : restQuery.data?.metadata.windowMinutes ?? requestWindow,
    fetchedAt: source === "bridge" ? null : restQuery.data?.metadata.fetchedAt ?? null,
    observedAt: source === "bridge" ? clusterObservedAt(externalFilters !== undefined && bridgeSpots.length > 0 ? bridgeSpots : spots) : restQuery.data?.metadata.observedAt ?? null,
  }), [sourceState, source, restQuery.data, requestWindow, spots, externalFilters, bridgeSpots]);

  // Snapshot effects must recheck current source ownership: a transport event
  // can promote the shared store before an older REST render's effect runs.
  useEffect(() => {
    if (!dataEnabled || externalFilters !== undefined) return;
    useDXStore.setState(state => {
      if (state.spotSource === "bridge") {
        const eligible = filterClusterAge(state.spots, state.filters.maxAge, Date.now(), CLUSTER_BRIDGE_FUTURE_TOLERANCE_MS);
        return eligible.length === state.spots.length ? state : { spots: eligible };
      }
      if (source === "bridge" || clusterRequestWindow(state.filters.maxAge) !== requestWindow || state.maxSpots !== maxSpots) return state;
      return state.spots === restSpots ? state : { spots: restSpots };
    });
  }, [dataEnabled, externalFilters, source, now, spots.length, restSpots, requestWindow, maxSpots]);
  useEffect(() => {
    if (!dataEnabled || externalFilters !== undefined) return;
    const current = useDXStore.getState();
    if (current.spotSource !== source || (source === "rest" && clusterRequestWindow(current.filters.maxAge) !== requestWindow)) return;
    // A disconnected observer cannot relabel another live owner's transport.
    if (source === "bridge" && !bridgeConnected && connectedBridgeOwners.size > 0) return;
    setClusterFeed(feedState);
  }, [dataEnabled, externalFilters, source, requestWindow, bridgeConnected, feedState, setClusterFeed]);

  const filteredSpots = filterSpots(allSpots, filters);

  // ─── Cluster link control ─────────────────────────────────────────────────

  const { clusterConnect, clusterDisconnect } = useClusterLink(
    bridgeSend,
    bridgeConnected,
  );

  // Manual refetch
  const refetch = useCallback(() => {
    if (!dataEnabled) return;
    if (source === "bridge") {
      setBridgeSpots([]);
    }
    queryClient.invalidateQueries({ queryKey: DX_QUERY_KEYS.restSpots });
  }, [dataEnabled, queryClient, source]);

  // Determine loading state
  const isLoading =
    dataEnabled && source === "rest" ? restQuery.isLoading : false;
  const isFetching =
    dataEnabled && source === "rest" ? restQuery.isFetching : false;
  const error = dataEnabled && source === "rest" ? restQuery.error : null;

  // Retrieval time is server evidence, not the client cache's update time.
  const timestamp = source === "bridge" ? feedState.observedAt : feedState.fetchedAt;
  const lastUpdated = dataEnabled && timestamp !== null ? new Date(timestamp) : null;

  return {
    spots: filteredSpots,
    allSpots,
    feedState,
    isLoading,
    isFetching,
    error,
    refetch,
    lastUpdated,
    /** Current data source tier: "bridge" | "rest" */
    source: source satisfies DXSpotSource,
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
