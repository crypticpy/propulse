/**
 * Award Engine — Compute DXCC / WAS / WAZ progress from log entries
 *
 * Pure functions that derive award progress from an array of LogEntry records.
 * No React dependencies — can be used in hooks, workers, or tests.
 */

import type { LogEntry } from "@/lib/db/types";
import {
  DXCC_ENTITIES,
  lookupEntity,
  type DXCCEntity,
} from "@/lib/data/dxccEntities";
import { US_STATES_DATA, TOTAL_US_STATES } from "./usStateMap";
import type {
  DxccSlot,
  WasState,
  WazZone,
  SlotStatus,
  AwardProgress,
} from "./types";

// ─── Constants ─────────────────────────────────────────────────────────────

const TOTAL_CQ_ZONES = 40;

/** Unique active DXCC entities by ID (deduped since the entity list may have duplicates) */
const UNIQUE_ACTIVE_ENTITIES: DXCCEntity[] = (() => {
  const seen = new Set<number>();
  const result: DXCCEntity[] = [];
  for (const entity of DXCC_ENTITIES) {
    if (entity.isActive && !seen.has(entity.id)) {
      seen.add(entity.id);
      result.push(entity);
    }
  }
  return result;
})();

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Check if a log entry has QSL confirmation */
function isConfirmed(entry: LogEntry): boolean {
  return entry.lotw === true || entry.qslRcvd === "Y" || entry.eqsl === true;
}

/** Derive slot status from worked/confirmed booleans */
function deriveStatus(worked: boolean, confirmed: boolean): SlotStatus {
  if (confirmed) return "confirmed";
  if (worked) return "worked_unconfirmed";
  return "needed";
}

// ─── Internal accumulator types ────────────────────────────────────────────

interface SlotAccumulator {
  confirmed: boolean;
  count: number;
  bands: Set<string>;
  modes: Set<string>;
}

function newAccumulator(): SlotAccumulator {
  return { confirmed: false, count: 0, bands: new Set(), modes: new Set() };
}

function mergeInto(
  acc: SlotAccumulator,
  confirmed: boolean,
  band: string,
  mode: string,
): void {
  acc.count++;
  if (confirmed) acc.confirmed = true;
  if (band) acc.bands.add(band);
  if (mode) acc.modes.add(mode);
}

// ─── US State Extraction ───────────────────────────────────────────────────

/** Pre-compiled regex for each state abbreviation and full name */
const STATE_PATTERNS: Array<{
  abbr: string;
  abbrRegex: RegExp;
  nameRegex: RegExp;
}> = US_STATES_DATA.map((s) => ({
  abbr: s.abbr,
  abbrRegex: new RegExp(`\\b${s.abbr}\\b`, "i"),
  nameRegex: new RegExp(
    `\\b${s.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
    "i",
  ),
}));

/**
 * Extract a US state from a log entry.
 * Priority: entry.state field > qth field > notes field
 */
function extractUSState(entry: LogEntry): string | null {
  // Direct state field (highest priority)
  if (entry.state) {
    const upper = entry.state.toUpperCase().trim();
    if (upper.length === 2) {
      // Validate it's a real state abbreviation
      const found = US_STATES_DATA.find((s) => s.abbr === upper);
      if (found) return found.abbr;
    }
    // Try full name match
    const lower = entry.state.toLowerCase().trim();
    const byName = US_STATES_DATA.find((s) => s.name.toLowerCase() === lower);
    if (byName) return byName.abbr;
  }

  // Fall back to QTH/notes regex scanning
  const fields = [entry.qth, entry.notes].filter(Boolean) as string[];
  for (const text of fields) {
    for (const { abbr, abbrRegex, nameRegex } of STATE_PATTERNS) {
      if (abbrRegex.test(text) || nameRegex.test(text)) {
        return abbr;
      }
    }
  }

  return null;
}

// ─── Filter Options ────────────────────────────────────────────────────────

/** Options to filter award computation by contest or operating mode */
export interface AwardFilterOptions {
  /** When set, only count entries matching this contest session ID */
  contestId?: string;
  /** When set, only count entries with matching mySig (e.g., "POTA", "SOTA") */
  operatingMode?: string;
}

/** Apply filter options to an entry array */
function applyAwardFilters(
  entries: LogEntry[],
  options?: AwardFilterOptions,
): LogEntry[] {
  if (!options) return entries;
  let filtered = entries;
  if (options.contestId) {
    filtered = filtered.filter((e) => e.contestId === options.contestId);
  }
  if (options.operatingMode) {
    const mode = options.operatingMode.toUpperCase();
    filtered = filtered.filter((e) => e.mySig?.toUpperCase() === mode);
  }
  return filtered;
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Compute DXCC award progress from log entries.
 *
 * Returns a slot for every active DXCC entity, with status based on
 * whether the entity has been worked and/or confirmed.
 *
 * @param entries - All log entries to analyze
 * @param options - Optional filter (contestId, operatingMode)
 */
export function computeDxccProgress(
  entries: LogEntry[],
  options?: AwardFilterOptions,
): AwardProgress["dxcc"] {
  entries = applyAwardFilters(entries, options);
  // Build accumulator map: entityId -> accumulator
  const accMap = new Map<number, SlotAccumulator>();

  for (const entry of entries) {
    const result = lookupEntity(entry.callsign);
    if (!result) continue;

    const { entity } = result;
    let acc = accMap.get(entity.id);
    if (!acc) {
      acc = newAccumulator();
      accMap.set(entity.id, acc);
    }
    mergeInto(acc, isConfirmed(entry), entry.band, entry.mode);
  }

  // Build slots for all unique active entities
  let workedCount = 0;
  let confirmedCount = 0;
  const slots: DxccSlot[] = UNIQUE_ACTIVE_ENTITIES.map((entity) => {
    const acc = accMap.get(entity.id);
    const worked = acc !== undefined;
    const confirmed = acc?.confirmed ?? false;
    const status = deriveStatus(worked, confirmed);

    if (worked) workedCount++;
    if (confirmed) confirmedCount++;

    return {
      entityId: entity.id,
      name: entity.name,
      prefix: entity.prefix,
      continent: entity.continent,
      cqZone: entity.cqZone,
      status,
      qsoCount: acc?.count ?? 0,
      bands: acc ? Array.from(acc.bands) : [],
      modes: acc ? Array.from(acc.modes) : [],
    };
  });

  return {
    slots,
    totalEntities: UNIQUE_ACTIVE_ENTITIES.length,
    workedCount,
    confirmedCount,
    neededCount: UNIQUE_ACTIVE_ENTITIES.length - workedCount,
  };
}

/**
 * Compute WAS (Worked All States) progress from log entries.
 *
 * Returns a slot for all 50 US states. Extracts state from the
 * `state` field, `qth` field, or `notes` field.
 *
 * @param entries - All log entries to analyze
 * @param options - Optional filter (contestId, operatingMode)
 */
export function computeWasProgress(
  entries: LogEntry[],
  options?: AwardFilterOptions,
): AwardProgress["was"] {
  entries = applyAwardFilters(entries, options);
  // Build accumulator map: stateAbbr -> accumulator
  const accMap = new Map<string, SlotAccumulator>();

  for (const entry of entries) {
    // Only consider US contacts
    const result = lookupEntity(entry.callsign);
    if (!result) continue;
    if (result.entity.name !== "United States") continue;

    const stateAbbr = extractUSState(entry);
    if (!stateAbbr) continue;

    let acc = accMap.get(stateAbbr);
    if (!acc) {
      acc = newAccumulator();
      accMap.set(stateAbbr, acc);
    }
    mergeInto(acc, isConfirmed(entry), entry.band, entry.mode);
  }

  // Build slots for all 50 states
  let workedCount = 0;
  let confirmedCount = 0;
  const slots: WasState[] = US_STATES_DATA.map((stateData) => {
    const acc = accMap.get(stateData.abbr);
    const worked = acc !== undefined;
    const confirmed = acc?.confirmed ?? false;
    const status = deriveStatus(worked, confirmed);

    if (worked) workedCount++;
    if (confirmed) confirmedCount++;

    return {
      abbr: stateData.abbr,
      name: stateData.name,
      status,
      qsoCount: acc?.count ?? 0,
      bands: acc ? Array.from(acc.bands) : [],
      modes: acc ? Array.from(acc.modes) : [],
    };
  });

  return {
    slots,
    totalStates: TOTAL_US_STATES,
    workedCount,
    confirmedCount,
    neededCount: TOTAL_US_STATES - workedCount,
  };
}

/**
 * Compute WAZ (Worked All Zones) progress from log entries.
 *
 * Returns a slot for all 40 CQ zones based on the DXCC entity
 * CQ zone of each worked callsign.
 *
 * @param entries - All log entries to analyze
 * @param options - Optional filter (contestId, operatingMode)
 */
export function computeWazProgress(
  entries: LogEntry[],
  options?: AwardFilterOptions,
): AwardProgress["waz"] {
  entries = applyAwardFilters(entries, options);
  // Build accumulator map: cqZone -> accumulator
  const accMap = new Map<number, SlotAccumulator>();

  for (const entry of entries) {
    const result = lookupEntity(entry.callsign);
    if (!result) continue;

    const { entity } = result;
    if (entity.cqZone < 1 || entity.cqZone > TOTAL_CQ_ZONES) continue;

    let acc = accMap.get(entity.cqZone);
    if (!acc) {
      acc = newAccumulator();
      accMap.set(entity.cqZone, acc);
    }
    mergeInto(acc, isConfirmed(entry), entry.band, entry.mode);
  }

  // Build slots for all 40 zones
  let workedCount = 0;
  let confirmedCount = 0;
  const slots: WazZone[] = [];

  for (let zone = 1; zone <= TOTAL_CQ_ZONES; zone++) {
    const acc = accMap.get(zone);
    const worked = acc !== undefined;
    const confirmed = acc?.confirmed ?? false;
    const status = deriveStatus(worked, confirmed);

    if (worked) workedCount++;
    if (confirmed) confirmedCount++;

    slots.push({
      zone,
      status,
      qsoCount: acc?.count ?? 0,
      bands: acc ? Array.from(acc.bands) : [],
      modes: acc ? Array.from(acc.modes) : [],
    });
  }

  return {
    slots,
    totalZones: TOTAL_CQ_ZONES,
    workedCount,
    confirmedCount,
    neededCount: TOTAL_CQ_ZONES - workedCount,
  };
}

/**
 * Compute full award progress for all three awards in one pass.
 *
 * This is more efficient than calling each compute function separately
 * because it only iterates entries once for shared entity lookups.
 *
 * @param entries - All log entries to analyze
 * @param options - Optional filter (contestId, operatingMode)
 */
export function computeAllAwardProgress(
  entries: LogEntry[],
  options?: AwardFilterOptions,
): AwardProgress {
  entries = applyAwardFilters(entries, options);
  // Shared accumulators
  const dxccAcc = new Map<number, SlotAccumulator>();
  const wasAcc = new Map<string, SlotAccumulator>();
  const wazAcc = new Map<number, SlotAccumulator>();

  // Single pass over all entries
  for (const entry of entries) {
    const result = lookupEntity(entry.callsign);
    if (!result) continue;

    const { entity } = result;
    const confirmed = isConfirmed(entry);
    const band = entry.band;
    const mode = entry.mode;

    // DXCC
    let dAcc = dxccAcc.get(entity.id);
    if (!dAcc) {
      dAcc = newAccumulator();
      dxccAcc.set(entity.id, dAcc);
    }
    mergeInto(dAcc, confirmed, band, mode);

    // WAZ
    if (entity.cqZone >= 1 && entity.cqZone <= TOTAL_CQ_ZONES) {
      let zAcc = wazAcc.get(entity.cqZone);
      if (!zAcc) {
        zAcc = newAccumulator();
        wazAcc.set(entity.cqZone, zAcc);
      }
      mergeInto(zAcc, confirmed, band, mode);
    }

    // WAS (US entities only)
    if (entity.name === "United States") {
      const stateAbbr = extractUSState(entry);
      if (stateAbbr) {
        let sAcc = wasAcc.get(stateAbbr);
        if (!sAcc) {
          sAcc = newAccumulator();
          wasAcc.set(stateAbbr, sAcc);
        }
        mergeInto(sAcc, confirmed, band, mode);
      }
    }
  }

  // ─── Build DXCC slots ───
  let dxccWorked = 0;
  let dxccConfirmed = 0;
  const dxccSlots: DxccSlot[] = UNIQUE_ACTIVE_ENTITIES.map((entity) => {
    const acc = dxccAcc.get(entity.id);
    const worked = acc !== undefined;
    const conf = acc?.confirmed ?? false;
    if (worked) dxccWorked++;
    if (conf) dxccConfirmed++;
    return {
      entityId: entity.id,
      name: entity.name,
      prefix: entity.prefix,
      continent: entity.continent,
      cqZone: entity.cqZone,
      status: deriveStatus(worked, conf),
      qsoCount: acc?.count ?? 0,
      bands: acc ? Array.from(acc.bands) : [],
      modes: acc ? Array.from(acc.modes) : [],
    };
  });

  // ─── Build WAS slots ───
  let wasWorked = 0;
  let wasConfirmed = 0;
  const wasSlots: WasState[] = US_STATES_DATA.map((stateData) => {
    const acc = wasAcc.get(stateData.abbr);
    const worked = acc !== undefined;
    const conf = acc?.confirmed ?? false;
    if (worked) wasWorked++;
    if (conf) wasConfirmed++;
    return {
      abbr: stateData.abbr,
      name: stateData.name,
      status: deriveStatus(worked, conf),
      qsoCount: acc?.count ?? 0,
      bands: acc ? Array.from(acc.bands) : [],
      modes: acc ? Array.from(acc.modes) : [],
    };
  });

  // ─── Build WAZ slots ───
  let wazWorked = 0;
  let wazConfirmed = 0;
  const wazSlots: WazZone[] = [];
  for (let zone = 1; zone <= TOTAL_CQ_ZONES; zone++) {
    const acc = wazAcc.get(zone);
    const worked = acc !== undefined;
    const conf = acc?.confirmed ?? false;
    if (worked) wazWorked++;
    if (conf) wazConfirmed++;
    wazSlots.push({
      zone,
      status: deriveStatus(worked, conf),
      qsoCount: acc?.count ?? 0,
      bands: acc ? Array.from(acc.bands) : [],
      modes: acc ? Array.from(acc.modes) : [],
    });
  }

  return {
    dxcc: {
      slots: dxccSlots,
      totalEntities: UNIQUE_ACTIVE_ENTITIES.length,
      workedCount: dxccWorked,
      confirmedCount: dxccConfirmed,
      neededCount: UNIQUE_ACTIVE_ENTITIES.length - dxccWorked,
    },
    was: {
      slots: wasSlots,
      totalStates: TOTAL_US_STATES,
      workedCount: wasWorked,
      confirmedCount: wasConfirmed,
      neededCount: TOTAL_US_STATES - wasWorked,
    },
    waz: {
      slots: wazSlots,
      totalZones: TOTAL_CQ_ZONES,
      workedCount: wazWorked,
      confirmedCount: wazConfirmed,
      neededCount: TOTAL_CQ_ZONES - wazWorked,
    },
  };
}
