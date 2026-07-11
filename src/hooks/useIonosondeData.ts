/**
 * Ionosonde Data Hook
 *
 * TanStack Query hook for fetching and managing real-time ionosonde data.
 * Provides automatic caching, refetching every 15 minutes, and helper
 * functions for path-based MUF lookups.
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo, useCallback } from "react";
import {
  fetchIonosondeData,
  getClosestStation,
  getMeasuredMUF,
  interpolateFoF2,
  type IonosondeReading,
  type IonosondeData,
} from "@/lib/api/ionosonde";

/** Query key for ionosonde data */
export const IONOSONDE_QUERY_KEY = ["solar", "ionosonde"] as const;

/** Time constants */
const MINUTE = 60 * 1000;

/** Demo/fallback data for when API calls fail */
const DEMO_IONOSONDE_DATA: IonosondeData = {
  stations: [
    {
      id: "BC840",
      name: "Boulder, CO",
      lat: 40.0,
      lon: -105.3,
      foF2: 7.2,
      muf3000: 21.6,
      hmF2: 280,
      confidence: 95,
      timestamp: new Date().toISOString(),
    },
    {
      id: "WP937",
      name: "Wallops Island, VA",
      lat: 37.9,
      lon: -75.5,
      foF2: 6.8,
      muf3000: 20.4,
      hmF2: 275,
      confidence: 90,
      timestamp: new Date().toISOString(),
    },
    {
      id: "PR840",
      name: "Puerto Rico",
      lat: 18.5,
      lon: -67.2,
      foF2: 8.5,
      muf3000: 25.5,
      hmF2: 310,
      confidence: 88,
      timestamp: new Date().toISOString(),
    },
    {
      id: "MH453",
      name: "Millstone Hill, MA",
      lat: 42.6,
      lon: -71.5,
      foF2: 6.5,
      muf3000: 19.5,
      hmF2: 265,
      confidence: 92,
      timestamp: new Date().toISOString(),
    },
  ],
  lastUpdate: new Date(),
  source: "demo",
};

/**
 * Hook return type
 */
export interface UseIonosondeDataReturn {
  /** Array of all ionosonde stations with readings */
  stations: IonosondeReading[];
  /** Map of readings by station ID for quick lookup */
  readings: Map<string, IonosondeReading>;
  /** Whether data is currently loading */
  isLoading: boolean;
  /** Whether an error occurred */
  isError: boolean;
  /** Error object if any */
  error: Error | null;
  /** Whether data is being refetched */
  isFetching: boolean;
  /** Last update timestamp */
  lastUpdate: Date | null;
  /** Data source identifier */
  source: string | null;
  /** Get reading for nearest station to a path */
  getReadingForPath: (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ) => IonosondeReading | null;
  /** Get measured MUF for a path */
  getMeasuredMUFForPath: (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ) => number | null;
  /** Get interpolated foF2 at any location */
  getInterpolatedFoF2: (lat: number, lon: number) => number | null;
}

/**
 * Hook to fetch and manage ionosonde data
 *
 * Features:
 * - Fetches every 15 minutes (matches data source update frequency)
 * - Caches readings with TanStack Query
 * - Provides helper functions for path-based lookups
 * - Falls back to demo data on error
 *
 * @returns Ionosonde data and helper functions
 *
 * @example
 * ```typescript
 * function PropagationPanel() {
 *   const { stations, getMeasuredMUFForPath, isLoading } = useIonosondeData();
 *
 *   const muf = getMeasuredMUFForPath(myLat, myLon, targetLat, targetLon);
 *
 *   return (
 *     <div>
 *       {isLoading ? "Loading..." : `${stations.length} stations reporting`}
 *       {muf && <span>Measured MUF: {muf.toFixed(1)} MHz</span>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useIonosondeData(): UseIonosondeDataReturn {
  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: IONOSONDE_QUERY_KEY,
    queryFn: fetchIonosondeData,
    staleTime: 10 * MINUTE,
    refetchInterval: 15 * MINUTE,
    placeholderData: DEMO_IONOSONDE_DATA,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  // Create a Map for quick station lookup by ID
  const readings = useMemo(() => {
    const map = new Map<string, IonosondeReading>();
    if (data?.stations) {
      for (const station of data.stations) {
        map.set(station.id, station);
      }
    }
    return map;
  }, [data?.stations]);

  // Get reading for nearest station to path midpoint
  const getReadingForPath = useCallback(
    (
      lat1: number,
      lon1: number,
      lat2: number,
      lon2: number,
    ): IonosondeReading | null => {
      if (!data?.stations.length) return null;

      const midLat = (lat1 + lat2) / 2;
      const midLon = (lon1 + lon2) / 2;

      return getClosestStation(midLat, midLon, data.stations, 3000);
    },
    [data?.stations],
  );

  // Get measured MUF for a path
  const getMeasuredMUFForPath = useCallback(
    (lat1: number, lon1: number, lat2: number, lon2: number): number | null => {
      if (!data?.stations.length) return null;
      return getMeasuredMUF(lat1, lon1, lat2, lon2, data.stations);
    },
    [data?.stations],
  );

  // Get interpolated foF2 at any location
  const getInterpolatedFoF2 = useCallback(
    (lat: number, lon: number): number | null => {
      if (!data?.stations.length) return null;
      return interpolateFoF2(lat, lon, data.stations);
    },
    [data?.stations],
  );

  return {
    stations: data?.stations ?? [],
    readings,
    isLoading,
    isError,
    error: error as Error | null,
    isFetching,
    lastUpdate: data?.lastUpdate ?? null,
    source: data?.source ?? null,
    getReadingForPath,
    getMeasuredMUFForPath,
    getInterpolatedFoF2,
  };
}

/**
 * Hook to get ionosonde reading at a specific location
 *
 * @param lat - Latitude
 * @param lon - Longitude
 * @returns Closest ionosonde reading or null
 */
export function useNearestIonsondeReading(
  lat: number | null,
  lon: number | null,
): IonosondeReading | null {
  const { stations } = useIonosondeData();

  return useMemo(() => {
    if (lat === null || lon === null || !stations.length) return null;
    return getClosestStation(lat, lon, stations, 2000);
  }, [lat, lon, stations]);
}

/**
 * Hook for comparing modeled vs measured MUF
 *
 * @param lat1 - Transmitter latitude
 * @param lon1 - Transmitter longitude
 * @param lat2 - Receiver latitude
 * @param lon2 - Receiver longitude
 * @param modeledMUF - MUF from prediction model
 * @returns Comparison data
 */
export function useMUFComparison(
  lat1: number | null,
  lon1: number | null,
  lat2: number | null,
  lon2: number | null,
  modeledMUF: number | null,
): {
  measuredMUF: number | null;
  modeledMUF: number | null;
  difference: number | null;
  percentDifference: number | null;
  hasMeasuredData: boolean;
} {
  const { getMeasuredMUFForPath } = useIonosondeData();

  return useMemo(() => {
    if (lat1 === null || lon1 === null || lat2 === null || lon2 === null) {
      return {
        measuredMUF: null,
        modeledMUF,
        difference: null,
        percentDifference: null,
        hasMeasuredData: false,
      };
    }

    const measured = getMeasuredMUFForPath(lat1, lon1, lat2, lon2);

    if (measured === null || modeledMUF === null) {
      return {
        measuredMUF: measured,
        modeledMUF,
        difference: null,
        percentDifference: null,
        hasMeasuredData: measured !== null,
      };
    }

    const difference = measured - modeledMUF;
    const percentDifference = ((measured - modeledMUF) / modeledMUF) * 100;

    return {
      measuredMUF: measured,
      modeledMUF,
      difference,
      percentDifference,
      hasMeasuredData: true,
    };
  }, [lat1, lon1, lat2, lon2, modeledMUF, getMeasuredMUFForPath]);
}
