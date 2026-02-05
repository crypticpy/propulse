/**
 * Hook for DX Cluster data
 *
 * Three-tier data source with automatic fallback:
 * 1. Primary: Bridge WebSocket (`cluster.spot` messages via ProPulse Bridge)
 * 2. Fallback: REST proxy (`/api/spots/dxcluster` Vercel Edge Function)
 * 3. Demo: Simulated spots for offline/demo usage
 *
 * Uses TanStack Query for REST/demo data refresh with automatic caching.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchDemoSpots,
  generateNewSpot,
  fetchClusterSpots,
  clusterPayloadToSpot,
} from "@/lib/api/dxcluster";
import { useBridge } from "@/hooks/useBridge";
import { useDXStore, type DXSpotSource } from "@/stores/dxStore";
import type { DXSpot, DXClusterFilters } from "@/types/dxcluster";
import type { ClusterSpotPayload } from "@/types/bridge";

// Query key constants for cache management
export const DX_QUERY_KEYS = {
  spots: ["dx", "spots"] as const,
  restSpots: ["dx", "rest-spots"] as const,
} as const;

// Time constants
const MINUTE = 60 * 1000;
const SECOND = 1000;

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
    const cutoff = Date.now() - filters.maxAge * MINUTE;
    filtered = filtered.filter((spot) => spot.time.getTime() >= cutoff);
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
      // Prefix match - "CN87" matches "CN87ML", "CN87" matches "CN87"
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
 * Uses a three-tier fallback system:
 * 1. Bridge WebSocket (real-time cluster spots via local bridge)
 * 2. REST proxy (Vercel Edge Function polling)
 * 3. Demo spots (simulated data for offline usage)
 */
export function useDXCluster(externalFilters?: DXClusterFilters) {
  const queryClient = useQueryClient();
  const {
    spots,
    setSpots,
    addSpot,
    filters: storeFilters,
    maxSpots,
    spotSource,
    setSpotSource,
  } = useDXStore();
  const newSpotIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Bridge connection for real-time cluster spots
  const { connected: bridgeConnected, lastMessage } = useBridge();
  const [bridgeSpots, setBridgeSpots] = useState<DXSpot[]>([]);

  // Use external filters if provided, otherwise use store filters
  const filters = externalFilters || storeFilters;

  // ─── Tier 1: Bridge WebSocket ─────────────────────────────────────────────

  // Listen for cluster spots from bridge
  useEffect(() => {
    if (!lastMessage || lastMessage.type !== "cluster.spot") return;
    const spot = clusterPayloadToSpot(
      lastMessage.payload as ClusterSpotPayload,
    );
    setBridgeSpots((prev) => {
      const next = [spot, ...prev];
      if (next.length > maxSpots) next.length = maxSpots;
      return next;
    });
  }, [lastMessage, maxSpots]);

  // Promote to bridge source when receiving bridge spots
  useEffect(() => {
    if (bridgeConnected && bridgeSpots.length > 0) {
      setSpotSource("bridge");
    }
  }, [bridgeConnected, bridgeSpots.length, setSpotSource]);

  // Demote from bridge when bridge disconnects
  useEffect(() => {
    if (!bridgeConnected && spotSource === "bridge") {
      setSpotSource("rest");
    }
  }, [bridgeConnected, spotSource, setSpotSource]);

  // ─── Tier 2: REST proxy ───────────────────────────────────────────────────

  const restQuery = useQuery({
    queryKey: DX_QUERY_KEYS.restSpots,
    queryFn: () => fetchClusterSpots(maxSpots),
    enabled: spotSource !== "bridge",
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
    } else if (
      spotSource === "rest" &&
      restQuery.data &&
      restQuery.data.length === 0 &&
      !restQuery.isFetching
    ) {
      // REST returned empty — fall back to demo
      setSpotSource("demo");
    }
  }, [restQuery.data, restQuery.isFetching, spotSource, setSpotSource]);

  // ─── Tier 3: Demo fallback ────────────────────────────────────────────────

  const demoQuery = useQuery({
    queryKey: [...DX_QUERY_KEYS.spots, maxSpots],
    queryFn: () => fetchDemoSpots(maxSpots),
    enabled: spotSource === "demo",
    staleTime: 60 * SECOND,
    refetchInterval: 60 * SECOND,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  // ─── Select data source ───────────────────────────────────────────────────

  const allSpots = useMemo<DXSpot[]>(() => {
    if (spotSource === "bridge") return bridgeSpots;
    if (spotSource === "rest" && restQuery.data && restQuery.data.length > 0)
      return restQuery.data;
    return demoQuery.data ?? [];
  }, [spotSource, bridgeSpots, restQuery.data, demoQuery.data]);

  // Update store when the selected data changes
  useEffect(() => {
    if (allSpots.length > 0) {
      setSpots(allSpots);
    }
  }, [allSpots, setSpots]);

  // ─── Demo real-time spot simulation (only in demo mode) ───────────────────

  useEffect(() => {
    // Only simulate new spots in demo mode
    if (spotSource !== "demo") {
      if (newSpotIntervalRef.current) {
        clearTimeout(newSpotIntervalRef.current);
        newSpotIntervalRef.current = null;
      }
      return;
    }

    const addNewSpot = () => {
      const newSpot = generateNewSpot();
      addSpot(newSpot);

      // Schedule next spot at random interval
      const nextInterval = (5 + Math.random() * 10) * SECOND;
      newSpotIntervalRef.current = setTimeout(addNewSpot, nextInterval);
    };

    // Start adding spots after initial load
    if (demoQuery.data && !newSpotIntervalRef.current) {
      const initialDelay = (3 + Math.random() * 5) * SECOND;
      newSpotIntervalRef.current = setTimeout(addNewSpot, initialDelay);
    }

    return () => {
      if (newSpotIntervalRef.current) {
        clearTimeout(newSpotIntervalRef.current);
        newSpotIntervalRef.current = null;
      }
    };
  }, [spotSource, demoQuery.data, addSpot]);

  // Apply filters to spots
  const filteredSpots = filterSpots(spots, filters);

  // Manual refetch
  const refetch = useCallback(() => {
    if (spotSource === "bridge") {
      // Clear bridge spots to force re-accumulation
      setBridgeSpots([]);
    }
    queryClient.invalidateQueries({ queryKey: DX_QUERY_KEYS.restSpots });
    queryClient.invalidateQueries({ queryKey: DX_QUERY_KEYS.spots });
  }, [queryClient, spotSource]);

  // Determine loading state across all tiers
  const isLoading =
    spotSource === "demo"
      ? demoQuery.isLoading
      : spotSource === "rest"
        ? restQuery.isLoading
        : false;

  const isFetching =
    spotSource === "demo"
      ? demoQuery.isFetching
      : spotSource === "rest"
        ? restQuery.isFetching
        : false;

  const error =
    spotSource === "demo"
      ? demoQuery.error
      : spotSource === "rest"
        ? restQuery.error
        : null;

  // Get last updated time
  const lastUpdated =
    spotSource === "bridge"
      ? bridgeSpots.length > 0
        ? bridgeSpots[0].time
        : null
      : spotSource === "rest" && restQuery.dataUpdatedAt
        ? new Date(restQuery.dataUpdatedAt)
        : demoQuery.dataUpdatedAt
          ? new Date(demoQuery.dataUpdatedAt)
          : null;

  return {
    spots: filteredSpots,
    allSpots: spots,
    isLoading,
    isFetching,
    error,
    refetch,
    lastUpdated,
    /** Current data source tier: "bridge" | "rest" | "demo" */
    source: spotSource satisfies DXSpotSource,
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
