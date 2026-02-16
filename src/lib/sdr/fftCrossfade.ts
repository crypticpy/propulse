/**
 * FFT Cross-fade Utility
 *
 * Blends between a wideband CI-V FFT source (~1050 Hz/bin) and an optional
 * narrowband audio FFT source (~11.7 Hz/bin) within the receiver passband.
 *
 * Outside the passband: CI-V only.
 * Inside the passband (past fade zones): audio only.
 * Within the fade zones (fadeHz wide at each edge): linear blend between
 * CI-V and audio.
 *
 * Both sources are sampled with linear interpolation between adjacent bins,
 * except when `civInterpolation` is set to "nearest" (used by the waterfall
 * renderer for its characteristic pixel-sharp look).
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface CrossfadeParams {
  /** Current frequency to sample (absolute Hz). */
  hz: number;

  // CI-V (wideband) source
  civBins: Float32Array;
  civStartHz: number;
  civSpanHz: number;
  civMinDb: number;
  civRange: number;

  // Audio (narrowband) source — null means CI-V only everywhere
  audioBins: Float32Array | null;
  audioStartHz: number;
  audioSpanHz: number;
  audioMinDb: number;
  audioRange: number;

  // Passband boundaries (absolute Hz)
  passbandStartHz: number;
  passbandEndHz: number;

  /** Width of each cross-fade zone in Hz (default 200). */
  fadeHz: number;

  /**
   * CI-V bin sampling mode.
   * - "linear": fractional-index lerp between adjacent bins (SpectrumScope).
   * - "nearest": floor-index nearest-neighbor (Waterfall).
   * Default: "linear".
   */
  civInterpolation?: "linear" | "nearest";
}

// ── Helpers ────────────────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

/**
 * Sample a single bin array with linear interpolation.
 * Returns the dB value at fractional position `frac` within `bins`.
 */
function sampleBinsLerp(
  bins: Float32Array,
  frac: number,
  fallbackDb: number,
): number {
  const clamped = clamp(frac, 0, bins.length - 1.001);
  const lo = Math.floor(clamped);
  const hi = Math.min(lo + 1, bins.length - 1);
  const t = clamped - lo;
  return (bins[lo] ?? fallbackDb) * (1 - t) + (bins[hi] ?? fallbackDb) * t;
}

/**
 * Sample a single bin array with nearest-neighbor.
 * Returns the dB value at the closest integer index.
 */
function sampleBinsNearest(
  bins: Float32Array,
  frac: number,
  fallbackDb: number,
): number {
  const idx = clamp(Math.floor(frac), 0, bins.length - 1);
  return bins[idx] ?? fallbackDb;
}

// ── Core ───────────────────────────────────────────────────────────────────

/**
 * Returns a normalized 0-1 value for the given frequency, blending between
 * the CI-V wideband and audio narrowband FFT sources within the passband.
 */
export function sampleFftCrossfade(p: CrossfadeParams): number {
  const {
    hz,
    civBins,
    civStartHz,
    civSpanHz,
    civMinDb,
    civRange,
    audioBins,
    audioStartHz,
    audioSpanHz,
    audioMinDb,
    audioRange,
    passbandStartHz,
    passbandEndHz,
    fadeHz,
    civInterpolation = "linear",
  } = p;

  const useLinearCiv = civInterpolation === "linear";

  // Check whether we're in the cross-fade region (passband +/- fadeHz)
  const inFadeRegion =
    audioBins !== null &&
    hz >= passbandStartHz - fadeHz &&
    hz < passbandEndHz + fadeHz;

  if (inFadeRegion) {
    // ── Audio sample (always linear interpolation) ──
    const aFrac = ((hz - audioStartHz) / audioSpanHz) * audioBins!.length;
    const audioDb = sampleBinsLerp(audioBins!, aFrac, audioMinDb);
    const audioVal = clamp((audioDb - audioMinDb) / audioRange, 0, 1);

    // ── CI-V sample (interpolation mode depends on consumer) ──
    const cFrac = ((hz - civStartHz) / civSpanHz) * civBins.length;
    const civDb = useLinearCiv
      ? sampleBinsLerp(civBins, cFrac, civMinDb)
      : sampleBinsNearest(civBins, cFrac, civMinDb);
    const civVal = clamp((civDb - civMinDb) / civRange, 0, 1);

    // ── Blend factor: 1 = full audio, 0 = full CI-V ──
    let blend = 1;
    if (hz < passbandStartHz) {
      blend = (hz - (passbandStartHz - fadeHz)) / fadeHz;
    } else if (hz >= passbandEndHz) {
      blend = (passbandEndHz + fadeHz - hz) / fadeHz;
    }
    blend = clamp(blend, 0, 1);

    return audioVal * blend + civVal * (1 - blend);
  }

  // ── Outside passband: CI-V only ──
  const cFrac = ((hz - civStartHz) / civSpanHz) * civBins.length;
  const civDb = useLinearCiv
    ? sampleBinsLerp(civBins, cFrac, civMinDb)
    : sampleBinsNearest(civBins, cFrac, civMinDb);
  return clamp((civDb - civMinDb) / civRange, 0, 1);
}

/**
 * Fills a pre-allocated Float32Array with normalized 0-1 values across
 * a frequency range, avoiding per-pixel allocation overhead.
 *
 * @param out       Output buffer (length = number of pixels/samples).
 * @param viewStartHz  Start frequency of the view (left edge).
 * @param viewSpanHz   Total frequency span of the view.
 * @param params    All crossfade parameters except `hz` (supplied per pixel).
 */
export function fillFftCrossfade(
  out: Float32Array,
  viewStartHz: number,
  viewSpanHz: number,
  params: Omit<CrossfadeParams, "hz">,
): void {
  const len = out.length;
  if (len === 0) return;

  const {
    civBins,
    civStartHz,
    civSpanHz,
    civMinDb,
    civRange,
    audioBins,
    audioStartHz,
    audioSpanHz,
    audioMinDb,
    audioRange,
    passbandStartHz,
    passbandEndHz,
    fadeHz,
    civInterpolation = "linear",
  } = params;

  const useLinearCiv = civInterpolation === "linear";
  const hasAudio = audioBins !== null;
  const wm1 = Math.max(1, len - 1);

  // Pre-compute fade-zone boundaries to minimize branching in the hot loop.
  const fadeLoStart = passbandStartHz - fadeHz; // left edge of left fade zone
  const fadeHiEnd = passbandEndHz + fadeHz; // right edge of right fade zone

  for (let x = 0; x < len; x++) {
    const hz = viewStartHz + (x / wm1) * viewSpanHz;

    const inFadeRegion = hasAudio && hz >= fadeLoStart && hz < fadeHiEnd;

    if (inFadeRegion) {
      // ── Audio sample ──
      const aFrac = ((hz - audioStartHz) / audioSpanHz) * audioBins!.length;
      const audioDb = sampleBinsLerp(audioBins!, aFrac, audioMinDb);
      const audioVal = clamp((audioDb - audioMinDb) / audioRange, 0, 1);

      // ── CI-V sample ──
      const cFrac = ((hz - civStartHz) / civSpanHz) * civBins.length;
      const civDb = useLinearCiv
        ? sampleBinsLerp(civBins, cFrac, civMinDb)
        : sampleBinsNearest(civBins, cFrac, civMinDb);
      const civVal = clamp((civDb - civMinDb) / civRange, 0, 1);

      // ── Blend ──
      let blend = 1;
      if (hz < passbandStartHz) {
        blend = (hz - fadeLoStart) / fadeHz;
      } else if (hz >= passbandEndHz) {
        blend = (fadeHiEnd - hz) / fadeHz;
      }
      blend = clamp(blend, 0, 1);

      out[x] = audioVal * blend + civVal * (1 - blend);
    } else {
      // ── CI-V only ──
      const cFrac = ((hz - civStartHz) / civSpanHz) * civBins.length;
      const civDb = useLinearCiv
        ? sampleBinsLerp(civBins, cFrac, civMinDb)
        : sampleBinsNearest(civBins, cFrac, civMinDb);
      out[x] = clamp((civDb - civMinDb) / civRange, 0, 1);
    }
  }
}
