/**
 * React hook for managing the logbook (QSO records)
 * Provides CRUD operations, ADIF import/export, and callsign lookup utilities
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import type { LogEntry } from "../lib/db/types";
import {
  getAllLogEntries,
  addLogEntry,
  updateLogEntry,
  deleteLogEntry,
  getLogEntriesByCallsign,
  addLogEntries,
} from "../lib/db/logStore";
import { parseADIF, generateADIF } from "../lib/utils/adifParser";

/**
 * Return type for the useLogbook hook
 */
export interface UseLogbookResult {
  /** All log entries */
  entries: LogEntry[];
  /** Loading state */
  loading: boolean;
  /** Error message if any */
  error: string | null;
  /** Add a new log entry */
  addEntry: (
    entry: Omit<LogEntry, "id" | "createdAt" | "updatedAt">,
  ) => Promise<string>;
  /** Update an existing log entry */
  updateEntry: (
    id: string,
    updates: Partial<Omit<LogEntry, "id" | "createdAt">>,
  ) => Promise<void>;
  /** Delete a log entry */
  deleteEntry: (id: string) => Promise<void>;
  /** Import entries from ADIF content */
  importADIF: (content: string) => Promise<number>;
  /** Export all entries to ADIF format */
  exportADIF: () => string;
  /** Check if a callsign has been worked */
  isWorked: (callsign: string) => boolean;
  /** Get all bands on which a callsign has been worked */
  getWorkedBands: (callsign: string) => string[];
  /** Get all modes on which a callsign has been worked */
  getWorkedModes: (callsign: string) => string[];
  /** Refresh entries from database */
  refresh: () => Promise<void>;
  /** Total entry count */
  count: number;
}

/**
 * Hook for managing the logbook
 * Provides state management and CRUD operations for QSO log entries
 *
 * @example
 * ```tsx
 * const { entries, addEntry, importADIF, isWorked } = useLogbook();
 *
 * // Add a new entry
 * await addEntry({
 *   callsign: 'W1ABC',
 *   frequency: 14074,
 *   mode: 'FT8',
 *   band: '20m',
 *   date: '2024-01-31',
 *   timeOn: '12:34',
 * });
 *
 * // Check if worked
 * if (isWorked('W1ABC')) {
 *   console.log('Already worked!');
 * }
 * ```
 */
export function useLogbook(): UseLogbookResult {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Build lookup maps for efficient callsign queries
  const callsignMap = useMemo(() => {
    const map = new Map<string, LogEntry[]>();
    for (const entry of entries) {
      const callsign = entry.callsign.toUpperCase();
      const existing = map.get(callsign) || [];
      existing.push(entry);
      map.set(callsign, existing);
    }
    return map;
  }, [entries]);

  /**
   * Load all entries from the database
   */
  const loadEntries = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const allEntries = await getAllLogEntries();
      // Sort by date descending (newest first)
      allEntries.sort((a, b) => {
        const dateCompare = b.date.localeCompare(a.date);
        if (dateCompare !== 0) return dateCompare;
        return b.timeOn.localeCompare(a.timeOn);
      });
      setEntries(allEntries);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load log entries";
      setError(message);
      console.error("Error loading log entries:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load entries on mount
  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  /**
   * Add a new log entry
   */
  const addEntryFn = useCallback(
    async (
      entry: Omit<LogEntry, "id" | "createdAt" | "updatedAt">,
    ): Promise<string> => {
      try {
        setError(null);
        const id = await addLogEntry(entry);
        await loadEntries(); // Refresh to get the new entry
        return id;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to add log entry";
        setError(message);
        throw err;
      }
    },
    [loadEntries],
  );

  /**
   * Update an existing log entry
   */
  const updateEntryFn = useCallback(
    async (
      id: string,
      updates: Partial<Omit<LogEntry, "id" | "createdAt">>,
    ): Promise<void> => {
      try {
        setError(null);
        await updateLogEntry(id, updates);
        await loadEntries(); // Refresh to get updated entry
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update log entry";
        setError(message);
        throw err;
      }
    },
    [loadEntries],
  );

  /**
   * Delete a log entry
   */
  const deleteEntryFn = useCallback(
    async (id: string): Promise<void> => {
      try {
        setError(null);
        await deleteLogEntry(id);
        await loadEntries(); // Refresh after deletion
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to delete log entry";
        setError(message);
        throw err;
      }
    },
    [loadEntries],
  );

  /**
   * Import entries from ADIF content
   * @returns Number of entries imported
   */
  const importADIFFn = useCallback(
    async (content: string): Promise<number> => {
      try {
        setError(null);
        const parsed = parseADIF(content);
        if (parsed.length === 0) {
          setError("No valid entries found in ADIF content");
          return 0;
        }
        await addLogEntries(parsed);
        await loadEntries();
        return parsed.length;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to import ADIF";
        setError(message);
        throw err;
      }
    },
    [loadEntries],
  );

  /**
   * Export all entries to ADIF format
   */
  const exportADIFFn = useCallback((): string => {
    return generateADIF(entries);
  }, [entries]);

  /**
   * Check if a callsign has been worked
   */
  const isWorked = useCallback(
    (callsign: string): boolean => {
      const normalized = callsign.toUpperCase().trim();
      return callsignMap.has(normalized);
    },
    [callsignMap],
  );

  /**
   * Get all bands on which a callsign has been worked
   */
  const getWorkedBands = useCallback(
    (callsign: string): string[] => {
      const normalized = callsign.toUpperCase().trim();
      const callsignEntries = callsignMap.get(normalized);
      if (!callsignEntries || callsignEntries.length === 0) {
        return [];
      }
      const bands = new Set(callsignEntries.map((e) => e.band));
      return Array.from(bands).filter(Boolean);
    },
    [callsignMap],
  );

  /**
   * Get all modes on which a callsign has been worked
   */
  const getWorkedModes = useCallback(
    (callsign: string): string[] => {
      const normalized = callsign.toUpperCase().trim();
      const callsignEntries = callsignMap.get(normalized);
      if (!callsignEntries || callsignEntries.length === 0) {
        return [];
      }
      const modes = new Set(callsignEntries.map((e) => e.mode));
      return Array.from(modes).filter(Boolean);
    },
    [callsignMap],
  );

  return {
    entries,
    loading,
    error,
    addEntry: addEntryFn,
    updateEntry: updateEntryFn,
    deleteEntry: deleteEntryFn,
    importADIF: importADIFFn,
    exportADIF: exportADIFFn,
    isWorked,
    getWorkedBands,
    getWorkedModes,
    refresh: loadEntries,
    count: entries.length,
  };
}

/**
 * Hook for looking up a specific callsign's history
 * Useful for checking if a station has been worked before during a QSO
 *
 * @param callsign - The callsign to look up
 * @returns Object with worked status and previous QSO details
 */
export function useCallsignLookup(callsign: string) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!callsign || callsign.trim().length < 2) {
      setEntries([]);
      return;
    }

    let cancelled = false;

    async function lookup() {
      try {
        setLoading(true);
        setError(null);
        const results = await getLogEntriesByCallsign(callsign);
        if (!cancelled) {
          // Sort by date descending
          results.sort((a, b) => {
            const dateCompare = b.date.localeCompare(a.date);
            if (dateCompare !== 0) return dateCompare;
            return b.timeOn.localeCompare(a.timeOn);
          });
          setEntries(results);
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : "Failed to lookup callsign";
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    lookup();

    return () => {
      cancelled = true;
    };
  }, [callsign]);

  const isWorked = entries.length > 0;
  const lastQSO = entries.length > 0 ? entries[0] : null;
  const workedBands = useMemo(
    () => Array.from(new Set(entries.map((e) => e.band))).filter(Boolean),
    [entries],
  );
  const workedModes = useMemo(
    () => Array.from(new Set(entries.map((e) => e.mode))).filter(Boolean),
    [entries],
  );

  return {
    entries,
    loading,
    error,
    isWorked,
    lastQSO,
    workedBands,
    workedModes,
    qsoCount: entries.length,
  };
}
