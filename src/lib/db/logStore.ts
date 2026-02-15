/**
 * CRUD operations for log entries in IndexedDB
 * Provides functions to create, read, update, and delete QSO records
 */

import { getDB } from "./index";
import type { LogEntry } from "./types";
import { generateId, now } from "./utils";

/**
 * Add a new log entry to the database
 * @param entry - Log entry data without id, createdAt, and updatedAt
 * @returns Promise resolving to the generated entry ID
 */
export async function addLogEntry(
  entry: Omit<LogEntry, "id" | "createdAt" | "updatedAt">,
): Promise<string> {
  const db = await getDB();
  const id = generateId();
  const timestamp = now();

  const logEntry: LogEntry = {
    ...entry,
    id,
    callsign: entry.callsign.toUpperCase().trim(),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await db.add("logEntries", logEntry);
  return id;
}

/**
 * Get a single log entry by ID
 * @param id - The entry's unique identifier
 * @returns Promise resolving to the log entry or undefined if not found
 */
export async function getLogEntry(id: string): Promise<LogEntry | undefined> {
  const db = await getDB();
  return db.get("logEntries", id);
}

/**
 * Update an existing log entry
 * @param id - The entry's unique identifier
 * @param updates - Partial log entry with fields to update
 * @throws Error if the entry does not exist
 */
export async function updateLogEntry(
  id: string,
  updates: Partial<Omit<LogEntry, "id" | "createdAt">>,
): Promise<void> {
  const db = await getDB();
  const existing = await db.get("logEntries", id);

  if (!existing) {
    throw new Error(`Log entry with id ${id} not found`);
  }

  const updated: LogEntry = {
    ...existing,
    ...updates,
    id: existing.id, // Prevent id change
    createdAt: existing.createdAt, // Prevent createdAt change
    updatedAt: now(),
  };

  // Normalize callsign if it was updated
  if (updates.callsign) {
    updated.callsign = updates.callsign.toUpperCase().trim();
  }

  await db.put("logEntries", updated);
}

/**
 * Delete a log entry by ID
 * @param id - The entry's unique identifier
 */
export async function deleteLogEntry(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("logEntries", id);
}

/**
 * Get all log entries from the database
 * @returns Promise resolving to array of all log entries
 */
export async function getAllLogEntries(): Promise<LogEntry[]> {
  const db = await getDB();
  return db.getAll("logEntries");
}

/**
 * Get log entries for a specific callsign
 * @param callsign - The callsign to search for (case-insensitive)
 * @returns Promise resolving to matching log entries
 */
export async function getLogEntriesByCallsign(
  callsign: string,
): Promise<LogEntry[]> {
  const db = await getDB();
  const normalizedCallsign = callsign.toUpperCase().trim();
  const index = db.transaction("logEntries").store.index("by-callsign");
  return index.getAll(normalizedCallsign);
}

/**
 * Search log entries by callsign, name, QTH, or notes
 * @param query - Search query string (case-insensitive)
 * @returns Promise resolving to matching log entries
 */
export async function searchLogEntries(query: string): Promise<LogEntry[]> {
  if (!query || query.trim().length === 0) {
    return [];
  }

  const db = await getDB();
  const allEntries = await db.getAll("logEntries");
  const searchTerm = query.toUpperCase().trim();

  return allEntries.filter((entry) => {
    return (
      entry.callsign.toUpperCase().includes(searchTerm) ||
      entry.name?.toUpperCase().includes(searchTerm) ||
      entry.qth?.toUpperCase().includes(searchTerm) ||
      entry.notes?.toUpperCase().includes(searchTerm) ||
      entry.grid?.toUpperCase().includes(searchTerm)
    );
  });
}

/**
 * Get the total count of log entries
 * @returns Promise resolving to the entry count
 */
export async function getLogEntryCount(): Promise<number> {
  const db = await getDB();
  return db.count("logEntries");
}

/**
 * Clear all log entries from the database
 * WARNING: This permanently removes all log data
 */
export async function clearAllLogEntries(): Promise<void> {
  const db = await getDB();
  await db.clear("logEntries");
}

/**
 * Get log entries for a specific date
 * @param date - The date in ISO format (YYYY-MM-DD)
 * @returns Promise resolving to matching log entries
 */
export async function getLogEntriesByDate(date: string): Promise<LogEntry[]> {
  const db = await getDB();
  const index = db.transaction("logEntries").store.index("by-date");
  return index.getAll(date);
}

/**
 * Get log entries for a specific band
 * @param band - The band (e.g., "20m", "40m")
 * @returns Promise resolving to matching log entries
 */
export async function getLogEntriesByBand(band: string): Promise<LogEntry[]> {
  const db = await getDB();
  const normalizedBand = band.toLowerCase().trim();
  const index = db.transaction("logEntries").store.index("by-band");
  return index.getAll(normalizedBand);
}

/**
 * Add multiple log entries in a single transaction
 * @param entries - Array of log entries to add
 * @returns Promise resolving to array of generated IDs
 */
export async function addLogEntries(
  entries: Omit<LogEntry, "id" | "createdAt" | "updatedAt">[],
): Promise<string[]> {
  const db = await getDB();
  const tx = db.transaction("logEntries", "readwrite");
  const ids: string[] = [];

  for (const entry of entries) {
    const id = generateId();
    const timestamp = now();

    const logEntry: LogEntry = {
      ...entry,
      id,
      callsign: entry.callsign.toUpperCase().trim(),
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    tx.store.add(logEntry);
    ids.push(id);
  }

  await tx.done;
  return ids;
}

/**
 * Check if a callsign has been worked before
 * @param callsign - The callsign to check
 * @returns Promise resolving to true if the callsign exists in the log
 */
export async function isCallsignWorked(callsign: string): Promise<boolean> {
  const entries = await getLogEntriesByCallsign(callsign);
  return entries.length > 0;
}

/**
 * Get all bands on which a callsign has been worked
 * @param callsign - The callsign to check
 * @returns Promise resolving to array of band strings
 */
export async function getWorkedBands(callsign: string): Promise<string[]> {
  const entries = await getLogEntriesByCallsign(callsign);
  const bands = new Set(entries.map((entry) => entry.band));
  return Array.from(bands);
}

/**
 * Get all modes on which a callsign has been worked
 * @param callsign - The callsign to check
 * @returns Promise resolving to array of mode strings
 */
export async function getWorkedModes(callsign: string): Promise<string[]> {
  const entries = await getLogEntriesByCallsign(callsign);
  const modes = new Set(entries.map((entry) => entry.mode));
  return Array.from(modes);
}

/**
 * Get paginated log entries sorted by date (newest first)
 * @param offset - Number of entries to skip
 * @param limit - Maximum entries to return
 * @returns Promise resolving to { entries, total }
 */
export async function getLogEntriesPaginated(
  offset: number = 0,
  limit: number = 50,
): Promise<{ entries: LogEntry[]; total: number }> {
  const db = await getDB();
  const total = await db.count("logEntries");
  const allEntries = await db.getAllFromIndex("logEntries", "by-date");
  // Reverse for newest-first, then slice for pagination
  const sorted = allEntries.reverse();
  const entries = sorted.slice(offset, offset + limit);
  return { entries, total };
}

/**
 * Check for duplicate QSO: same callsign + band + mode on same date
 * @param callsign - Callsign to check
 * @param band - Band to check
 * @param mode - Mode to check
 * @param date - Date to check (YYYY-MM-DD)
 * @param excludeId - Optional entry ID to exclude (for edits)
 * @returns Promise resolving to true if a dupe exists
 */
export async function isDuplicateQSO(
  callsign: string,
  band: string,
  mode: string,
  date: string,
  excludeId?: string,
): Promise<boolean> {
  const entries = await getLogEntriesByCallsign(callsign);
  const normalizedBand = band.toLowerCase().trim();
  const normalizedMode = mode.toUpperCase().trim();
  return entries.some(
    (e) =>
      e.band?.toLowerCase().trim() === normalizedBand &&
      e.mode?.toUpperCase().trim() === normalizedMode &&
      e.date === date &&
      e.id !== excludeId,
  );
}

/**
 * Get all unique band+mode combinations worked for a DXCC entity.
 * Uses the by-dxcc index for efficient lookup.
 * @param dxccId - The DXCC entity number
 * @returns Promise resolving to array of { band, mode } slots
 */
export async function getWorkedDxccSlots(
  dxccId: number,
): Promise<{ band: string; mode: string }[]> {
  const db = await getDB();
  const index = db.transaction("logEntries").store.index("by-dxcc");
  const entries = await index.getAll(dxccId);

  // Deduplicate by band+mode combo
  const seen = new Set<string>();
  const slots: { band: string; mode: string }[] = [];

  for (const entry of entries) {
    const key = `${entry.band}|${entry.mode}`;
    if (!seen.has(key)) {
      seen.add(key);
      slots.push({ band: entry.band, mode: entry.mode });
    }
  }

  return slots;
}

/**
 * Batch update QSL status fields across multiple log entries.
 * Efficiently groups updates by entry ID and applies them in a single transaction.
 *
 * @param updates - Array of { id, field, value } objects describing each update
 * @returns Promise resolving to the number of entries successfully updated
 */
export async function updateQslStatuses(
  updates: { id: string; field: string; value: string }[],
): Promise<number> {
  if (updates.length === 0) return 0;

  // Group updates by entry ID
  const grouped = new Map<string, Record<string, unknown>>();
  for (const { id, field, value } of updates) {
    const existing = grouped.get(id) ?? {};
    // Handle boolean fields stored as string "true"/"false"
    if (field === "lotw" || field === "eqsl") {
      existing[field] = value === "true";
    } else {
      existing[field] = value;
    }
    grouped.set(id, existing);
  }

  const db = await getDB();
  const tx = db.transaction("logEntries", "readwrite");
  let updatedCount = 0;

  for (const [id, fields] of grouped) {
    const existing = await tx.store.get(id);
    if (!existing) continue;

    const updated: LogEntry = {
      ...existing,
      ...(fields as Partial<LogEntry>),
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: now(),
    };

    tx.store.put(updated);
    updatedCount++;
  }

  await tx.done;
  return updatedCount;
}

/**
 * Get all log entries for a specific contest session.
 *
 * Performs a full scan of the logEntries store and filters by contestId.
 * No index exists on contestId, so this uses a cursor scan with filter.
 *
 * @param contestId - The contest session ID to filter by
 * @returns Promise resolving to matching log entries
 */
export async function getEntriesByContestId(
  contestId: string,
): Promise<LogEntry[]> {
  const db = await getDB();
  const allEntries = await db.getAll("logEntries");
  return allEntries.filter((entry) => entry.contestId === contestId);
}
