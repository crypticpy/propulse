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
import { fetchClusterSpots, clusterPayloadToSpot } from "@/lib/api/dxcluster";
import { useBridge } from "@/hooks/useBridge";
import { useClusterLink } from "@/hooks/useClusterLink";
import { useUserStore } from "@/stores/userStore";
import {
  useDXStore,
  type DXSpotSource,
  type ClusterLinkStatus,
} from "@/stores/dxStore";
import type { DXSpot, DXClusterFilters } from "@/types/dxcluster";
import type { ClusterSpotPayload } from "@/types/bridge";

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
    filtered = filtered.filter(
      (spot) => spot.band && filters.bands!.includes(spot.band),
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
      return t >= cutoff;
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
    filters: storeFilters,
    maxSpots,
    spotSource,
    setSpotSource,
    setClusterStatus,
  } = useDXStore();

  // Bridge connection for real-time cluster spots (only when enabled)
  const bridgeEnabled = useUserStore(
    (s) => s.preferences.bridgeEnabled ?? false,
  );
  const {
    connected: bridgeConnected,
    lastMessage,
    send: bridgeSend,
  } = useBridge({
    enabled: dataEnabled && bridgeEnabled,
  });
  const [bridgeSpots, setBridgeSpots] = useState<DXSpot[]>([]);
  useSharedBridgeSourceOwnership(dataEnabled, bridgeConnected);

  // Use external filters if provided, otherwise use store filters
  const filters = externalFilters || storeFilters;

  // ─── Tier 1: Bridge WebSocket ─────────────────────────────────────────────

  // Listen for cluster spots from bridge
  useEffect(() => {
    if (
      !dataEnabled ||
      !lastMessage ||
      lastMessage.type !== "cluster.spot"
    ) {
      return;
    }
    const spot = clusterPayloadToSpot(
      lastMessage.payload as ClusterSpotPayload,
    );
    setBridgeSpots((prev) => {
      const next = [spot, ...prev];
      if (next.length > maxSpots) next.length = maxSpots;
      return next;
    });
  }, [dataEnabled, lastMessage, maxSpots]);

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

  // Promote to bridge source when receiving bridge spots
  useEffect(() => {
    if (bridgeConnected && bridgeSpots.length > 0) {
      setSpotSource("bridge");
    }
  }, [bridgeConnected, bridgeSpots.length, setSpotSource]);

  // ─── Tier 2: REST proxy ───────────────────────────────────────────────────

  const restQuery = useQuery({
    queryKey: DX_QUERY_KEYS.restSpots,
    queryFn: () => fetchClusterSpots(maxSpots),
    enabled: dataEnabled && spotSource !== "bridge",
    staleTime: 30 * SECOND,
    refetchInterval: 30 * SECOND,
    retry: 2,
  });

  // If REST returned spots, promote to "rest" source
  useEffect(() => {
    if (
      spotSource !== "bridge" &&
      restQuery.data &&
      restQuery.data.length > 0
    ) {
      setSpotSource("rest");
    }
  }, [restQuery.data, spotSource, setSpotSource]);

  // ─── Select data source ───────────────────────────────────────────────────

  const allSpots = useMemo<DXSpot[]>(() => {
    if (!dataEnabled) return [];
    if (spotSource === "bridge") return bridgeSpots;
    if (restQuery.data && restQuery.data.length > 0) return restQuery.data;
    return [];
  }, [dataEnabled, spotSource, bridgeSpots, restQuery.data]);

  // Update store when the selected data changes
  useEffect(() => {
    if (allSpots.length > 0) {
      setSpots(allSpots);
    }
  }, [allSpots, setSpots]);

  // Apply filters to spots
  const filteredSpots = dataEnabled ? filterSpots(spots, filters) : [];

  // ─── Cluster link control ─────────────────────────────────────────────────

  const { clusterConnect, clusterDisconnect } = useClusterLink(
    bridgeSend,
    bridgeConnected,
  );

  // Manual refetch
  const refetch = useCallback(() => {
    if (!dataEnabled) return;
    if (spotSource === "bridge") {
      setBridgeSpots([]);
    }
    queryClient.invalidateQueries({ queryKey: DX_QUERY_KEYS.restSpots });
  }, [dataEnabled, queryClient, spotSource]);

  // Determine loading state
  const isLoading =
    dataEnabled && spotSource === "rest" ? restQuery.isLoading : false;
  const isFetching =
    dataEnabled && spotSource === "rest" ? restQuery.isFetching : false;
  const error = dataEnabled && spotSource === "rest" ? restQuery.error : null;

  // Get last updated time
  const lastUpdated =
    !dataEnabled
      ? null
      : spotSource === "bridge"
      ? bridgeSpots.length > 0
        ? bridgeSpots[0].time
        : null
      : restQuery.dataUpdatedAt
        ? new Date(restQuery.dataUpdatedAt)
        : null;

  return {
    spots: filteredSpots,
    allSpots: dataEnabled ? spots : [],
    isLoading,
    isFetching,
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
