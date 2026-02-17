// ---------------------------------------------------------------------------
// eqResponse — Frequency response computation for parametric EQ system
// ---------------------------------------------------------------------------
//
// Computes the combined magnitude response of an array of EQ bands using the
// Web Audio API's BiquadFilterNode.getFrequencyResponse() method. Designed for
// render-loop usage (~60 fps) with pre-allocated buffers and a pooled node set.
//
// Target: <0.5 ms for 16 bands x 2000 frequency points.
// ---------------------------------------------------------------------------

import {
  type EqBand,
  EQ_FILTER_TO_BIQUAD,
  MAX_EQ_BANDS,
  filterTypeUsesGain,
} from "./eqTypes";

// ---------------------------------------------------------------------------
// Module-level state (lazy-initialized)
// ---------------------------------------------------------------------------

/** Shared audio context used only for BiquadFilterNode frequency response. */
let _ctx: BaseAudioContext | null = null;

/** Pool of reusable BiquadFilterNode instances. */
let _nodePool: BiquadFilterNode[] = [];

/** Tracks the last freqPoints length to know when to reallocate buffers. */
let _lastLength = 0;

/** Per-band magnitude output (linear scale). */
let _magResponse = new Float32Array(0);

/** Per-band phase output (required by API, not used). */
let _phaseResponse = new Float32Array(0);

/** Accumulated combined magnitude (linear, product of all bands). */
let _combinedMag = new Float32Array(0);

/** Final output buffer (dB). */
let _resultDb = new Float32Array(0);

// ---------------------------------------------------------------------------
// Lazy initialization
// ---------------------------------------------------------------------------

/** Create or return the shared AudioContext used for frequency response only. */
function getContext(): BaseAudioContext {
  if (_ctx) return _ctx;

  // OfflineAudioContext is preferred — it never needs audio hardware
  try {
    _ctx = new OfflineAudioContext(1, 1, 44100);
  } catch {
    // Fallback for environments where OfflineAudioContext is unavailable
    try {
      _ctx = new AudioContext();
    } catch {
      throw new Error(
        "eqResponse: neither OfflineAudioContext nor AudioContext is available",
      );
    }
  }

  return _ctx;
}

/** Ensure the node pool has at least `count` BiquadFilterNode instances. */
function ensurePool(count: number): void {
  const ctx = getContext();
  while (_nodePool.length < count) {
    _nodePool.push(ctx.createBiquadFilter());
  }
}

/** Reallocate working buffers when the frequency point count changes. */
function ensureBuffers(length: number): void {
  if (length === _lastLength) return;
  _lastLength = length;
  _magResponse = new Float32Array(length);
  _phaseResponse = new Float32Array(length);
  _combinedMag = new Float32Array(length);
  _resultDb = new Float32Array(length);
}

// ---------------------------------------------------------------------------
// Frequency clamping
// ---------------------------------------------------------------------------

/**
 * Return a sanitised copy of freqPoints with values <= 0 clamped to 1 Hz.
 * If no values need clamping the original array is returned (zero-copy).
 */
function clampFreqPoints(freqPoints: Float32Array): Float32Array {
  let needsClamp = false;
  for (let i = 0; i < freqPoints.length; i++) {
    if (freqPoints[i] <= 0) {
      needsClamp = true;
      break;
    }
  }

  if (!needsClamp) return freqPoints;

  const clamped = new Float32Array(freqPoints.length);
  for (let i = 0; i < freqPoints.length; i++) {
    clamped[i] = freqPoints[i] <= 0 ? 1 : freqPoints[i];
  }
  return clamped;
}

// ---------------------------------------------------------------------------
// Node configuration
// ---------------------------------------------------------------------------

/** Configure a pooled BiquadFilterNode to match an EqBand. */
function configureBiquadNode(node: BiquadFilterNode, band: EqBand): void {
  node.type = EQ_FILTER_TO_BIQUAD[band.filterType];
  node.frequency.value = band.freqHz;
  node.Q.value = band.q;
  node.gain.value = filterTypeUsesGain(band.filterType) ? band.gainDb : 0;
}

// ---------------------------------------------------------------------------
// Main export — combined frequency response
// ---------------------------------------------------------------------------

/**
 * Compute the combined frequency response of an array of EQ bands.
 *
 * @param bands - Active EQ band configurations (only enabled bands are computed)
 * @param freqPoints - Float32Array of audio-domain frequencies in Hz to evaluate
 * @returns Float32Array of combined magnitude response in dB at each frequency point
 *
 * Performance: Pre-allocated buffers + pooled BiquadFilterNodes.
 * Target: <0.5 ms for 16 bands x 2000 frequency points.
 */
export function computeEqResponse(
  bands: EqBand[],
  freqPoints: Float32Array,
): Float32Array {
  const len = freqPoints.length;

  // Edge case: empty frequency array
  if (len === 0) return new Float32Array(0);

  // Filter to enabled bands only
  const enabledBands: EqBand[] = [];
  for (let i = 0; i < bands.length; i++) {
    if (bands[i].enabled) enabledBands.push(bands[i]);
  }

  // Edge case: no enabled bands — flat response (0 dB everywhere)
  if (enabledBands.length === 0) {
    return new Float32Array(len); // Float32Array initializes to 0
  }

  // Ensure buffers and pool are ready
  ensureBuffers(len);
  ensurePool(Math.min(enabledBands.length, MAX_EQ_BANDS));

  // Sanitise frequency points (clamp <= 0 to 1 Hz)
  const safeFreqs = clampFreqPoints(freqPoints);

  // Initialize combined magnitude to 1.0 (unity, linear scale)
  for (let i = 0; i < len; i++) {
    _combinedMag[i] = 1.0;
  }

  // Evaluate each enabled band and multiply into combined magnitude
  const bandCount = Math.min(enabledBands.length, MAX_EQ_BANDS);
  for (let b = 0; b < bandCount; b++) {
    const node = _nodePool[b];
    configureBiquadNode(node, enabledBands[b]);

    node.getFrequencyResponse(safeFreqs, _magResponse, _phaseResponse);

    // Multiply per-band magnitude into combined result (linear domain)
    // Cascaded stages: slope / 12 identical BiquadFilterNodes per band
    const stages = (enabledBands[b].slope ?? 12) / 12;
    for (let i = 0; i < len; i++) {
      _combinedMag[i] *=
        stages === 1 ? _magResponse[i] : _magResponse[i] ** stages;
    }
  }

  // Convert combined linear magnitude to dB
  for (let i = 0; i < len; i++) {
    const mag = _combinedMag[i];
    // Guard against log10(0) — clamp to very small positive value
    _resultDb[i] = mag > 0 ? 20 * Math.log10(mag) : -120;
  }

  // Return a copy so callers can safely store the reference
  return new Float32Array(_resultDb);
}

// ---------------------------------------------------------------------------
// Secondary export — single band response
// ---------------------------------------------------------------------------

/**
 * Compute the frequency response of a SINGLE band.
 * Useful for drawing individual band shapes on hover.
 *
 * @param band - The EQ band configuration
 * @param freqPoints - Float32Array of frequencies in Hz to evaluate
 * @returns Float32Array of magnitude response in dB at each frequency point
 */
export function computeSingleBandResponse(
  band: EqBand,
  freqPoints: Float32Array,
): Float32Array {
  const len = freqPoints.length;
  if (len === 0) return new Float32Array(0);

  ensureBuffers(len);
  ensurePool(1);

  const safeFreqs = clampFreqPoints(freqPoints);

  const node = _nodePool[0];
  configureBiquadNode(node, band);
  node.getFrequencyResponse(safeFreqs, _magResponse, _phaseResponse);

  const stages = (band.slope ?? 12) / 12;
  const result = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const mag = _magResponse[i];
    const magStaged = stages === 1 ? mag : mag ** stages;
    result[i] = magStaged > 0 ? 20 * Math.log10(magStaged) : -120;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/**
 * Dispose the internal AudioContext and node pool.
 * Called when the EQ system is torn down (optional cleanup).
 */
export function disposeEqResponseContext(): void {
  if (_ctx) {
    // OfflineAudioContext does not have a close() method, but AudioContext does
    if ("close" in _ctx && typeof (_ctx as AudioContext).close === "function") {
      void (_ctx as AudioContext).close();
    }
    _ctx = null;
  }

  _nodePool = [];
  _lastLength = 0;
  _magResponse = new Float32Array(0);
  _phaseResponse = new Float32Array(0);
  _combinedMag = new Float32Array(0);
  _resultDb = new Float32Array(0);
}
