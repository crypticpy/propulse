/**
 * Contest Propagation Intelligence Engine
 *
 * During major contests (CQ WW, ARRL DX, etc.), 10K-50K stations actively
 * probe propagation paths. This spot density provides much higher confidence
 * for propagation predictions.
 *
 * All functions are pure with no side effects.
 *
 * @module lib/contest/contestPropIntel
 */

// ─── Types ──────────────────────────────────────────────────────────────────

/** Minimal spot shape accepted by the analysis engine */
export interface SpotLike {
  frequency: number;
  mode: string;
  grid?: string;
  receiverGrid?: string;
  snr?: number;
  time: Date;
}

/** A single path entry within the density map */
export interface PathEntry {
  txGrid: string;
  rxGrid: string;
  snr?: number;
  time: Date;
}

/** Per-grid-pair density bucket: count, average SNR, and individual paths */
export interface DensityBucket {
  count: number;
  avgSnr: number;
  paths: PathEntry[];
}

/**
 * Density map: aggregated spot counts between 2-char Maidenhead grid pairs.
 * Key format: "TX_GRID:RX_GRID" (e.g., "FN:JO")
 */
export type DensityMap = Map<string, DensityBucket>;

/** A high-confidence propagation path extracted from contest density data */
export interface PropagationPath {
  txGrid: string;
  rxGrid: string;
  count: number;
  avgSnr: number;
  band: string;
  confidence: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Default grid resolution: 2-char Maidenhead (20 x 10 degrees) */
const DEFAULT_GRID_RESOLUTION = 2;

/** Minimum spots for a path to be considered high-confidence */
const HIGH_CONFIDENCE_THRESHOLD = 10;

/** Time window (ms) for high-confidence extraction — 30 minutes */
const EXTRACTION_WINDOW_MS = 30 * 60 * 1000;

/** Maximum confidence value */
const MAX_CONFIDENCE = 1.0;

/** Minimum confidence value */
const MIN_CONFIDENCE = 0.0;

/** Density value at which confidence boost is maximized */
const SATURATION_DENSITY = 100;

/** Maximum boost that contest density can provide (0.4 = 40 percentage points) */
const MAX_DENSITY_BOOST = 0.4;

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Extract the N-character Maidenhead prefix from a grid locator.
 * Returns null if the grid is undefined or too short.
 */
function gridPrefix(grid: string | undefined, chars: number): string | null {
  if (!grid || grid.length < chars) return null;
  return grid.slice(0, chars).toUpperCase();
}

/**
 * Build a canonical key for a grid pair (alphabetically sorted so
 * FN:JO and JO:FN map to the same bucket).
 */
function makePairKey(txGrid: string, rxGrid: string): string {
  const sorted = [txGrid, rxGrid].sort();
  return `${sorted[0]}:${sorted[1]}`;
}

/**
 * Derive amateur band designation from frequency in kHz.
 * Returns null if the frequency doesn't map to a known band.
 */
function bandFromFrequency(freqKhz: number): string | null {
  if (freqKhz >= 1800 && freqKhz <= 2000) return "160m";
  if (freqKhz >= 3500 && freqKhz <= 4000) return "80m";
  if (freqKhz >= 5330 && freqKhz <= 5410) return "60m";
  if (freqKhz >= 7000 && freqKhz <= 7300) return "40m";
  if (freqKhz >= 10100 && freqKhz <= 10150) return "30m";
  if (freqKhz >= 14000 && freqKhz <= 14350) return "20m";
  if (freqKhz >= 18068 && freqKhz <= 18168) return "17m";
  if (freqKhz >= 21000 && freqKhz <= 21450) return "15m";
  if (freqKhz >= 24890 && freqKhz <= 24990) return "12m";
  if (freqKhz >= 28000 && freqKhz <= 29700) return "10m";
  if (freqKhz >= 50000 && freqKhz <= 54000) return "6m";
  return null;
}

// ─── Core Functions ─────────────────────────────────────────────────────────

/**
 * Aggregate spot counts between grid square pairs.
 *
 * @param spots - Array of spot-like records with grid info
 * @param gridResolution - Number of Maidenhead characters to use (default 2)
 * @returns DensityMap keyed by "TX_GRID:RX_GRID"
 */
export function computeContestDensity(
  spots: SpotLike[],
  gridResolution: number = DEFAULT_GRID_RESOLUTION,
): DensityMap {
  const density: DensityMap = new Map();

  for (const spot of spots) {
    const tx = gridPrefix(spot.grid, gridResolution);
    const rx = gridPrefix(spot.receiverGrid, gridResolution);

    // Both grids required for path density analysis
    if (!tx || !rx) continue;
    // Skip same-grid spots (not useful for propagation analysis)
    if (tx === rx) continue;

    const key = makePairKey(tx, rx);
    const entry: PathEntry = {
      txGrid: tx,
      rxGrid: rx,
      snr: spot.snr,
      time: spot.time,
    };

    const existing = density.get(key);
    if (existing) {
      existing.count += 1;
      existing.paths.push(entry);
      // Recompute running average SNR
      const snrPaths = existing.paths.filter((p) => p.snr != null);
      existing.avgSnr =
        snrPaths.length > 0
          ? snrPaths.reduce((sum, p) => sum + (p.snr ?? 0), 0) / snrPaths.length
          : 0;
    } else {
      density.set(key, {
        count: 1,
        avgSnr: spot.snr ?? 0,
        paths: [entry],
      });
    }
  }

  return density;
}

/**
 * Extract high-confidence propagation paths from density data.
 *
 * A path with 10+ spots in the last 30 minutes is considered high confidence.
 * Results are sorted by count descending.
 *
 * @param density - DensityMap from computeContestDensity
 * @param band - Band designation (e.g., "20m") — attached to output paths
 * @returns Array of PropagationPath sorted by count (descending)
 */
export function extractPropagationSignal(
  density: DensityMap,
  band: string,
): PropagationPath[] {
  const paths: PropagationPath[] = [];
  const now = Date.now();

  for (const [key, bucket] of density) {
    // Filter to paths within the extraction window
    const recentPaths = bucket.paths.filter((p) => {
      const t = p.time instanceof Date ? p.time.getTime() : Number(p.time);
      return now - t <= EXTRACTION_WINDOW_MS;
    });

    if (recentPaths.length < HIGH_CONFIDENCE_THRESHOLD) continue;

    const [gridA, gridB] = key.split(":");

    // Compute average SNR of recent paths
    const snrPaths = recentPaths.filter((p) => p.snr != null);
    const avgSnr =
      snrPaths.length > 0
        ? snrPaths.reduce((sum, p) => sum + (p.snr ?? 0), 0) / snrPaths.length
        : 0;

    // Confidence scales from 0.5 (at threshold) to 1.0 (at 5x threshold)
    const normalizedCount = Math.min(
      recentPaths.length / (HIGH_CONFIDENCE_THRESHOLD * 5),
      1.0,
    );
    const confidence = 0.5 + normalizedCount * 0.5;

    paths.push({
      txGrid: gridA,
      rxGrid: gridB,
      count: recentPaths.length,
      avgSnr: Math.round(avgSnr * 10) / 10,
      band,
      confidence: Math.round(confidence * 100) / 100,
    });
  }

  // Sort by count descending
  return paths.sort((a, b) => b.count - a.count);
}

/**
 * Boost propagation confidence based on contest spot volume.
 *
 * Contest density provides additional confirmation of propagation paths
 * that analytical models might not capture. The boost is logarithmic,
 * saturating at high density values.
 *
 * @param normalConfidence - Base analytical confidence (0-1)
 * @param contestDensity - Number of contest spots confirming this path
 * @returns Enhanced confidence value (0-1), always >= normalConfidence
 */
export function getEnhancedConfidence(
  normalConfidence: number,
  contestDensity: number,
): number {
  // Clamp inputs
  const base = Math.max(
    MIN_CONFIDENCE,
    Math.min(MAX_CONFIDENCE, normalConfidence),
  );
  const density = Math.max(0, contestDensity);

  if (density === 0) return base;

  // Logarithmic boost: rapid gain at low density, diminishing returns at high
  // ln(1 + density) / ln(1 + SATURATION) gives 0..1 range
  const densityFactor =
    Math.log(1 + density) / Math.log(1 + SATURATION_DENSITY);
  const boost = Math.min(densityFactor, 1.0) * MAX_DENSITY_BOOST;

  return Math.min(MAX_CONFIDENCE, base + boost);
}

/**
 * Compute the band designation for a spot frequency.
 * Re-exports the internal helper for use by the hook layer.
 */
export function getBandForFrequency(freqKhz: number): string | null {
  return bandFromFrequency(freqKhz);
}
