/**
 * Call History Import and Management for SCP (Super Check Partial)
 *
 * Provides functionality to import, store, and query call history data
 * from various formats to enhance SCP suggestions during contests.
 *
 * Supported formats:
 * - Simple CSV (CALL, EXCHANGE columns)
 * - N1MM call history format (subset of fields)
 *
 * @module lib/contest/callHistory
 */

import type { ContestSession } from "@/stores/contestStore";
import { buildSCPIndex } from "./scp";

// ============================================================================
// Types
// ============================================================================

/**
 * Entry in the call history database
 */
export interface CallHistoryEntry {
  /** Callsign (required, normalized to uppercase) */
  callsign: string;
  /** Exchange data (e.g., zone, serial) */
  exchange?: string;
  /** Operator name */
  name?: string;
  /** ARRL/RAC section (for sweepstakes-type contests) */
  section?: string;
  /** CQ zone number */
  zone?: string;
  /** State abbreviation */
  state?: string;
  /** Grid square locator */
  grid?: string;
  /** Club affiliation */
  club?: string;
  /** Number of times this call has been worked historically */
  timesWorked?: number;
  /** Last contest where this call was worked */
  lastContest?: string;
  /** Import timestamp */
  importedAt?: string;
}

/**
 * Stored call history data with versioning
 */
export interface CallHistoryStore {
  /** Schema version for migrations */
  version: number;
  /** Timestamp of last update */
  updatedAt: string;
  /** Total entry count */
  count: number;
  /** Call history entries indexed by callsign */
  entries: Record<string, CallHistoryEntry>;
}

/**
 * Result of parsing a call history file
 */
export interface ParseResult {
  /** Successfully parsed entries */
  entries: CallHistoryEntry[];
  /** Number of lines that failed to parse */
  errorCount: number;
  /** Detected format */
  format: "csv" | "n1mm" | "unknown";
  /** Sample of error messages for debugging */
  errors: string[];
}

/**
 * Options for merging history with SCP
 */
export interface MergeOptions {
  /** Maximum number of results to return */
  maxResults?: number;
  /** Prioritize history entries over session entries */
  prioritizeHistory?: boolean;
  /** Filter by specific contest type (optional) */
  contestType?: string;
}

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY = "propulse-call-history";
const CURRENT_VERSION = 1;
const MAX_PARSE_ERRORS = 10;

// N1MM call history field mappings
const N1MM_FIELD_MAP: Record<string, keyof CallHistoryEntry> = {
  call: "callsign",
  name: "name",
  exch1: "exchange",
  sect: "section",
  state: "state",
  cqzone: "zone",
  grid: "grid",
  club: "club",
};

// ============================================================================
// Parsing Functions
// ============================================================================

/**
 * Detect the format of a call history file
 *
 * @param content - Raw file content
 * @returns Detected format type
 */
export function detectFormat(content: string): "csv" | "n1mm" | "unknown" {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length === 0) {
    return "unknown";
  }

  const firstLine = lines[0].toLowerCase();

  // N1MM format typically has specific headers
  if (
    firstLine.includes("!!order!!") ||
    (firstLine.includes("call") &&
      (firstLine.includes("sect") ||
        firstLine.includes("cqzone") ||
        firstLine.includes("exch1")))
  ) {
    return "n1mm";
  }

  // Simple CSV with CALL header
  if (
    firstLine.includes("call") &&
    (firstLine.includes(",") || firstLine.includes("\t"))
  ) {
    return "csv";
  }

  // Check if it looks like comma-separated data
  if (lines.every((line) => line.includes(",") || line.trim() === "")) {
    return "csv";
  }

  return "unknown";
}

/**
 * Parse a simple CSV call history file
 *
 * Expects format with at minimum a CALL column.
 * Optional columns: EXCHANGE, NAME, SECTION, ZONE, STATE
 *
 * @param content - Raw CSV content
 * @returns Parsed entries with metadata
 *
 * @example
 * ```ts
 * const result = parseCSVCallHistory("CALL,EXCHANGE\nW1AW,599\nK3LR,599");
 * // result.entries = [
 * //   { callsign: "W1AW", exchange: "599" },
 * //   { callsign: "K3LR", exchange: "599" }
 * // ]
 * ```
 */
export function parseCSVCallHistory(content: string): ParseResult {
  const lines = content.trim().split(/\r?\n/);
  const entries: CallHistoryEntry[] = [];
  const errors: string[] = [];
  let errorCount = 0;

  if (lines.length === 0) {
    return { entries: [], errorCount: 0, format: "csv", errors: [] };
  }

  // Parse header row
  const headerLine = lines[0];
  const delimiter = headerLine.includes("\t") ? "\t" : ",";
  const headers = headerLine
    .split(delimiter)
    .map((h) => h.trim().toLowerCase());

  // Find column indices
  const callIndex = headers.findIndex(
    (h) => h === "call" || h === "callsign" || h === "call sign",
  );
  const exchangeIndex = headers.findIndex(
    (h) => h === "exchange" || h === "exch" || h === "exch1",
  );
  const nameIndex = headers.findIndex((h) => h === "name" || h === "op");
  const sectionIndex = headers.findIndex(
    (h) => h === "section" || h === "sect" || h === "arrl_sect",
  );
  const zoneIndex = headers.findIndex(
    (h) => h === "zone" || h === "cqzone" || h === "cq_zone",
  );
  const stateIndex = headers.findIndex(
    (h) => h === "state" || h === "st" || h === "sp",
  );

  if (callIndex === -1) {
    return {
      entries: [],
      errorCount: 1,
      format: "csv",
      errors: ["No CALL column found in header"],
    };
  }

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const fields = parseCSVLine(line, delimiter);
    const callsign = fields[callIndex]?.trim().toUpperCase();

    if (!callsign || !isValidCallsign(callsign)) {
      errorCount++;
      if (errors.length < MAX_PARSE_ERRORS) {
        errors.push(`Line ${i + 1}: Invalid callsign "${fields[callIndex]}"`);
      }
      continue;
    }

    const entry: CallHistoryEntry = {
      callsign,
      importedAt: new Date().toISOString(),
    };

    if (exchangeIndex !== -1 && fields[exchangeIndex]) {
      entry.exchange = fields[exchangeIndex].trim();
    }
    if (nameIndex !== -1 && fields[nameIndex]) {
      entry.name = fields[nameIndex].trim();
    }
    if (sectionIndex !== -1 && fields[sectionIndex]) {
      entry.section = fields[sectionIndex].trim().toUpperCase();
    }
    if (zoneIndex !== -1 && fields[zoneIndex]) {
      entry.zone = fields[zoneIndex].trim();
    }
    if (stateIndex !== -1 && fields[stateIndex]) {
      entry.state = fields[stateIndex].trim().toUpperCase();
    }

    entries.push(entry);
  }

  return { entries, errorCount, format: "csv", errors };
}

/**
 * Parse a CSV line handling quoted fields
 */
function parseCSVLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  fields.push(current);
  return fields;
}

/**
 * Parse an N1MM call history file
 *
 * Supports the N1MM Logger+ call history format with field mapping.
 * Handles both tab-delimited and comma-delimited variants.
 *
 * @param content - Raw N1MM call history content
 * @returns Parsed entries with metadata
 *
 * @example
 * ```ts
 * const result = parseN1MMCallHistory("!!Order!!,Call,Name,Sect\nW1AW,ARRL,CT");
 * // result.entries = [{ callsign: "W1AW", name: "ARRL", section: "CT" }]
 * ```
 */
export function parseN1MMCallHistory(content: string): ParseResult {
  const lines = content.trim().split(/\r?\n/);
  const entries: CallHistoryEntry[] = [];
  const errors: string[] = [];
  let errorCount = 0;

  if (lines.length === 0) {
    return { entries: [], errorCount: 0, format: "n1mm", errors: [] };
  }

  // Find and parse header row
  const headerIndex = 0;
  const headerLine = lines[0];

  // Determine delimiter
  const delimiter = headerLine.includes("\t") ? "\t" : ",";
  const rawHeaders = headerLine.split(delimiter);

  // Map headers to field indices, handling !!Order!! prefix
  const headers = rawHeaders.map((h) =>
    h
      .trim()
      .toLowerCase()
      .replace(/^!!order!!,?/i, ""),
  );

  // Define field indices for parseable columns
  type ParseableField =
    | "callsign"
    | "exchange"
    | "name"
    | "section"
    | "zone"
    | "state"
    | "grid"
    | "club";
  const fieldIndices: Record<ParseableField, number> = {
    callsign: -1,
    exchange: -1,
    name: -1,
    section: -1,
    zone: -1,
    state: -1,
    grid: -1,
    club: -1,
  };

  // Map N1MM field names to our field indices
  headers.forEach((header, index) => {
    const cleanHeader = header.replace(/^!!order!!,?/i, "").trim();
    const mappedField = N1MM_FIELD_MAP[cleanHeader] as
      | ParseableField
      | undefined;
    if (mappedField && mappedField in fieldIndices) {
      fieldIndices[mappedField] = index;
    }
  });

  // Ensure we have a call column
  if (fieldIndices.callsign === -1) {
    return {
      entries: [],
      errorCount: 1,
      format: "n1mm",
      errors: ["No Call column found in N1MM file header"],
    };
  }

  // Parse data rows
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("#")) continue;

    const fields = line.split(delimiter);
    const callsign = fields[fieldIndices.callsign]?.trim().toUpperCase();

    if (!callsign || !isValidCallsign(callsign)) {
      errorCount++;
      if (errors.length < MAX_PARSE_ERRORS) {
        errors.push(
          `Line ${i + 1}: Invalid callsign "${fields[fieldIndices.callsign]}"`,
        );
      }
      continue;
    }

    const entry: CallHistoryEntry = {
      callsign,
      importedAt: new Date().toISOString(),
    };

    // Map all available fields
    if (fieldIndices.exchange !== -1 && fields[fieldIndices.exchange]) {
      entry.exchange = fields[fieldIndices.exchange].trim();
    }
    if (fieldIndices.name !== -1 && fields[fieldIndices.name]) {
      entry.name = fields[fieldIndices.name].trim();
    }
    if (fieldIndices.section !== -1 && fields[fieldIndices.section]) {
      entry.section = fields[fieldIndices.section].trim().toUpperCase();
    }
    if (fieldIndices.zone !== -1 && fields[fieldIndices.zone]) {
      entry.zone = fields[fieldIndices.zone].trim();
    }
    if (fieldIndices.state !== -1 && fields[fieldIndices.state]) {
      entry.state = fields[fieldIndices.state].trim().toUpperCase();
    }
    if (fieldIndices.grid !== -1 && fields[fieldIndices.grid]) {
      entry.grid = fields[fieldIndices.grid].trim().toUpperCase();
    }
    if (fieldIndices.club !== -1 && fields[fieldIndices.club]) {
      entry.club = fields[fieldIndices.club].trim();
    }

    entries.push(entry);
  }

  return { entries, errorCount, format: "n1mm", errors };
}

/**
 * Auto-detect format and parse call history content
 *
 * @param content - Raw file content
 * @returns Parsed entries with detected format
 */
export function parseCallHistory(content: string): ParseResult {
  const format = detectFormat(content);

  switch (format) {
    case "n1mm":
      return parseN1MMCallHistory(content);
    case "csv":
      return parseCSVCallHistory(content);
    default:
      // Try CSV as fallback
      return parseCSVCallHistory(content);
  }
}

// ============================================================================
// Storage Functions
// ============================================================================

/**
 * Save call history entries to localStorage
 *
 * Merges new entries with existing data, updating entries with the same callsign.
 *
 * @param entries - Call history entries to save
 * @param clearExisting - If true, replaces all existing entries
 */
export function saveCallHistory(
  entries: CallHistoryEntry[],
  clearExisting = false,
): void {
  let store: CallHistoryStore;

  if (clearExisting) {
    store = {
      version: CURRENT_VERSION,
      updatedAt: new Date().toISOString(),
      count: 0,
      entries: {},
    };
  } else {
    store = loadCallHistoryStore();
  }

  // Merge entries
  for (const entry of entries) {
    const existing = store.entries[entry.callsign];
    if (existing) {
      // Merge, keeping existing data and updating with new
      store.entries[entry.callsign] = {
        ...existing,
        ...entry,
        timesWorked: (existing.timesWorked || 0) + 1,
      };
    } else {
      store.entries[entry.callsign] = {
        ...entry,
        timesWorked: 1,
      };
    }
  }

  store.count = Object.keys(store.entries).length;
  store.updatedAt = new Date().toISOString();

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Handle quota exceeded - could implement LRU eviction in future
    throw new Error("Failed to save call history: storage quota exceeded");
  }
}

/**
 * Load the raw call history store from localStorage
 */
function loadCallHistoryStore(): CallHistoryStore {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) {
      return {
        version: CURRENT_VERSION,
        updatedAt: new Date().toISOString(),
        count: 0,
        entries: {},
      };
    }

    const store = JSON.parse(data) as CallHistoryStore;

    // Handle version migrations if needed
    if (store.version < CURRENT_VERSION) {
      return migrateStore(store);
    }

    return store;
  } catch {
    return {
      version: CURRENT_VERSION,
      updatedAt: new Date().toISOString(),
      count: 0,
      entries: {},
    };
  }
}

/**
 * Migrate store to current version
 */
function migrateStore(store: CallHistoryStore): CallHistoryStore {
  // Currently at v1, no migrations needed
  return {
    ...store,
    version: CURRENT_VERSION,
  };
}

/**
 * Load call history entries as an array
 *
 * @returns Array of call history entries
 */
export function loadCallHistory(): CallHistoryEntry[] {
  const store = loadCallHistoryStore();
  return Object.values(store.entries);
}

/**
 * Get call history metadata
 *
 * @returns Object with count and last update time
 */
export function getCallHistoryStats(): {
  count: number;
  updatedAt: string | null;
} {
  const store = loadCallHistoryStore();
  return {
    count: store.count,
    updatedAt: store.count > 0 ? store.updatedAt : null,
  };
}

/**
 * Clear all call history data
 */
export function clearCallHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Get a specific entry from call history
 *
 * @param callsign - Callsign to look up
 * @returns Entry if found, undefined otherwise
 */
export function getCallHistoryEntry(
  callsign: string,
): CallHistoryEntry | undefined {
  const store = loadCallHistoryStore();
  return store.entries[callsign.toUpperCase()];
}

// ============================================================================
// SCP Integration
// ============================================================================

/**
 * Merge call history with SCP matches for enhanced suggestions
 *
 * Combines session history with imported call history, prioritizing based on:
 * 1. Session matches (already worked in current contest)
 * 2. History matches with high frequency
 * 3. Other history matches
 *
 * @param partial - Partial callsign to match
 * @param session - Current contest session
 * @param options - Merge options
 * @returns Array of matching callsigns, prioritized
 *
 * @example
 * ```ts
 * const matches = mergeWithSCP("K3", session, { maxResults: 10 });
 * // Returns: ["K3LR", "K3WW", ...] with session matches first
 * ```
 */
export function mergeWithSCP(
  partial: string,
  session: ContestSession | null,
  options: MergeOptions = {},
): string[] {
  const { maxResults = 15, prioritizeHistory = false } = options;

  if (!partial || partial.length < 2) {
    return [];
  }

  const normalizedPartial = partial.toUpperCase();
  const results: Array<{ callsign: string; score: number; source: string }> =
    [];
  const seen = new Set<string>();

  // Get session SCP matches
  if (session) {
    const sessionIndex = buildSCPIndex(session);
    for (const entry of sessionIndex.values()) {
      if (matchesPartial(entry.callsign, normalizedPartial)) {
        seen.add(entry.callsign);
        results.push({
          callsign: entry.callsign,
          // Session matches get high score, boosted by times worked
          score: prioritizeHistory ? 50 : 100 + entry.timesWorked * 10,
          source: "session",
        });
      }
    }
  }

  // Get history matches
  const store = loadCallHistoryStore();
  for (const entry of Object.values(store.entries)) {
    if (seen.has(entry.callsign)) continue;

    if (matchesPartial(entry.callsign, normalizedPartial)) {
      seen.add(entry.callsign);
      results.push({
        callsign: entry.callsign,
        // History score based on times worked
        score: prioritizeHistory
          ? 100 + (entry.timesWorked || 1) * 5
          : 50 + (entry.timesWorked || 1) * 2,
        source: "history",
      });
    }
  }

  // Sort by score descending, then alphabetically
  results.sort((a, b) => {
    if (a.score !== b.score) {
      return b.score - a.score;
    }
    return a.callsign.localeCompare(b.callsign);
  });

  return results.slice(0, maxResults).map((r) => r.callsign);
}

/**
 * Get enhanced SCP match with exchange hint from history
 *
 * Returns the match along with any stored exchange data that might help
 * pre-fill fields during logging.
 *
 * @param callsign - Full or partial callsign
 * @param session - Current contest session
 * @returns Match with exchange hint if available
 */
export function getSCPMatchWithExchange(
  callsign: string,
  session: ContestSession | null,
): { callsign: string; exchangeHint?: string; source: string } | null {
  const normalized = callsign.toUpperCase();

  // Check session first
  if (session) {
    const qso = session.qsos.find(
      (q) => q.callsign.toUpperCase() === normalized,
    );
    if (qso) {
      return {
        callsign: qso.callsign,
        exchangeHint: qso.exchangeReceived,
        source: "session",
      };
    }
  }

  // Check history
  const entry = getCallHistoryEntry(normalized);
  if (entry) {
    return {
      callsign: entry.callsign,
      exchangeHint: entry.exchange || entry.section || entry.zone,
      source: "history",
    };
  }

  return null;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a callsign matches a partial (prefix, suffix, or contains)
 */
function matchesPartial(callsign: string, partial: string): boolean {
  return (
    callsign.startsWith(partial) ||
    callsign.endsWith(partial) ||
    callsign.includes(partial)
  );
}

/**
 * Basic callsign validation
 *
 * Checks for reasonable callsign format without being overly strict.
 */
function isValidCallsign(callsign: string): boolean {
  if (!callsign || callsign.length < 3 || callsign.length > 15) {
    return false;
  }

  // Must contain at least one letter and one number
  const hasLetter = /[A-Z]/.test(callsign);
  const hasNumber = /[0-9]/.test(callsign);

  // Allow only alphanumeric and /
  const validChars = /^[A-Z0-9/]+$/.test(callsign);

  return hasLetter && hasNumber && validChars;
}
