/**
 * Contest Strategy Engine
 *
 * Provides multiplier management and strategic decision support:
 * - Computes needed multipliers based on contest rules
 * - Ranks multipliers by strategic value using deterministic heuristics
 * - Supports per-band multiplier tracking for contests like CQWW
 *
 * @module lib/contest/strategy
 */

import type { ContestDefinition, MultiplierType } from "@/types/contest";
import { getEffectiveMultiplierRules } from "@/types/contest";
import type { ContestSession, MultiplierEntry } from "@/stores/contestStore";
import { ARRL_RAC_SECTIONS, US_STATES } from "./validation";

// ============================================================================
// Types
// ============================================================================

/**
 * A multiplier that has not yet been worked
 */
export interface NeededMult {
  /** Multiplier type (CQ_ZONE, DXCC, STATE, etc.) */
  type: MultiplierType;
  /** Multiplier value (e.g., "14" for zone, "DL" for DXCC) */
  value: string;
  /** Band this mult is needed on (only for perBand rules) */
  band?: string;
  /** Display label for UI */
  label: string;
  /** Human-readable description */
  description?: string;
}

/**
 * A ranked multiplier target with strategic scoring
 */
export interface RankedTarget {
  /** The needed multiplier */
  mult: NeededMult;
  /** Strategic score (higher = more valuable) */
  score: number;
  /** Rank position (1 = best) */
  rank: number;
  /** Scoring factors that contributed to the rank */
  factors: RankFactor[];
}

/**
 * A factor that contributed to ranking
 */
export interface RankFactor {
  /** Factor name */
  name: string;
  /** Points contributed */
  points: number;
  /** Human-readable explanation */
  reason: string;
}

/**
 * Context for ranking multipliers
 */
export interface RankingContext {
  /** Current band being operated */
  currentBand?: string;
  /** Current hour of contest (0-23) */
  contestHour?: number;
  /** QSO rate context */
  qsoRate?: number;
  /** Number of bands with QSOs */
  activeBandCount?: number;
}

/**
 * Summary of needed multipliers by type
 */
export interface NeededMultsSummary {
  /** All needed multipliers */
  needed: NeededMult[];
  /** Count by multiplier type */
  countByType: Record<MultiplierType, number>;
  /** Count by band (for perBand mults) */
  countByBand: Record<string, number>;
  /** Total needed count */
  total: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Standard contest bands */
const CONTEST_BANDS = ["160m", "80m", "40m", "20m", "15m", "10m"] as const;

/** CQ zones (1-40) */
const CQ_ZONES = Array.from({ length: 40 }, (_, i) => i + 1);

/** ITU zones (1-90) */
const ITU_ZONES = Array.from({ length: 90 }, (_, i) => i + 1);

/**
 * Common DXCC prefixes for major contest entities
 * Ordered roughly by propagation likelihood for US operators
 */
const COMMON_DXCC_PREFIXES = [
  // North America
  "K",
  "VE",
  "XE",
  // Europe (high activity)
  "DL",
  "G",
  "F",
  "I",
  "EA",
  "PA",
  "ON",
  "SP",
  "OK",
  "OM",
  "HA",
  "OE",
  "HB9",
  "LZ",
  "YU",
  "YO",
  "S5",
  "9A",
  // Scandinavia
  "SM",
  "LA",
  "OH",
  "OZ",
  // UK & Islands
  "GM",
  "GW",
  "GI",
  "GD",
  "GJ",
  "GU",
  // Russia/Ukraine
  "UA",
  "UR",
  // Japan
  "JA",
  // South America
  "PY",
  "LU",
  "CE",
  "CX",
  "HK",
  "YV",
  // Caribbean
  "KP4",
  "KP2",
  "6Y",
  "HI",
  // Oceania
  "VK",
  "ZL",
  "KH6",
  // Africa
  "ZS",
  "CN",
  "EA8",
  "5N",
  // Asia/Middle East
  "HL",
  "BV",
  "VU",
  "A6",
  "A7",
  "9K",
] as const;

// ============================================================================
// Universe Generation
// ============================================================================

/**
 * Get the universe of possible multipliers for a given type
 */
function getMultiplierUniverse(type: MultiplierType): string[] {
  switch (type) {
    case "CQ_ZONE":
      return CQ_ZONES.map((z) => z.toString().padStart(2, "0"));
    case "ITU_ZONE":
      return ITU_ZONES.map((z) => z.toString().padStart(2, "0"));
    case "STATE":
      return [...US_STATES];
    case "SECTION":
      return [...ARRL_RAC_SECTIONS];
    case "DXCC":
      return [...COMMON_DXCC_PREFIXES];
    case "WPX_PREFIX":
      // WPX has effectively infinite prefixes; return empty to indicate dynamic
      return [];
    case "GRID":
      // Grid squares are too numerous; return empty to indicate dynamic
      return [];
    case "PROVINCE":
      return [
        "AB",
        "BC",
        "MB",
        "NB",
        "NL",
        "NS",
        "NT",
        "NU",
        "ON",
        "PE",
        "QC",
        "SK",
        "YT",
      ];
    case "NONE":
    default:
      return [];
  }
}

/**
 * Get display label for a multiplier value
 */
function getMultiplierLabel(type: MultiplierType, value: string): string {
  switch (type) {
    case "CQ_ZONE":
      return `Zone ${parseInt(value, 10)}`;
    case "ITU_ZONE":
      return `ITU ${parseInt(value, 10)}`;
    case "STATE":
    case "PROVINCE":
    case "SECTION":
    case "DXCC":
    case "WPX_PREFIX":
    case "GRID":
      return value;
    default:
      return value;
  }
}

/**
 * Get description for a multiplier type
 */
function getTypeDescription(type: MultiplierType): string {
  switch (type) {
    case "CQ_ZONE":
      return "CQ Zone";
    case "ITU_ZONE":
      return "ITU Zone";
    case "STATE":
      return "US State";
    case "PROVINCE":
      return "Canadian Province";
    case "SECTION":
      return "ARRL/RAC Section";
    case "DXCC":
      return "DXCC Entity";
    case "WPX_PREFIX":
      return "WPX Prefix";
    case "GRID":
      return "Grid Square";
    default:
      return "Multiplier";
  }
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Build a set of worked multiplier keys from session multipliers
 */
function buildWorkedSet(
  multipliers: MultiplierEntry[],
  perBand: boolean,
): Set<string> {
  const worked = new Set<string>();

  for (const mult of multipliers) {
    if (perBand && mult.band) {
      worked.add(
        `${mult.type}|${mult.value.toUpperCase()}|${mult.band.toLowerCase()}`,
      );
    } else {
      worked.add(`${mult.type}|${mult.value.toUpperCase()}`);
    }
  }

  return worked;
}

/**
 * Check if a multiplier is already worked
 */
function isWorked(
  worked: Set<string>,
  type: MultiplierType,
  value: string,
  band?: string,
  perBand?: boolean,
): boolean {
  if (perBand && band) {
    return worked.has(`${type}|${value.toUpperCase()}|${band.toLowerCase()}`);
  }
  return worked.has(`${type}|${value.toUpperCase()}`);
}

/**
 * Get all bands where a multiplier is needed (for perBand rules)
 */
function getNeededBands(
  worked: Set<string>,
  type: MultiplierType,
  value: string,
  bands: readonly string[],
): string[] {
  return bands.filter(
    (band) =>
      !worked.has(`${type}|${value.toUpperCase()}|${band.toLowerCase()}`),
  );
}

/**
 * Get needed multipliers for a contest session
 *
 * @param session - Active contest session with worked multipliers
 * @param contestDef - Contest definition with multiplier rules
 * @returns Array of needed multipliers
 */
export function getNeededMultipliers(
  session: ContestSession,
  contestDef: ContestDefinition,
): NeededMult[] {
  const rules = getEffectiveMultiplierRules(contestDef);
  if (rules.length === 0) {
    return [];
  }

  const needed: NeededMult[] = [];
  const worked = buildWorkedSet(session.multipliers, true);

  for (const rule of rules) {
    const universe = getMultiplierUniverse(rule.type);

    // Skip dynamic types (WPX, GRID) - can't enumerate universe
    if (universe.length === 0) {
      continue;
    }

    for (const value of universe) {
      if (rule.perBand) {
              // Check each band
              const neededBands = getNeededBands(
                worked,
                rule.type,
                value,
                CONTEST_BANDS,
              );
              for (const band of neededBands) {
                needed.push({
                  type: rule.type,
                  value: value.toUpperCase(),
                  band,
                  label: getMultiplierLabel(rule.type, value),
                  description: `${getTypeDescription(rule.type)} on ${band}`,
                });
              }
            }
      else if (!isWorked(worked, rule.type, value)) {
                needed.push({
                  type: rule.type,
                  value: value.toUpperCase(),
                  label: getMultiplierLabel(rule.type, value),
                  description: getTypeDescription(rule.type),
                });
              }
    }
  }

  return needed;
}

/**
 * Get summary of needed multipliers by type and band
 *
 * @param session - Active contest session
 * @param contestDef - Contest definition
 * @returns Summary with counts by type and band
 */
export function getNeededMultipliersSummary(
  session: ContestSession,
  contestDef: ContestDefinition,
): NeededMultsSummary {
  const needed = getNeededMultipliers(session, contestDef);

  const countByType: Record<MultiplierType, number> = {
    CQ_ZONE: 0,
    ITU_ZONE: 0,
    STATE: 0,
    PROVINCE: 0,
    SECTION: 0,
    DXCC: 0,
    WPX_PREFIX: 0,
    GRID: 0,
    NONE: 0,
  };

  const countByBand: Record<string, number> = {};

  for (const mult of needed) {
    countByType[mult.type]++;
    if (mult.band) {
      countByBand[mult.band] = (countByBand[mult.band] || 0) + 1;
    }
  }

  return {
    needed,
    countByType,
    countByBand,
    total: needed.length,
  };
}

// ============================================================================
// Ranking Functions
// ============================================================================

/**
 * Score factors for ranking multipliers
 */
const SCORE_WEIGHTS = {
  /** Bonus for current band */
  CURRENT_BAND: 50,
  /** Bonus for common/likely propagation paths */
  COMMON_ENTITY: 30,
  /** Bonus for high bands during day */
  DAYTIME_HIGH_BAND: 20,
  /** Bonus for low bands during night */
  NIGHTTIME_LOW_BAND: 20,
  /** Base score for zone mults (generally higher value) */
  ZONE_BASE: 10,
  /** Base score for DXCC mults */
  DXCC_BASE: 8,
  /** Base score for state/section mults */
  DOMESTIC_BASE: 5,
  /** Bonus for mults needed on multiple bands */
  MULTI_BAND_NEED: 15,
} as const;

/**
 * Determine if a band is a "high" band (daytime propagation)
 */
function isHighBand(band: string): boolean {
  return ["20m", "15m", "10m"].includes(band.toLowerCase());
}

/**
 * Determine if a band is a "low" band (nighttime propagation)
 */
function isLowBand(band: string): boolean {
  return ["160m", "80m", "40m"].includes(band.toLowerCase());
}

/**
 * Check if it's daytime UTC (roughly 12-00 UTC for US)
 */
function isDaytimeUTC(hour: number): boolean {
  return hour >= 12 || hour < 4;
}

/**
 * Score a single needed multiplier
 */
function scoreMultiplier(
  mult: NeededMult,
  context: RankingContext,
  allNeeded: NeededMult[],
): { score: number; factors: RankFactor[] } {
  let score = 0;
  const factors: RankFactor[] = [];

  // Base score by type
  if (mult.type === "CQ_ZONE" || mult.type === "ITU_ZONE") {
    score += SCORE_WEIGHTS.ZONE_BASE;
    factors.push({
      name: "zone_base",
      points: SCORE_WEIGHTS.ZONE_BASE,
      reason: "Zone multipliers have high strategic value",
    });
  } else if (mult.type === "DXCC") {
    score += SCORE_WEIGHTS.DXCC_BASE;
    factors.push({
      name: "dxcc_base",
      points: SCORE_WEIGHTS.DXCC_BASE,
      reason: "DXCC country multiplier",
    });
  } else {
    score += SCORE_WEIGHTS.DOMESTIC_BASE;
    factors.push({
      name: "domestic_base",
      points: SCORE_WEIGHTS.DOMESTIC_BASE,
      reason: "Domestic section/state multiplier",
    });
  }

  // Current band bonus
  if (context.currentBand && mult.band === context.currentBand.toLowerCase()) {
    score += SCORE_WEIGHTS.CURRENT_BAND;
    factors.push({
      name: "current_band",
      points: SCORE_WEIGHTS.CURRENT_BAND,
      reason: `Available on current band (${context.currentBand})`,
    });
  }

  // Common entity bonus (for DXCC)
  if (
    mult.type === "DXCC" &&
    COMMON_DXCC_PREFIXES.includes(
      mult.value as (typeof COMMON_DXCC_PREFIXES)[number],
    )
  ) {
    score += SCORE_WEIGHTS.COMMON_ENTITY;
    factors.push({
      name: "common_entity",
      points: SCORE_WEIGHTS.COMMON_ENTITY,
      reason: "High activity DXCC entity",
    });
  }

  // Propagation-based scoring
  if (context.contestHour !== undefined && mult.band) {
    const daytime = isDaytimeUTC(context.contestHour);

    if (daytime && isHighBand(mult.band)) {
      score += SCORE_WEIGHTS.DAYTIME_HIGH_BAND;
      factors.push({
        name: "propagation_daytime",
        points: SCORE_WEIGHTS.DAYTIME_HIGH_BAND,
        reason: "High band favorable during daytime",
      });
    } else if (!daytime && isLowBand(mult.band)) {
      score += SCORE_WEIGHTS.NIGHTTIME_LOW_BAND;
      factors.push({
        name: "propagation_nighttime",
        points: SCORE_WEIGHTS.NIGHTTIME_LOW_BAND,
        reason: "Low band favorable during nighttime",
      });
    }
  }

  // Multi-band need bonus (for mults needed on multiple bands)
  if (mult.band) {
    const sameValueCount = allNeeded.filter(
      (n) => n.type === mult.type && n.value === mult.value,
    ).length;
    if (sameValueCount > 1) {
      score += SCORE_WEIGHTS.MULTI_BAND_NEED;
      factors.push({
        name: "multi_band",
        points: SCORE_WEIGHTS.MULTI_BAND_NEED,
        reason: `Needed on ${sameValueCount} bands`,
      });
    }
  }

  return { score, factors };
}

/**
 * Rank needed multipliers by strategic value
 *
 * Uses deterministic heuristics to prioritize multipliers:
 * - Current band preference
 * - Propagation conditions (time of day)
 * - Common activity patterns
 * - Multi-band opportunities
 *
 * @param needed - Array of needed multipliers
 * @param context - Ranking context (current band, time, etc.)
 * @returns Array of ranked targets, sorted by score descending
 */
export function rankNextBestMultipliers(
  needed: NeededMult[],
  context: RankingContext = {},
): RankedTarget[] {
  const ranked: RankedTarget[] = [];

  for (const mult of needed) {
    const { score, factors } = scoreMultiplier(mult, context, needed);
    ranked.push({
      mult,
      score,
      rank: 0, // Will be set after sorting
      factors,
    });
  }

  // Sort by score descending
  ranked.sort((a, b) => b.score - a.score);

  // Assign ranks
  for (let i = 0; i < ranked.length; i++) {
    ranked[i].rank = i + 1;
  }

  return ranked;
}

/**
 * Get the top N best multiplier targets
 *
 * @param session - Active contest session
 * @param contestDef - Contest definition
 * @param context - Ranking context
 * @param limit - Maximum number of targets to return (default 10)
 * @returns Top ranked multiplier targets
 */
export function getTopTargets(
  session: ContestSession,
  contestDef: ContestDefinition,
  context: RankingContext = {},
  limit = 10,
): RankedTarget[] {
  const needed = getNeededMultipliers(session, contestDef);
  const ranked = rankNextBestMultipliers(needed, context);
  return ranked.slice(0, limit);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get worked multipliers grouped by type from session
 */
export function getWorkedByType(
  session: ContestSession,
): Record<MultiplierType, string[]> {
  const byType: Record<MultiplierType, string[]> = {
    CQ_ZONE: [],
    ITU_ZONE: [],
    STATE: [],
    PROVINCE: [],
    SECTION: [],
    DXCC: [],
    WPX_PREFIX: [],
    GRID: [],
    NONE: [],
  };

  for (const mult of session.multipliers) {
    if (!byType[mult.type].includes(mult.value.toUpperCase())) {
      byType[mult.type].push(mult.value.toUpperCase());
    }
  }

  return byType;
}

/**
 * Get worked multipliers grouped by band
 */
export function getWorkedByBand(
  session: ContestSession,
): Record<string, MultiplierEntry[]> {
  const byBand: Record<string, MultiplierEntry[]> = {};

  for (const mult of session.multipliers) {
    const band = mult.band?.toLowerCase() || "all";
    if (!byBand[band]) {
      byBand[band] = [];
    }
    byBand[band].push(mult);
  }

  return byBand;
}

/**
 * Check if any multiplier rule in the contest uses perBand
 */
export function hasPerBandMultipliers(contestDef: ContestDefinition): boolean {
  const rules = getEffectiveMultiplierRules(contestDef);
  return rules.some((rule) => rule.perBand);
}

/**
 * Get unique worked values for a multiplier type (ignoring band)
 */
export function getUniqueWorkedValues(
  session: ContestSession,
  type: MultiplierType,
): string[] {
  const values = new Set<string>();

  for (const mult of session.multipliers) {
    if (mult.type === type) {
      values.add(mult.value.toUpperCase());
    }
  }

  return Array.from(values).sort();
}

/**
 * Get bands where a specific multiplier has been worked
 */
export function getWorkedBandsForMult(
  session: ContestSession,
  type: MultiplierType,
  value: string,
): string[] {
  const bands: string[] = [];
  const upperValue = value.toUpperCase();

  for (const mult of session.multipliers) {
    if (
      mult.type === type &&
      mult.value.toUpperCase() === upperValue &&
      mult.band
    ) {
      bands.push(mult.band.toLowerCase());
    }
  }

  return bands;
}
