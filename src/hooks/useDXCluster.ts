/**
 * Hook for DX Cluster data
 * Uses TanStack Query for demo data refresh with automatic caching
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { fetchDemoSpots, generateNewSpot } from "@/lib/api/dxcluster";
import { useDXStore } from "@/stores/dxStore";
import type { DXSpot, DXClusterFilters } from "@/types/dxcluster";

// Query key constants for cache management
export const DX_QUERY_KEYS = {
  spots: ["dx", "spots"] as const,
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
 */
export function useDXCluster(externalFilters?: DXClusterFilters) {
  const queryClient = useQueryClient();
  const {
    spots,
    setSpots,
    addSpot,
    filters: storeFilters,
    maxSpots,
  } = useDXStore();
  const newSpotIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Use external filters if provided, otherwise use store filters
  const filters = externalFilters || storeFilters;

  // Fetch initial spots
  const query = useQuery({
    queryKey: DX_QUERY_KEYS.spots,
    queryFn: async () => {
      return await fetchDemoSpots(maxSpots);
    },
    staleTime: 30 * SECOND,
    refetchInterval: 60 * SECOND, // Refresh every minute
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  // Update store when query data changes
  useEffect(() => {
    if (query.data) {
      setSpots(query.data);
    }
  }, [query.data, setSpots]);

  // Simulate real-time spot additions (every 5-15 seconds)
  useEffect(() => {
    const addNewSpot = () => {
      const newSpot = generateNewSpot();
      addSpot(newSpot);

      // Schedule next spot at random interval
      const nextInterval = (5 + Math.random() * 10) * SECOND;
      newSpotIntervalRef.current = setTimeout(addNewSpot, nextInterval);
    };

    // Start adding spots after initial load
    if (query.data && !newSpotIntervalRef.current) {
      const initialDelay = (3 + Math.random() * 5) * SECOND;
      newSpotIntervalRef.current = setTimeout(addNewSpot, initialDelay);
    }

    return () => {
      if (newSpotIntervalRef.current) {
        clearTimeout(newSpotIntervalRef.current);
        newSpotIntervalRef.current = null;
      }
    };
  }, [query.data, addSpot]);

  // Apply filters to spots
  const filteredSpots = filterSpots(spots, filters);

  // Manual refetch
  const refetch = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: DX_QUERY_KEYS.spots });
  }, [queryClient]);

  // Get last updated time
  const lastUpdated = query.dataUpdatedAt
    ? new Date(query.dataUpdatedAt)
    : null;

  return {
    spots: filteredSpots,
    allSpots: spots,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch,
    lastUpdated,
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
