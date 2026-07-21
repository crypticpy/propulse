import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  buildCorePathFeatures,
  HF_MODEL_BANDS,
  type OperationalSpaceWeather,
} from "@/lib/propagation/coreFeatureBuilder";
import {
  propagationModelClient,
  propagationModelEnabled,
  propagationModelMode,
  type PathPredictionRequest,
  type PropagationPrediction,
  type ResearchSubjectBinding,
} from "@/lib/propagation/modelClient";
import { resolveNowCastCapabilityAccess } from "@/lib/propagation/capabilityAccess";
import type {
  StationCalculationOptions,
  StationFeatureEnvelope,
} from "@/lib/station/stationChainEngine";

const FIVE_MINUTES_MS = 5 * 60 * 1000;

export interface NowCastBandInput {
  origin: { grid: string; lat: number; lon: number } | null;
  target: { grid: string; lat: number; lon: number } | null;
  weather?: OperationalSpaceWeather;
  weatherUpdatedAt?: number;
  /**
   * Operator's selected mode. Core probability stays the WSPR single-decode
   * estimand; the station envelope carries this mode's SNR threshold so the
   * personalized probability answers "can I work them in this mode?".
   */
  mode?: string;
  deriveEnvelope: (
    band: string,
    options?: StationCalculationOptions,
  ) => StationFeatureEnvelope | null;
  researchSubjectBinding?: ResearchSubjectBinding | null;
}

function bearingDegrees(values: Record<string, number | null>): number {
  const degrees = Math.atan2(
    Number(values.bearing_sin ?? 0),
    Number(values.bearing_cos ?? 1),
  ) * 180 / Math.PI;
  return (degrees + 360) % 360;
}

export function buildNowCastRequests(
  input: NowCastBandInput,
  issuedAt: Date,
  personalizationEnabled = true,
): PathPredictionRequest[] {
  if (!input.origin || !input.target) return [];
  const originGrid4 = input.origin.grid.toUpperCase().slice(0, 4);
  const targetGrid4 = input.target.grid.toUpperCase().slice(0, 4);
  if (!/^[A-R]{2}[0-9]{2}$/.test(originGrid4) || !/^[A-R]{2}[0-9]{2}$/.test(targetGrid4)) {
    return [];
  }
  const weatherAge = input.weatherUpdatedAt
    ? Math.max(0, Math.round((issuedAt.getTime() - input.weatherUpdatedAt) / 1000))
    : 86_400;
  const mode = (input.mode ?? "WSPR").trim().toUpperCase() || "WSPR";
  return HF_MODEL_BANDS.map((band) => {
    const preliminary = buildCorePathFeatures({
      origin: input.origin!,
      target: input.target!,
      band,
      declaredPowerWatts: 5,
      validTime: issuedAt,
      weather: input.weather,
    });
    const envelope = personalizationEnabled
      ? input.deriveEnvelope(band, {
          mode,
          targetBearingDeg: bearingDegrees(preliminary),
        })
      : null;
    const declaredPower = Math.max(envelope?.conductedPowerWatts ?? 5, 0.001);
    const values = buildCorePathFeatures({
      origin: input.origin!,
      target: input.target!,
      band,
      declaredPowerWatts: declaredPower,
      validTime: issuedAt,
      weather: input.weather,
    });
    return {
      origin_grid4: originGrid4,
      issue_time: issuedAt.toISOString(),
      valid_time: issuedAt.toISOString(),
      band,
      mode,
      declared_power_watts: declaredPower,
      features: { target_grid4: targetGrid4, values },
      ...(envelope ? { station: envelope } : {}),
      data_freshness_seconds: {
        space_weather: weatherAge,
      },
      ...(input.researchSubjectBinding
        ? { research_subject_binding: input.researchSubjectBinding }
        : {}),
    };
  });
}

export interface NowCastBandPredictions {
  enabled: boolean;
  visible: boolean;
  available: boolean;
  personalized: boolean;
  pending: boolean;
  capabilityError: Error | null;
  predictions: Map<string, PropagationPrediction>;
  stationEnvelopes: Map<string, StationFeatureEnvelope>;
  errors: Map<string, Error>;
  requestedCount: number;
  failedCount: number;
  partial: boolean;
  fallbackBands: string[];
  staleInputBands: string[];
  nowcastBands: string[];
}

export function summarizeNowCastResults(
  requestedBands: string[],
  predictions: Map<string, PropagationPrediction>,
  errors: Map<string, Error>,
): Pick<
  NowCastBandPredictions,
  | "requestedCount"
  | "failedCount"
  | "partial"
  | "fallbackBands"
  | "staleInputBands"
  | "nowcastBands"
> {
  const fallbackBands = requestedBands.filter(
    (band) => predictions.get(band)?.profile === "physics",
  );
  const staleInputBands = requestedBands.filter((band) => {
    const prediction = predictions.get(band);
    return Boolean(
      prediction && (
        prediction.ood_flags.includes("recent_network_stale_physics_fallback") ||
        prediction.assumptions.includes("path_history_stale_or_unavailable_physics_fallback")
      ),
    );
  });
  const nowcastBands = requestedBands.filter(
    (band) => predictions.get(band)?.profile === "nowcast",
  );
  return {
    requestedCount: requestedBands.length,
    failedCount: errors.size,
    partial: predictions.size > 0 && errors.size > 0,
    fallbackBands,
    staleInputBands,
    nowcastBands,
  };
}

export function useNowCastBandPredictions(
  input: NowCastBandInput,
): NowCastBandPredictions {
  const issueBucket = Math.floor(Date.now() / FIVE_MINUTES_MS) * FIVE_MINUTES_MS;
  const capabilities = useQuery({
    queryKey: ["propagation-v4", "capabilities"] as const,
    queryFn: ({ signal }: { signal: AbortSignal }) => {
      if (!propagationModelClient) throw new Error("Propagation model is disabled");
      return propagationModelClient.capabilities(signal);
    },
    enabled: propagationModelEnabled,
    staleTime: FIVE_MINUTES_MS,
    retry: 1,
  });
  const access = resolveNowCastCapabilityAccess(
    capabilities.data,
    propagationModelMode,
  );
  const requests = useMemo(
    () => access.coreNowCast
      ? buildNowCastRequests(
          input,
          new Date(issueBucket),
          access.stationCast,
        )
      : [],
    [input, issueBucket, access.coreNowCast, access.stationCast],
  );
  const queries = useQueries({
    queries: requests.map((request) => ({
      queryKey: [
        "propagation-v4",
        "path",
        request.origin_grid4,
        request.features.target_grid4,
        request.band,
        request.issue_time,
        request.declared_power_watts,
        request.station?.chainFingerprint ?? "core",
        request.research_subject_binding?.hmac_sha256 ?? "unbound",
        input.weather,
      ] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => {
        if (!propagationModelClient) throw new Error("Propagation model is disabled");
        return propagationModelClient.path(request, signal);
      },
      enabled: propagationModelEnabled && requests.length > 0,
      staleTime: FIVE_MINUTES_MS,
      retry: 1,
    })),
  });
  const predictions = new Map<string, PropagationPrediction>();
  const stationEnvelopes = new Map<string, StationFeatureEnvelope>();
  const errors = new Map<string, Error>();
  queries.forEach((query, index) => {
    const band = requests[index]?.band;
    if (!band) return;
    if (query.data) predictions.set(band, query.data);
    if (query.error instanceof Error) errors.set(band, query.error);
  });
  requests.forEach((request) => {
    if (request.station) stationEnvelopes.set(request.band, request.station);
  });
  const summary = summarizeNowCastResults(
    requests.map((request) => request.band),
    predictions,
    errors,
  );
  return {
    enabled: propagationModelEnabled,
    visible: propagationModelEnabled,
    available: access.coreNowCast,
    personalized:
      access.stationCast && requests.some((request) => Boolean(request.station)),
    pending:
      (propagationModelEnabled && capabilities.isPending) ||
      queries.some((query) => query.isPending || query.isFetching),
    capabilityError:
      capabilities.error instanceof Error ? capabilities.error : null,
    predictions,
    stationEnvelopes,
    errors,
    ...summary,
  };
}
