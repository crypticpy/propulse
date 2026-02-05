/**
 * SCP Database Import - MASTER.SCP and Call History File Parser
 *
 * Provides functionality to import, store, and query the MASTER.SCP database
 * from supercheckpartial.com and call history files into IndexedDB for
 * fast partial callsign matching during contest operation.
 *
 * Supported formats:
 * - MASTER.SCP: one callsign per line, UTF-8
 * - Call history: CSV or pipe-delimited with header row
 *
 * @module lib/contest/scpImport
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Entry from a call history file with optional metadata
 */
export interface CallHistoryImportEntry {
  callsign: string;
  name?: string;
  section?: string;
  state?: string;
  grid?: string;
  club?: string;
}

/**
 * Result from importing an SCP file
 */
export interface SCPImportResult {
  /** Number of callsigns successfully imported */
  imported: number;
  /** Number of lines skipped (comments, blanks, invalid) */
  skipped: number;
  /** Total lines processed */
  totalLines: number;
  /** Sample of skipped entries for debugging */
  skippedSamples: string[];
}

/**
 * Result from importing a call history file
 */
export interface CallHistoryImportResult {
  /** Number of entries successfully imported */
  imported: number;
  /** Number of lines with errors */
  errors: number;
  /** Detected format */
  format: string;
  /** Sample error messages */
  errorMessages: string[];
}

// ============================================================================
// Constants
// ============================================================================

/** IndexedDB database name for SCP data */
const SCP_DB_NAME = "propulse-scp";

/** IndexedDB database version */
const SCP_DB_VERSION = 1;

/** Object store name for SCP callsigns */
const SCP_STORE_NAME = "scp";

/** Maximum number of skipped samples to track */
const MAX_SKIPPED_SAMPLES = 10;

/** Maximum number of error samples to track */
const MAX_ERROR_SAMPLES = 10;

// ============================================================================
// MASTER.SCP Parser
// ============================================================================

/**
 * Parse a MASTER.SCP file and extract callsigns
 *
 * MASTER.SCP format:
 * - One callsign per line
 * - UTF-8 encoding
 * - Comments starting with # are skipped
 * - Blank lines are skipped
 * - Callsigns are uppercase-normalized and trimmed
 *
 * @param fileContent - Raw text content of MASTER.SCP file
 * @returns Array of normalized callsign strings
 *
 * @example
 * ```ts
 * const callsigns = loadSCPFile("# MASTER.SCP\nW1AW\nK3LR\nN1MM\n");
 * // Returns: ["W1AW", "K3LR", "N1MM"]
 * ```
 */
export function loadSCPFile(fileContent: string): string[] {
  const lines = fileContent.split(/\r?\n/);
  const callsigns: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const normalized = trimmed.toUpperCase();

    // Basic validation: must have at least one letter and one number,
    // only alphanumeric and /
    if (isPlausibleCallsign(normalized)) {
      callsigns.push(normalized);
    }
  }

  return callsigns;
}

/**
 * Parse a MASTER.SCP file with detailed result tracking
 *
 * @param fileContent - Raw text content of MASTER.SCP file
 * @returns Import result with counts and skipped samples
 */
export function parseSCPFile(fileContent: string): SCPImportResult {
  const lines = fileContent.split(/\r?\n/);
  const imported: string[] = [];
  const skippedSamples: string[] = [];
  let skipped = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) {
      skipped++;
      continue;
    }

    const normalized = trimmed.toUpperCase();

    if (isPlausibleCallsign(normalized)) {
      imported.push(normalized);
    } else {
      skipped++;
      if (skippedSamples.length < MAX_SKIPPED_SAMPLES) {
        skippedSamples.push(trimmed);
      }
    }
  }

  return {
    imported: imported.length,
    skipped,
    totalLines: lines.length,
    skippedSamples,
  };
}

// ============================================================================
// Call History Parser
// ============================================================================

/**
 * Parse a call history file (CSV or pipe-delimited)
 *
 * Expects a header row with field names. Supported field names:
 * - CALL / CALLSIGN: callsign (required)
 * - NAME: operator name
 * - SECT / SECTION: ARRL/RAC section
 * - STATE / ST / SP: state abbreviation
 * - GRID: Maidenhead grid locator
 * - CLUB: club affiliation
 *
 * @param fileContent - Raw text content of call history file
 * @returns Array of parsed call history entries
 *
 * @example
 * ```ts
 * const entries = loadCallHistoryFile("CALL,NAME,SECTION\nW1AW,ARRL,CT\n");
 * // Returns: [{ callsign: "W1AW", name: "ARRL", section: "CT" }]
 * ```
 */
export function loadCallHistoryFile(
  fileContent: string,
): CallHistoryImportEntry[] {
  const result = parseCallHistoryFile(fileContent);
  return result.entries;
}

/**
 * Parse a call history file with detailed result tracking
 *
 * @param fileContent - Raw text content
 * @returns Import result with entries, error counts, and format detection
 */
export function parseCallHistoryFile(fileContent: string): {
  entries: CallHistoryImportEntry[];
  result: CallHistoryImportResult;
} {
  const lines = fileContent.trim().split(/\r?\n/);
  const entries: CallHistoryImportEntry[] = [];
  const errorMessages: string[] = [];
  let errors = 0;

  if (lines.length === 0) {
    return {
      entries: [],
      result: {
        imported: 0,
        errors: 0,
        format: "unknown",
        errorMessages: [],
      },
    };
  }

  // Detect delimiter
  const headerLine = lines[0];
  const isPipeDelimited = headerLine.includes("|");
  const isTabDelimited = !isPipeDelimited && headerLine.includes("\t");
  const delimiter = isPipeDelimited ? "|" : isTabDelimited ? "\t" : ",";
  const format = isPipeDelimited ? "pipe" : isTabDelimited ? "tab" : "csv";

  // Parse header row
  const headers = headerLine
    .split(delimiter)
    .map((h) => h.trim().toLowerCase());

  // Map header names to indices
  const callIndex = headers.findIndex(
    (h) => h === "call" || h === "callsign" || h === "call sign",
  );
  const nameIndex = headers.findIndex((h) => h === "name" || h === "op");
  const sectionIndex = headers.findIndex(
    (h) =>
      h === "sect" ||
      h === "section" ||
      h === "arrl_sect" ||
      h === "arrl_section",
  );
  const stateIndex = headers.findIndex(
    (h) => h === "state" || h === "st" || h === "sp",
  );
  const gridIndex = headers.findIndex(
    (h) => h === "grid" || h === "gridsquare" || h === "grid_square",
  );
  const clubIndex = headers.findIndex((h) => h === "club");

  if (callIndex === -1) {
    return {
      entries: [],
      result: {
        imported: 0,
        errors: 1,
        format,
        errorMessages: ["No CALL/CALLSIGN column found in header row"],
      },
    };
  }

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const fields = line.split(delimiter).map((f) => f.trim());
    const callsign = fields[callIndex]?.toUpperCase();

    if (!callsign || !isPlausibleCallsign(callsign)) {
      errors++;
      if (errorMessages.length < MAX_ERROR_SAMPLES) {
        errorMessages.push(
          `Line ${i + 1}: Invalid callsign "${fields[callIndex] || ""}"`,
        );
      }
      continue;
    }

    const entry: CallHistoryImportEntry = { callsign };

    if (nameIndex !== -1 && fields[nameIndex]) {
      entry.name = fields[nameIndex];
    }
    if (sectionIndex !== -1 && fields[sectionIndex]) {
      entry.section = fields[sectionIndex].toUpperCase();
    }
    if (stateIndex !== -1 && fields[stateIndex]) {
      entry.state = fields[stateIndex].toUpperCase();
    }
    if (gridIndex !== -1 && fields[gridIndex]) {
      entry.grid = fields[gridIndex].toUpperCase();
    }
    if (clubIndex !== -1 && fields[clubIndex]) {
      entry.club = fields[clubIndex];
    }

    entries.push(entry);
  }

  return {
    entries,
    result: {
      imported: entries.length,
      errors,
      format,
      errorMessages,
    },
  };
}

// ============================================================================
// IndexedDB Storage
// ============================================================================

/**
 * Open or create the SCP IndexedDB database
 *
 * Uses a dedicated database separate from the main propulse DB to avoid
 * version conflicts when importing large SCP datasets.
 */
function openSCPDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SCP_DB_NAME, SCP_DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create the SCP object store with callsign as key
      if (!db.objectStoreNames.contains(SCP_STORE_NAME)) {
        db.createObjectStore(SCP_STORE_NAME);
      }
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      reject(
        new Error(
          `Failed to open SCP database: ${(event.target as IDBOpenDBRequest).error?.message}`,
        ),
      );
    };
  });
}

/**
 * Save an array of callsigns to IndexedDB
 *
 * Uses a single transaction for bulk insert performance.
 * Existing entries are overwritten (upsert behavior).
 *
 * @param callsigns - Array of normalized callsign strings
 *
 * @example
 * ```ts
 * const callsigns = loadSCPFile(fileContent);
 * await saveSCPToIndexedDB(callsigns);
 * console.log(`Saved ${callsigns.length} callsigns`);
 * ```
 */
export async function saveSCPToIndexedDB(callsigns: string[]): Promise<void> {
  const db = await openSCPDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(SCP_STORE_NAME, "readwrite");
    const store = tx.objectStore(SCP_STORE_NAME);

    // Bulk insert: use callsign as both key and value for minimal storage
    // Value is 1 (truthy marker) to minimize storage overhead
    for (const callsign of callsigns) {
      store.put(1, callsign);
    }

    tx.oncomplete = () => {
      db.close();
      resolve();
    };

    tx.onerror = () => {
      db.close();
      reject(new Error(`Failed to save SCP data: ${tx.error?.message}`));
    };
  });
}

/**
 * Load all callsigns from the SCP IndexedDB
 *
 * @returns Array of all stored callsign strings
 */
export async function loadSCPFromIndexedDB(): Promise<string[]> {
  const db = await openSCPDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(SCP_STORE_NAME, "readonly");
    const store = tx.objectStore(SCP_STORE_NAME);
    const request = store.getAllKeys();

    request.onsuccess = () => {
      db.close();
      resolve(request.result as string[]);
    };

    request.onerror = () => {
      db.close();
      reject(new Error(`Failed to load SCP data: ${request.error?.message}`));
    };
  });
}

/**
 * Get the number of callsigns in the SCP IndexedDB
 *
 * @returns Number of stored callsigns
 */
export async function getSCPDatabaseSize(): Promise<number> {
  const db = await openSCPDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(SCP_STORE_NAME, "readonly");
    const store = tx.objectStore(SCP_STORE_NAME);
    const request = store.count();

    request.onsuccess = () => {
      db.close();
      resolve(request.result);
    };

    request.onerror = () => {
      db.close();
      reject(
        new Error(`Failed to count SCP database: ${request.error?.message}`),
      );
    };
  });
}

/**
 * Clear all callsigns from the SCP IndexedDB
 */
export async function clearSCPDatabase(): Promise<void> {
  const db = await openSCPDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(SCP_STORE_NAME, "readwrite");
    const store = tx.objectStore(SCP_STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => {
      db.close();
      resolve();
    };

    request.onerror = () => {
      db.close();
      reject(
        new Error(`Failed to clear SCP database: ${request.error?.message}`),
      );
    };
  });
}

/**
 * Check if a specific callsign exists in the SCP IndexedDB
 *
 * @param callsign - Callsign to check (will be uppercased)
 * @returns True if the callsign exists in the database
 */
export async function isCallInSCPDatabase(callsign: string): Promise<boolean> {
  const db = await openSCPDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(SCP_STORE_NAME, "readonly");
    const store = tx.objectStore(SCP_STORE_NAME);
    const request = store.getKey(callsign.toUpperCase());

    request.onsuccess = () => {
      db.close();
      resolve(request.result !== undefined);
    };

    request.onerror = () => {
      db.close();
      reject(
        new Error(`Failed to check SCP database: ${request.error?.message}`),
      );
    };
  });
}

/**
 * Get SCP matches for a partial callsign from IndexedDB
 *
 * Performs a cursor-based prefix scan for efficient matching.
 * Falls back to full scan for contains/suffix matches.
 *
 * @param partial - Partial callsign prefix (minimum 2 characters)
 * @param maxResults - Maximum number of results to return (default: 20)
 * @returns Array of matching callsigns
 */
export async function getSCPDatabaseMatches(
  partial: string,
  maxResults = 20,
): Promise<string[]> {
  if (!partial || partial.length < 2) {
    return [];
  }

  const normalized = partial.toUpperCase();
  const db = await openSCPDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(SCP_STORE_NAME, "readonly");
    const store = tx.objectStore(SCP_STORE_NAME);
    const matches: string[] = [];

    // Use IDBKeyRange for efficient prefix scan
    // Range from "partial" to "partial" + high unicode char
    const range = IDBKeyRange.bound(
      normalized,
      normalized + "\uffff",
      false,
      true,
    );
    const request = store.openKeyCursor(range);

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor && matches.length < maxResults) {
        const key = cursor.key as string;
        // Verify it's actually a prefix match (IDBKeyRange may include false positives)
        if (key.startsWith(normalized)) {
          matches.push(key);
        }
        cursor.continue();
      } else {
        db.close();
        resolve(matches);
      }
    };

    request.onerror = () => {
      db.close();
      reject(
        new Error(`Failed to search SCP database: ${request.error?.message}`),
      );
    };
  });
}

/**
 * Download and import MASTER.SCP from the API proxy
 *
 * Fetches the file through the edge function at /api/contest/scp
 * and imports all callsigns into IndexedDB.
 *
 * @param onProgress - Optional progress callback (0-100)
 * @returns Import result with counts
 */
export async function downloadAndImportSCP(
  onProgress?: (percent: number) => void,
): Promise<SCPImportResult> {
  onProgress?.(5);

  // Fetch from our edge function proxy
  const response = await fetch("/api/contest/scp");

  if (!response.ok) {
    throw new Error(
      `Failed to download MASTER.SCP: ${response.status} ${response.statusText}`,
    );
  }

  onProgress?.(30);

  const content = await response.text();
  onProgress?.(50);

  // Parse the file
  const callsigns = loadSCPFile(content);
  const result = parseSCPFile(content);

  onProgress?.(60);

  // Clear existing database and import new data
  await clearSCPDatabase();
  onProgress?.(70);

  // Save in batches for better performance with progress tracking
  const batchSize = 10000;
  const totalBatches = Math.ceil(callsigns.length / batchSize);

  for (let i = 0; i < callsigns.length; i += batchSize) {
    const batch = callsigns.slice(i, i + batchSize);
    await saveSCPToIndexedDB(batch);

    const batchNum = Math.floor(i / batchSize) + 1;
    const progress = 70 + Math.round((batchNum / totalBatches) * 28);
    onProgress?.(Math.min(progress, 98));
  }

  onProgress?.(100);

  return result;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check if a string looks like a plausible callsign
 *
 * Looser than full validation - accepts anything with:
 * - At least 3 characters
 * - At most 15 characters (handles portable suffixes like /P, /QRP)
 * - Contains at least one letter and one digit
 * - Only alphanumeric characters and /
 */
function isPlausibleCallsign(callsign: string): boolean {
  if (!callsign || callsign.length < 3 || callsign.length > 15) {
    return false;
  }

  const hasLetter = /[A-Z]/.test(callsign);
  const hasDigit = /[0-9]/.test(callsign);
  const validChars = /^[A-Z0-9/]+$/.test(callsign);

  return hasLetter && hasDigit && validChars;
}
