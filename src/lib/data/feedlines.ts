/**
 * Feedline Loss Data & Calculation Engine
 *
 * Static loss tables for common feedline types at HF frequencies.
 * Loss values are in dB per 100 feet, based on manufacturer data.
 * Interpolation uses sqrt(f) model for coaxial cables.
 */

import type {
  FeedlineType,
  FeedlineCondition,
  ConnectorType,
  UserFeedline,
} from "@/types/shack";

// ─── Loss Tables (dB per 100 feet at each frequency in MHz) ─────────────────

/** Frequencies in MHz for the loss table columns */
const TABLE_FREQUENCIES = [1.8, 3.5, 7, 10, 14, 18, 21, 24.9, 28, 50] as const;

/**
 * Loss in dB per 100 feet for each feedline type at each frequency.
 * Sources: manufacturer published specs, ARRL Antenna Book.
 */
const LOSS_TABLES: Record<FeedlineType, readonly number[]> = {
  rg58: [0.4, 0.6, 0.9, 1.1, 1.3, 1.5, 1.6, 1.7, 1.9, 2.6],
  rg8x: [0.35, 0.5, 0.7, 0.85, 1.0, 1.15, 1.25, 1.35, 1.45, 2.0],
  rg213: [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 1.3],
  lmr400: [0.12, 0.17, 0.25, 0.3, 0.35, 0.4, 0.45, 0.48, 0.5, 0.7],
  lmr600: [0.08, 0.12, 0.17, 0.2, 0.24, 0.27, 0.3, 0.33, 0.35, 0.5],
  hardline_7_8: [0.04, 0.06, 0.08, 0.1, 0.12, 0.14, 0.15, 0.16, 0.17, 0.25],
  ladder_line_450: [0.03, 0.04, 0.06, 0.07, 0.08, 0.09, 0.1, 0.11, 0.12, 0.18],
  window_line_300: [0.04, 0.05, 0.07, 0.09, 0.1, 0.12, 0.13, 0.14, 0.15, 0.22],
};

// ─── Connector Loss (dB per connector) ──────────────────────────────────────

const CONNECTOR_LOSS: Record<ConnectorType, number> = {
  pl259: 0.5,
  n_type: 0.2,
  bnc: 0.3,
  sma: 0.2,
  f_type: 0.4,
  binding_post: 0.1,
  none: 0.0,
};

// ─── Condition Multipliers ──────────────────────────────────────────────────

const CONDITION_MULTIPLIERS: Record<FeedlineCondition, number> = {
  new: 1.0,
  good: 1.1,
  fair: 1.3,
  poor: 1.6,
};

// ─── Feedline Display Names ─────────────────────────────────────────────────

export const FEEDLINE_TYPE_NAMES: Record<FeedlineType, string> = {
  rg58: "RG-58",
  rg8x: "RG-8X",
  rg213: "RG-213/U",
  lmr400: "LMR-400",
  lmr600: "LMR-600",
  hardline_7_8: 'Hardline 7/8"',
  ladder_line_450: "Ladder Line 450\u03A9",
  window_line_300: "Window Line 300\u03A9",
};

export const FEEDLINE_IMPEDANCE: Record<FeedlineType, number> = {
  rg58: 50,
  rg8x: 50,
  rg213: 50,
  lmr400: 50,
  lmr600: 50,
  hardline_7_8: 50,
  ladder_line_450: 450,
  window_line_300: 300,
};

// ─── Calculation Functions ──────────────────────────────────────────────────

/**
 * Interpolate loss at a given frequency using sqrt(f) model.
 * For coaxial cables, attenuation scales approximately as sqrt(frequency).
 */
function interpolateLoss(
  lossTable: readonly number[],
  freqMHz: number,
): number {
  if (freqMHz <= TABLE_FREQUENCIES[0]) return lossTable[0];
  if (freqMHz >= TABLE_FREQUENCIES[TABLE_FREQUENCIES.length - 1]) {
    return lossTable[lossTable.length - 1];
  }

  // Find bracketing frequencies
  let lowerIdx = 0;
  for (let i = 0; i < TABLE_FREQUENCIES.length - 1; i++) {
    if (TABLE_FREQUENCIES[i + 1] >= freqMHz) {
      lowerIdx = i;
      break;
    }
  }

  const f1 = TABLE_FREQUENCIES[lowerIdx];
  const f2 = TABLE_FREQUENCIES[lowerIdx + 1];
  const l1 = lossTable[lowerIdx];
  const l2 = lossTable[lowerIdx + 1];

  // sqrt(f) interpolation
  const sqrtF = Math.sqrt(freqMHz);
  const sqrtF1 = Math.sqrt(f1);
  const sqrtF2 = Math.sqrt(f2);

  const t = (sqrtF - sqrtF1) / (sqrtF2 - sqrtF1);
  return l1 + t * (l2 - l1);
}

/**
 * Calculate feedline loss for a given type, length, frequency, connectors, and condition.
 * @returns Loss in dB (positive value = signal reduction)
 */
export function calculateFeedlineLoss(
  type: FeedlineType,
  lengthFeet: number,
  freqMHz: number,
  connectorCount: number = 2,
  connectorType: ConnectorType = "pl259",
  condition: FeedlineCondition = "good",
): number {
  const lossTable = LOSS_TABLES[type];
  if (!lossTable) return 0;

  const lossPer100ft = interpolateLoss(lossTable, freqMHz);
  const cableLoss = (lossPer100ft * lengthFeet) / 100;
  const connectorLoss = connectorCount * (CONNECTOR_LOSS[connectorType] ?? 0);
  const conditionMultiplier = CONDITION_MULTIPLIERS[condition] ?? 1.0;

  return cableLoss * conditionMultiplier + connectorLoss;
}

/**
 * Calculate additional loss due to SWR mismatch.
 * Uses the reflection coefficient model.
 * @param feedlineLossDb - Matched line loss in dB
 * @param swr - Standing Wave Ratio (>= 1.0)
 * @returns Additional loss in dB due to SWR mismatch
 */
export function calculateSWRMismatchLoss(
  feedlineLossDb: number,
  swr: number,
): number {
  if (swr <= 1.0) return 0;
  if (feedlineLossDb <= 0) return 0;

  // Reflection coefficient from SWR
  const rho = (swr - 1) / (swr + 1);
  const rhoSq = rho * rho;

  // Convert matched loss to linear
  const matchedLossLinear = Math.pow(10, feedlineLossDb / 10);

  // Total loss with mismatch
  const totalLossLinear =
    (matchedLossLinear * (1 - rhoSq)) /
    (1 - rhoSq / (matchedLossLinear * matchedLossLinear));

  const totalLossDb = 10 * Math.log10(totalLossLinear);
  return Math.max(0, totalLossDb - feedlineLossDb);
}

/**
 * Calculate total feedline loss including matched loss, connectors, condition, and optional SWR mismatch.
 */
export function calculateTotalFeedlineLoss(
  feedline: UserFeedline,
  freqMHz: number,
  swr?: number,
): number {
  const matchedLoss = calculateFeedlineLoss(
    feedline.feedlineType,
    feedline.lengthFeet,
    freqMHz,
    feedline.connectorCount,
    feedline.connectorType,
    feedline.condition,
  );

  if (swr && swr > 1.0) {
    const mismatchLoss = calculateSWRMismatchLoss(matchedLoss, swr);
    return matchedLoss + mismatchLoss;
  }

  return matchedLoss;
}

/** Band center frequencies for HF bands in MHz */
const BAND_CENTER_FREQUENCIES: Record<string, number> = {
  "160m": 1.9,
  "80m": 3.6,
  "60m": 5.3,
  "40m": 7.15,
  "30m": 10.125,
  "20m": 14.15,
  "17m": 18.1,
  "15m": 21.2,
  "12m": 24.93,
  "10m": 28.5,
  "6m": 51.0,
};

/**
 * Get feedline loss for multiple bands at once.
 * @returns Record mapping band name to loss in dB
 */
export function getFeedlineLossForBands(
  feedline: UserFeedline,
  bands: string[],
  swr?: number,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const band of bands) {
    const freq = BAND_CENTER_FREQUENCIES[band];
    if (freq) {
      result[band] = calculateTotalFeedlineLoss(feedline, freq, swr);
    }
  }
  return result;
}

/**
 * Get available feedline types with display info.
 */
export function getFeedlineTypes(): Array<{
  type: FeedlineType;
  name: string;
  impedance: number;
}> {
  return (Object.keys(FEEDLINE_TYPE_NAMES) as FeedlineType[]).map((type) => ({
    type,
    name: FEEDLINE_TYPE_NAMES[type],
    impedance: FEEDLINE_IMPEDANCE[type],
  }));
}

/**
 * Get connector loss for a given type.
 */
export function getConnectorLoss(type: ConnectorType): number {
  return CONNECTOR_LOSS[type] ?? 0;
}

/**
 * Get condition multiplier for feedline aging.
 */
export function getConditionMultiplier(condition: FeedlineCondition): number {
  return CONDITION_MULTIPLIERS[condition] ?? 1.0;
}
