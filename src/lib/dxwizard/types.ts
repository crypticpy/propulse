import type { PathBandCondition } from "@/lib/utils/bands";
import type { BestWindow } from "@/lib/utils/bands";
import type { PathMetrics } from "@/lib/utils/path";
import type { PropagationModeResult } from "@/lib/utils/propagationModes";
import type { ITURegion, LicenseClass } from "@/types/bandplan";
import type { NoiseEnvironment } from "@/lib/utils/noiseModel";

export type WizardMode = "SSB" | "CW" | "FT8" | "FT4" | "RTTY";

export type WizardPathMode = "short" | "long";

/** How to weigh contest congestion vs propagation. */
export type WizardOptimizeFor = "propagation" | "clear" | "balance";

export interface ResolvedTarget {
  label: string;
  grid: string;
  lat: number;
  lon: number;
  source: "grid" | "coords" | "geocode" | "callsign" | "map" | "url";
  callsign?: string;
  lookupSources?: string[];
}

export interface BandCandidate extends PathBandCondition {
  requiredWatts: number;
  ceilingWatts: number;
  withinCeiling: boolean;
  freqsKHz: number[];
  legalMaxWatts: number | null;
  contestImpact?: import("@/lib/contest/contestCongestionModel").CongestionLevel;
  contestDescription?: string;
}

export interface WizardRecommendationOk {
  type: "ok";
  best: BandCandidate;
  candidates: BandCandidate[];
  bands: PathBandCondition[];
  antennaGainDbi: number;
  contestAlternatives?: Array<{
    band: string;
    reason: string;
    congestionLevel: import("@/lib/contest/contestCongestionModel").CongestionLevel;
  }>;
  optimizeFor?: WizardOptimizeFor;
}

export interface WizardRecommendationNone {
  type: "none";
  bands: PathBandCondition[];
  antennaGainDbi: number;
}

export type WizardRecommendation =
  | WizardRecommendationOk
  | WizardRecommendationNone;

export interface WizardStationInput {
  lat: number;
  lon: number;
  grid?: string;
  callsign?: string;
}

export interface WizardRecommendParams {
  station: WizardStationInput;
  target: ResolvedTarget;
  mode: WizardMode;
  ituRegion: ITURegion;
  licenseClass: LicenseClass;
  currentKp: number;
  currentSfi: number;
  date?: Date;
  txPowerCeilingWatts: number;
  kitMaxPowerWatts: number;
  antennaGainDbi: number;
  noiseEnvironment?: NoiseEnvironment;
  pathMode: WizardPathMode;
  optimizeFor?: WizardOptimizeFor;
  congestionContext?: import("@/lib/contest/contestCongestionModel").CongestionContext;
}

export interface WizardPathSummary {
  metrics: PathMetrics;
  active: {
    distanceKm: number;
    distanceMi: number;
    bearing: number;
    reciprocal: number;
  };
  pathMode: WizardPathMode;
  propagation: PropagationModeResult | null;
}

export interface WizardNextWindow {
  window: BestWindow;
  hoursAway: number;
  label: string;
}

export const MODE_SNR_TARGET_DB: Record<WizardMode, number> = {
  SSB: -6,
  CW: -12,
  FT8: -18,
  FT4: -17,
  RTTY: -8,
};

export const WIZARD_MODES: WizardMode[] = [
  "FT8",
  "FT4",
  "CW",
  "SSB",
  "RTTY",
];
