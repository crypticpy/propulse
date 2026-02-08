/**
 * Pure computation module for advanced logbook statistics.
 * All functions are side-effect-free and suitable for use inside useMemo.
 */

import type { LogEntry } from "@/lib/db/types";
import { lookupEntity } from "@/lib/data/dxccEntities";
import { gridDistance, isValidGrid } from "@/lib/utils/grid";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AdvancedStats {
  /** Fraction of QSOs that are DX (non-home-country), 0-1 */
  dxDomesticRatio: number;
  /** Average QSO distance in km (only QSOs with valid grids) */
  avgDistanceKm: number;
  /** Longest consecutive-day operating streak */
  longestStreak: number;
  /** Current consecutive-day streak (ending today or yesterday) */
  currentStreak: number;
  /** Best single operating day */
  bestSingleDay: { date: string; count: number };
  /** Personal records */
  personalRecords: {
    mostCountriesInDay: { date: string; count: number };
    mostBandsInDay: { date: string; count: number };
  };
  /** 24-element array, index = UTC hour, value = QSO count */
  qsosByHourUtc: number[];
  /** UTC hour with the most QSOs */
  peakHourUtc: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Parse "HH:MM" time string to hour number (0-23). Returns -1 on failure. */
function parseHour(time: string | undefined): number {
  if (!time) return -1;
  const h = parseInt(time.split(":")[0], 10);
  return Number.isFinite(h) && h >= 0 && h <= 23 ? h : -1;
}

/** Get today's date as YYYY-MM-DD in UTC. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Add `days` to a YYYY-MM-DD string and return YYYY-MM-DD. */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ─── Main computation ───────────────────────────────────────────────────────

/**
 * Compute advanced stats from logbook entries.
 *
 * @param entries      - Raw logbook entries
 * @param qsosByDate   - Pre-computed date -> count map (from useLogbookStats)
 * @param homeCountry  - DXCC entity name of operator's home country (optional)
 * @param operatorGrid - Operator's Maidenhead grid (for distance calculation)
 */
export function computeAdvancedStats(
  entries: LogEntry[],
  qsosByDate: Record<string, number>,
  homeCountry?: string,
  operatorGrid?: string,
): AdvancedStats {
  // ── DX / domestic ratio ──
  let dxCount = 0;
  let totalClassified = 0;

  // ── Distance accumulation ──
  let totalDistanceKm = 0;
  let distanceCount = 0;

  // ── Hourly distribution ──
  const hourly = new Array<number>(24).fill(0);

  // ── Per-date grouping for personal records ──
  const countriesByDate = new Map<string, Set<string>>();
  const bandsByDate = new Map<string, Set<string>>();

  for (const entry of entries) {
    const cs = entry.callsign?.toUpperCase().trim();

    // DX classification
    if (cs) {
      const result = lookupEntity(cs);
      if (result?.entity.name) {
        totalClassified++;
        if (homeCountry && result.entity.name === homeCountry) {
          // domestic
        } else {
          dxCount++;
        }

        // Per-date country tracking
        const dateCountries =
          countriesByDate.get(entry.date) ?? new Set<string>();
        dateCountries.add(result.entity.name);
        countriesByDate.set(entry.date, dateCountries);
      }
    }

    // Distance
    if (
      operatorGrid &&
      entry.grid &&
      isValidGrid(operatorGrid) &&
      isValidGrid(entry.grid)
    ) {
      try {
        const dist = gridDistance(operatorGrid, entry.grid);
        if (Number.isFinite(dist)) {
          totalDistanceKm += dist;
          distanceCount++;
        }
      } catch {
        // skip invalid grids
      }
    }

    // Hour distribution
    const hour = parseHour(entry.timeOn);
    if (hour >= 0) {
      hourly[hour]++;
    }

    // Per-date band tracking
    if (entry.date && entry.band) {
      const dateBands = bandsByDate.get(entry.date) ?? new Set<string>();
      dateBands.add(entry.band);
      bandsByDate.set(entry.date, dateBands);
    }
  }

  // ── DX ratio ──
  const dxDomesticRatio = totalClassified > 0 ? dxCount / totalClassified : 0;

  // ── Average distance ──
  const avgDistanceKm =
    distanceCount > 0 ? Math.round(totalDistanceKm / distanceCount) : 0;

  // ── Streaks ──
  const sortedDates = Object.keys(qsosByDate).sort();
  let longestStreak = 0;
  let currentStreak = 0;

  if (sortedDates.length > 0) {
    let streak = 1;
    for (let i = 1; i < sortedDates.length; i++) {
      if (addDays(sortedDates[i - 1], 1) === sortedDates[i]) {
        streak++;
      } else {
        if (streak > longestStreak) longestStreak = streak;
        streak = 1;
      }
    }
    if (streak > longestStreak) longestStreak = streak;

    // Current streak: walk backwards from last date
    const today = todayUtc();
    const lastDate = sortedDates[sortedDates.length - 1];
    // Streak is "current" if the last date is today or yesterday
    if (lastDate === today || lastDate === addDays(today, -1)) {
      currentStreak = 1;
      for (let i = sortedDates.length - 2; i >= 0; i--) {
        if (addDays(sortedDates[i], 1) === sortedDates[i + 1]) {
          currentStreak++;
        } else {
          break;
        }
      }
    }
  }

  // ── Best single day ──
  let bestSingleDay = { date: "--", count: 0 };
  for (const [date, count] of Object.entries(qsosByDate)) {
    if (count > bestSingleDay.count) {
      bestSingleDay = { date, count };
    }
  }

  // ── Personal records: most countries in a day ──
  let mostCountriesInDay = { date: "--", count: 0 };
  for (const [date, countries] of countriesByDate) {
    if (countries.size > mostCountriesInDay.count) {
      mostCountriesInDay = { date, count: countries.size };
    }
  }

  // ── Personal records: most bands in a day ──
  let mostBandsInDay = { date: "--", count: 0 };
  for (const [date, bands] of bandsByDate) {
    if (bands.size > mostBandsInDay.count) {
      mostBandsInDay = { date, count: bands.size };
    }
  }

  // ── Peak hour ──
  let peakHourUtc = 0;
  let peakCount = 0;
  for (let h = 0; h < 24; h++) {
    if (hourly[h] > peakCount) {
      peakCount = hourly[h];
      peakHourUtc = h;
    }
  }

  return {
    dxDomesticRatio,
    avgDistanceKm,
    longestStreak,
    currentStreak,
    bestSingleDay,
    personalRecords: {
      mostCountriesInDay,
      mostBandsInDay,
    },
    qsosByHourUtc: hourly,
    peakHourUtc,
  };
}
