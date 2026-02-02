/**
 * TanStack Query hooks for fetching solar weather data
 * Provides React hooks with automatic caching, refetching, and error handling
 */

import { useQuery } from "@tanstack/react-query";
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

/**
 * Hook to fetch K-index data
 * Returns last 24 entries, refetches every 1 minute, stale after 5 minutes
 */
export function useKIndex() {
  return useQuery({
    queryKey: QUERY_KEYS.kIndex,
    queryFn: async () => {
      const data = await fetchKIndex();
      // Return last 24 entries
      return data.slice(-24);
    },
    staleTime: 5 * MINUTE,
    refetchInterval: 1 * MINUTE,
    placeholderData: DEMO_K_INDEX,
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
      const data = await fetchSolarFlux();
      // Return last 30 entries
      return data.slice(-30);
    },
    staleTime: 24 * HOUR,
    refetchInterval: 4 * HOUR,
    placeholderData: DEMO_SOLAR_FLUX,
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
    queryFn: fetchProbabilities,
    staleTime: 6 * HOUR,
    refetchInterval: 6 * HOUR,
    placeholderData: DEMO_PROBABILITIES,
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
      const data = await fetchSunspots();
      // Return last 12 entries (approximately 1 year of monthly data)
      return data.slice(-12);
    },
    staleTime: 6 * HOUR,
    refetchInterval: 6 * HOUR,
    placeholderData: DEMO_SUNSPOTS,
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

      return recent;
    },
    staleTime: 1 * MINUTE,
    refetchInterval: 1 * MINUTE,
    placeholderData: DEMO_MAGNETOMETER,
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

  return {
    kIndex,
    solarFlux,
    probabilities,
    sunspots,
    isLoading,
    isError,
    isFetching,
  };
}
