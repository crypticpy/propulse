/**
 * useRIM — React hook that wires existing data hooks into the RIM engine.
 *
 * Aggregates solar, weather, and lightning data from existing hooks,
 * computes nearest lightning distance via haversine, and passes
 * everything to the pure computeRIM() scoring engine. A 12 h rolling
 * composite series is retained per region (no new feed). An optional
 * focus re-scopes lightning, TEC and NVIS to a monitored region.
 */

import { useEffect, useMemo, useState } from "react";
import { computeRIM } from "@/lib/atmos/rim";
import type { RIMInput } from "@/lib/atmos/rimTypes";
import type { MonitoredRegion, RIMResult } from "@/types/atmos";
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
import type { WeatherAlert } from "@/lib/api/weather";
import { useUserStore } from "@/stores/userStore";
import { useAtmosStore } from "@/stores/atmosStore";
import { useRepeaters } from "@/hooks/useRepeaters";
import { analyzeNVIS, type NVISAnalysis } from "@/lib/utils/nvis";

const EARTH_RADIUS_KM = 6371;
const RIM_HISTORY_WINDOW_MS = 12 * 60 * 60 * 1000;
const RIM_HISTORY_MIN_INTERVAL_MS = 15 * 60 * 1000;
/**
 * Search radius (km) for terrestrial inputs (lightning, alerts, gauges)
 * scoped to a target with no configured radius of its own — home has none
 * (`RimFocus` carries no `radiusKm`); a monitored region's own `radiusKm`
 * (`MonitoredRegionManager`'s "Default monitoring radius" is also 150) is
 * used instead when the focus matches one.
 */
const DEFAULT_FOCUS_RADIUS_KM = 150;

type AlertSeverity = "Extreme" | "Severe" | "Moderate" | "Minor";

export interface RimFocus {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export interface RimHistoryPoint {
  timestamp: string;
  composite: number;
  hf: number | null;
  vhf: number | null;
  infra: number | null;
  emcomm: number | null;
}

export interface RimRegionScore {
  region: RimFocus;
  result: RIMResult;
}

const rimHistoryBuffers = new Map<string, RimHistoryPoint[]>();

export function resetRimHistoryForTests(): void {
  rimHistoryBuffers.clear();
}

export function seedRimHistoryForTests(
  regionId: string,
  points: RimHistoryPoint[],
): void {
  rimHistoryBuffers.set(regionId, [...points]);
}

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

function nearestLightningKm(
  lat: number | null,
  lon: number | null,
  strikes: Array<{ lat: number; lon: number }>,
): number | null {
  if (lat == null || lon == null || strikes.length === 0) return null;
  let minDist = Infinity;
  for (const strike of strikes) {
    const dist = haversineKm(lat, lon, strike.lat, strike.lon);
    if (dist < minDist) minDist = dist;
  }
  return Number.isFinite(minDist) ? minDist : null;
}

/** Count of strikes within `radiusKm` of a target — falls back to the raw global count when the target has no location to scope around. */
function strikesNear(
  lat: number | null,
  lon: number | null,
  radiusKm: number,
  strikes: Array<{ lat: number; lon: number }>,
): number {
  if (lat == null || lon == null) return strikes.length;
  let count = 0;
  for (const strike of strikes) {
    if (haversineKm(lat, lon, strike.lat, strike.lon) <= radiusKm) count++;
  }
  return count;
}

function severitiesFrom(alerts: readonly WeatherAlert[]): AlertSeverity[] {
  const relevant: AlertSeverity[] = [];
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
}

/** Alert severities within `radiusKm` of a target — falls back to every active severity, unfiltered, when the target has no location to scope around. */
function severitiesNear(
  alerts: readonly WeatherAlert[],
  lat: number | null,
  lon: number | null,
  radiusKm: number,
): AlertSeverity[] {
  if (lat == null || lon == null) return severitiesFrom(alerts);
  return severitiesFrom(
    alerts.filter((alert) => haversineKm(lat, lon, alert.lat, alert.lon) <= radiusKm),
  );
}

function maxSeverityLevel(severities: readonly AlertSeverity[]): number {
  const severityMap: Record<AlertSeverity, number> = {
    Minor: 1,
    Moderate: 2,
    Severe: 3,
    Extreme: 4,
  };
  let max = 0;
  for (const sev of severities) {
    const level = severityMap[sev];
    if (level > max) max = level;
  }
  return max;
}

/** River gauges within `radiusKm` of a target — falls back to the full fetched set (already a ~2° box around the Atmos map center, see `useRiverGauges`) when the target has no location to scope around. */
function gaugesNear(
  gauges: readonly RiverGauge[],
  lat: number | null,
  lon: number | null,
  radiusKm: number,
): RiverGauge[] {
  if (lat == null || lon == null) return [...gauges];
  return gauges.filter((gauge) => haversineKm(lat, lon, gauge.lat, gauge.lon) <= radiusKm);
}

function localTecValue(
  lat: number | null,
  lon: number | null,
  tecData: { available: boolean; grid: Array<{ lat: number; lon: number; tec: number }> },
): number | null {
  if (lat == null || lon == null || !tecData.available || tecData.grid.length === 0) {
    return null;
  }
  const nearby = tecData.grid.filter(
    (pt) => Math.abs(pt.lat - lat) < 10 && Math.abs(pt.lon - lon) < 10,
  );
  if (nearby.length === 0) return null;
  const sorted = nearby.map((p) => p.tec).sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function nvisAt(
  lat: number | null,
  lon: number | null,
  sfi: number | null,
): NVISAnalysis | null {
  if (lat == null || lon == null || sfi == null) return null;
  return analyzeNVIS(lat, lon, sfi, new Date());
}

function pointFromResult(result: RIMResult): RimHistoryPoint {
  return {
    timestamp: new Date(result.updatedAt).toISOString(),
    composite: result.composite,
    hf: result.hfBand.dataAvailable ? result.hfBand.value : null,
    vhf: result.vhfUhf.dataAvailable ? result.vhfUhf.value : null,
    infra: result.infraRisk.dataAvailable ? result.infraRisk.value : null,
    emcomm: result.emcommReadiness.dataAvailable
      ? result.emcommReadiness.value
      : null,
  };
}

function samePoint(a: RimHistoryPoint, b: RimHistoryPoint): boolean {
  return (
    a.composite === b.composite &&
    a.hf === b.hf &&
    a.vhf === b.vhf &&
    a.infra === b.infra &&
    a.emcomm === b.emcomm
  );
}

function recordHistory(regionId: string, result: RIMResult): RimHistoryPoint[] {
  const now = Date.now();
  const incoming = pointFromResult(result);
  const existing = rimHistoryBuffers.get(regionId) ?? [];
  const last = existing[existing.length - 1];
  if (last && Date.parse(last.timestamp) >= result.updatedAt) {
    return existing.filter(
      (p) => now - Date.parse(p.timestamp) <= RIM_HISTORY_WINDOW_MS,
    );
  }
  if (
    last &&
    samePoint(last, incoming) &&
    now - Date.parse(last.timestamp) < RIM_HISTORY_MIN_INTERVAL_MS
  ) {
    return existing.filter(
      (p) => now - Date.parse(p.timestamp) <= RIM_HISTORY_WINDOW_MS,
    );
  }
  const next = [...existing, incoming].filter(
    (p) => now - Date.parse(p.timestamp) <= RIM_HISTORY_WINDOW_MS,
  );
  rimHistoryBuffers.set(regionId, next);
  return next;
}

function homeFocus(
  station: { lat?: number; lon?: number; name?: string } | null,
): RimFocus | null {
  if (station?.lat == null || station.lon == null) return null;
  return {
    id: "home",
    name: station.name?.trim() ? station.name.toUpperCase() : "HOME",
    lat: station.lat,
    lon: station.lon,
  };
}

function regionFocus(region: MonitoredRegion): RimFocus {
  return {
    id: region.id,
    name: region.name,
    lat: region.lat,
    lon: region.lon,
  };
}

/**
 * The search radius terrestrial inputs should be scoped to for `focus`:
 * a monitored region's own configured `radiusKm`, or `DEFAULT_FOCUS_RADIUS_KM`
 * for "home" (no configurable radius) or a focus passed in from outside this
 * hook's own `targets` list (e.g. an ad hoc focus with no matching region).
 */
function radiusForFocus(
  focus: RimFocus,
  monitoredRegions: readonly MonitoredRegion[],
): number {
  if (focus.id === "home") return DEFAULT_FOCUS_RADIUS_KM;
  return monitoredRegions.find((region) => region.id === focus.id)?.radiusKm ?? DEFAULT_FOCUS_RADIUS_KM;
}

export function useRIM(focus?: RimFocus | null): {
  rimResult: RIMResult | null;
  isLoading: boolean;
  history: RimHistoryPoint[];
  regionScores: RimRegionScore[];
  nearestLightningKm: number | null;
  lightningStrikeCount: number;
  floodProximity: RIMInput["floodProximity"];
  floodActionCount: number;
  repeaterCount: number;
  operationalRepeaterRatio: number | null;
  nvis: NVISAnalysis | null;
} {
  const kIndexQuery = useKIndex();
  const solarFluxQuery = useSolarFlux();
  const xrayFluxQuery = useXrayFlux();
  const protonFluxQuery = useProtonFlux();
  const dstIndexQuery = useDstIndex();

  const { tecData, isLoading: tecLoading } = useTEC();
  const { strikes, isLoading: lightningLoading, error: lightningError } = useLightning();
  const { alerts, isLoading: alertsLoading, error: alertsError } = useWeatherAlerts();
  const { manifest, isLoading: radarLoading } = useWeatherRadar();
  const { gauges, isLoading: gaugesLoading, error: gaugesError } = useRiverGauges();
  const { repeaters, isLoading: repeatersLoading, error: repeatersError } = useRepeaters();
  const monitoredRegions = useAtmosStore((s) => s.monitoredRegions);

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

  const repeaterCount = repeaters.length;
  const operationalRepeaterRatio = useMemo(() => {
    if (repeaters.length === 0) return null;
    const operational = repeaters.filter((r) => r.operational).length;
    return operational / repeaters.length;
  }, [repeaters]);

  const targets = useMemo(() => {
    const list: RimFocus[] = [];
    const home = homeFocus(station);
    if (home) list.push(home);
    for (const region of monitoredRegions) {
      if (region.id === "home") continue;
      if (list.some((item) => item.id === region.id)) continue;
      list.push(regionFocus(region));
    }
    return list;
  }, [station, monitoredRegions]);

  const activeFocus = focus ?? targets[0] ?? null;

  const hasAnyData =
    latestKp != null ||
    latestSfi != null ||
    latestXray != null ||
    latestProton != null ||
    latestDst != null ||
    tecData.available ||
    strikes.length > 0 ||
    alerts.length > 0;

  // `radiusKm` scopes lightning/alerts/gauges to the target being scored —
  // without it every region inherited the global count/nationwide severities
  // and the map-center gauge query (#916 review).
  const buildInput = (
    lat: number | null,
    lon: number | null,
    radiusKm: number,
  ): RIMInput => {
    const nvis = nvisAt(lat, lon, latestSfi);
    const severities = severitiesNear(alerts, lat, lon, radiusKm);
    return {
      kpIndex: latestKp,
      solarFlux: latestSfi,
      xrayFlux: latestXray,
      protonFlux: latestProton,
      dstIndex: latestDst,
      tecValue: localTecValue(lat, lon, tecData),
      lightningStrikeCount: strikesNear(lat, lon, radiusKm, strikes),
      nearestLightningKm: nearestLightningKm(lat, lon, strikes),
      activeAlertSeverities: severities,
      hasActiveRadar: manifest != null,
      floodProximity: worstFloodStatus(gaugesNear(gauges, lat, lon, radiusKm)),
      stationLat: lat,
      stationLon: lon,
      repeaterCount,
      operationalRepeaterRatio,
      nvisViable: nvis?.nvisViable ?? false,
      alertMaxSeverityLevel: maxSeverityLevel(severities),
      // Explicit feed-success flags so a successful empty result (e.g. no
      // active alerts) scores as quiet rather than PARTIAL/unavailable, and
      // so EmComm availability reflects whether these feeds actually
      // answered rather than whether station coordinates exist (#916 review).
      alertsFeedOk: !alertsLoading && alertsError == null,
      lightningFeedOk: !lightningLoading && lightningError == null,
      floodFeedOk: !gaugesLoading && gaugesError == null,
      repeatersFeedOk: !repeatersLoading && repeatersError == null,
      sfiFeedOk: !solarFluxQuery.isLoading && solarFluxQuery.error == null,
    };
  };

  const regionScores = useMemo((): RimRegionScore[] => {
    if (!hasAnyData && isLoading) return [];
    return targets.map((region) => {
      const radiusKm = radiusForFocus(region, monitoredRegions);
      return {
        region,
        result: computeRIM(buildInput(region.lat, region.lon, radiusKm), region.id),
      };
    });
    // buildInput closes over the latest scalars; listing them keeps the
    // per-region scores in lock-step with the focused result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    targets,
    hasAnyData,
    isLoading,
    latestKp,
    latestSfi,
    latestXray,
    latestProton,
    latestDst,
    tecData,
    strikes,
    alerts,
    manifest,
    gauges,
    repeaterCount,
    operationalRepeaterRatio,
    monitoredRegions,
    alertsLoading,
    alertsError,
    lightningLoading,
    lightningError,
    gaugesLoading,
    gaugesError,
    repeatersLoading,
    repeatersError,
    solarFluxQuery.isLoading,
    solarFluxQuery.error,
  ]);

  const rimResult = useMemo(() => {
    if (!hasAnyData && isLoading) return null;
    const lat = activeFocus?.lat ?? stationLat;
    const lon = activeFocus?.lon ?? stationLon;
    const match = activeFocus
      ? regionScores.find((row) => row.region.id === activeFocus.id)
      : undefined;
    if (match) return match.result;
    const radiusKm = activeFocus
      ? radiusForFocus(activeFocus, monitoredRegions)
      : DEFAULT_FOCUS_RADIUS_KM;
    return computeRIM(buildInput(lat, lon, radiusKm), activeFocus?.id ?? "home");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeFocus,
    regionScores,
    hasAnyData,
    isLoading,
    stationLat,
    stationLon,
    monitoredRegions,
  ]);

  const [, setTick] = useState(0);
  useEffect(() => {
    if (!rimResult) return;
    recordHistory(rimResult.regionId, rimResult);
    setTick((n) => n + 1);
  }, [rimResult]);

  const history = rimResult
    ? (rimHistoryBuffers.get(rimResult.regionId) ?? [])
    : [];

  const activeLat = activeFocus?.lat ?? stationLat;
  const activeLon = activeFocus?.lon ?? stationLon;
  const activeRadiusKm = activeFocus
    ? radiusForFocus(activeFocus, monitoredRegions)
    : DEFAULT_FOCUS_RADIUS_KM;
  const activeGauges = gaugesNear(gauges, activeLat, activeLon, activeRadiusKm);

  const nvis = nvisAt(activeLat, activeLon, latestSfi);

  return {
    rimResult,
    isLoading,
    history,
    regionScores,
    nearestLightningKm: nearestLightningKm(activeLat, activeLon, strikes),
    lightningStrikeCount: strikesNear(activeLat, activeLon, activeRadiusKm, strikes),
    floodProximity: worstFloodStatus(activeGauges),
    floodActionCount: activeGauges.filter((g) => FLOOD_RANK[g.floodStatus] >= 1).length,
    repeaterCount,
    operationalRepeaterRatio,
    nvis,
  };
}
