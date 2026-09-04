import {
  getEnhancedBandConditions,
  calculateGreatCircleDistance,
} from "@/lib/utils/bands";
import { getAntennaGainForPath } from "@/lib/data/antennas";
import type { AntennaType } from "@/lib/data/antennas";
import {
  clampWatts,
  estimateRequiredPowerWatts,
} from "./power";
import {
  getMaxAllowedPowerWatts,
  pickAllowedFrequenciesKHz,
} from "./frequencies";
import {
  MODE_SNR_TARGET_DB,
  type BandCandidate,
  type WizardRecommendParams,
  type WizardRecommendation,
} from "./types";

/** Earth circumference used for long-path free-space delta. */
const EARTH_CIRCUMFERENCE_KM = 40030;

/**
 * Extra free-space path loss for the long path relative to short path.
 * Applied as an SNR penalty so LP ranking is not antenna-gain-only.
 */
export function longPathFsplDeltaDb(shortPathKm: number): number {
  if (!Number.isFinite(shortPathKm) || shortPathKm <= 0) return 0;
  const longKm = Math.max(shortPathKm, EARTH_CIRCUMFERENCE_KM - shortPathKm);
  if (longKm <= shortPathKm) return 0;
  return 20 * Math.log10(longKm / shortPathKm);
}

export function resolveAntennaGainDbi(params: {
  antennaType: AntennaType | string;
  homeLat: number;
  homeLon: number;
  targetLat: number;
  targetLon: number;
  pathMode: "short" | "long";
  overrideGainDbi?: number;
}): number {
  if (
    typeof params.overrideGainDbi === "number" &&
    Number.isFinite(params.overrideGainDbi)
  ) {
    return params.overrideGainDbi;
  }
  const shortKm = calculateGreatCircleDistance(
    params.homeLat,
    params.homeLon,
    params.targetLat,
    params.targetLon,
  );
  const distanceKm =
    params.pathMode === "long" ? Math.max(shortKm, EARTH_CIRCUMFERENCE_KM - shortKm) : shortKm;
  return getAntennaGainForPath(
    params.antennaType as AntennaType,
    distanceKm,
  );
}

export function buildWizardRecommendation(
  params: WizardRecommendParams,
): WizardRecommendation {
  const {
    station,
    target,
    mode,
    pathMode,
    ituRegion,
    licenseClass,
    currentKp,
    currentSfi,
    txPowerCeilingWatts,
    kitMaxPowerWatts,
    antennaGainDbi,
    noiseEnvironment,
  } = params;

  const date = params.date ?? new Date();
  const txPowerBaseline = 100;

  const modelMode: "SSB" | "CW" | "FT8" =
    mode === "SSB" ? "SSB" : mode === "CW" || mode === "RTTY" ? "CW" : "FT8";

  let bands = getEnhancedBandConditions(
    station.lat,
    station.lon,
    target.lat,
    target.lon,
    currentKp,
    currentSfi,
    date,
    txPowerBaseline,
    modelMode,
    antennaGainDbi,
    noiseEnvironment,
  );

  // Physics models the short path; apply LP free-space delta when long path
  // is selected so SNR / required power reflect the longer hop.
  if (pathMode === "long") {
    const shortKm = calculateGreatCircleDistance(
      station.lat,
      station.lon,
      target.lat,
      target.lon,
    );
    const fsplDelta = longPathFsplDeltaDb(shortKm);
    if (fsplDelta > 0) {
      bands = bands.map((b) => ({
        ...b,
        snrEstimate: Math.round((b.snrEstimate - fsplDelta) * 10) / 10,
        notes: `${b.notes} · LP −${fsplDelta.toFixed(1)} dB FSPL`,
      }));
    }
  }

  const snrTarget = MODE_SNR_TARGET_DB[mode];

  const candidates: BandCandidate[] = bands
    .filter((b) => b.status !== "closed")
    .map((b) => {
      const requiredWatts = estimateRequiredPowerWatts(
        b.snrEstimate,
        snrTarget,
      );
      const legalMax = getMaxAllowedPowerWatts({
        band: b.band,
        mode,
        region: ituRegion,
        licenseClass,
      });
      const ceiling = clampWatts(
        Math.min(
          txPowerCeilingWatts || 1500,
          kitMaxPowerWatts || 1500,
          legalMax ?? 1500,
        ),
      );

      const freqsKHz = pickAllowedFrequenciesKHz({
        band: b.band,
        mode,
        region: ituRegion,
        licenseClass,
      });

      return {
        ...b,
        requiredWatts,
        ceilingWatts: ceiling,
        withinCeiling: requiredWatts <= ceiling,
        freqsKHz,
        legalMaxWatts: legalMax,
      };
    })
    .filter((b) => b.freqsKHz.length > 0);

  if (candidates.length === 0) {
    return { type: "none", bands, antennaGainDbi };
  }

  const sorted = [...candidates].sort((a, b) => {
    if (a.withinCeiling !== b.withinCeiling) {
      return a.withinCeiling ? -1 : 1;
    }
    if (a.requiredWatts !== b.requiredWatts) {
      return a.requiredWatts - b.requiredWatts;
    }
    return b.snrEstimate - a.snrEstimate;
  });

  return {
    type: "ok",
    best: sorted[0],
    candidates: sorted,
    bands,
    antennaGainDbi,
  };
}
