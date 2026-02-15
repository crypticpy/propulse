/**
 * TanStack Query hooks for expanded solar weather data
 * Provides React hooks for X-ray flux, proton flux, Dst index, DRAP,
 * CME analysis, and solar flux forecast endpoints.
 */

import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import {
  fetchXrayFlux,
  fetchProtonFlux,
  fetchDstIndex,
  fetchDRAPData,
  fetchCMEAnalysis,
  fetchFluxForecast,
} from "../lib/api/noaa";
import type {
  XrayFluxEntry,
  ProtonFluxEntry,
  DstEntry,
  DRAPData,
  CMEAnalysis,
  SolarFluxForecast,
} from "@/types/alerts";
import { classifyError } from "@/lib/errors/classifyError";
import { useDataSourceStatus } from "@/stores/dataSourceStatusStore";

// Query key constants for cache management
export const EXPANDED_QUERY_KEYS = {
  xrayFlux: ["solar", "xray"] as const,
  protonFlux: ["solar", "protons"] as const,
  dstIndex: ["solar", "dst"] as const,
  drap: ["solar", "drap"] as const,
  cmeAnalysis: ["solar", "cme"] as const,
  fluxForecast: ["solar", "flux-forecast"] as const,
} as const;

// Time constants in milliseconds
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/**
 * Hook to fetch GOES X-ray flux data
 * Refetches every 5 minutes, stale after 2 minutes
 * Used for radio blackout detection (NOAA R-scale)
 */
export function useXrayFlux() {
  return useQuery<XrayFluxEntry[]>({
    queryKey: EXPANDED_QUERY_KEYS.xrayFlux,
    queryFn: async () => {
      try {
        const data = await fetchXrayFlux();
        useDataSourceStatus.getState().reportSuccess("noaa-xray");
        return data;
      } catch (err) {
        const classified = classifyError(err, "xray");
        useDataSourceStatus.getState().reportError("noaa-xray", classified);
        throw err;
      }
    },
    staleTime: 2 * MINUTE,
    refetchInterval: 5 * MINUTE,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

/**
 * Hook to fetch GOES proton flux data (>= 10 MeV)
 * Refetches every 5 minutes, stale after 2 minutes
 * Used for solar proton event detection (NOAA S-scale)
 */
export function useProtonFlux() {
  return useQuery<ProtonFluxEntry[]>({
    queryKey: EXPANDED_QUERY_KEYS.protonFlux,
    queryFn: async () => {
      try {
        const data = await fetchProtonFlux();
        useDataSourceStatus.getState().reportSuccess("noaa-protons");
        return data;
      } catch (err) {
        const classified = classifyError(err, "protons");
        useDataSourceStatus.getState().reportError("noaa-protons", classified);
        throw err;
      }
    },
    staleTime: 2 * MINUTE,
    refetchInterval: 5 * MINUTE,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

/**
 * Hook to fetch Dst (Disturbance Storm Time) index data
 * Refetches every 30 minutes, stale after 10 minutes
 * Dst < -50 nT indicates moderate geomagnetic storm
 */
export function useDstIndex() {
  return useQuery<DstEntry[]>({
    queryKey: EXPANDED_QUERY_KEYS.dstIndex,
    queryFn: async () => {
      try {
        const data = await fetchDstIndex();
        useDataSourceStatus.getState().reportSuccess("noaa-dst");
        return data;
      } catch (err) {
        const classified = classifyError(err, "dst");
        useDataSourceStatus.getState().reportError("noaa-dst", classified);
        throw err;
      }
    },
    staleTime: 10 * MINUTE,
    refetchInterval: 30 * MINUTE,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

/**
 * Hook to fetch D-Region Absorption Prediction (DRAP) data
 * Refetches every 15 minutes, stale after 5 minutes
 * Shows global HF absorption levels
 */
export function useDRAPData() {
  return useQuery<DRAPData>({
    queryKey: EXPANDED_QUERY_KEYS.drap,
    queryFn: async () => {
      try {
        const data = await fetchDRAPData();
        useDataSourceStatus.getState().reportSuccess("noaa-drap");
        return data;
      } catch (err) {
        const classified = classifyError(err, "drap");
        useDataSourceStatus.getState().reportError("noaa-drap", classified);
        throw err;
      }
    },
    staleTime: 5 * MINUTE,
    refetchInterval: 15 * MINUTE,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

/**
 * Hook to fetch CME (Coronal Mass Ejection) analysis data
 * Refetches every 1 hour, stale after 30 minutes
 * Shows Earth-directed CME events from NASA DONKI
 */
export function useCMEAnalysis() {
  return useQuery<CMEAnalysis[]>({
    queryKey: EXPANDED_QUERY_KEYS.cmeAnalysis,
    queryFn: async () => {
      try {
        const data = await fetchCMEAnalysis();
        useDataSourceStatus.getState().reportSuccess("nasa-cme");
        return data;
      } catch (err) {
        const classified = classifyError(err, "cme");
        useDataSourceStatus.getState().reportError("nasa-cme", classified);
        throw err;
      }
    },
    staleTime: 30 * MINUTE,
    refetchInterval: 1 * HOUR,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

/**
 * Hook to fetch solar flux forecast (3-day NOAA prediction)
 * Refetches every 4 hours, stale after 1 hour
 * Returns raw forecast text and parsed SFI predictions
 */
export function useFluxForecast() {
  return useQuery<{ raw: string; forecast: SolarFluxForecast[] }>({
    queryKey: EXPANDED_QUERY_KEYS.fluxForecast,
    queryFn: async () => {
      try {
        const data = await fetchFluxForecast();
        useDataSourceStatus.getState().reportSuccess("noaa-flux-forecast");
        return data;
      } catch (err) {
        const classified = classifyError(err, "flux-forecast");
        useDataSourceStatus
          .getState()
          .reportError("noaa-flux-forecast", classified);
        throw err;
      }
    },
    staleTime: 1 * HOUR,
    refetchInterval: 4 * HOUR,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

/**
 * Combined hook to fetch all expanded solar data at once
 * Useful for components that need multiple expanded data sources
 */
export function useSolarExpanded() {
  const xrayFlux = useXrayFlux();
  const protonFlux = useProtonFlux();
  const dstIndex = useDstIndex();
  const drap = useDRAPData();
  const cmeAnalysis = useCMEAnalysis();
  const fluxForecast = useFluxForecast();

  const isLoading =
    xrayFlux.isLoading ||
    protonFlux.isLoading ||
    dstIndex.isLoading ||
    drap.isLoading ||
    cmeAnalysis.isLoading ||
    fluxForecast.isLoading;

  const isError =
    xrayFlux.isError ||
    protonFlux.isError ||
    dstIndex.isError ||
    drap.isError ||
    cmeAnalysis.isError ||
    fluxForecast.isError;

  const isFetching =
    xrayFlux.isFetching ||
    protonFlux.isFetching ||
    dstIndex.isFetching ||
    drap.isFetching ||
    cmeAnalysis.isFetching ||
    fluxForecast.isFetching;

  const isRefetching =
    xrayFlux.isRefetching ||
    protonFlux.isRefetching ||
    dstIndex.isRefetching ||
    drap.isRefetching ||
    cmeAnalysis.isRefetching ||
    fluxForecast.isRefetching;

  const dataUpdatedAt =
    Math.max(
      xrayFlux.dataUpdatedAt || 0,
      protonFlux.dataUpdatedAt || 0,
      dstIndex.dataUpdatedAt || 0,
      drap.dataUpdatedAt || 0,
      cmeAnalysis.dataUpdatedAt || 0,
      fluxForecast.dataUpdatedAt || 0,
    ) || undefined;

  const refetchAll = useCallback(() => {
    xrayFlux.refetch();
    protonFlux.refetch();
    dstIndex.refetch();
    drap.refetch();
    cmeAnalysis.refetch();
    fluxForecast.refetch();
  }, [xrayFlux, protonFlux, dstIndex, drap, cmeAnalysis, fluxForecast]);

  return {
    xrayFlux,
    protonFlux,
    dstIndex,
    drap,
    cmeAnalysis,
    fluxForecast,
    isLoading,
    isError,
    isFetching,
    isRefetching,
    dataUpdatedAt,
    refetchAll,
  };
}
