import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { useSolarResource } from "./useSolarResource";
import { fetchSolarResource, SolarClientError } from "@/lib/api/solarClient";
import type { SolarResource, SolarSourceId, SolarWidgetState } from "@/lib/solar/contracts";
import type {
  CmeAnalysisPoint,
  DrapGrid,
  DstPoint,
  FlareProbabilityForecast,
  KpPoint,
  LatestXrayFlare,
  MagnetometerPoint,
  NoaaScalesProduct,
  OfficialSolarAlert,
  ProtonPoint,
  SolarFluxForecastProduct,
  SolarFluxPoint,
  SolarWindMagPoint,
  SolarWindPlasmaPoint,
  SunspotPoint,
  XrayPoint,
} from "@/lib/solar/dataTypes";
import {
  currentKp,
  latestByTime,
  predictedKp,
  protonScale,
  widgetState,
  xrayClass,
} from "@/lib/solar/selectors";
import {
  getSolarSourcePolicy,
  SOLAR_QUERY_KEYS,
  type SolarSourceGroup,
} from "@/lib/solar/sourcePolicies";
import { buildSolarBriefing, usableEvidence } from "@/lib/solar/briefing";
import { buildSolarTrends } from "@/lib/solar/trends";
import { sourceIdsForVisibleGroups } from "@/lib/solar/widgetRegistry";

const DEFAULT_GROUPS: ReadonlySet<SolarSourceGroup> = new Set([
  "now",
  "impacts",
  "forecast",
  "details",
]);

export interface SolarResourceView<T> {
  sourceId: SolarSourceId;
  query: UseQueryResult<SolarResource<T>>;
  resource?: SolarResource<T>;
  data?: T;
  state: SolarWidgetState;
  refresh: () => Promise<unknown>;
}

function view<T>(
  sourceId: SolarSourceId,
  query: UseQueryResult<SolarResource<T>>,
  now: number,
): SolarResourceView<T> {
  if (!query) throw new Error(`Solar query hook returned no result for ${sourceId}`);
  const resource = query.data;
  const data = resource?.envelope.data;
  const isEmpty = Array.isArray(data) && data.length === 0;
  const projected = usableEvidence({
    sourceId, resource, data,
    state: query.isError && resource ? "stale" : widgetState({
      resource,
      pending: query.isPending,
      fetching: query.isFetching,
      error: query.isError,
      unavailable:
        query.error instanceof SolarClientError &&
        query.error.body.error.code === "HARD_EXPIRED",
      empty: isEmpty,
    }),
  }, now);
  return {
    ...projected, query,
    refresh: () => query.refetch(),
  };
}

export interface UseSolarModelOptions {
  enabledGroups?: ReadonlySet<SolarSourceGroup>;
}

export function useSolarModel(options: UseSolarModelOptions = {}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const enabledGroups = options.enabledGroups ?? DEFAULT_GROUPS;
  const enabled = (sourceId: SolarSourceId) =>
    enabledGroups.has(getSolarSourcePolicy(sourceId).group);

  const kpQuery = useSolarResource<KpPoint[]>("noaa-k-index", enabled("noaa-k-index"));
  const fluxQuery = useSolarResource<SolarFluxPoint[]>("noaa-solar-flux", enabled("noaa-solar-flux"));
  const magnetometerQuery = useSolarResource<MagnetometerPoint[]>("noaa-magnetometer", enabled("noaa-magnetometer"));
  const probabilitiesQuery = useSolarResource<FlareProbabilityForecast>("noaa-probabilities", enabled("noaa-probabilities"));
  const sunspotsQuery = useSolarResource<SunspotPoint[]>("noaa-sunspots", enabled("noaa-sunspots"));
  const xrayQuery = useSolarResource<XrayPoint[]>("noaa-xray", enabled("noaa-xray"));
  const protonsQuery = useSolarResource<ProtonPoint[]>("noaa-protons", enabled("noaa-protons"));
  const dstQuery = useSolarResource<DstPoint[]>("noaa-dst", enabled("noaa-dst"));
  const drapQuery = useSolarResource<DrapGrid>("noaa-drap", enabled("noaa-drap"));
  const forecastQuery = useSolarResource<SolarFluxForecastProduct>("noaa-flux-forecast", enabled("noaa-flux-forecast"));
  const cmeQuery = useSolarResource<CmeAnalysisPoint[]>("nasa-cme", enabled("nasa-cme"));
  const scalesQuery = useSolarResource<NoaaScalesProduct>("swpc-scales", enabled("swpc-scales"));
  const alertsQuery = useSolarResource<OfficialSolarAlert[]>("swpc-alerts", enabled("swpc-alerts"));
  const latestFlareQuery = useSolarResource<LatestXrayFlare>("swpc-xray-latest", enabled("swpc-xray-latest"));
  const windMagQuery = useSolarResource<SolarWindMagPoint[]>("swpc-solar-wind-mag", enabled("swpc-solar-wind-mag"));
  const windPlasmaQuery = useSolarResource<SolarWindPlasmaPoint[]>("swpc-solar-wind-plasma", enabled("swpc-solar-wind-plasma"));

  const resources = useMemo(
    () => ({
      kp: view("noaa-k-index", kpQuery, now),
      flux: view("noaa-solar-flux", fluxQuery, now),
      magnetometer: view("noaa-magnetometer", magnetometerQuery, now),
      probabilities: view("noaa-probabilities", probabilitiesQuery, now),
      sunspots: view("noaa-sunspots", sunspotsQuery, now),
      xray: view("noaa-xray", xrayQuery, now),
      protons: view("noaa-protons", protonsQuery, now),
      dst: view("noaa-dst", dstQuery, now),
      drap: view("noaa-drap", drapQuery, now),
      forecast: view("noaa-flux-forecast", forecastQuery, now),
      cme: view("nasa-cme", cmeQuery, now),
      scales: view("swpc-scales", scalesQuery, now),
      alerts: view("swpc-alerts", alertsQuery, now),
      latestFlare: view("swpc-xray-latest", latestFlareQuery, now),
      windMag: view("swpc-solar-wind-mag", windMagQuery, now),
      windPlasma: view("swpc-solar-wind-plasma", windPlasmaQuery, now),
    }),
    [
      now,
      alertsQuery,
      cmeQuery,
      drapQuery,
      dstQuery,
      fluxQuery,
      forecastQuery,
      kpQuery,
      latestFlareQuery,
      magnetometerQuery,
      probabilitiesQuery,
      protonsQuery,
      scalesQuery,
      sunspotsQuery,
      windMagQuery,
      windPlasmaQuery,
      xrayQuery,
    ],
  );

  const current = useMemo(() => {
    const kp = currentKp(resources.kp.data);
    const flux = latestByTime(resources.flux.data, (point) => point.time_tag);
    const mag = latestByTime(
      resources.magnetometer.data,
      (point) => point.time_tag,
      (point) => point.bz_gsm !== null,
    );
    const xray = latestByTime(resources.xray.data, (point) => point.time_tag);
    const proton = latestByTime(resources.protons.data, (point) => point.time_tag);
    const dst = latestByTime(resources.dst.data, (point) => point.time_tag);
    const sunspot = latestByTime(resources.sunspots.data, (point) => point.time_tag);
    const plasma = latestByTime(resources.windPlasma.data, (point) => point.time_tag);
    return {
      kp,
      flux,
      mag,
      xray,
      xrayClass: xrayClass(xray?.flux ?? null),
      proton,
      protonScale: protonScale(proton?.flux ?? null),
      dst,
      sunspot,
      plasma,
      predictedKp: predictedKp(resources.kp.data),

    };
  }, [resources]);

  const briefing = useMemo(() => buildSolarBriefing(resources, now), [resources, now]);
  const trends = useMemo(() => buildSolarTrends(resources, now), [resources, now]);

  const visibleSourceIds = useMemo(
    () => sourceIdsForVisibleGroups(enabledGroups),
    [enabledGroups],
  );
  const allResourceViews = Object.values(resources) as unknown as Array<SolarResourceView<unknown>>;
  const criticalViews = allResourceViews.filter(
    (resource) =>
      visibleSourceIds.includes(resource.sourceId) &&
      getSolarSourcePolicy(resource.sourceId).criticality === "critical",
  );
  const unavailableCritical = criticalViews.filter((resource) => ["error", "unavailable"].includes(resource.state));
  const degradedCritical = criticalViews.filter((resource) => ["stale", "partial"].includes(resource.state));
  const pageHealth = unavailableCritical.length > 0
    ? "unavailable"
    : degradedCritical.length > 0
      ? "degraded"
      : criticalViews.some((resource) => resource.state === "loading")
        ? "loading"
        : "healthy";

  const queryClient = useQueryClient();
  const [refreshResult, setRefreshResult] = useState<{
    running: boolean;
    succeeded: SolarSourceId[];
    failed: SolarSourceId[];
  }>({ running: false, succeeded: [], failed: [] });

  const refreshVisible = useCallback(async () => {
    setRefreshResult({ running: true, succeeded: [], failed: [] });
    const settled = await Promise.allSettled(
      visibleSourceIds.map(async (sourceId) => {
        const resource = await fetchSolarResource(sourceId, { force: true });
        queryClient.setQueryData(SOLAR_QUERY_KEYS[sourceId], resource);
        return { sourceId, failed: Boolean(resource.lastError) };
      }),
    );
    const succeeded: SolarSourceId[] = [];
    const failed: SolarSourceId[] = [];
    settled.forEach((result, index) => {
      const sourceId = visibleSourceIds[index];
      if (result.status === "fulfilled" && !result.value.failed) succeeded.push(sourceId);
      else failed.push(sourceId);
    });
    setRefreshResult({ running: false, succeeded, failed });
    return { succeeded, failed };
  }, [queryClient, visibleSourceIds]);

  return {
    resources,
    current,
    briefing,
    trends,
    pageHealth,
    unavailableCritical,
    degradedCritical,
    visibleSourceIds,
    refreshVisible,
    refreshResult,
  };
}
