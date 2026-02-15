/**
 * TanStack Query hooks for fetching solar weather data
 * Provides React hooks with automatic caching, refetching, and error handling
 */

import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import {
  fetchKIndex,
  fetchSolarFlux,
  fetchProbabilities,
  fetchSunspots,
  fetchMagnetometer,
} from "../lib/api/noaa";
import { classifyError } from "@/lib/errors/classifyError";
import { useDataSourceStatus } from "@/stores/dataSourceStatusStore";

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

/**
 * Hook to fetch K-index data
 * Returns last 24 entries, refetches every 1 minute, stale after 5 minutes
 */
export function useKIndex() {
  return useQuery({
    queryKey: QUERY_KEYS.kIndex,
    queryFn: async () => {
      try {
        const data = await fetchKIndex();
        // Return last 24 entries
        const result = data.slice(-24);
        useDataSourceStatus.getState().reportSuccess("noaa-k-index");
        return result;
      } catch (err) {
        const classified = classifyError(err, "k-index");
        useDataSourceStatus.getState().reportError("noaa-k-index", classified);
        throw err;
      }
    },
    staleTime: 5 * MINUTE,
    refetchInterval: 1 * MINUTE,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

/**
 * Hook to fetch solar flux data
 * Returns last 30 entries, refetches every 4 hours, stale after 1 day
 */
export function useSolarFlux() {
  return useQuery({
    queryKey: QUERY_KEYS.solarFlux,
    queryFn: async () => {
      try {
        const data = await fetchSolarFlux();
        // Return last 30 entries
        const result = data.slice(-30);
        useDataSourceStatus.getState().reportSuccess("noaa-solar-flux");
        return result;
      } catch (err) {
        const classified = classifyError(err, "flux");
        useDataSourceStatus
          .getState()
          .reportError("noaa-solar-flux", classified);
        throw err;
      }
    },
    staleTime: 24 * HOUR,
    refetchInterval: 4 * HOUR,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

/**
 * Hook to fetch solar event probabilities
 * Returns current probabilities, refetches every 6 hours
 */
export function useProbabilities() {
  return useQuery({
    queryKey: QUERY_KEYS.probabilities,
    queryFn: async () => {
      try {
        const data = await fetchProbabilities();
        useDataSourceStatus.getState().reportSuccess("noaa-probabilities");
        return data;
      } catch (err) {
        const classified = classifyError(err, "probabilities");
        useDataSourceStatus
          .getState()
          .reportError("noaa-probabilities", classified);
        throw err;
      }
    },
    staleTime: 6 * HOUR,
    refetchInterval: 6 * HOUR,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

/**
 * Hook to fetch sunspot data
 * Returns last 12 entries (monthly data), refetches every 6 hours
 */
export function useSunspots() {
  return useQuery({
    queryKey: QUERY_KEYS.sunspots,
    queryFn: async () => {
      try {
        const data = await fetchSunspots();
        // Return last 12 entries (approximately 1 year of monthly data)
        const result = data.slice(-12);
        useDataSourceStatus.getState().reportSuccess("noaa-sunspots");
        return result;
      } catch (err) {
        const classified = classifyError(err, "sunspots");
        useDataSourceStatus.getState().reportError("noaa-sunspots", classified);
        throw err;
      }
    },
    staleTime: 6 * HOUR,
    refetchInterval: 6 * HOUR,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

/**
 * Hook to fetch solar wind magnetometer data
 * Returns last 60 entries (1 hour of data), refetches every 1 minute
 * Bz is critical for storm prediction - negative values indicate southward IMF
 */
export function useMagnetometer() {
  return useQuery({
    queryKey: QUERY_KEYS.magnetometer,
    queryFn: async () => {
      try {
        const data = await fetchMagnetometer();
        // Return last 60 entries (approximately 1 hour of 1-minute data)
        // Guard against upstream "header-only" or empty responses so we don't
        // replace last-good cached data with an empty array.
        const recent = data.slice(-60).map((point) => ({
          time_tag: point.time_tag,
          bz_gsm:
            typeof point.bz_gsm === "number" && Number.isFinite(point.bz_gsm)
              ? point.bz_gsm
              : null,
          by_gsm:
            typeof point.by_gsm === "number" && Number.isFinite(point.by_gsm)
              ? point.by_gsm
              : null,
          bt:
            typeof point.bt === "number" && Number.isFinite(point.bt)
              ? point.bt
              : null,
        }));

        const hasAnyBz = recent.some((p) => p.bz_gsm !== null);
        if (recent.length === 0 || !hasAnyBz) {
          throw new Error("No valid magnetometer data available");
        }

        useDataSourceStatus.getState().reportSuccess("noaa-magnetometer");
        return recent;
      } catch (err) {
        const classified = classifyError(err, "magnetometer");
        useDataSourceStatus
          .getState()
          .reportError("noaa-magnetometer", classified);
        throw err;
      }
    },
    staleTime: 1 * MINUTE,
    refetchInterval: 1 * MINUTE,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

/**
 * Combined hook to fetch all solar data at once
 * Useful for dashboard components that need multiple data sources
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

  const isRefetching =
    kIndex.isRefetching ||
    solarFlux.isRefetching ||
    probabilities.isRefetching ||
    sunspots.isRefetching;

  const dataUpdatedAt =
    Math.max(
      kIndex.dataUpdatedAt || 0,
      solarFlux.dataUpdatedAt || 0,
      probabilities.dataUpdatedAt || 0,
      sunspots.dataUpdatedAt || 0,
    ) || undefined;

  const refetchAll = useCallback(() => {
    kIndex.refetch();
    solarFlux.refetch();
    probabilities.refetch();
    sunspots.refetch();
  }, [kIndex, solarFlux, probabilities, sunspots]);

  return {
    kIndex,
    solarFlux,
    probabilities,
    sunspots,
    isLoading,
    isError,
    isFetching,
    isRefetching,
    dataUpdatedAt,
    refetchAll,
  };
}
