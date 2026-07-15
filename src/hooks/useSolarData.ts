/**
 * Backward-compatible solar hooks for dashboard, map, contest, and radio
 * consumers. All network/cache/status mechanics are delegated to the shared
 * versioned solar resource path.
 */

import { useCallback } from "react";
import { useSolarResource } from "./useSolarResource";
import {
  oldestKnownTimestamp,
  projectSolarResource,
} from "./projectSolarResource";
import type {
  FlareProbabilityForecast,
  KpPoint,
  MagnetometerPoint,
  SolarFluxPoint,
  SunspotPoint,
} from "@/lib/solar/dataTypes";
import { SOLAR_QUERY_KEYS } from "@/lib/solar/sourcePolicies";

export const QUERY_KEYS = {
  kIndex: SOLAR_QUERY_KEYS["noaa-k-index"],
  solarFlux: SOLAR_QUERY_KEYS["noaa-solar-flux"],
  probabilities: SOLAR_QUERY_KEYS["noaa-probabilities"],
  sunspots: SOLAR_QUERY_KEYS["noaa-sunspots"],
  magnetometer: SOLAR_QUERY_KEYS["noaa-magnetometer"],
} as const;

export function useKIndex(enabled = true) {
  return projectSolarResource(
    useSolarResource<KpPoint[]>("noaa-k-index", enabled),
    (points) =>
      points
        .filter((point) => point.kind !== "predicted")
        .slice(-24)
        .map((point) => ({
          time_tag: point.time_tag,
          kp_index: point.kp,
          estimated_kp: point.kp,
          kp: point.kp.toFixed(2),
        })),
  );
}

export function useSolarFlux(enabled = true) {
  return projectSolarResource(
    useSolarResource<SolarFluxPoint[]>("noaa-solar-flux", enabled),
    (points) =>
      points.slice(-30).map((point) => ({
        time_tag: point.time_tag,
        flux: point.flux,
        adjusted_flux: point.flux,
      })),
  );
}

export function useProbabilities(enabled = true) {
  return projectSolarResource(
    useSolarResource<FlareProbabilityForecast>("noaa-probabilities", enabled),
    (forecast) => ({
      time_tag: forecast.issue_time,
      c_prob: forecast.c_class,
      m_prob: forecast.m_class,
      x_prob: forecast.x_class,
      proton_prob: forecast.proton_10mev,
    }),
  );
}

export function useSunspots(enabled = true) {
  return projectSolarResource(
    useSolarResource<SunspotPoint[]>("noaa-sunspots", enabled),
    (points) => points.slice(-12),
  );
}

export function useMagnetometer(enabled = true) {
  return projectSolarResource(
    useSolarResource<MagnetometerPoint[]>("noaa-magnetometer", enabled),
    (points) => points,
  );
}

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
  const dataUpdatedAt = oldestKnownTimestamp([
    kIndex.dataUpdatedAt,
    solarFlux.dataUpdatedAt,
    probabilities.dataUpdatedAt,
    sunspots.dataUpdatedAt,
  ]);

  const refetchAll = useCallback(() => {
    void kIndex.refetch();
    void solarFlux.refetch();
    void probabilities.refetch();
    void sunspots.refetch();
  }, [kIndex, probabilities, solarFlux, sunspots]);

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
