/** Shared-contract compatibility hooks for expanded solar products. */

import { useCallback } from "react";
import { useSolarResource } from "./useSolarResource";
import {
  oldestKnownTimestamp,
  projectSolarResource,
} from "./projectSolarResource";
import type {
  CmeAnalysisPoint,
  DrapGrid,
  DstPoint,
  ProtonPoint,
  SolarFluxForecastProduct,
  XrayPoint,
} from "@/lib/solar/dataTypes";
import { SOLAR_QUERY_KEYS } from "@/lib/solar/sourcePolicies";

export const EXPANDED_QUERY_KEYS = {
  xrayFlux: SOLAR_QUERY_KEYS["noaa-xray"],
  protonFlux: SOLAR_QUERY_KEYS["noaa-protons"],
  dstIndex: SOLAR_QUERY_KEYS["noaa-dst"],
  drap: SOLAR_QUERY_KEYS["noaa-drap"],
  cmeAnalysis: SOLAR_QUERY_KEYS["nasa-cme"],
  fluxForecast: SOLAR_QUERY_KEYS["noaa-flux-forecast"],
} as const;

export function useXrayFlux(enabled = true) {
  return projectSolarResource(
    useSolarResource<XrayPoint[]>("noaa-xray", enabled),
    (points) => points.map((point) => ({ ...point, satellite: point.satellite ?? 0 })),
  );
}

export function useProtonFlux(enabled = true) {
  return projectSolarResource(
    useSolarResource<ProtonPoint[]>("noaa-protons", enabled),
    (points) => points.map((point) => ({ ...point, satellite: point.satellite ?? 0 })),
  );
}

export function useDstIndex(enabled = true) {
  return projectSolarResource(
    useSolarResource<DstPoint[]>("noaa-dst", enabled),
    (points) => points,
  );
}

export function useDRAPData(enabled = true) {
  return projectSolarResource(
    useSolarResource<DrapGrid>("noaa-drap", enabled),
    (grid) => grid,
  );
}

export function useCMEAnalysis(enabled = true) {
  return projectSolarResource(
    useSolarResource<CmeAnalysisPoint[]>("nasa-cme", enabled),
    (events) => events,
  );
}

export function useFluxForecast(enabled = true) {
  return projectSolarResource(
    useSolarResource<SolarFluxForecastProduct>("noaa-flux-forecast", enabled),
    (product) => ({
      raw: "",
      forecast: product.forecast.map((point) => ({
        date: point.date,
        predicted_flux: point.predicted_flux,
        predicted_a_index: point.predicted_planetary_a,
      })),
    }),
  );
}

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
  const dataUpdatedAt = oldestKnownTimestamp([
    xrayFlux.dataUpdatedAt,
    protonFlux.dataUpdatedAt,
    dstIndex.dataUpdatedAt,
    drap.dataUpdatedAt,
    cmeAnalysis.dataUpdatedAt,
    fluxForecast.dataUpdatedAt,
  ]);

  const refetchAll = useCallback(() => {
    void xrayFlux.refetch();
    void protonFlux.refetch();
    void dstIndex.refetch();
    void drap.refetch();
    void cmeAnalysis.refetch();
    void fluxForecast.refetch();
  }, [cmeAnalysis, drap, dstIndex, fluxForecast, protonFlux, xrayFlux]);

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
