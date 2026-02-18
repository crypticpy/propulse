/**
 * ft8TxFreqPicker — TX Frequency Collision Avoidance for FT8/FT4.
 *
 * Analyzes the current decode cycle to find a clear transmit frequency
 * in the audio passband (200-3000 Hz). The algorithm avoids collisions
 * with other stations by identifying gaps between occupied frequencies
 * and selecting the widest one.
 *
 * Signal bandwidth references:
 *   - FT8: 8 tones x 6.25 Hz spacing = 50 Hz
 *   - FT4: 4 tones x 20.83 Hz spacing ~= 83.3 Hz
 *
 * Usage:
 *   const result = pickTxFrequency({
 *     currentDecodes: decodes,
 *     preferredHz: 1500,
 *   });
 */

// ============================================================================
// Constants
// ============================================================================

/** FT8 signal bandwidth: 8 tones x 6.25 Hz spacing. */
const FT8_BANDWIDTH_HZ = 50;

/** FT4 signal bandwidth: 4 tones x 20.83 Hz spacing. */
const FT4_BANDWIDTH_HZ = 83.3;

/** Default audio passband lower bound in Hz. */
const DEFAULT_AUDIO_LOW = 200;

/** Default audio passband upper bound in Hz. */
const DEFAULT_AUDIO_HIGH = 3000;

/** Default minimum gap between TX frequency and any occupied frequency. */
const DEFAULT_MIN_GAP_HZ = 60;

// ============================================================================
// Types
// ============================================================================

export interface TxFreqPickerOptions {
  /** Current decodes from the most recent cycle. */
  currentDecodes: { deltaFrequency: number }[];
  /** Preferred TX frequency in Hz (operator's last choice). */
  preferredHz?: number;
  /** Audio passband lower bound (default 200). */
  audioLow?: number;
  /** Audio passband upper bound (default 3000). */
  audioHigh?: number;
  /** Minimum gap in Hz to maintain from other signals (default 60). */
  minGapHz?: number;
  /** Protocol mode — affects tone bandwidth. */
  mode?: "FT8" | "FT4";
}

export interface TxFreqPickerResult {
  /** Recommended TX frequency in Hz. */
  frequencyHz: number;
  /** True if the preferred frequency was clear and used. */
  usedPreferred: boolean;
  /** Gap width in Hz at the chosen frequency. */
  gapWidthHz: number;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Pick the best transmit frequency that avoids collision with decoded signals.
 *
 * Algorithm:
 * 1. Extract occupied frequencies from current decodes.
 * 2. If a preferred frequency is provided and clear, use it.
 * 3. Otherwise find all gaps between adjacent occupied frequencies
 *    (including edges of the passband), select the widest gap, and
 *    place the TX frequency at its center.
 * 4. If no gap meets the minimum gap requirement, the widest available
 *    gap is used anyway — the narrow gapWidthHz in the result signals
 *    the compromise to the caller.
 */
export function pickTxFrequency(
  options: TxFreqPickerOptions,
): TxFreqPickerResult {
  const {
    currentDecodes,
    preferredHz,
    audioLow = DEFAULT_AUDIO_LOW,
    audioHigh = DEFAULT_AUDIO_HIGH,
    minGapHz = DEFAULT_MIN_GAP_HZ,
    mode = "FT8",
  } = options;

  const bandwidth = getSignalBandwidthHz(mode);
  const halfBw = bandwidth / 2;

  // ── Collect and sort occupied frequencies ────────────────────────────────
  const occupied = currentDecodes
    .map((d) => d.deltaFrequency)
    .filter((f) => f >= audioLow && f <= audioHigh)
    .sort((a, b) => a - b);

  // ── No signals: passband is wide open ───────────────────────────────────
  if (occupied.length === 0) {
    if (
      preferredHz !== undefined &&
      preferredHz >= audioLow + halfBw &&
      preferredHz <= audioHigh - halfBw
    ) {
      return {
        frequencyHz: preferredHz,
        usedPreferred: true,
        gapWidthHz: audioHigh - audioLow,
      };
    }
    const center = Math.round((audioLow + audioHigh) / 2);
    return {
      frequencyHz: center,
      usedPreferred: false,
      gapWidthHz: audioHigh - audioLow,
    };
  }

  // ── Check preferred frequency first ─────────────────────────────────────
  if (preferredHz !== undefined) {
    if (isFrequencyClear(preferredHz, currentDecodes, minGapHz, mode)) {
      // Compute exact gap width at the preferred frequency
      const gap = computeGapAtFrequency(
        preferredHz,
        occupied,
        audioLow,
        audioHigh,
        bandwidth,
      );
      return {
        frequencyHz: preferredHz,
        usedPreferred: true,
        gapWidthHz: gap,
      };
    }
  }

  // ── Build gap list ──────────────────────────────────────────────────────
  const gaps = buildGaps(occupied, audioLow, audioHigh, bandwidth);

  // ── Select best gap ─────────────────────────────────────────────────────
  // Prefer the widest gap that meets the minimum requirement. If none
  // qualifies, fall back to the widest overall.
  let bestGap = gaps[0];
  let bestQualifying: (typeof gaps)[number] | null = null;

  for (const gap of gaps) {
    if (gap.width > bestGap.width) {
      bestGap = gap;
    }
    if (gap.width >= minGapHz) {
      if (bestQualifying === null || gap.width > bestQualifying.width) {
        bestQualifying = gap;
      }
    }
  }

  const chosen = bestQualifying ?? bestGap;
  const txFreq = Math.round((chosen.low + chosen.high) / 2);

  // Clamp to passband (accounting for signal bandwidth on each side)
  const clampedFreq = Math.max(
    audioLow + halfBw,
    Math.min(audioHigh - halfBw, txFreq),
  );

  return {
    frequencyHz: Math.round(clampedFreq),
    usedPreferred: false,
    gapWidthHz: chosen.width,
  };
}

/**
 * Check if a specific frequency is clear of collisions with decoded signals.
 *
 * A frequency is considered clear when the edge-to-edge distance between
 * our signal and every occupied signal is at least `minGapHz`. The
 * center-to-center distance must therefore be at least one full signal
 * bandwidth (half from each side) plus the requested gap.
 */
export function isFrequencyClear(
  freqHz: number,
  decodes: { deltaFrequency: number }[],
  minGapHz: number = DEFAULT_MIN_GAP_HZ,
  mode: "FT8" | "FT4" = "FT8",
): boolean {
  const bandwidth = getSignalBandwidthHz(mode);
  // Each signal occupies `bandwidth` Hz centered on its frequency.
  // For two signals not to overlap with `minGapHz` clearance, their
  // centers must be at least `bandwidth + minGapHz` apart.
  const minCenterDist = bandwidth + minGapHz;

  for (const decode of decodes) {
    if (Math.abs(freqHz - decode.deltaFrequency) < minCenterDist) {
      return false;
    }
  }
  return true;
}

/**
 * Get the signal bandwidth in Hz for a given protocol mode.
 *
 * - FT8: 8 tones x 6.25 Hz = 50 Hz
 * - FT4: 4 tones x 20.83 Hz ~= 83.3 Hz
 */
export function getSignalBandwidthHz(mode: "FT8" | "FT4"): number {
  return mode === "FT4" ? FT4_BANDWIDTH_HZ : FT8_BANDWIDTH_HZ;
}

// ============================================================================
// Internal Helpers
// ============================================================================

interface FrequencyGap {
  /** Lower edge of the gap in Hz (signal boundary or passband edge). */
  low: number;
  /** Upper edge of the gap in Hz (signal boundary or passband edge). */
  high: number;
  /** Width of the gap (high - low). */
  width: number;
}

/**
 * Build a sorted list of frequency gaps between occupied signals.
 *
 * Includes the edge gaps from the passband boundaries to the first and
 * last occupied signal. Each occupied frequency is treated as occupying
 * `bandwidth` Hz centered on its deltaFrequency.
 */
function buildGaps(
  sortedOccupied: number[],
  audioLow: number,
  audioHigh: number,
  bandwidth: number,
): FrequencyGap[] {
  const halfBw = bandwidth / 2;
  const gaps: FrequencyGap[] = [];

  // Gap from passband lower edge to the lower edge of the first signal
  const firstSignalLow = sortedOccupied[0] - halfBw;
  if (firstSignalLow > audioLow) {
    gaps.push({
      low: audioLow,
      high: firstSignalLow,
      width: firstSignalLow - audioLow,
    });
  }

  // Gaps between adjacent signals
  for (let i = 0; i < sortedOccupied.length - 1; i++) {
    const upperEdgeCurrent = sortedOccupied[i] + halfBw;
    const lowerEdgeNext = sortedOccupied[i + 1] - halfBw;
    if (lowerEdgeNext > upperEdgeCurrent) {
      gaps.push({
        low: upperEdgeCurrent,
        high: lowerEdgeNext,
        width: lowerEdgeNext - upperEdgeCurrent,
      });
    }
  }

  // Gap from the upper edge of the last signal to passband upper edge
  const lastSignalHigh = sortedOccupied[sortedOccupied.length - 1] + halfBw;
  if (audioHigh > lastSignalHigh) {
    gaps.push({
      low: lastSignalHigh,
      high: audioHigh,
      width: audioHigh - lastSignalHigh,
    });
  }

  // If signals are so dense that no gap was found, create a minimal one
  // spanning the full passband so the caller still gets a result.
  if (gaps.length === 0) {
    gaps.push({
      low: audioLow,
      high: audioHigh,
      width: 0,
    });
  }

  return gaps;
}

/**
 * Compute the effective gap width at a specific frequency given the
 * surrounding occupied signals.
 *
 * Returns the distance from freqHz to the nearest occupied signal edge,
 * doubled to represent the full gap around the chosen TX frequency.
 */
function computeGapAtFrequency(
  freqHz: number,
  sortedOccupied: number[],
  audioLow: number,
  audioHigh: number,
  bandwidth: number,
): number {
  const halfBw = bandwidth / 2;

  let nearestBelow = audioLow;
  let nearestAbove = audioHigh;

  for (const occ of sortedOccupied) {
    const upper = occ + halfBw;
    const lower = occ - halfBw;

    if (upper <= freqHz && upper > nearestBelow) {
      nearestBelow = upper;
    }
    if (lower >= freqHz && lower < nearestAbove) {
      nearestAbove = lower;
    }
  }

  return nearestAbove - nearestBelow;
}
