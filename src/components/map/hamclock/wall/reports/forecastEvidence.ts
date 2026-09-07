import type { PropagationPrediction } from "@/lib/propagation/modelClient";
import { FUTURECAST_HORIZONS_HOURS } from "@/lib/propagation/runtimeActivation";

export const FORECAST_HOUR_MS = 3_600_000;
const MAX_MODEL_AGE_MS = 15 * 60_000;

export interface ForecastContext {
  band: string;
  targetGrid: string | null;
  mode: string;
  hourIndex: number;
  now: number;
}

export interface ModelEvidence {
  prediction: PropagationPrediction | null;
  reason: string | null;
}

/** Never reuse another path, mode, hour or physics fallback as model evidence. */
export function modelEvidence(
  prediction: PropagationPrediction | undefined,
  context: ForecastContext,
): ModelEvidence {
  const unavailable = (reason: string): ModelEvidence => ({ prediction: null, reason });
  if (!context.targetGrid) return unavailable("NO TARGET — PATH MODEL UNAVAILABLE");
  if (!prediction) return unavailable("NO MODEL RESPONSE");
  if (prediction.profile !== "nowcast") return unavailable("PHYSICS FALLBACK — NO MODEL VALUE");
  if (prediction.band !== context.band || prediction.target_grid4.toUpperCase() !== context.targetGrid.toUpperCase().slice(0, 4)) return unavailable("DIFFERENT PATH OR BAND");
  if (prediction.mode.toUpperCase() !== context.mode.toUpperCase()) return unavailable("DIFFERENT MODE");
  const issued = Date.parse(prediction.issue_time);
  const valid = Date.parse(prediction.valid_time);
  if (!Number.isFinite(issued) || !Number.isFinite(valid) || issued > context.now || valid < issued) return unavailable("INVALID MODEL TIME");
  if (Math.floor(valid / FORECAST_HOUR_MS) !== context.hourIndex) return unavailable("SELECTED HOUR NOT COVERED");
  if (context.now - issued > MAX_MODEL_AGE_MS) return unavailable("MODEL RESPONSE OLDER THAN 15 MIN");
  if (![prediction.core_probability, prediction.personalized_probability, prediction.confidence].every(value => Number.isFinite(value) && value >= 0 && value <= 1)) return unavailable("INVALID MODEL VALUE");
  return { prediction, reason: null };
}

/** Service identifiers are displayed as words, never hidden behind a flag icon. */
export function modelWords(values: readonly string[]): string {
  return values.length ? values.map(value => value.replace(/[_-]+/g, " ")).join(" · ") : "NONE REPORTED";
}

export function horizonEvidence(
  active: readonly number[],
  predictions: ReadonlyMap<number, PropagationPrediction>,
  context: Omit<ForecastContext, "hourIndex"> & { issueTime: number },
  offReason: string,
) {
  return FUTURECAST_HORIZONS_HOURS.map(hours => ({
    hours,
    ...(!active.includes(hours)
      ? { prediction: null, reason: offReason }
      : modelEvidence(predictions.get(hours), {
        ...context,
        hourIndex: Math.floor((context.issueTime + hours * FORECAST_HOUR_MS) / FORECAST_HOUR_MS),
      })),
  }));
}
