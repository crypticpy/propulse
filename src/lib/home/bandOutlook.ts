/**
 * Home 24-hour single-band outlook.
 *
 * A "taste" of the PropSphere forecast: one band, 24 UTC hours, four spoken
 * levels. It reuses the existing pure model pieces — `calculateBandConditions`
 * (Kp/SFI → per-band day and night condition) and `isDay` (daylight at the
 * operator's own location) — plus Home's `forecastSolarInput`, which walks the
 * NOAA predicted-Kp and flux forecasts hour by hour and says when it fell back
 * to holding the current reading constant.
 *
 * Deliberately target-free: Home has no path, so this is a location outlook,
 * not a path prediction. Path analysis and NowCast stay in PropSphere.
 */

import { calculateBandConditions } from "@/lib/utils/bands";
import { isDay } from "@/lib/utils/time";
import { forecastSolarInput } from "./forecast";
import type { BandCondition, VHFCondition } from "@/types/solar";
import type { KpPoint, SolarFluxForecastProduct } from "@/lib/solar/dataTypes";

/** Bands the ionospheric model covers here; 6 m and above are excluded. */
export const OUTLOOK_BANDS = [
  "160m",
  "80m",
  "60m",
  "40m",
  "30m",
  "20m",
  "17m",
  "15m",
  "12m",
  "10m",
] as const;

export type OutlookLevel = "stronger" | "mixed" | "limited" | "unknown";

/**
 * The words that carry the meaning. Colour is a second channel only; these
 * labels appear in every cell's accessible name and in the printed legend.
 * Vocabulary matches the Advanced dashboard's forecast table.
 */
export const OUTLOOK_LABELS: Record<OutlookLevel, string> = {
  stronger: "Stronger",
  mixed: "Mixed",
  limited: "Limited",
  unknown: "Unknown",
};

/** Legend order, strongest first. */
export const OUTLOOK_LEVELS: OutlookLevel[] = [
  "stronger",
  "mixed",
  "limited",
  "unknown",
];

const LEVEL_RANK: Record<OutlookLevel, number> = {
  stronger: 0,
  mixed: 1,
  limited: 2,
  unknown: 3,
};

export interface OutlookHour {
  /** UTC hour of day, 0-23. */
  hour: number;
  /** Epoch milliseconds at the top of that UTC hour. */
  at: number;
  level: OutlookLevel;
  /** Spoken label for `level`. */
  label: string;
  /** Sun above the horizon at the operator's location at `at`. */
  daylight: boolean;
  /** Kp used for this hour. */
  kp: number;
  /** Solar flux used for this hour. */
  sfi: number;
  /** Where `kp` came from ("NOAA forecast" / "current held constant"). */
  kpSource: string;
  /** Where `sfi` came from. */
  fluxSource: string;
}

export interface HomeBandOutlookInput {
  band: string;
  lat: number;
  lon: number;
  /** Epoch milliseconds; the strip starts at the top of this UTC hour. */
  now: number;
  kp: number;
  sfi: number;
  predictedKp: KpPoint[];
  fluxForecast?: SolarFluxForecastProduct;
}

/** Map a model condition onto one of the four spoken levels. */
export function outlookLevel(
  condition: BandCondition | VHFCondition | undefined,
): OutlookLevel {
  switch (condition) {
    case "Excellent":
    case "Good":
      return "stronger";
    case "Fair":
      return "mixed";
    case "Poor":
    case "Aurora":
      return "limited";
    default:
      return "unknown";
  }
}

/** Epoch ms at the top of the UTC hour containing `at`. */
function topOfHour(at: number): number {
  return at - (at % 3_600_000);
}

/**
 * 24 consecutive hourly cells for one band, starting at the current UTC hour.
 *
 * Returns `[]` when an input is unusable, so callers can withhold the strip
 * rather than draw a confident-looking row of "Unknown".
 */
export function buildHomeBandOutlook(
  input: HomeBandOutlookInput,
): OutlookHour[] {
  if (
    ![input.now, input.lat, input.lon, input.kp, input.sfi].every(
      Number.isFinite,
    ) ||
    input.sfi <= 0 ||
    input.kp < 0 ||
    input.kp > 9 ||
    !(OUTLOOK_BANDS as readonly string[]).includes(input.band)
  ) {
    return [];
  }

  const start = topOfHour(input.now);
  return Array.from({ length: 24 }, (_unused, step) => {
    const at = start + step * 3_600_000;
    const solar = forecastSolarInput(input, at);
    const when = new Date(at);
    const daylight = isDay(input.lat, input.lon, when);
    const band = calculateBandConditions(solar.kp, solar.sfi).find(
      (candidate) => candidate.name === input.band,
    );
    const level = outlookLevel(
      daylight ? band?.dayCondition : band?.nightCondition,
    );
    return {
      hour: when.getUTCHours(),
      at,
      level,
      label: OUTLOOK_LABELS[level],
      daylight,
      kp: solar.kp,
      sfi: solar.sfi,
      kpSource: solar.kpSource,
      fluxSource: solar.fluxSource,
    };
  });
}

export interface OutlookBandChoice {
  band: string;
  /** "active" = the operator's own band; "best-now" = fallback. */
  reason: "active" | "best-now";
}

/**
 * The band the strip should show: the operator's active band when the model
 * covers it, otherwise the best band right now — highest frequency wins ties,
 * which is how an operator picks between two equally open bands.
 */
export function pickHomeOutlookBand(
  activeBand: string | null | undefined,
  input: { lat: number; lon: number; now: number; kp: number; sfi: number },
): OutlookBandChoice {
  if (activeBand && (OUTLOOK_BANDS as readonly string[]).includes(activeBand)) {
    return { band: activeBand, reason: "active" };
  }

  const at = topOfHour(input.now);
  const daylight = isDay(input.lat, input.lon, new Date(at));
  const conditions = calculateBandConditions(input.kp, input.sfi);
  const ranked = [...OUTLOOK_BANDS]
    .map((band, index) => {
      const condition = conditions.find(
        (candidate) => candidate.name === band,
      );
      return {
        band,
        index,
        rank: LEVEL_RANK[
          outlookLevel(daylight ? condition?.dayCondition : condition?.nightCondition)
        ],
      };
    })
    .sort((a, b) => a.rank - b.rank || b.index - a.index);

  return { band: ranked[0].band, reason: "best-now" };
}
