/**
 * React hook that aggregates FT8/FT4 decode data into a propagation
 * radar data model.  Groups decodes by continent, computes SNR
 * statistics, and derives an activity-level score (0-1) with recency
 * weighting so the freshest spots dominate the visualization.
 *
 * Re-computes only when the `decodes` array reference changes.
 */

import { useMemo } from "react";

// ── Public types ────────────────────────────────────────────────────────────

export interface PropRadarDataPoint {
  continent: string; // "NA" | "SA" | "EU" | "AF" | "AS" | "OC"
  band: string; // "20m", "40m", etc.
  avgSnr: number;
  peakSnr: number;
  decodeCount: number;
  lastDecodeTime: string;
  /** 0.0 – 1.0, higher = more active */
  activityLevel: number;
}

export interface PropRadarData {
  /** Data points indexed by continent */
  continents: PropRadarDataPoint[];
  /** Timestamp of most recent decode */
  lastUpdateTime: string;
  /** Total decodes in the analysis window */
  totalDecodes: number;
  /** Time window in minutes */
  windowMinutes: number;
}

// ── Decode input shape ──────────────────────────────────────────────────────

interface DecodeInput {
  continent?: string;
  snr: number;
  time: string;
  band?: string;
}

// ── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_WINDOW_MINUTES = 30;

const VALID_CONTINENTS = new Set(["NA", "SA", "EU", "AF", "AS", "OC"]);

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Clamp a value between min and max inclusive. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Compute an activity level between 0 and 1.
 *
 * Each decode receives a weight based on how recently it occurred:
 *   weight = 1 - (age / windowMs)
 * so a decode at the current moment has weight 1 and a decode at the
 * edge of the window has weight ~0.  The sum of weights is normalised
 * against a reasonable upper-bound so that a steady stream of decodes
 * converges toward 1.0.
 */
function computeActivityLevel(
  decodeTimes: number[],
  nowMs: number,
  windowMs: number,
): number {
  if (decodeTimes.length === 0) return 0;

  let weightedSum = 0;
  for (const t of decodeTimes) {
    const age = nowMs - t;
    if (age < 0 || age > windowMs) continue;
    weightedSum += 1 - age / windowMs;
  }

  // Normalise: treat 20 fully-recent decodes as "maximum" activity so
  // that smaller counts still produce useful values.
  const MAX_EXPECTED = 20;
  return clamp(weightedSum / MAX_EXPECTED, 0, 1);
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useFt8PropRadar(
  decodes: DecodeInput[],
  windowMinutes: number = DEFAULT_WINDOW_MINUTES,
): PropRadarData {
  return useMemo(() => {
    const windowMs = windowMinutes * 60 * 1000;
    const nowMs = Date.now();
    const cutoff = nowMs - windowMs;

    // ── Filter to window & valid continents ─────────────────────────────
    const filtered = decodes.filter((d) => {
      if (!d.continent || !VALID_CONTINENTS.has(d.continent)) return false;
      const ts = new Date(d.time).getTime();
      return !Number.isNaN(ts) && ts >= cutoff;
    });

    if (filtered.length === 0) {
      return {
        continents: [],
        lastUpdateTime: new Date(nowMs).toISOString(),
        totalDecodes: 0,
        windowMinutes,
      };
    }

    // ── Group by continent+band ─────────────────────────────────────────
    const groups = new Map<
      string,
      {
        continent: string;
        band: string;
        snrs: number[];
        times: number[];
        lastMs: number;
      }
    >();

    let globalLastMs = 0;

    for (const d of filtered) {
      const continent = d.continent!;
      const band = d.band ?? "unknown";
      const key = `${continent}:${band}`;
      const ts = new Date(d.time).getTime();

      let group = groups.get(key);
      if (!group) {
        group = { continent, band, snrs: [], times: [], lastMs: 0 };
        groups.set(key, group);
      }

      group.snrs.push(d.snr);
      group.times.push(ts);
      if (ts > group.lastMs) group.lastMs = ts;
      if (ts > globalLastMs) globalLastMs = ts;
    }

    // ── Build data points ───────────────────────────────────────────────
    const continents: PropRadarDataPoint[] = [];

    for (const g of groups.values()) {
      const sum = g.snrs.reduce((a, b) => a + b, 0);
      const avgSnr = Math.round((sum / g.snrs.length) * 10) / 10;
      const peakSnr = Math.max(...g.snrs);

      continents.push({
        continent: g.continent,
        band: g.band,
        avgSnr,
        peakSnr,
        decodeCount: g.snrs.length,
        lastDecodeTime: new Date(g.lastMs).toISOString(),
        activityLevel: computeActivityLevel(g.times, nowMs, windowMs),
      });
    }

    // Sort by activity descending for deterministic rendering order.
    continents.sort((a, b) => b.activityLevel - a.activityLevel);

    return {
      continents,
      lastUpdateTime: new Date(globalLastMs).toISOString(),
      totalDecodes: filtered.length,
      windowMinutes,
    };
  }, [decodes, windowMinutes]);
}
