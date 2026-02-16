/**
 * Hook: Meteor Shower Data for Globe Overlay
 *
 * Provides active and upcoming meteor shower data using the
 * meteorShowers.ts data module. Recalculates on mount and daily.
 *
 * No API call needed -- all data is computed locally from date.
 * Includes radiant lat/lon positions for globe overlay rendering.
 *
 * Test/Demo Mode:
 *   Add ?meteorTest=true to the URL to force-show 4 hardcoded test
 *   showers regardless of the current date. This lets developers
 *   verify the MeteorShowerOverlay3D visuals at any time of year.
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

// ─── Test/Demo Mode ─────────────────────────────────────────────────────────

/**
 * Check whether `?meteorTest=true` is present in the current URL.
 * Returns false during SSR or when the param is absent/falsy.
 */
function isMeteorTestMode(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("meteorTest") === "true";
}

/**
 * Build a set of 4 hardcoded test showers spanning the globe with a mix of
 * ZHR sizes and 6m-favorable / non-favorable variants.  Dates are anchored
 * around "today" so the overlay always shows realistic peak timing.
 */
function getTestShowers(): MeteorShowerWithPosition[] {
  const now = new Date();
  const todayMonth = now.getMonth() + 1;
  const todayDay = now.getDate();

  // Helper: build a date string for logging
  const dateLabel = `${todayMonth}/${todayDay}`;

  console.log(
    `%c[MeteorShowers] TEST MODE ACTIVE — showing 4 test showers (date ${dateLabel}). ` +
      "Remove ?meteorTest=true from the URL to disable.",
    "color: #00ff66; font-weight: bold;",
  );

  // Use radiantToLatLon to compute the current sub-point for each radiant so
  // positions rotate naturally with the Earth, exactly like real data would.
  const perseidPos = radiantToLatLon({ ra: 48, dec: 58 }, now);
  const geminidPos = radiantToLatLon({ ra: 112.3, dec: 32.5 }, now);
  const leonidPos = radiantToLatLon({ ra: 152, dec: 21.6 }, now);
  const etaAquariidPos = radiantToLatLon({ ra: 338, dec: -1 }, now);

  return [
    {
      // Perseids — high ZHR, 6m NOT favorable, peak in 2 days
      name: "Perseids",
      code: "PER",
      peakMonth: todayMonth,
      peakDay: todayDay + 2 > 28 ? todayDay : todayDay + 2,
      activeStartMonth: todayMonth,
      activeStartDay: Math.max(1, todayDay - 10),
      activeEndMonth: todayMonth,
      activeEndDay: Math.min(28, todayDay + 14),
      radiantRA: 48,
      radiantDec: 58,
      zhr: 100,
      velocity: 59,
      parentBody: "109P/Swift-Tuttle",
      bestFor6m: false,
      radiantLat: Math.round(perseidPos.lat * 100) / 100,
      radiantLon: Math.round(perseidPos.lon * 100) / 100,
      daysUntilPeak: 2,
      is6mFavorable: false,
    },
    {
      // Geminids — highest ZHR, 6m favorable, peak NOW
      name: "Geminids",
      code: "GEM",
      peakMonth: todayMonth,
      peakDay: todayDay,
      activeStartMonth: todayMonth,
      activeStartDay: Math.max(1, todayDay - 7),
      activeEndMonth: todayMonth,
      activeEndDay: Math.min(28, todayDay + 7),
      radiantRA: 112.3,
      radiantDec: 32.5,
      zhr: 150,
      velocity: 35,
      parentBody: "3200 Phaethon (asteroid)",
      bestFor6m: true,
      radiantLat: Math.round(geminidPos.lat * 100) / 100,
      radiantLon: Math.round(geminidPos.lon * 100) / 100,
      daysUntilPeak: 0,
      is6mFavorable: true,
    },
    {
      // Leonids — low ZHR, 6m NOT favorable, peak in 5 days
      name: "Leonids",
      code: "LEO",
      peakMonth: todayMonth,
      peakDay: Math.min(28, todayDay + 5),
      activeStartMonth: todayMonth,
      activeStartDay: Math.max(1, todayDay - 5),
      activeEndMonth: todayMonth,
      activeEndDay: Math.min(28, todayDay + 12),
      radiantRA: 152,
      radiantDec: 21.6,
      zhr: 15,
      velocity: 71,
      parentBody: "55P/Tempel-Tuttle",
      bestFor6m: false,
      radiantLat: Math.round(leonidPos.lat * 100) / 100,
      radiantLon: Math.round(leonidPos.lon * 100) / 100,
      daysUntilPeak: 5,
      is6mFavorable: false,
    },
    {
      // Eta Aquariids — medium ZHR, 6m favorable, peak tomorrow
      name: "Eta Aquariids",
      code: "ETA",
      peakMonth: todayMonth,
      peakDay: Math.min(28, todayDay + 1),
      activeStartMonth: todayMonth,
      activeStartDay: Math.max(1, todayDay - 8),
      activeEndMonth: todayMonth,
      activeEndDay: Math.min(28, todayDay + 10),
      radiantRA: 338,
      radiantDec: -1,
      zhr: 50,
      velocity: 66,
      parentBody: "1P/Halley",
      bestFor6m: true,
      radiantLat: Math.round(etaAquariidPos.lat * 100) / 100,
      radiantLon: Math.round(etaAquariidPos.lon * 100) / 100,
      daysUntilPeak: 1,
      is6mFavorable: true,
    },
  ];
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

    // ── Test mode: return hardcoded showers when ?meteorTest=true ──────
    if (isMeteorTestMode()) {
      const testShowers = getTestShowers();
      const test6m = testShowers.filter((s) => s.is6mFavorable);
      return {
        activeShowers: testShowers,
        upcomingShowers: [],
        active6mShowers: test6m,
        scatterQuality: 85, // high quality to exercise full UI
        lastUpdated: now.toISOString(),
      };
    }

    // ── Normal mode: compute from real date ───────────────────────────
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
