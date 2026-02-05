/**
 * Contest Multiplier Extraction Engine
 *
 * Extracts multiplier values from QSOs based on contest rules.
 * Supports various multiplier types:
 * - DXCC entities (from callsign)
 * - CQ/ITU zones (from exchange or callsign)
 * - US states / Canadian provinces (from exchange)
 * - WPX prefixes (from callsign)
 * - Grid squares (from exchange)
 * - ARRL sections (from exchange)
 *
 * @module lib/contest/multipliers
 */

import type {
  ContestDefinition,
  MultiplierRule,
  MultiplierType,
} from "@/types/contest";
import { getEffectiveMultiplierRules } from "@/types/contest";
import type { ContestQSODraft, ExtractedMultiplier } from "./types";

// Import extraction utilities from existing multipliers module
import {
  getDXCCEntity,
  getCQZone,
  getITUZone,
  getWPXPrefix,
  getUSState,
  getCanadianProvince,
} from "@/lib/utils/multipliers";

// ============================================================================
// Multiplier Value Extraction
// ============================================================================

/**
 * Extract a multiplier value from the given input based on type and source
 *
 * @param value - The value to extract from (callsign or exchange field)
 * @param type - Type of multiplier to extract
 * @param source - Whether this is from callsign or exchange
 * @returns Extracted and normalized multiplier value, or null if not found
 *
 * @example
 * ```ts
 * // DXCC from callsign
 * extractMultiplierValue("W1AW", "DXCC", "callsign") // "K" (US prefix)
 *
 * // CQ Zone from exchange
 * extractMultiplierValue("05", "CQ_ZONE", "exchange") // "05"
 *
 * // State from exchange
 * extractMultiplierValue("CA", "STATE", "exchange") // "CA"
 * ```
 */
export function extractMultiplierValue(
  value: string,
  type: MultiplierType,
  source: "callsign" | "exchange",
): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toUpperCase();

  switch (type) {
    case "DXCC": {
      // DXCC typically extracted from callsign
      const entity = getDXCCEntity(normalized);
      if (entity) {
        // Return the prefix as the multiplier value (e.g., "K", "DL", "JA")
        return entity.prefix.toUpperCase();
      }
      return null;
    }

    case "CQ_ZONE": {
      if (source === "callsign") {
        // Extract zone from callsign
        const zone = getCQZone(normalized);
        return zone !== null ? String(zone).padStart(2, "0") : null;
      }
      // From exchange - validate it's a valid zone number (1-40)
      const zoneNum = parseInt(normalized, 10);
      if (!isNaN(zoneNum) && zoneNum >= 1 && zoneNum <= 40) {
        return String(zoneNum).padStart(2, "0");
      }
      return null;
    }

    case "ITU_ZONE": {
      if (source === "callsign") {
        // Extract zone from callsign
        const zone = getITUZone(normalized);
        return zone !== null ? String(zone).padStart(2, "0") : null;
      }
      // From exchange - validate it's a valid zone number (1-90)
      const zoneNum = parseInt(normalized, 10);
      if (!isNaN(zoneNum) && zoneNum >= 1 && zoneNum <= 90) {
        return String(zoneNum).padStart(2, "0");
      }
      return null;
    }

    case "WPX_PREFIX": {
      // WPX prefix typically extracted from callsign
      const prefix = getWPXPrefix(normalized);
      return prefix ? prefix.toUpperCase() : null;
    }

    case "STATE": {
      // US state from exchange
      return getUSState(normalized);
    }

    case "PROVINCE": {
      // Canadian province from exchange
      return getCanadianProvince(normalized);
    }

    case "GRID": {
      // Maidenhead grid square (4 or 6 char)
      // Validate format: 2 letters + 2 digits [+ 2 letters]
      if (/^[A-R]{2}[0-9]{2}([A-X]{2})?$/i.test(normalized)) {
        return normalized.toUpperCase();
      }
      return null;
    }

    case "GRID_SQUARE": {
      // 4-character Maidenhead grid square (for VHF contests like CQ WW VHF)
      // Extract first 4 characters if 6-char grid provided
      const gridValue = normalized.slice(0, 4);
      if (/^[A-R]{2}[0-9]{2}$/i.test(gridValue)) {
        return gridValue.toUpperCase();
      }
      return null;
    }

    case "COUNTY": {
      // County abbreviation (for State QSO Parties)
      // Just normalize to uppercase; full validation requires state context
      if (normalized.length >= 2 && normalized.length <= 5) {
        return normalized;
      }
      return null;
    }

    case "SECTION": {
      // ARRL/RAC section - just normalize to uppercase
      // Full validation would require a list of valid sections
      if (normalized.length >= 2 && normalized.length <= 4) {
        return normalized;
      }
      return null;
    }

    case "NONE":
      return null;

    default:
      return null;
  }
}

// ============================================================================
// Multiplier Extraction from QSO
// ============================================================================

/**
 * Extract a single multiplier from QSO based on rule
 *
 * @param qso - QSO draft with callsign and exchange
 * @param rule - Multiplier rule to apply
 * @returns Extracted multiplier or null if not found
 */
function extractSingleMultiplier(
  qso: ContestQSODraft,
  rule: MultiplierRule,
): ExtractedMultiplier | null {
  let sourceValue: string;

  if (rule.source === "callsign") {
    sourceValue = qso.callsign;
  } else {
    // source === "exchange"
    // Use the full exchange received string
    sourceValue = qso.exchangeRcvd;

    // Also check parsed exchange fields for the specific type
    // e.g., for CQ_ZONE, check parsedExchange.zone
    const fieldMap: Record<MultiplierType, string[]> = {
      CQ_ZONE: ["zone", "cq_zone", "cqzone"],
      ITU_ZONE: ["itu_zone", "ituzone", "zone"],
      STATE: ["state", "st"],
      PROVINCE: ["province", "prov"],
      GRID: ["grid", "locator"],
      GRID_SQUARE: ["grid", "locator", "grid_square"],
      COUNTY: ["county", "cnty"],
      SECTION: ["section", "sect", "sec"],
      DXCC: [],
      WPX_PREFIX: [],
      NONE: [],
    };

    const possibleFields = fieldMap[rule.type] || [];
    for (const field of possibleFields) {
      if (qso.parsedExchange[field]) {
        sourceValue = qso.parsedExchange[field];
        break;
      }
    }
  }

  // Extract the multiplier value
  const value = extractMultiplierValue(sourceValue, rule.type, rule.source);

  if (!value) {
    return null;
  }

  const mult: ExtractedMultiplier = {
    type: rule.type,
    value,
    source: rule.source,
    rule,
  };

  // Add band key if multiplier is per-band
  if (rule.perBand) {
    mult.bandKey = qso.band.toLowerCase().trim();
  }

  return mult;
}

/**
 * Extract all multipliers from a QSO based on contest rules
 *
 * Applies all MultiplierRules from the contest definition to extract
 * multiplier values from the QSO's callsign and exchange fields.
 *
 * @param qso - QSO draft to extract multipliers from
 * @param contest - Contest definition with multiplier rules
 * @returns Array of extracted multipliers (normalized, uppercase)
 *
 * @example
 * ```ts
 * // For CQWW with zone and DXCC multipliers:
 * const qso = {
 *   callsign: "DL2ABC",
 *   exchangeRcvd: "599 14",
 *   parsedExchange: { zone: "14" },
 *   band: "20m",
 *   // ... other fields
 * };
 *
 * extractMultipliers(qso, cqwwContest)
 * // Returns: [
 * //   { type: "CQ_ZONE", value: "14", bandKey: "20m", source: "exchange" },
 * //   { type: "DXCC", value: "DL", bandKey: "20m", source: "callsign" }
 * // ]
 * ```
 */
export function extractMultipliers(
  qso: ContestQSODraft,
  contest: ContestDefinition,
): ExtractedMultiplier[] {
  // Get effective multiplier rules (vNext or legacy fallback)
  const rules = getEffectiveMultiplierRules(contest);

  const multipliers: ExtractedMultiplier[] = [];

  for (const rule of rules) {
    const mult = extractSingleMultiplier(qso, rule);
    if (mult) {
      multipliers.push(mult);
    }
  }

  return multipliers;
}

// ============================================================================
// Multiplier Status Checking
// ============================================================================

/**
 * Generate a unique key for a multiplier (for tracking worked mults)
 *
 * @param mult - Extracted multiplier
 * @returns Unique key string
 *
 * @example
 * ```ts
 * generateMultKey({ type: "CQ_ZONE", value: "14", bandKey: "20m" })
 * // Returns: "CQ_ZONE|14|20m"
 *
 * generateMultKey({ type: "DXCC", value: "DL" })
 * // Returns: "DXCC|DL"
 * ```
 */
export function generateMultKey(mult: ExtractedMultiplier): string {
  if (mult.bandKey) {
    return `${mult.type}|${mult.value}|${mult.bandKey}`;
  }
  return `${mult.type}|${mult.value}`;
}

/**
 * Check if a multiplier is new (not previously worked)
 *
 * @param mult - Extracted multiplier to check
 * @param workedMults - Map of worked multipliers (type -> Set<value or value|band>)
 * @returns True if this is a new multiplier
 *
 * @example
 * ```ts
 * const worked = new Map([
 *   ["CQ_ZONE", new Set(["05|20m", "14|20m"])],
 *   ["DXCC", new Set(["K|20m", "DL|20m"])]
 * ]);
 *
 * isNewMultiplier({ type: "CQ_ZONE", value: "14", bandKey: "40m" }, worked)
 * // Returns: true (14 on 40m is new, only had 14 on 20m)
 *
 * isNewMultiplier({ type: "CQ_ZONE", value: "14", bandKey: "20m" }, worked)
 * // Returns: false (already worked 14 on 20m)
 * ```
 */
export function isNewMultiplier(
  mult: ExtractedMultiplier,
  workedMults: Map<string, Set<string>>,
): boolean {
  const typeSet = workedMults.get(mult.type);

  if (!typeSet) {
    // Type not seen yet, definitely new
    return true;
  }

  // Generate the key to check
  const keyToCheck = mult.bandKey
    ? `${mult.value}|${mult.bandKey}`
    : mult.value;

  return !typeSet.has(keyToCheck);
}

/**
 * Mark multipliers with isNew status based on worked mults tracking
 *
 * @param multipliers - Array of extracted multipliers
 * @param workedMults - Map of worked multipliers (type -> Set<value or value|band>)
 * @returns Same array with isNew field populated
 */
export function markNewMultipliers(
  multipliers: ExtractedMultiplier[],
  workedMults: Map<string, Set<string>>,
): ExtractedMultiplier[] {
  return multipliers.map((mult) => ({
    ...mult,
    isNew: isNewMultiplier(mult, workedMults),
  }));
}

/**
 * Add a multiplier to the worked mults tracking
 *
 * @param mult - Multiplier to add
 * @param workedMults - Map of worked multipliers to update
 */
export function addToWorkedMults(
  mult: ExtractedMultiplier,
  workedMults: Map<string, Set<string>>,
): void {
  let typeSet = workedMults.get(mult.type);

  if (!typeSet) {
    typeSet = new Set();
    workedMults.set(mult.type, typeSet);
  }

  const keyToAdd = mult.bandKey ? `${mult.value}|${mult.bandKey}` : mult.value;
  typeSet.add(keyToAdd);
}

/**
 * Count total unique multipliers from worked mults tracking
 *
 * @param workedMults - Map of worked multipliers
 * @returns Total count of unique multipliers
 */
export function countTotalMultipliers(
  workedMults: Map<string, Set<string>>,
): number {
  let total = 0;
  for (const typeSet of workedMults.values()) {
    total += typeSet.size;
  }
  return total;
}
