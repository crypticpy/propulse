import { buildNowCastRequests, type NowCastBandInput } from "@/hooks/useNowCastBandPredictions";
import { buildCorePathFeatures } from "@/lib/propagation/coreFeatureBuilder";
import type { PathPredictionRequest } from "@/lib/propagation/modelClient";
import { FUTURECAST_HORIZONS_HOURS } from "@/lib/propagation/runtimeActivation";
import { WALL_FORECAST_BANDS } from "../tiles/useWallReliability";
import { FORECAST_HOUR_MS } from "./forecastEvidence";

/** Presentation adapter: retain station/mode inputs and rebuild time-dependent
 * features for the permitted future instant, without changing model gates. */
export function buildFutureCastReportRequests(
  input: NowCastBandInput,
  issuedAt: Date,
  activeHorizons: readonly number[],
  personalized: boolean,
): { hours: number; request: PathPredictionRequest }[] {
  const horizons = FUTURECAST_HORIZONS_HOURS.filter(hours => activeHorizons.includes(hours));
  if (!input.origin || !input.target || !horizons.length) return [];
  const bands = new Set<string>(WALL_FORECAST_BANDS);
  const current = buildNowCastRequests(input, issuedAt, personalized).filter(request => bands.has(request.band));
  return horizons.flatMap(hours => {
    const validTime = new Date(issuedAt.getTime() + hours * FORECAST_HOUR_MS);
    return current.map(request => ({
      hours,
      request: {
        ...request,
        valid_time: validTime.toISOString(),
        features: {
          ...request.features,
          values: buildCorePathFeatures({
            origin: input.origin!, target: input.target!, band: request.band,
            declaredPowerWatts: request.declared_power_watts,
            validTime, weather: input.weather,
          }),
        },
      },
    }));
  });
}
