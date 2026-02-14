/**
 * Hook: Meteor Shower Data for Globe Overlay
 *
 * Provides active and upcoming meteor shower data using the
 * meteorShowers.ts data module. Recalculates on mount and daily.
 *
 * No API call needed -- all data is computed locally from date.
 * Includes radiant lat/lon positions for globe overlay rendering.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useMapStore } from "@/stores/mapStore";
import {
  type MeteorShower,
  getActiveShowers,
  daysUntilPeak,
  getMeteorScatterQuality,
  radiantToLatLon,
  MAJOR_METEOR_SHOWERS,
} from "@/lib/data/meteorShowers";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MeteorShowerWithPosition extends MeteorShower {
  /** Current geographic position of the radiant sub-point */
  radiantLat: number;
  /** Current geographic longitude of the radiant sub-point */
  radiantLon: number;
  /** Days until the shower's peak (0 = today) */
  daysUntilPeak: number;
  /** Whether the shower is good for 6m meteor scatter */
  is6mFavorable: boolean;
}

export interface UpcomingShower extends MeteorShower {
  /** Days until the shower's active period begins */
  daysUntilActive: number;
  /** Days until the shower's peak */
  daysUntilPeak: number;
}

export interface MeteorShowerState {
  /** Currently active showers with radiant positions */
  activeShowers: MeteorShowerWithPosition[];
  /** Showers that will become active within the next 30 days */
  upcomingShowers: UpcomingShower[];
  /** Active showers that are favorable for 6m meteor scatter */
  active6mShowers: MeteorShowerWithPosition[];
  /** Meteor scatter quality rating (0-100) */
  scatterQuality: number;
  /** Last computation timestamp */
  lastUpdated: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const HOUR = 60 * 60 * 1000;

/**
 * Find showers becoming active within the next N days.
 */
function getUpcomingShowers(
  date: Date,
  withinDays: number = 30,
): UpcomingShower[] {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const current = month * 100 + day;

  const active = getActiveShowers(date);
  const activeCodes = new Set(active.map((s) => s.code));

  return MAJOR_METEOR_SHOWERS.filter((s) => !activeCodes.has(s.code))
    .map((s) => {
      const startDate = s.activeStartMonth * 100 + s.activeStartDay;
      // Calculate days until active (approximate)
      let daysUntilActive: number;
      if (startDate > current) {
        daysUntilActive = Math.round(
          ((startDate - current) / 100) * 30 + ((startDate - current) % 100),
        );
      } else {
        // Wraps around to next year
        daysUntilActive = Math.round(((1300 - current + startDate) / 100) * 30);
      }

      return {
        ...s,
        daysUntilActive: Math.max(0, daysUntilActive),
        daysUntilPeak: daysUntilPeak(s, date),
      };
    })
    .filter((s) => s.daysUntilActive <= withinDays)
    .sort((a, b) => a.daysUntilActive - b.daysUntilActive);
}

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * Meteor shower data for globe overlay and status display.
 *
 * Recalculates hourly to update radiant positions (which move with
 * Earth's rotation) and daily for active/upcoming status.
 *
 * @returns MeteorShowerState
 */
export function useMeteorShowers(): MeteorShowerState {
  const meteorShowersEnabled = useMapStore((s) => s.layers.meteorShowers);

  const computeState = useCallback((): MeteorShowerState => {
    const now = new Date();

    // Get active showers and enrich with radiant positions
    const active = getActiveShowers(now);
    const activeWithPositions: MeteorShowerWithPosition[] = active.map((s) => {
      const { lat, lon } = radiantToLatLon(
        { ra: s.radiantRA, dec: s.radiantDec },
        now,
      );
      return {
        ...s,
        radiantLat: Math.round(lat * 100) / 100,
        radiantLon: Math.round(lon * 100) / 100,
        daysUntilPeak: daysUntilPeak(s, now),
        is6mFavorable: s.bestFor6m,
      };
    });

    // Filter for 6m-favorable
    const active6m = activeWithPositions.filter((s) => s.is6mFavorable);

    // Get upcoming showers
    const upcoming = getUpcomingShowers(now, 30);

    return {
      activeShowers: activeWithPositions,
      upcomingShowers: upcoming,
      active6mShowers: active6m,
      scatterQuality: getMeteorScatterQuality(now),
      lastUpdated: now.toISOString(),
    };
  }, []);

  const [state, setState] = useState<MeteorShowerState>(computeState);

  useEffect(() => {
    if (!meteorShowersEnabled) return;

    // Initial computation
    setState(computeState());

    // Update hourly (radiant positions shift with Earth's rotation)
    const interval = setInterval(() => {
      setState(computeState());
    }, 1 * HOUR);

    return () => clearInterval(interval);
  }, [meteorShowersEnabled, computeState]);

  return state;
}

/**
 * Standalone scatter quality rating (no position computation).
 * Lightweight alternative when only the quality score is needed.
 */
export function useMeteorScatterQuality(): number {
  return useMemo(() => getMeteorScatterQuality(new Date()), []);
}
