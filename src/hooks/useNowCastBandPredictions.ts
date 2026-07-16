import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { buildCorePathFeatures, HF_BAND_MHZ, type OperationalSpaceWeather } from "@/lib/propagation/coreFeatureBuilder";
import {
  propagationModelClient,
  propagationCoreNowCastVisible,
  propagationModelEnabled,
  propagationStationCastRequested,
  propagationStationCastVisible,
  type PathPredictionRequest,
  type PropagationPrediction,
  type ResearchSubjectBinding,
} from "@/lib/propagation/modelClient";
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
  return Object.keys(HF_BAND_MHZ).map((band) => {
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
          mode: "WSPR",
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
      mode: "WSPR",
      declared_power_watts: declaredPower,
      features: { target_grid4: targetGrid4, values },
      ...(envelope ? { station: envelope } : {}),
      data_freshness_seconds: {
        space_weather: weatherAge,
        path_history: 86_400,
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
  personalized: boolean;
  pending: boolean;
  predictions: Map<string, PropagationPrediction>;
  errors: Map<string, Error>;
}

export function useNowCastBandPredictions(
  input: NowCastBandInput,
): NowCastBandPredictions {
  const issueBucket = Math.floor(Date.now() / FIVE_MINUTES_MS) * FIVE_MINUTES_MS;
  const requests = useMemo(
    () => buildNowCastRequests(
      input,
      new Date(issueBucket),
      propagationStationCastRequested,
    ),
    [input, issueBucket],
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
  const errors = new Map<string, Error>();
  queries.forEach((query, index) => {
    const band = requests[index]?.band;
    if (!band) return;
    if (query.data) predictions.set(band, query.data);
    if (query.error instanceof Error) errors.set(band, query.error);
  });
  return {
    enabled: propagationModelEnabled && requests.length > 0,
    visible: propagationCoreNowCastVisible && requests.length > 0,
    personalized:
      propagationStationCastVisible && requests.some((request) => Boolean(request.station)),
    pending: queries.some((query) => query.isPending || query.isFetching),
    predictions,
    errors,
  };
}
