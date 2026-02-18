/**
 * ft8PropPredictor — Propagation prediction from historical FT8 decode data.
 *
 * Analyses accumulated decode history to predict band openings, optimal
 * operating times, and propagation paths.  Uses a statistical approach based
 * on time-of-day patterns, solar conditions, and observed SNR distributions.
 *
 * All predictions are local — no external API calls.  The predictor improves
 * as more history is fed via {@link addHistory}.
 *
 * @example
 * ```ts
 * const predictor = new Ft8PropPredictor();
 * predictor.addHistory(decodeLogs);
 *
 * const predictions = predictor.predict({
 *   currentHourUtc: 14,
 *   sfi: 150,
 *   kIndex: 2,
 * });
 *
 * for (const p of predictions) {
 *   console.log(`${p.band} -> ${p.target}: ${(p.openingProbability * 100).toFixed(0)}%`);
 * }
 * ```
 */

// ============================================================================
// Types
// ============================================================================

/** A propagation prediction for a specific path. */
export interface PropPrediction {
  /** Target continent or DXCC entity. */
  target: string;
  /** Band identifier (e.g. "20m", "40m"). */
  band: string;
  /** Predicted opening probability (0-1). */
  openingProbability: number;
  /** Predicted SNR range based on historical percentiles. */
  predictedSnrRange: { min: number; max: number };
  /** Best UTC time window for this path. */
  bestTimeWindow: { startHour: number; endHour: number };
  /** Confidence in the prediction (0-1). */
  confidence: number;
  /** Number of historical data points backing this prediction. */
  sampleSize: number;
}

/** Historical decode summary for prediction input. */
export interface PropHistoryEntry {
  /** ISO 8601 timestamp of the decode. */
  timestamp: string;
  /** Continent code: NA, SA, EU, AF, AS, OC, AN. */
  continent: string;
  /** Band identifier (e.g. "20m", "40m"). */
  band: string;
  /** Observed SNR (dB). */
  snr: number;
  /** Solar Flux Index at time of decode. */
  sfi?: number;
  /** K-index (geomagnetic activity) at time of decode. */
  kIndex?: number;
}

/** A single cell in the activity heatmap. */
export interface HeatmapCell {
  /** UTC hour (0-23). */
  hour: number;
  /** Continent code. */
  continent: string;
  /** Average SNR across matching decodes. */
  avgSnr: number;
  /** Number of decodes in this cell. */
  count: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Known continent codes. */
const CONTINENTS = ["NA", "SA", "EU", "AF", "AS", "OC"] as const;

/** Number of history entries needed for full confidence. */
const FULL_CONFIDENCE_THRESHOLD = 50;

/**
 * Hour window (+/- hours) when filtering history by time of day.
 * A value of 2 means we consider entries within a 5-hour window centred
 * on the query hour.
 */
const HOUR_WINDOW = 2;

/** SFI tolerance for filtering by solar conditions. */
const SFI_TOLERANCE = 20;

/** K-index tolerance for filtering by geomagnetic conditions. */
const K_INDEX_TOLERANCE = 2;

/** SNR threshold (dB) — decodes above this are considered "open" contacts. */
const OPENING_SNR_THRESHOLD = -20;

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Extract the UTC hour from an ISO 8601 timestamp string.
 *
 * @param isoTimestamp - ISO 8601 date-time string.
 * @returns UTC hour (0-23), or -1 on parse failure.
 */
function extractUtcHour(isoTimestamp: string): number {
  const d = new Date(isoTimestamp);
  if (isNaN(d.getTime())) return -1;
  return d.getUTCHours();
}

/**
 * Check whether two hours are within a given window, accounting for
 * midnight wrap-around.
 *
 * @param hour1  - First hour (0-23).
 * @param hour2  - Second hour (0-23).
 * @param window - Maximum distance in hours.
 * @returns `true` if within window.
 */
function hoursWithinWindow(
  hour1: number,
  hour2: number,
  window: number,
): boolean {
  const diff = Math.abs(hour1 - hour2);
  return Math.min(diff, 24 - diff) <= window;
}

/**
 * Compute a percentile value from a sorted numeric array.
 *
 * @param sorted     - Pre-sorted array (ascending).
 * @param percentile - Desired percentile (0-100).
 * @returns Interpolated value at the given percentile.
 */
function percentile(sorted: number[], percentile: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (percentile / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  const frac = idx - lower;
  return sorted[lower] * (1 - frac) + sorted[upper] * frac;
}

/**
 * Find the contiguous window of hours with the highest decode density.
 *
 * Scans a 24-element count array with a sliding window of width 5
 * (matching HOUR_WINDOW * 2 + 1) and returns the centre hour of the
 * densest window.
 *
 * @param hourCounts - Array of 24 counts (index = UTC hour).
 * @returns Best time window `{ startHour, endHour }`.
 */
function findBestTimeWindow(hourCounts: number[]): {
  startHour: number;
  endHour: number;
} {
  const windowSize = HOUR_WINDOW * 2 + 1;
  let bestSum = -1;
  let bestStart = 0;

  for (let start = 0; start < 24; start++) {
    let sum = 0;
    for (let offset = 0; offset < windowSize; offset++) {
      sum += hourCounts[(start + offset) % 24];
    }
    if (sum > bestSum) {
      bestSum = sum;
      bestStart = start;
    }
  }

  return {
    startHour: bestStart,
    endHour: (bestStart + windowSize - 1) % 24,
  };
}

// ============================================================================
// Ft8PropPredictor
// ============================================================================

/**
 * FT8 Propagation Predictor — Analyses historical decode patterns to predict
 * band openings and optimal operating windows.
 *
 * Predictions are purely statistical: the predictor groups historical decodes
 * by time-of-day, band, continent, and (optionally) solar conditions, then
 * derives opening probabilities, SNR ranges, and best time windows.
 */
export class Ft8PropPredictor {
  /** In-memory history store, sorted by timestamp. */
  private history: PropHistoryEntry[] = [];

  // ── Constructor ───────────────────────────────────────────────────────────

  constructor() {
    // Intentionally empty — history is added via addHistory().
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Feed historical decode data for analysis.
   *
   * Entries are merged into the existing history and re-sorted by timestamp.
   * Duplicate entries (same timestamp + band + continent) are not deduplicated;
   * callers should pre-filter if needed.
   *
   * @param entries - Array of historical decode summaries.
   */
  addHistory(entries: PropHistoryEntry[]): void {
    if (!entries || entries.length === 0) return;
    this.history.push(...entries);
    this.history.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  /**
   * Clear all accumulated history.
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * Get predictions for current conditions.
   *
   * Filters history to a time-of-day window and optional solar conditions,
   * then groups by continent + band to compute predictions.
   *
   * @param params - Current conditions and optional filters.
   * @returns Array of predictions, sorted by opening probability (descending).
   */
  predict(params: {
    /** Current UTC hour (0-23). */
    currentHourUtc: number;
    /** Restrict to a specific band (optional). */
    currentBand?: string;
    /** Restrict to a specific continent (optional). */
    targetContinent?: string;
    /** Current Solar Flux Index for condition matching (optional). */
    sfi?: number;
    /** Current K-index for condition matching (optional). */
    kIndex?: number;
  }): PropPrediction[] {
    const { currentHourUtc, currentBand, targetContinent, sfi, kIndex } =
      params;

    // ── Filter history ──────────────────────────────────────────────────

    const filtered = this.history.filter((entry) => {
      // Time-of-day window
      const entryHour = extractUtcHour(entry.timestamp);
      if (entryHour < 0) return false;
      if (!hoursWithinWindow(entryHour, currentHourUtc, HOUR_WINDOW))
        return false;

      // Band filter
      if (currentBand && entry.band !== currentBand) return false;

      // Continent filter
      if (targetContinent && entry.continent !== targetContinent) return false;

      // Solar condition filter (if both current and historical are available)
      if (sfi !== undefined && entry.sfi !== undefined) {
        if (Math.abs(entry.sfi - sfi) > SFI_TOLERANCE) return false;
      }

      // Geomagnetic condition filter
      if (kIndex !== undefined && entry.kIndex !== undefined) {
        if (Math.abs(entry.kIndex - kIndex) > K_INDEX_TOLERANCE) return false;
      }

      return true;
    });

    // ── Group by continent + band ───────────────────────────────────────

    const groups = new Map<string, PropHistoryEntry[]>();
    for (const entry of filtered) {
      const key = `${entry.continent}|${entry.band}`;
      const group = groups.get(key);
      if (group) {
        group.push(entry);
      } else {
        groups.set(key, [entry]);
      }
    }

    // ── Compute predictions ─────────────────────────────────────────────

    const predictions: PropPrediction[] = [];

    for (const [key, entries] of groups) {
      const [continent, band] = key.split("|");
      const sampleSize = entries.length;

      // Opening probability: fraction of entries with SNR above threshold
      const openCount = entries.filter(
        (e) => e.snr > OPENING_SNR_THRESHOLD,
      ).length;
      const openingProbability = sampleSize > 0 ? openCount / sampleSize : 0;

      // SNR range from 10th and 90th percentiles
      const snrValues = entries.map((e) => e.snr).sort((a, b) => a - b);
      const snrMin = percentile(snrValues, 10);
      const snrMax = percentile(snrValues, 90);

      // Best time window from hour distribution (over full history, not
      // just the filtered window, to find the absolute peak)
      const hourCounts = new Array<number>(24).fill(0);
      for (const entry of this.history) {
        if (entry.continent !== continent || entry.band !== band) continue;
        const h = extractUtcHour(entry.timestamp);
        if (h >= 0) hourCounts[h]++;
      }
      const bestTimeWindow = findBestTimeWindow(hourCounts);

      // Confidence scales linearly with sample size up to the threshold
      const confidence = Math.min(1, sampleSize / FULL_CONFIDENCE_THRESHOLD);

      predictions.push({
        target: continent,
        band,
        openingProbability,
        predictedSnrRange: { min: snrMin, max: snrMax },
        bestTimeWindow,
        confidence,
        sampleSize,
      });
    }

    // Sort by opening probability descending, then by confidence
    predictions.sort((a, b) => {
      const probDiff = b.openingProbability - a.openingProbability;
      if (Math.abs(probDiff) > 0.001) return probDiff;
      return b.confidence - a.confidence;
    });

    return predictions;
  }

  /**
   * Get the best bands for reaching a target continent at the current time.
   *
   * Returns bands ranked by a composite score of opening probability and
   * average SNR.
   *
   * @param targetContinent - Continent code (e.g. "EU", "AS").
   * @param currentHourUtc  - Current UTC hour (0-23).
   * @returns Ranked list of bands with scores.
   */
  getBestBands(
    targetContinent: string,
    currentHourUtc: number,
  ): { band: string; score: number }[] {
    // Group history for this continent within the time window
    const bandStats = new Map<
      string,
      { totalSnr: number; openCount: number; total: number }
    >();

    for (const entry of this.history) {
      if (entry.continent !== targetContinent) continue;

      const entryHour = extractUtcHour(entry.timestamp);
      if (entryHour < 0) continue;
      if (!hoursWithinWindow(entryHour, currentHourUtc, HOUR_WINDOW)) continue;

      const stats = bandStats.get(entry.band);
      if (stats) {
        stats.totalSnr += entry.snr;
        stats.total++;
        if (entry.snr > OPENING_SNR_THRESHOLD) stats.openCount++;
      } else {
        bandStats.set(entry.band, {
          totalSnr: entry.snr,
          openCount: entry.snr > OPENING_SNR_THRESHOLD ? 1 : 0,
          total: 1,
        });
      }
    }

    // Compute composite score: weighted combination of opening probability
    // and normalised average SNR
    const results: { band: string; score: number }[] = [];

    for (const [band, stats] of bandStats) {
      const openProb = stats.total > 0 ? stats.openCount / stats.total : 0;
      const avgSnr = stats.total > 0 ? stats.totalSnr / stats.total : -99;

      // Normalise SNR to 0-1 range: -30 dB -> 0, +10 dB -> 1
      const normSnr = Math.max(0, Math.min(1, (avgSnr + 30) / 40));

      // Composite: 70% opening probability, 30% SNR quality
      const score = 0.7 * openProb + 0.3 * normSnr;
      results.push({ band, score });
    }

    results.sort((a, b) => b.score - a.score);
    return results;
  }

  /**
   * Get historical activity heatmap data for a specific band.
   *
   * Returns a 2-D structure: an array of 24 rows (one per UTC hour), each
   * containing up to 6 cells (one per continent) with average SNR and
   * decode count.
   *
   * @param band - Band identifier (e.g. "20m").
   * @returns 24-element array of arrays, where each inner array contains
   *          heatmap cells for that hour.
   */
  getActivityHeatmap(band: string): HeatmapCell[][] {
    // Accumulator: [hour][continent] -> { totalSnr, count }
    const grid = new Map<string, { totalSnr: number; count: number }>();

    for (const entry of this.history) {
      if (entry.band !== band) continue;

      const hour = extractUtcHour(entry.timestamp);
      if (hour < 0) continue;

      const key = `${hour}|${entry.continent}`;
      const cell = grid.get(key);
      if (cell) {
        cell.totalSnr += entry.snr;
        cell.count++;
      } else {
        grid.set(key, { totalSnr: entry.snr, count: 1 });
      }
    }

    // Build the 24 x N output structure
    const heatmap: HeatmapCell[][] = [];

    for (let hour = 0; hour < 24; hour++) {
      const row: HeatmapCell[] = [];
      for (const continent of CONTINENTS) {
        const key = `${hour}|${continent}`;
        const cell = grid.get(key);
        if (cell && cell.count > 0) {
          row.push({
            hour,
            continent,
            avgSnr: cell.totalSnr / cell.count,
            count: cell.count,
          });
        }
      }
      heatmap.push(row);
    }

    return heatmap;
  }

  // ============================================================================
  // Accessors
  // ============================================================================

  /** Minimum history entries needed for meaningful predictions. */
  get minimumHistory(): number {
    return FULL_CONFIDENCE_THRESHOLD;
  }

  /** Current number of history entries stored. */
  get historySize(): number {
    return this.history.length;
  }
}
