/**
 * Batch dupe-checking hook for FT8/FT4 decoded callsigns.
 *
 * Unlike `useDupeCheck` (which queries IndexedDB per callsign for the QSO form),
 * this hook pre-loads all worked callsigns for the current band+mode+date at
 * session start and on band changes, providing O(1) synchronous lookup for
 * every decoded callsign in the waterfall.
 *
 * It also merges in the in-memory `workedThisSession` map from ft8SessionStore
 * so that QSOs logged during the current session are reflected immediately,
 * even before they are flushed to IndexedDB.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getAllLogEntries, getLogEntriesByDate } from "@/lib/db/logStore";
import { useFt8SessionStore } from "@/stores/ft8SessionStore";

// ─── Public interface ────────────────────────────────────────────────────────

interface PreviousContact {
  date: string;
  band: string;
  mode: string;
}

export interface Ft8DupeCheckResult {
  /** Check if a callsign is a dupe on the current band/mode/date */
  isDupe: (callsign: string) => boolean;
  /** Get previous contacts for a callsign (for tooltip info) */
  getPreviousContacts: (callsign: string) => PreviousContact[];
  /** Number of callsigns in the worked set */
  workedCount: number;
  /** Whether the initial load is complete */
  isReady: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Return today's date as YYYY-MM-DD in UTC */
function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useFt8DupeCheck(
  band: string | null,
  mode: "FT8" | "FT4",
): Ft8DupeCheckResult {
  const [isReady, setIsReady] = useState(false);
  const [workedCount, setWorkedCount] = useState(0);

  // Refs hold the lookup data so reads are synchronous and don't trigger
  // re-renders on every decode cycle.
  const todayWorkedRef = useRef<Set<string>>(new Set());
  const previousContactsRef = useRef<Map<string, PreviousContact[]>>(new Map());

  // Subscribe to session-scoped worked map (keyed by uppercase callsign)
  const workedThisSession = useFt8SessionStore((s) => s.workedThisSession);

  // ── Load from IndexedDB on mount / band / mode change ──────────────────

  useEffect(() => {
    // If band is not yet known we cannot determine dupes.
    if (!band) return;

    let cancelled = false;

    async function load() {
      const date = todayUTC();
      const normalizedBand = band!.toLowerCase().trim();
      const normalizedMode = mode.toUpperCase().trim();

      // 1. Load today's entries filtered to this band+mode for the dupe set
      const todayEntries = await getLogEntriesByDate(date);
      const dupeSet = new Set<string>();
      for (const entry of todayEntries) {
        if (
          entry.band?.toLowerCase().trim() === normalizedBand &&
          entry.mode?.toUpperCase().trim() === normalizedMode
        ) {
          dupeSet.add(entry.callsign.toUpperCase().trim());
        }
      }

      // 2. Load full history for the previous-contacts map
      const allEntries = await getAllLogEntries();
      const contactsMap = new Map<string, PreviousContact[]>();
      for (const entry of allEntries) {
        const key = entry.callsign.toUpperCase().trim();
        const existing = contactsMap.get(key);
        const contact: PreviousContact = {
          date: entry.date,
          band: entry.band,
          mode: entry.mode,
        };
        if (existing) {
          existing.push(contact);
        } else {
          contactsMap.set(key, [contact]);
        }
      }

      if (cancelled) return;

      todayWorkedRef.current = dupeSet;
      previousContactsRef.current = contactsMap;
      setWorkedCount(dupeSet.size);
      setIsReady(true);
    }

    // Reset ready state while loading new data
    setIsReady(false);
    load();

    return () => {
      cancelled = true;
    };
  }, [band, mode]);

  // ── isDupe ─────────────────────────────────────────────────────────────

  const isDupe = useCallback(
    (callsign: string): boolean => {
      const key = callsign.toUpperCase().trim();

      // Check the pre-loaded IndexedDB set for today
      if (todayWorkedRef.current.has(key)) return true;

      // Check the in-memory session map (covers QSOs logged this session
      // that may not have been flushed to IDB yet, or were logged after
      // the last IDB load).
      if (workedThisSession[key]) return true;

      return false;
    },
    [workedThisSession],
  );

  // ── getPreviousContacts ────────────────────────────────────────────────

  const getPreviousContacts = useCallback(
    (callsign: string): PreviousContact[] => {
      const key = callsign.toUpperCase().trim();
      const fromDb = previousContactsRef.current.get(key) ?? [];

      // Merge any session-only record that isn't already in the DB list
      const sessionRecord = workedThisSession[key];
      if (sessionRecord) {
        const alreadyIncluded = fromDb.some(
          (c) =>
            c.date === sessionRecord.startTime.slice(0, 10) &&
            c.band === sessionRecord.band &&
            c.mode === sessionRecord.mode,
        );
        if (!alreadyIncluded) {
          return [
            ...fromDb,
            {
              date: sessionRecord.startTime.slice(0, 10),
              band: sessionRecord.band,
              mode: sessionRecord.mode,
            },
          ];
        }
      }

      return fromDb;
    },
    [workedThisSession],
  );

  // ── Recompute workedCount when session map changes ─────────────────────

  useEffect(() => {
    // Merge IDB-loaded set with session map to get an accurate count.
    const merged = new Set(todayWorkedRef.current);
    for (const key of Object.keys(workedThisSession)) {
      merged.add(key.toUpperCase().trim());
    }
    setWorkedCount(merged.size);
  }, [workedThisSession]);

  return { isDupe, getPreviousContacts, workedCount, isReady };
}
