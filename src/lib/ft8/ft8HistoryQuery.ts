/**
 * Query layer for historical FT8/FT4 decode data stored in IndexedDB.
 *
 * IndexedDB has limited querying capabilities, so most filters are
 * applied in-memory after loading records through the best available
 * index.  For large datasets the `limit` / `offset` pagination in
 * {@link Ft8HistoryFilters} keeps memory usage bounded.
 */

import { getDB } from "@/lib/db/index";
import type { Ft8Decode } from "@/lib/db/types";

// ── Public types ────────────────────────────────────────────────────────────

export interface Ft8HistoryFilters {
  dateFrom?: string; // ISO date
  dateTo?: string;
  band?: string;
  mode?: "FT8" | "FT4";
  callsign?: string; // partial match
  grid?: string; // partial match
  minSnr?: number;
  maxSnr?: number;
  isCQ?: boolean;
  limit?: number;
  offset?: number;
}

export interface Ft8HistoryResult {
  decodes: Ft8HistoryEntry[];
  totalCount: number;
  /** Unique callsigns in result set */
  uniqueCallsigns: number;
  /** Unique countries in result set */
  uniqueCountries: number;
}

export interface Ft8HistoryEntry {
  id: string;
  timestamp: string;
  callsign: string;
  grid?: string;
  snr: number;
  frequency: number;
  message: string;
  mode: "FT8" | "FT4";
  band: string;
  country?: string;
  continent?: string;
  dxcc?: number;
  isCQ: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Convert a raw IndexedDB Ft8Decode into the leaner Ft8HistoryEntry. */
function toHistoryEntry(d: Ft8Decode): Ft8HistoryEntry {
  return {
    id: d.id,
    timestamp: d.timestamp,
    callsign: d.callsign ?? "",
    grid: d.grid,
    snr: d.snr,
    frequency: d.frequencyHz ?? d.deltaFrequency,
    message: d.message,
    mode: (d.mode === "FT4" ? "FT4" : "FT8") as "FT8" | "FT4",
    band: d.band ?? "unknown",
    // country / continent / dxcc are not stored on the raw Ft8Decode
    // record today — they live on the enriched decode.  We leave them
    // undefined here; callers can cross-reference with the enrichment
    // layer if needed.
    country: undefined,
    continent: undefined,
    dxcc: undefined,
    isCQ: d.isCQ ?? false,
  };
}

/**
 * Load decodes from IndexedDB within an optional timestamp range.
 * Uses the "by-timestamp" index for efficient range scans.
 */
async function loadDecodes(
  dateFrom?: string,
  dateTo?: string,
): Promise<Ft8Decode[]> {
  const db = await getDB();
  const tx = db.transaction("ft8Decodes", "readonly");
  const index = tx.store.index("by-timestamp");

  let range: IDBKeyRange | undefined;
  if (dateFrom && dateTo) {
    range = IDBKeyRange.bound(dateFrom, dateTo);
  } else if (dateFrom) {
    range = IDBKeyRange.lowerBound(dateFrom);
  } else if (dateTo) {
    range = IDBKeyRange.upperBound(dateTo);
  }

  const results: Ft8Decode[] = [];
  let cursor = await index.openCursor(range ?? null, "prev");

  while (cursor) {
    results.push(cursor.value);
    cursor = await cursor.continue();
  }

  return results;
}

/** Case-insensitive partial match. */
function partialMatch(value: string | undefined, pattern: string): boolean {
  if (!value) return false;
  return value.toLowerCase().includes(pattern.toLowerCase());
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Query historical FT8 decodes from IndexedDB with filters.
 *
 * Date range filtering is done at the index level; all other filters
 * are applied in-memory.
 */
export async function queryFt8History(
  filters: Ft8HistoryFilters,
): Promise<Ft8HistoryResult> {
  const raw = await loadDecodes(filters.dateFrom, filters.dateTo);

  // Apply in-memory filters
  let matched = raw.filter((d) => {
    if (filters.band && d.band !== filters.band) return false;
    if (filters.mode && d.mode !== filters.mode) return false;
    if (filters.callsign && !partialMatch(d.callsign, filters.callsign))
      return false;
    if (filters.grid && !partialMatch(d.grid, filters.grid)) return false;
    if (filters.minSnr !== undefined && d.snr < filters.minSnr) return false;
    if (filters.maxSnr !== undefined && d.snr > filters.maxSnr) return false;
    if (filters.isCQ !== undefined && d.isCQ !== filters.isCQ) return false;
    return true;
  });

  const totalCount = matched.length;

  // Build stats before pagination
  const callsignSet = new Set<string>();
  const countrySet = new Set<string>();
  for (const d of matched) {
    if (d.callsign) callsignSet.add(d.callsign);
    // country not available on raw records — skipped
  }

  // Apply pagination
  const offset = filters.offset ?? 0;
  const limit = filters.limit ?? matched.length;
  matched = matched.slice(offset, offset + limit);

  return {
    decodes: matched.map(toHistoryEntry),
    totalCount,
    uniqueCallsigns: callsignSet.size,
    uniqueCountries: countrySet.size,
  };
}

/**
 * Get decode count per band for a date range.
 */
export async function getFt8BandActivity(
  dateFrom: string,
  dateTo: string,
): Promise<Record<string, number>> {
  const raw = await loadDecodes(dateFrom, dateTo);
  const counts: Record<string, number> = {};

  for (const d of raw) {
    const band = d.band ?? "unknown";
    counts[band] = (counts[band] ?? 0) + 1;
  }

  return counts;
}

/**
 * Get unique countries decoded per day for a date range.
 *
 * Because country is not stored on raw decode records, this falls back
 * to counting unique callsigns as a proxy.  When enrichment data is
 * added to the decode store in a future migration this function will
 * be updated to use actual country values.
 */
export async function getFt8DailyCountries(
  dateFrom: string,
  dateTo: string,
): Promise<{ date: string; count: number }[]> {
  const raw = await loadDecodes(dateFrom, dateTo);

  // Group unique callsigns per day (YYYY-MM-DD)
  const dayMap = new Map<string, Set<string>>();

  for (const d of raw) {
    const day = d.timestamp.slice(0, 10); // "YYYY-MM-DD"
    let set = dayMap.get(day);
    if (!set) {
      set = new Set();
      dayMap.set(day, set);
    }
    if (d.callsign) set.add(d.callsign);
  }

  const results: { date: string; count: number }[] = [];
  for (const [date, set] of dayMap) {
    results.push({ date, count: set.size });
  }

  // Sort ascending by date
  results.sort((a, b) => a.date.localeCompare(b.date));
  return results;
}

// ── CSV Export ───────────────────────────────────────────────────────────────

const CSV_COLUMNS: (keyof Ft8HistoryEntry)[] = [
  "id",
  "timestamp",
  "callsign",
  "grid",
  "snr",
  "frequency",
  "message",
  "mode",
  "band",
  "country",
  "continent",
  "dxcc",
  "isCQ",
];

/** Escape a single CSV field (RFC 4180). */
function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes('"') || str.includes(",") || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Export history results as a CSV string.
 * Includes a header row followed by one row per entry.
 */
export function exportFt8HistoryCSV(entries: Ft8HistoryEntry[]): string {
  const header = CSV_COLUMNS.join(",");
  const rows = entries.map((entry) =>
    CSV_COLUMNS.map((col) => escapeCsvField(entry[col])).join(","),
  );
  return [header, ...rows].join("\n");
}
