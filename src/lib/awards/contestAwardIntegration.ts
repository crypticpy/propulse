/**
 * Contest Award Integration — Bridge contest QSOs to DXCC/WAS/WAZ award tracking
 *
 * Analyzes contest sessions to determine which QSOs contribute NEW entities,
 * bands, states, or zones toward DXCC, WAS, and WAZ awards. Also provides
 * a merge function to copy contest QSOs into the main logbook.
 *
 * Pure functions — no React dependencies.
 */

import type { ContestSession } from "@/stores/contestStore";
import type { DXCCEntity } from "@/lib/data/dxccEntities";
import { lookupEntity } from "@/lib/data/dxccEntities";
import { getAllLogEntries, addLogEntries } from "@/lib/db/logStore";
import type { LogEntry } from "@/lib/db/types";
import { getDeviceId } from "@/lib/sync/deviceId";

// ─── Types ──────────────────────────────────────────────────────────────────

/** Summary of how a contest session contributed to award progress */
export interface ContestAwardContributions {
  /** DXCC entities that are entirely new (not previously in the main log) */
  newDxccEntities: DXCCEntity[];
  /** Existing DXCC entities worked on a new band during this contest */
  newDxccBands: { entity: DXCCEntity; band: string }[];
  /** US states newly worked during this contest */
  newWasStates: string[];
  /** CQ zones newly worked during this contest */
  newWazZones: number[];
  /** Total non-dupe QSOs in this contest session */
  totalQsos: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Extract US state from a contest QSO's exchange.
 * Looks for 2-letter state abbreviations in the received exchange.
 */
const US_STATE_ABBRS = new Set([
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
]);

function extractStateFromExchange(exchange: string): string | null {
  if (!exchange) return null;
  const tokens = exchange.toUpperCase().trim().split(/\s+/);
  for (const token of tokens) {
    if (US_STATE_ABBRS.has(token)) {
      return token;
    }
  }
  return null;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Compute how a contest session contributes to DXCC, WAS, and WAZ awards.
 *
 * Compares contest QSOs against the existing main logbook to find
 * entities, bands, states, and zones that are NEW from this contest.
 *
 * @param session - The contest session to analyze
 * @param existingEntries - Main logbook entries (pass from cache to avoid re-reading IDB)
 */
export function getContestContributions(
  session: ContestSession,
  existingEntries: LogEntry[],
): ContestAwardContributions {
  // Build existing worked state from the main logbook
  const existingDxccIds = new Set<number>();
  const existingDxccBandKeys = new Set<string>(); // "entityId|band"
  const existingWasStates = new Set<string>();
  const existingWazZones = new Set<number>();

  for (const entry of existingEntries) {
    const result = lookupEntity(entry.callsign);
    if (!result) continue;

    const { entity } = result;
    existingDxccIds.add(entity.id);
    existingDxccBandKeys.add(`${entity.id}|${entry.band.toLowerCase()}`);

    if (entity.cqZone >= 1 && entity.cqZone <= 40) {
      existingWazZones.add(entity.cqZone);
    }

    if (entity.name === "United States" && entry.state) {
      existingWasStates.add(entry.state.toUpperCase());
    }
  }

  // Analyze contest QSOs for new contributions
  const newDxccEntities: DXCCEntity[] = [];
  const newDxccBands: { entity: DXCCEntity; band: string }[] = [];
  const newWasStates: string[] = [];
  const newWazZones: number[] = [];

  // Track what we've already counted from this contest to avoid double-counting
  const seenDxccIds = new Set<number>();
  const seenDxccBandKeys = new Set<string>();
  const seenWasStates = new Set<string>();
  const seenWazZones = new Set<number>();

  let totalQsos = 0;

  for (const qso of session.qsos) {
    // Skip dupes
    if (qso.isDupe) continue;
    totalQsos++;

    const result = lookupEntity(qso.callsign);
    if (!result) continue;

    const { entity } = result;
    const bandKey = `${entity.id}|${qso.band.toLowerCase()}`;

    // New DXCC entity
    if (!existingDxccIds.has(entity.id) && !seenDxccIds.has(entity.id)) {
      seenDxccIds.add(entity.id);
      newDxccEntities.push(entity);
    }

    // New band for an existing DXCC entity
    if (
      existingDxccIds.has(entity.id) &&
      !existingDxccBandKeys.has(bandKey) &&
      !seenDxccBandKeys.has(bandKey)
    ) {
      seenDxccBandKeys.add(bandKey);
      newDxccBands.push({ entity, band: qso.band });
    }

    // New CQ zone
    if (
      entity.cqZone >= 1 &&
      entity.cqZone <= 40 &&
      !existingWazZones.has(entity.cqZone) &&
      !seenWazZones.has(entity.cqZone)
    ) {
      seenWazZones.add(entity.cqZone);
      newWazZones.push(entity.cqZone);
    }

    // New US state (from exchange field)
    if (entity.name === "United States") {
      const state = extractStateFromExchange(qso.exchangeReceived);
      if (state && !existingWasStates.has(state) && !seenWasStates.has(state)) {
        seenWasStates.add(state);
        newWasStates.push(state);
      }
    }
  }

  return {
    newDxccEntities,
    newDxccBands,
    newWasStates,
    newWazZones,
    totalQsos,
  };
}

/**
 * Compute contest contributions by reading existing entries from IndexedDB.
 * Convenience wrapper that handles the async logbook read.
 */
export async function getContestContributionsAsync(
  session: ContestSession,
): Promise<ContestAwardContributions> {
  const existingEntries = await getAllLogEntries();
  return getContestContributions(session, existingEntries);
}

/**
 * Merge contest QSOs into the main logbook as LogEntry records.
 *
 * Each QSO is tagged with the contest session's ID via `contestId`.
 * Skips duplicate QSOs (QSOs marked as isDupe in the contest session).
 *
 * @param session - The contest session whose QSOs to merge
 * @param userId - Not stored on LogEntry, reserved for future sync
 * @returns Array of IDs for the created log entries
 */
export async function mergeContestQsosToLog(
  session: ContestSession,
  _userId: string,
): Promise<string[]> {
  const deviceId = getDeviceId();

  const entries: Omit<LogEntry, "id" | "createdAt" | "updatedAt">[] = [];

  for (const qso of session.qsos) {
    // Skip dupes — they don't count for anything
    if (qso.isDupe) continue;

    // Parse the ISO timestamp from the contest QSO
    const isoTimestamp = qso.timestamp.includes("T")
      ? qso.timestamp
      : new Date(qso.timestamp).toISOString();
    const date = isoTimestamp.slice(0, 10);
    const timeOn = isoTimestamp.slice(11, 16);

    // Resolve DXCC entity for enrichment
    const lookupResult = lookupEntity(qso.callsign);

    const entry: Omit<LogEntry, "id" | "createdAt" | "updatedAt"> = {
      callsign: qso.callsign.toUpperCase().trim(),
      frequency: qso.frequencyKHz ?? 0,
      mode: qso.mode,
      band: qso.band,
      date,
      timeOn,
      rstSent: qso.rstSent || undefined,
      rstRcvd: qso.rstReceived || undefined,
      contestId: session.id,
      stx: qso.serialSent?.toString() || qso.exchangeSent || undefined,
      srx: qso.serialReceived?.toString() || qso.exchangeReceived || undefined,
      stxString: qso.exchangeSent || undefined,
      srxString: qso.exchangeReceived || undefined,
      version: 1,
      lastDeviceId: deviceId,
      // DXCC enrichment
      dxcc: lookupResult?.entity.id,
      country: lookupResult?.entity.name,
      cqZone: lookupResult?.entity.cqZone,
      continent: lookupResult?.entity.continent,
    };

    // Extract state from exchange for US entities
    if (lookupResult?.entity.name === "United States") {
      const state = extractStateFromExchange(qso.exchangeReceived);
      if (state) {
        entry.state = state;
      }
    }

    entries.push(entry);
  }

  if (entries.length === 0) {
    return [];
  }

  return addLogEntries(entries);
}
