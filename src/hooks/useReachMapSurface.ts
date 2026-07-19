import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMapStore } from "@/stores/mapStore";
import { useStationCastContext } from "./useStationCastContext";
import {
  propagationModelClient,
  propagationModelEnabled,
  propagationModelMode,
  type PropagationPrediction,
  type SurfacePredictionRequest,
} from "@/lib/propagation/modelClient";
import {
  resolveFutureCastHorizons,
  resolveNowCastCapabilityAccess,
} from "@/lib/propagation/capabilityAccess";
import type { FutureCastHorizonHours } from "@/lib/propagation/runtimeActivation";
import {
  buildReachMapRequest,
  chunkReachMapSurfaceRequest,
  predictionsToReachMapCells,
  summarizeReachMapPredictions,
} from "@/lib/propagation/reachMapSurface";
import type { OperationalSpaceWeather } from "@/lib/propagation/coreFeatureBuilder";

const REACH_MAP_LAYER_ID = "reach-map";
const FIVE_MINUTES_MS = 5 * 60 * 1000;

interface ReachMapQueryResult {
  predictions: PropagationPrediction[];
  failedCellCount: number;
}

export interface ReachMapSurfaceState {
  status: "idle" | "loading" | "ready" | "partial" | "unavailable" | "input-required";
  loading: boolean;
  error: string | null;
  modelVersion: string | null;
  profile: string | null;
  cellCount: number;
  expectedCellCount: number;
  failedCellCount: number;
  fallbackCellCount: number;
  staleInputCellCount: number;
  oodCellCount: number;
  meanConfidence: number | null;
  maxDataAgeSeconds: number | null;
  personalized: boolean;
  stationAvailable: boolean;
  available: boolean;
  locationName: string | null;
  chainName: string | null;
  validTime: string | null;
  /** FutureCast horizons the prediction service has activated. */
  futureCastHorizons: FutureCastHorizonHours[];
  /** The active FutureCast horizon, or null when viewing live NowCast. */
  horizonHours: FutureCastHorizonHours | null;
}

async function fetchReachMapSurface(
  requests: SurfacePredictionRequest[],
  signal: AbortSignal,
): Promise<ReachMapQueryResult> {
  const client = propagationModelClient;
  if (!client) throw new Error("Prediction service is not configured");
  const results = await Promise.allSettled(
    requests.map((request) => client.surface(request, signal)),
  );
  if (signal.aborted) throw new DOMException("ReachMap request aborted", "AbortError");
  const predictions = results.flatMap((result) =>
    result.status === "fulfilled" ? result.value.cells : [],
  );
  const failedCellCount = results.reduce(
    (total, result, index) =>
      total + (result.status === "rejected" ? requests[index].cells.length : 0),
    0,
  );
  if (predictions.length === 0) throw new Error("Prediction service is unavailable");
  return { predictions, failedCellCount };
}

export function useReachMapSurface(options: {
  enabled: boolean;
  renderOverlay?: boolean;
  personalized: boolean;
  band: string;
  validTime: Date;
  /**
   * Hours ahead of live time that validTime represents (0 = live NowCast).
   * Non-zero offsets require a matching activated FutureCast horizon.
   * Pass null for an arbitrary absolute time, which no model surface covers.
   */
  timeOffsetHours?: number | null;
  weather?: OperationalSpaceWeather;
}): ReachMapSurfaceState {
  const { location, chain, deriveEnvelope, hasConfiguredChain } = useStationCastContext();
  const timeBucket = Math.floor(options.validTime.getTime() / FIVE_MINUTES_MS) * FIVE_MINUTES_MS;
  const weatherKey = JSON.stringify(options.weather ?? {});
  const capabilities = useQuery({
    queryKey: ["propagation-v4", "capabilities"] as const,
    queryFn: ({ signal }: { signal: AbortSignal }) => {
      if (!propagationModelClient) throw new Error("Propagation model is disabled");
      return propagationModelClient.capabilities(signal);
    },
    enabled: propagationModelEnabled && options.enabled,
    staleTime: FIVE_MINUTES_MS,
    retry: 1,
  });
  const access = resolveNowCastCapabilityAccess(capabilities.data, propagationModelMode);
  const futureCastHorizons = resolveFutureCastHorizons(
    capabilities.data,
    propagationModelMode,
  );
  const timeOffsetHours = options.timeOffsetHours === undefined ? 0 : options.timeOffsetHours;
  const horizonHours =
    futureCastHorizons.find((horizon) => horizon === timeOffsetHours) ?? null;
  const timeAllowed = timeOffsetHours === 0 || horizonHours !== null;
  const stationAvailable = access.stationCast && hasConfiguredChain;
  const personalized = options.personalized && stationAvailable;
  const prepared = useMemo(() => {
    if (!options.enabled || !timeAllowed || !location || !access.coreNowCast) return null;
    const validTime = new Date(timeBucket);
    const issueTime = horizonHours !== null
      ? new Date(timeBucket - horizonHours * 3_600_000)
      : validTime;
    const weather = JSON.parse(weatherKey) as OperationalSpaceWeather;
    const referenceEnvelope = personalized
      ? deriveEnvelope(options.band, { mode: "WSPR" })
      : null;
    const declaredPowerWatts = Math.max(
      referenceEnvelope?.conductedPowerWatts ?? 5,
      0.001,
    );
    return buildReachMapRequest({
      origin: location,
      band: options.band,
      validTime,
      issueTime,
      declaredPowerWatts,
      weather,
      personalizationEnabled: personalized,
      deriveEnvelope: (band, targetBearingDeg) =>
        deriveEnvelope(band, { mode: "WSPR", targetBearingDeg }),
    });
  }, [
    access.coreNowCast,
    deriveEnvelope,
    horizonHours,
    location,
    options.band,
    options.enabled,
    personalized,
    timeAllowed,
    timeBucket,
    weatherKey,
  ]);
  const requests = useMemo(
    () => prepared ? chunkReachMapSurfaceRequest(prepared.request) : [],
    [prepared],
  );
  const stationFingerprint = prepared?.request.cells.find((cell) => cell.station)
    ?.station?.chainFingerprint ?? "core";
  const surface = useQuery({
    queryKey: [
      "propagation-v4",
      "reach-map",
      prepared?.request.origin_grid4,
      options.band,
      timeBucket,
      horizonHours,
      prepared?.request.declared_power_watts,
      stationFingerprint,
      weatherKey,
    ] as const,
    queryFn: ({ signal }: { signal: AbortSignal }) => fetchReachMapSurface(requests, signal),
    enabled: Boolean(options.enabled && prepared && requests.length > 0),
    staleTime: FIVE_MINUTES_MS,
    gcTime: 20 * 60 * 1000,
    retry: 1,
  });

  useEffect(() => {
    const remove = () => useMapStore.getState().removeOverlayLayer(REACH_MAP_LAYER_ID);
    if (!options.enabled || options.renderOverlay === false || !prepared || !surface.data) {
      remove();
      return remove;
    }
    useMapStore.getState().updateOverlayLayer(REACH_MAP_LAYER_ID, {
      type: "cells",
      cells: predictionsToReachMapCells(
        surface.data.predictions,
        prepared.grid,
        personalized,
      ),
    });
    return remove;
  }, [options.enabled, options.renderOverlay, personalized, prepared, surface.data]);

  const emptySummary = {
    modelVersion: null,
    profile: null,
    fallbackCellCount: 0,
    staleInputCellCount: 0,
    oodCellCount: 0,
    meanConfidence: null,
    maxDataAgeSeconds: null,
  };
  const summary = surface.data
    ? summarizeReachMapPredictions(surface.data.predictions)
    : emptySummary;
  const expectedCellCount = prepared?.grid.length ?? 0;
  const cellCount = surface.data?.predictions.length ?? 0;
  const failedCellCount = surface.data?.failedCellCount ?? 0;
  let status: ReachMapSurfaceState["status"] = "idle";
  let error: string | null = null;
  if (options.enabled && !propagationModelEnabled) {
    status = "unavailable";
    error = "Prediction service is not configured";
  } else if (options.enabled && !location) {
    status = "input-required";
    error = "Set an operating location to build ReachMap";
  } else if (options.enabled && capabilities.error) {
    status = "unavailable";
    error = capabilities.error instanceof Error
      ? capabilities.error.message
      : "Could not verify prediction capabilities";
  } else if (options.enabled && capabilities.isPending) {
    status = "loading";
  } else if (options.enabled && !access.coreNowCast) {
    status = "unavailable";
    error = "NowCast is not available from the prediction service";
  } else if (options.enabled && !timeAllowed) {
    status = "unavailable";
    error = futureCastHorizons.length === 0
      ? "Return to live time to use NowCast"
      : `Set time to live or a FutureCast horizon (${futureCastHorizons
          .map((horizon) => `+${horizon}h`)
          .join(", ")})`;
  } else if (options.enabled && surface.isPending) {
    status = "loading";
  } else if (options.enabled && surface.error) {
    status = "unavailable";
    error = surface.error instanceof Error ? surface.error.message : "ReachMap request failed";
  } else if (surface.data) {
    status = failedCellCount > 0 ? "partial" : "ready";
  }

  return {
    status,
    loading: status === "loading" || surface.isFetching,
    error,
    ...summary,
    cellCount,
    expectedCellCount,
    failedCellCount,
    personalized,
    stationAvailable,
    available: Boolean(propagationModelEnabled && location && access.coreNowCast),
    locationName: location?.name ?? null,
    chainName: chain?.name ?? null,
    validTime: prepared?.request.valid_time ?? null,
    futureCastHorizons,
    horizonHours,
  };
}
