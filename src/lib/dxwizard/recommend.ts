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
    params.pathMode === "long" ? Math.max(shortKm, 40030 - shortKm) : shortKm;
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

  const bands = getEnhancedBandConditions(
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
