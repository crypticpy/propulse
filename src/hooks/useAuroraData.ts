/**
 * TanStack Query hook for fetching aurora data
 * Provides React hook with automatic caching, refetching, and error handling
 */

import { useQuery } from "@tanstack/react-query";
import { fetchAuroraData, type AuroraData } from "@/lib/api/aurora";

// Query key for cache management
export const AURORA_QUERY_KEY = ["aurora"] as const;

// Time constants in milliseconds
const MINUTE = 60 * 1000;

// Demo/fallback data for when API calls fail
// Creates a simple aurora oval pattern for both hemispheres
function generateDemoAuroraData(): AuroraData {
  const coordinates = [];

  // Generate aurora ovals for both hemispheres
  for (let lon = -180; lon <= 180; lon += 2) {
    for (let lat = -90; lat <= 90; lat += 1) {
      // Aurora oval is typically between 65-75 degrees latitude
      const absLat = Math.abs(lat);
      let aurora = 0;

      // Northern and southern auroral ovals
      if (absLat >= 60 && absLat <= 80) {
        // Peak at around 68-72 degrees
        const distFromPeak = Math.abs(absLat - 70);
        if (distFromPeak <= 10) {
          aurora = Math.max(0, 50 - distFromPeak * 5 + Math.random() * 20);
        }
      }

      if (aurora > 5) {
        coordinates.push({ lat, lon, aurora: Math.min(100, aurora) });
      }
    }
  }

  return {
    observationTime: new Date().toISOString(),
    forecastTime: new Date(Date.now() + 30 * MINUTE).toISOString(),
    coordinates,
  };
}

/**
 * Hook to fetch aurora data
 * Returns NOAA OVATION aurora probability data
 * Refetches every 30 minutes, stale after 30 minutes
 */
export function useAuroraData() {
  return useQuery({
    queryKey: AURORA_QUERY_KEY,
    queryFn: fetchAuroraData,
    staleTime: 30 * MINUTE,
    refetchInterval: 30 * MINUTE,
    placeholderData: generateDemoAuroraData(),
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}
