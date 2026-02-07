/**
 * Hook that computes aggregate statistics from logbook entries in a single pass.
 * Provides counts, distributions, and date ranges for the stats tab.
 */

import { useMemo } from "react";
import { useLogbook } from "@/hooks/useLogbook";
import { lookupEntity } from "@/lib/data/dxccEntities";

export interface LogbookStats {
  totalQSOs: number;
  uniqueCallsigns: number;
  uniqueCountries: number;
  qsosByMode: Record<string, number>;
  qsosByBand: Record<string, number>;
  /** Date string "YYYY-MM-DD" to count */
  qsosByDate: Record<string, number>;
  firstQSODate: string | null;
  lastQSODate: string | null;
  isLoading: boolean;
}

/**
 * Sort a record's entries by value descending, returning a new record.
 */
function sortRecordByCountDesc(
  record: Record<string, number>,
): Record<string, number> {
  const sorted: Record<string, number> = {};
  const entries = Object.entries(record).sort(([, a], [, b]) => b - a);
  for (const [key, value] of entries) {
    sorted[key] = value;
  }
  return sorted;
}

export function useLogbookStats(): LogbookStats {
  const { entries, loading } = useLogbook();

  const stats = useMemo(() => {
    const callsigns = new Set<string>();
    const countries = new Set<string>();
    const modeMap: Record<string, number> = {};
    const bandMap: Record<string, number> = {};
    const dateMap: Record<string, number> = {};
    let firstDate: string | null = null;
    let lastDate: string | null = null;

    for (const entry of entries) {
      // Unique callsigns
      const cs = entry.callsign.toUpperCase().trim();
      if (cs) {
        callsigns.add(cs);
      }

      // Country counting via DXCC lookup
      if (cs) {
        const result = lookupEntity(cs);
        if (result?.entity.name) {
          countries.add(result.entity.name);
        }
      }

      // Mode distribution
      const mode = entry.mode?.trim();
      if (mode) {
        modeMap[mode] = (modeMap[mode] || 0) + 1;
      }

      // Band distribution
      const band = entry.band?.trim();
      if (band) {
        bandMap[band] = (bandMap[band] || 0) + 1;
      }

      // Date distribution and range tracking
      const date = entry.date;
      if (date) {
        dateMap[date] = (dateMap[date] || 0) + 1;

        if (firstDate === null || date < firstDate) {
          firstDate = date;
        }
        if (lastDate === null || date > lastDate) {
          lastDate = date;
        }
      }
    }

    return {
      totalQSOs: entries.length,
      uniqueCallsigns: callsigns.size,
      uniqueCountries: countries.size,
      qsosByMode: sortRecordByCountDesc(modeMap),
      qsosByBand: sortRecordByCountDesc(bandMap),
      qsosByDate: dateMap,
      firstQSODate: firstDate,
      lastQSODate: lastDate,
    };
  }, [entries]);

  return {
    ...stats,
    isLoading: loading,
  };
}
