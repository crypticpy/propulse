/**
 * TanStack Query hooks for fetching solar weather data
 * Provides React hooks with automatic caching, refetching, and error handling
 * Includes offline support with IndexedDB caching
 */

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  fetchKIndex,
  fetchSolarFlux,
  fetchProbabilities,
  fetchSunspots,
  fetchMagnetometer,
} from "../lib/api/noaa";
import type {
  KIndexData,
  SolarFluxData,
  SolarProbabilities,
  SunspotData,
  MagnetometerData,
} from "../lib/api/types";
import { useIsOnline } from "./useOfflineStatus";
import {
  setCachedData,
  getCachedDataWithMeta,
  CACHE_KEYS,
  CACHE_TTL,
  isExpired,
} from "../lib/utils/offlineStorage";
import { useState, useEffect } from "react";

// Query key constants for cache management
export const QUERY_KEYS = {
  kIndex: ["solar", "k-index"] as const,
  solarFlux: ["solar", "flux"] as const,
  probabilities: ["solar", "probabilities"] as const,
  sunspots: ["solar", "sunspots"] as const,
  magnetometer: ["solar", "magnetometer"] as const,
} as const;

// Time constants in milliseconds
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

// Demo/fallback data for when API calls fail
const DEMO_K_INDEX: KIndexData[] = Array.from({ length: 24 }, (_, i) => ({
  time_tag: new Date(Date.now() - i * HOUR).toISOString(),
  kp_index: Math.floor(Math.random() * 4) + 1,
  estimated_kp: Math.floor(Math.random() * 4) + 1,
  kp: String(Math.floor(Math.random() * 4) + 1),
})).reverse();

const DEMO_SOLAR_FLUX: SolarFluxData[] = Array.from({ length: 30 }, (_, i) => ({
  time_tag: new Date(Date.now() - i * 24 * HOUR).toISOString(),
  flux: 120 + Math.floor(Math.random() * 60),
  adjusted_flux: 115 + Math.floor(Math.random() * 60),
})).reverse();

const DEMO_PROBABILITIES: SolarProbabilities = {
  time_tag: new Date().toISOString(),
  c_prob: 75,
  m_prob: 25,
  x_prob: 5,
  proton_prob: 1,
};

const DEMO_SUNSPOTS: SunspotData[] = Array.from({ length: 12 }, (_, i) => ({
  time_tag: new Date(Date.now() - i * 30 * 24 * HOUR).toISOString(),
  ssn: 100 + Math.floor(Math.random() * 80),
  smoothed_ssn: 110 + Math.floor(Math.random() * 40),
})).reverse();

const DEMO_MAGNETOMETER: MagnetometerData[] = Array.from(
  { length: 60 },
  (_, i) => ({
    time_tag: new Date(Date.now() - i * MINUTE).toISOString(),
    bz_gsm: Math.random() * 10 - 5, // -5 to +5 nT typical quiet conditions
    by_gsm: Math.random() * 10 - 5,
    bt: 5 + Math.random() * 5, // 5-10 nT typical
  }),
).reverse();

// Extended return type for offline-aware hooks
export interface OfflineAwareQueryResult<T> {
  /** The data returned from the query */
  data: T | undefined;
  /** True if the query is currently fetching for the first time */
  isLoading: boolean;
  /** True if the query encountered an error */
  isError: boolean;
  /** True if the query is currently fetching (including background refetches) */
  isFetching: boolean;
  /** True if the query was successful */
  isSuccess: boolean;
  /** The error if the query failed */
  error: Error | null;
  /** Function to manually refetch the data */
  refetch: () => void;
  /** True if currently using cached data due to being offline */
  isOffline: boolean;
  /** True if cached data is older than the TTL */
  isStale: boolean;
  /** Timestamp of the last successful data fetch */
  lastUpdated: Date | null;
}

/**
 * Custom hook to create offline-aware queries
 * Wraps TanStack Query with IndexedDB caching for offline support
 */
function useOfflineAwareQuery<T>(
  cacheKey: string,
  ttl: number,
  queryResult: UseQueryResult<T, Error>,
): OfflineAwareQueryResult<T> {
  const isOnline = useIsOnline();
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [staleStatus, setStaleStatus] = useState(false);
  const [offlineData, setOfflineData] = useState<T | null>(null);

  // Update cache when new data is fetched successfully
  useEffect(() => {
    if (queryResult.data && queryResult.isSuccess && !queryResult.isFetching) {
      setCachedData(cacheKey, queryResult.data, ttl);
      setLastUpdated(new Date());
      setStaleStatus(false);
    }
  }, [
    queryResult.data,
    queryResult.isSuccess,
    queryResult.isFetching,
    cacheKey,
    ttl,
  ]);

  // Load cached data when offline or on mount
  useEffect(() => {
    const loadCachedData = async () => {
      const cached = await getCachedDataWithMeta(cacheKey);
      if (cached) {
        setOfflineData(cached.data as T);
        setLastUpdated(new Date(cached.timestamp));
        setStaleStatus(isExpired(cached.expiresAt));
      }
    };

    loadCachedData();
  }, [cacheKey]);

  // Determine if we're using offline data
  const isUsingOfflineData = !isOnline && !queryResult.data && !!offlineData;

  // Use offline data when appropriate
  const effectiveData = isUsingOfflineData ? offlineData : queryResult.data;

  // Create the extended result with offline properties
  return {
    data: effectiveData,
    isLoading: queryResult.isLoading,
    isError: queryResult.isError,
    isFetching: queryResult.isFetching,
    isSuccess: queryResult.isSuccess,
    error: queryResult.error,
    refetch: queryResult.refetch,
    isOffline: !isOnline,
    isStale: staleStatus,
    lastUpdated,
  };
}

/**
 * Hook to fetch K-index data
 * Returns last 24 entries, refetches every 1 minute, stale after 5 minutes
 */
export function useKIndex(): OfflineAwareQueryResult<KIndexData[]> {
  const isOnline = useIsOnline();

  const query = useQuery({
    queryKey: QUERY_KEYS.kIndex,
    queryFn: async () => {
      const data = await fetchKIndex();
      return data.slice(-24);
    },
    staleTime: 5 * MINUTE,
    refetchInterval: isOnline ? 1 * MINUTE : false,
    placeholderData: DEMO_K_INDEX,
    retry: isOnline ? 3 : 0,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    enabled: isOnline,
  });

  return useOfflineAwareQuery(CACHE_KEYS.kIndex, CACHE_TTL.kIndex, query);
}

/**
 * Hook to fetch solar flux data
 * Returns last 30 entries, refetches every 4 hours, stale after 1 day
 */
export function useSolarFlux(): OfflineAwareQueryResult<SolarFluxData[]> {
  const isOnline = useIsOnline();

  const query = useQuery({
    queryKey: QUERY_KEYS.solarFlux,
    queryFn: async () => {
      const data = await fetchSolarFlux();
      return data.slice(-30);
    },
    staleTime: 24 * HOUR,
    refetchInterval: isOnline ? 4 * HOUR : false,
    placeholderData: DEMO_SOLAR_FLUX,
    retry: isOnline ? 3 : 0,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    enabled: isOnline,
  });

  return useOfflineAwareQuery(CACHE_KEYS.solarFlux, CACHE_TTL.solarFlux, query);
}

/**
 * Hook to fetch solar event probabilities
 * Returns current probabilities, refetches every 6 hours
 */
export function useProbabilities(): OfflineAwareQueryResult<SolarProbabilities> {
  const isOnline = useIsOnline();

  const query = useQuery({
    queryKey: QUERY_KEYS.probabilities,
    queryFn: fetchProbabilities,
    staleTime: 6 * HOUR,
    refetchInterval: isOnline ? 6 * HOUR : false,
    placeholderData: DEMO_PROBABILITIES,
    retry: isOnline ? 3 : 0,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    enabled: isOnline,
  });

  return useOfflineAwareQuery(
    CACHE_KEYS.probabilities,
    CACHE_TTL.probabilities,
    query,
  );
}

/**
 * Hook to fetch sunspot data
 * Returns last 12 entries (monthly data), refetches every 6 hours
 */
export function useSunspots(): OfflineAwareQueryResult<SunspotData[]> {
  const isOnline = useIsOnline();

  const query = useQuery({
    queryKey: QUERY_KEYS.sunspots,
    queryFn: async () => {
      const data = await fetchSunspots();
      return data.slice(-12);
    },
    staleTime: 6 * HOUR,
    refetchInterval: isOnline ? 6 * HOUR : false,
    placeholderData: DEMO_SUNSPOTS,
    retry: isOnline ? 3 : 0,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    enabled: isOnline,
  });

  return useOfflineAwareQuery(CACHE_KEYS.sunspots, CACHE_TTL.sunspots, query);
}

/**
 * Hook to fetch solar wind magnetometer data
 * Returns last 60 entries (1 hour of data), refetches every 1 minute
 * Bz is critical for storm prediction - negative values indicate southward IMF
 */
export function useMagnetometer(): OfflineAwareQueryResult<MagnetometerData[]> {
  const isOnline = useIsOnline();

  const query = useQuery({
    queryKey: QUERY_KEYS.magnetometer,
    queryFn: async () => {
      const data = await fetchMagnetometer();
      return data.slice(-60);
    },
    staleTime: 1 * MINUTE,
    refetchInterval: isOnline ? 1 * MINUTE : false,
    placeholderData: DEMO_MAGNETOMETER,
    retry: isOnline ? 3 : 0,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    enabled: isOnline,
  });

  return useOfflineAwareQuery(
    CACHE_KEYS.magnetometer,
    CACHE_TTL.magnetometer,
    query,
  );
}

/**
 * Combined hook to fetch all solar data at once
 * Useful for dashboard components that need multiple data sources
 * Includes offline awareness
 */
export function useAllSolarData() {
  const kIndex = useKIndex();
  const solarFlux = useSolarFlux();
  const probabilities = useProbabilities();
  const sunspots = useSunspots();

  const isLoading =
    kIndex.isLoading ||
    solarFlux.isLoading ||
    probabilities.isLoading ||
    sunspots.isLoading;

  const isError =
    kIndex.isError ||
    solarFlux.isError ||
    probabilities.isError ||
    sunspots.isError;

  const isFetching =
    kIndex.isFetching ||
    solarFlux.isFetching ||
    probabilities.isFetching ||
    sunspots.isFetching;

  // Check if any data is from offline cache
  const isOffline =
    kIndex.isOffline ||
    solarFlux.isOffline ||
    probabilities.isOffline ||
    sunspots.isOffline;

  // Check if any data is stale
  const isStale =
    kIndex.isStale ||
    solarFlux.isStale ||
    probabilities.isStale ||
    sunspots.isStale;

  // Get the most recent last updated time
  const lastUpdated =
    [
      kIndex.lastUpdated,
      solarFlux.lastUpdated,
      probabilities.lastUpdated,
      sunspots.lastUpdated,
    ]
      .filter((d): d is Date => d !== null)
      .sort((a, b) => b.getTime() - a.getTime())[0] || null;

  return {
    kIndex,
    solarFlux,
    probabilities,
    sunspots,
    isLoading,
    isError,
    isFetching,
    isOffline,
    isStale,
    lastUpdated,
  };
}
