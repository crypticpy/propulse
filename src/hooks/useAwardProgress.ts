/**
 * useAwardProgress - Computes award tracking progress from logbook data
 *
 * Derives WAS (Worked All States), WAZ (Worked All Zones), and DXCC
 * progress from logbook entries for use in map overlays and dashboards.
 */

import { useMemo } from "react";
import type { LogEntry } from "@/lib/db/types";
import { useLogbook } from "@/hooks/useLogbook";
import { lookupEntity } from "@/lib/data/dxccEntities";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AwardEntityStatus {
  worked: boolean;
  confirmed: boolean;
  count: number;
  bands: string[];
}

export interface AwardProgress {
  /** WAS: keyed by 2-letter state abbreviation (e.g., "CA", "TX") */
  wasStates: Map<string, AwardEntityStatus>;
  wasWorkedCount: number;
  wasConfirmedCount: number;

  /** WAZ: keyed by CQ zone number (1-40) */
  wazZones: Map<number, AwardEntityStatus>;
  wazWorkedCount: number;
  wazConfirmedCount: number;

  /** DXCC: keyed by entity ID */
  dxccEntities: Map<number, AwardEntityStatus>;
  dxccWorkedCount: number;
  dxccConfirmedCount: number;

  /** Loading state */
  isLoading: boolean;
}

// ─── US States ──────────────────────────────────────────────────────────────

const US_STATES: Record<string, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
};

/** Reverse lookup: state full name → 2-letter abbreviation */
export const STATE_NAME_TO_ABBR = new Map<string, string>(
  Object.entries(US_STATES).map(([abbr, name]) => [name, abbr]),
);

/** Pre-compiled state abbreviation patterns for efficient matching */
const STATE_PATTERNS: Array<{
  abbr: string;
  abbrRegex: RegExp;
  nameRegex: RegExp;
}> = Object.entries(US_STATES).map(([abbr, name]) => ({
  abbr,
  abbrRegex: new RegExp(`\\b${abbr}\\b`, "i"),
  nameRegex: new RegExp(
    `\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
    "i",
  ),
}));

// ─── Helper Functions ───────────────────────────────────────────────────────

/**
 * Check if an entry is confirmed via LoTW, QSL card, or eQSL
 */
function isConfirmed(entry: LogEntry): boolean {
  return entry.lotw === true || entry.qslRcvd === "Y" || entry.eqsl === true;
}

/**
 * Extract US state from a log entry.
 * Checks QTH field, then notes field for 2-letter state abbreviations
 * or full state names using word-boundary matching.
 */
function extractUSState(entry: LogEntry): string | null {
  if (entry.qth) {
    const qth = entry.qth;
    for (const { abbr, abbrRegex, nameRegex } of STATE_PATTERNS) {
      if (abbrRegex.test(qth) || nameRegex.test(qth)) {
        return abbr;
      }
    }
  }

  if (entry.notes) {
    const notes = entry.notes;
    for (const { abbr, abbrRegex, nameRegex } of STATE_PATTERNS) {
      if (abbrRegex.test(notes) || nameRegex.test(notes)) {
        return abbr;
      }
    }
  }

  return null;
}

/**
 * Merge a QSO into an accumulator map.
 * Updates worked/confirmed status, increments count, and tracks bands.
 */
function mergeStatus(
  map: Map<
    string | number,
    { confirmed: boolean; count: number; bands: Set<string> }
  >,
  key: string | number,
  confirmed: boolean,
  band: string,
): void {
  const existing = map.get(key);
  if (existing) {
    existing.count++;
    if (confirmed) existing.confirmed = true;
    if (band) existing.bands.add(band);
  } else {
    map.set(key, {
      confirmed,
      count: 1,
      bands: new Set(band ? [band] : []),
    });
  }
}

/**
 * Convert an internal accumulator map to the public AwardEntityStatus map.
 */
function toStatusMap<K extends string | number>(
  acc: Map<K, { confirmed: boolean; count: number; bands: Set<string> }>,
): Map<K, AwardEntityStatus> {
  const result = new Map<K, AwardEntityStatus>();
  for (const [key, value] of acc) {
    result.set(key, {
      worked: true,
      confirmed: value.confirmed,
      count: value.count,
      bands: Array.from(value.bands),
    });
  }
  return result;
}

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * Computes award tracking progress (WAS, WAZ, DXCC) from logbook entries.
 *
 * Uses `useLogbook()` to obtain all QSOs and derives aggregate statistics
 * via `useMemo`. The computation only reruns when the entries array changes.
 *
 * @example
 * ```tsx
 * const { wasStates, dxccEntities, wazZones, isLoading } = useAwardProgress();
 *
 * // Check if California has been worked
 * const caStatus = wasStates.get("CA");
 * if (caStatus?.confirmed) {
 *   console.log("CA confirmed!");
 * }
 * ```
 */
const EMPTY_PROGRESS = {
  wasStates: new Map<string, AwardEntityStatus>(),
  wasWorkedCount: 0,
  wasConfirmedCount: 0,
  wazZones: new Map<number, AwardEntityStatus>(),
  wazWorkedCount: 0,
  wazConfirmedCount: 0,
  dxccEntities: new Map<number, AwardEntityStatus>(),
  dxccWorkedCount: 0,
  dxccConfirmedCount: 0,
};

export function useAwardProgress(enabled = true): AwardProgress {
  const { entries, loading } = useLogbook();

  const progress = useMemo(() => {
    if (!enabled || entries.length === 0) {
      return EMPTY_PROGRESS;
    }

    // Accumulators: key -> { confirmed, count, bands }
    const wasAcc = new Map<
      string,
      { confirmed: boolean; count: number; bands: Set<string> }
    >();
    const wazAcc = new Map<
      number,
      { confirmed: boolean; count: number; bands: Set<string> }
    >();
    const dxccAcc = new Map<
      number,
      { confirmed: boolean; count: number; bands: Set<string> }
    >();

    for (const entry of entries) {
      const confirmed = isConfirmed(entry);
      const band = entry.band;

      // DXCC + CQ Zone via entity lookup
      const result = lookupEntity(entry.callsign);
      if (result) {
        const { entity } = result;

        // DXCC entity
        mergeStatus(dxccAcc, entity.id, confirmed, band);

        // CQ Zone
        if (entity.cqZone >= 1 && entity.cqZone <= 40) {
          mergeStatus(wazAcc, entity.cqZone, confirmed, band);
        }

        // WAS: only for US entities
        if (entity.name === "United States") {
          const state = extractUSState(entry);
          if (state) {
            mergeStatus(wasAcc, state, confirmed, band);
          }
        }
      }
    }

    // Convert accumulators to public maps
    const wasStates = toStatusMap(wasAcc);
    const wazZones = toStatusMap(wazAcc);
    const dxccEntities = toStatusMap(dxccAcc);

    // Count worked/confirmed totals
    let wasConfirmedCount = 0;
    for (const status of wasStates.values()) {
      if (status.confirmed) wasConfirmedCount++;
    }

    let wazConfirmedCount = 0;
    for (const status of wazZones.values()) {
      if (status.confirmed) wazConfirmedCount++;
    }

    let dxccConfirmedCount = 0;
    for (const status of dxccEntities.values()) {
      if (status.confirmed) dxccConfirmedCount++;
    }

    return {
      wasStates,
      wasWorkedCount: wasStates.size,
      wasConfirmedCount,
      wazZones,
      wazWorkedCount: wazZones.size,
      wazConfirmedCount,
      dxccEntities,
      dxccWorkedCount: dxccEntities.size,
      dxccConfirmedCount,
    };
  }, [entries, enabled]);

  return {
    ...progress,
    isLoading: loading,
  };
}
