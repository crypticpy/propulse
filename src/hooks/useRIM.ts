/**
 * useRIM — React hook that wires existing data hooks into the RIM engine.
 *
 * Aggregates solar, weather, and lightning data from existing hooks,
 * computes nearest lightning distance via haversine, and passes
 * everything to the pure computeRIM() scoring engine.
 */

import { useMemo } from "react";
import { computeRIM } from "@/lib/atmos/rim";
import type { RIMInput } from "@/lib/atmos/rimTypes";
import type { RIMResult } from "@/types/atmos";
import { useKIndex, useSolarFlux } from "@/hooks/useSolarData";
import {
  useXrayFlux,
  useProtonFlux,
  useDstIndex,
} from "@/hooks/useSolarExpanded";
import { useTEC } from "@/hooks/useTEC";
import { useLightning } from "@/hooks/useLightning";
import { useWeatherAlerts } from "@/hooks/useWeatherAlerts";
import { useWeatherRadar } from "@/hooks/useWeatherRadar";
import { useRiverGauges } from "@/hooks/useRiverGauges";
import type { RiverGauge } from "@/lib/api/gauges";
import { useUserStore } from "@/stores/userStore";
import { useRepeaters } from "@/hooks/useRepeaters";
import { analyzeNVIS } from "@/lib/utils/nvis";

// ---------------------------------------------------------------------------
// Haversine distance (km)
// ---------------------------------------------------------------------------

const EARTH_RADIUS_KM = 6371;

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// Flood status aggregation
// ---------------------------------------------------------------------------

const FLOOD_RANK: Record<RiverGauge["floodStatus"], number> = {
  normal: 0,
  action: 1,
  minor: 2,
  moderate: 3,
  major: 4,
};

const RANK_TO_PROXIMITY: RIMInput["floodProximity"][] = [
  "none",
  "action",
  "minor",
  "moderate",
  "major",
];

function worstFloodStatus(gauges: RiverGauge[]): RIMInput["floodProximity"] {
  let worst = 0;
  for (const g of gauges) {
    const rank = FLOOD_RANK[g.floodStatus] ?? 0;
    if (rank > worst) worst = rank;
  }
  return RANK_TO_PROXIMITY[worst];
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useRIM(): {
  rimResult: RIMResult | null;
  isLoading: boolean;
} {
  // Solar / space weather
  const kIndexQuery = useKIndex();
  const solarFluxQuery = useSolarFlux();
  const xrayFluxQuery = useXrayFlux();
  const protonFluxQuery = useProtonFlux();
  const dstIndexQuery = useDstIndex();

  // TEC (ionospheric)
  const { tecData, isLoading: tecLoading } = useTEC();

  // Terrestrial weather
  const { strikes, isLoading: lightningLoading } = useLightning();
  const { alerts, isLoading: alertsLoading } = useWeatherAlerts();
  const { manifest, isLoading: radarLoading } = useWeatherRadar();
  const { gauges } = useRiverGauges();
  const { repeaters } = useRepeaters();

  // Station location
  const station = useUserStore((s) => s.station);
  const stationLat = station?.lat ?? null;
  const stationLon = station?.lon ?? null;

  const isLoading =
    kIndexQuery.isLoading ||
    solarFluxQuery.isLoading ||
    xrayFluxQuery.isLoading ||
    protonFluxQuery.isLoading ||
    dstIndexQuery.isLoading ||
    tecLoading ||
    lightningLoading ||
    alertsLoading ||
    radarLoading;

  // Extract latest scalar values from array-based queries
  const latestKp = kIndexQuery.data?.length
    ? kIndexQuery.data[kIndexQuery.data.length - 1].kp_index
    : null;

  const latestSfi = solarFluxQuery.data?.length
    ? solarFluxQuery.data[solarFluxQuery.data.length - 1].flux
    : null;

  const latestXray = xrayFluxQuery.data?.length
    ? xrayFluxQuery.data[xrayFluxQuery.data.length - 1].flux
    : null;

  const latestProton = protonFluxQuery.data?.length
    ? protonFluxQuery.data[protonFluxQuery.data.length - 1].flux
    : null;

  const latestDst = dstIndexQuery.data?.length
    ? dstIndexQuery.data[dstIndexQuery.data.length - 1].dst
    : null;

  // Compute nearest lightning distance
  const nearestLightningKm = useMemo(() => {
    if (stationLat == null || stationLon == null || strikes.length === 0) {
      return null;
    }
    let minDist = Infinity;
    for (const strike of strikes) {
      const dist = haversineKm(stationLat, stationLon, strike.lat, strike.lon);
      if (dist < minDist) minDist = dist;
    }
    return Number.isFinite(minDist) ? minDist : null;
  }, [stationLat, stationLon, strikes]);

  // Filter alert severities to only the radio-relevant ones
  const activeAlertSeverities = useMemo(() => {
    const relevant: ("Extreme" | "Severe" | "Moderate" | "Minor")[] = [];
    for (const alert of alerts) {
      if (
        alert.severity === "Extreme" ||
        alert.severity === "Severe" ||
        alert.severity === "Moderate" ||
        alert.severity === "Minor"
      ) {
        relevant.push(alert.severity);
      }
    }
    return relevant;
  }, [alerts]);

  // Compute median TEC near the station (within ~10 degrees)
  const localTecValue = useMemo(() => {
    if (
      stationLat == null ||
      stationLon == null ||
      !tecData.available ||
      tecData.grid.length === 0
    ) {
      return null;
    }
    const nearby = tecData.grid.filter(
      (pt) =>
        Math.abs(pt.lat - stationLat) < 10 &&
        Math.abs(pt.lon - stationLon) < 10,
    );
    if (nearby.length === 0) return null;
    const sorted = nearby.map((p) => p.tec).sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }, [stationLat, stationLon, tecData]);

  // EmComm: NVIS viability
  const nvisViable = useMemo(() => {
    if (stationLat == null || stationLon == null || latestSfi == null)
      return false;
    const analysis = analyzeNVIS(stationLat, stationLon, latestSfi, new Date());
    return analysis.nvisViable;
  }, [stationLat, stationLon, latestSfi]);

  // EmComm: repeater metrics
  const repeaterCount = repeaters.length;
  const operationalRepeaterRatio = useMemo(() => {
    if (repeaters.length === 0) return null;
    const operational = repeaters.filter((r) => r.operational).length;
    return operational / repeaters.length;
  }, [repeaters]);

  // EmComm: alert severity level (0-4)
  const alertMaxSeverityLevel = useMemo(() => {
    const severityMap: Record<string, number> = {
      Minor: 1,
      Moderate: 2,
      Severe: 3,
      Extreme: 4,
    };
    let max = 0;
    for (const sev of activeAlertSeverities) {
      const level = severityMap[sev] ?? 0;
      if (level > max) max = level;
    }
    return max;
  }, [activeAlertSeverities]);

  const rimResult = useMemo(() => {
    // Don't compute if everything is still loading and we have zero data
    const hasAnyData =
      latestKp != null ||
      latestSfi != null ||
      latestXray != null ||
      latestProton != null ||
      latestDst != null ||
      localTecValue != null ||
      strikes.length > 0 ||
      alerts.length > 0;

    if (!hasAnyData && isLoading) return null;

    const input: RIMInput = {
      kpIndex: latestKp,
      solarFlux: latestSfi,
      xrayFlux: latestXray,
      protonFlux: latestProton,
      dstIndex: latestDst,
      tecValue: localTecValue,
      lightningStrikeCount: strikes.length,
      nearestLightningKm,
      activeAlertSeverities,
      hasActiveRadar: manifest != null,
      floodProximity: worstFloodStatus(gauges),
      stationLat,
      stationLon,
      repeaterCount,
      operationalRepeaterRatio,
      nvisViable,
      alertMaxSeverityLevel,
    };

    return computeRIM(input, "home");
  }, [
    latestKp,
    latestSfi,
    latestXray,
    latestProton,
    latestDst,
    localTecValue,
    strikes.length,
    nearestLightningKm,
    activeAlertSeverities,
    manifest,
    gauges,
    stationLat,
    stationLon,
    repeaterCount,
    operationalRepeaterRatio,
    nvisViable,
    alertMaxSeverityLevel,
    isLoading,
    alerts.length,
  ]);

  return { rimResult, isLoading };
}
