import {
  calculateGreatCircleDistance,
  getEnhancedBandConditions,
  type PathBandCondition,
} from "@/lib/utils/bands";
import {
  getAntennaGainForPath,
  type AntennaType,
} from "@/lib/data/antennas";
import { MODE_PARAMETERS } from "@/lib/utils/signal";
import type { NoiseEnvironment } from "@/lib/utils/noiseModel";
import type { HamClockReliabilityMode } from "@/stores/hamclockStore";

export const HAMCLOCK_RELIABILITY_BANDS = [
  "160m",
  "80m",
  "40m",
  "30m",
  "20m",
  "17m",
  "15m",
  "12m",
  "10m",
] as const;

export interface ReliabilityCoordinate {
  lat: number;
  lon: number;
}
export interface ReliabilityForecastInput {
  origin: ReliabilityCoordinate;
  target: ReliabilityCoordinate;
  kp: number;
  sfi: number;
  baseTime: Date;
  mode: HamClockReliabilityMode;
  powerWatts: number;
  antennaType: AntennaType;
  noiseEnvironment?: NoiseEnvironment;
}

export interface ReliabilityCell {
  band: (typeof HAMCLOCK_RELIABILITY_BANDS)[number];
  hour: number;
  score: number;
  snrEstimate: number;
  confidence: number;
  status: PathBandCondition["status"];
}

const BAND_SET = new Set<string>(HAMCLOCK_RELIABILITY_BANDS);

/**
 * Convert the enhanced model's mode-relative SNR margin and confidence into a
 * compact 0-100 index. This is deliberately described as a relative model
 * score in the UI: it is useful for comparing band/hour cells, but it is not
 * a calibrated probability that a QSO will complete.
 */
export function scoreReliability(
  snrEstimate: number,
  confidence: number,
  mode: HamClockReliabilityMode,
  status: PathBandCondition["status"],
): number {
  if (status === "closed" || !Number.isFinite(snrEstimate)) return 0;

  const threshold = MODE_PARAMETERS[mode].minSNR;
  const margin = snrEstimate - threshold;
  const marginScore = 100 / (1 + Math.exp(-margin / 3));
  const boundedConfidence = Math.max(0, Math.min(100, confidence));
  const confidenceWeight = 0.65 + (boundedConfidence / 100) * 0.35;
  return Math.max(0, Math.min(100, Math.round(marginScore * confidenceWeight)));
}

/** Build a 00-23 UTC band matrix from the enhanced propagation engine. */
export function buildReliabilityForecast(
  input: ReliabilityForecastInput,
): ReliabilityCell[] {
  const distanceKm = calculateGreatCircleDistance(
    input.origin.lat,
    input.origin.lon,
    input.target.lat,
    input.target.lon,
  );
  const antennaGainDbi = getAntennaGainForPath(
    input.antennaType,
    distanceKm,
  );
  const utcDay = new Date(input.baseTime);
  const cells: ReliabilityCell[] = [];

  for (let hour = 0; hour < 24; hour++) {
    const atHour = new Date(utcDay);
    atHour.setUTCHours(hour, 0, 0, 0);
    const conditions = getEnhancedBandConditions(
      input.origin.lat,
      input.origin.lon,
      input.target.lat,
      input.target.lon,
      input.kp,
      input.sfi,
      atHour,
      input.powerWatts,
      input.mode,
      antennaGainDbi,
      input.noiseEnvironment,
    );

    for (const condition of conditions) {
      if (!BAND_SET.has(condition.band)) continue;
      const confidence = condition.signalPrediction?.confidence ?? 50;
      cells.push({
        band: condition.band as ReliabilityCell["band"],
        hour,
        score: scoreReliability(
          condition.snrEstimate,
          confidence,
          input.mode,
          condition.status,
        ),
        snrEstimate: condition.snrEstimate,
        confidence,
        status: condition.status,
      });
    }
  }

  return cells;
}
