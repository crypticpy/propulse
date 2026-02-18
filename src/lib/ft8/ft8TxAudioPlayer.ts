/**
 * FT8 TX Audio Player — GFSK-modulated audio generation and playback
 *
 * Generates continuous-phase GFSK (Gaussian Frequency Shift Keying) audio
 * from FT8/FT4 tone symbols and plays it via the Web Audio API.
 *
 * FT8 modulation parameters:
 *   - Symbol period:  0.160 s
 *   - Tone spacing:   6.25 Hz
 *   - Symbol count:   79
 *   - Total duration: 12.64 s
 *   - BT product:     2.0  (Gaussian bandwidth-time)
 *
 * FT4 modulation parameters:
 *   - Symbol period:  0.048 s
 *   - Tone spacing:   20.8333 Hz
 *   - Symbol count:   105
 *   - Total duration: 5.04 s
 *   - BT product:     1.0
 */

// =============================================================================
// Types
// =============================================================================

export interface Ft8TxAudioOptions {
  /** 79 tone symbols (FT8) or 105 (FT4), each value 0-7 */
  symbols: number[];
  /** Audio frequency offset in Hz (200-3000, typically 1000-2500) */
  baseFreqHz: number;
  /** Output sample rate (default 48000) */
  sampleRate?: number;
  /** Protocol mode */
  mode: "FT8" | "FT4";
}

export interface Ft8TxPlaybackHandle {
  /** Promise that resolves when playback completes */
  done: Promise<void>;
  /** Stop playback immediately */
  stop: () => void;
  /** Duration in seconds */
  durationSec: number;
}

// =============================================================================
// Mode-specific constants
// =============================================================================

interface ModeParams {
  symbolPeriod: number; // seconds
  toneSpacing: number; // Hz
  expectedSymbols: number;
  bt: number; // Gaussian bandwidth-time product
}

const MODE_PARAMS: Record<"FT8" | "FT4", ModeParams> = {
  FT8: {
    symbolPeriod: 0.16,
    toneSpacing: 6.25,
    expectedSymbols: 79,
    bt: 2.0,
  },
  FT4: {
    symbolPeriod: 0.048,
    toneSpacing: 20.8333,
    expectedSymbols: 105,
    bt: 1.0,
  },
};

// =============================================================================
// Gaussian filter helpers
// =============================================================================

/**
 * Evaluate the Gaussian pulse shape for GFSK modulation.
 *
 * h(t) = sqrt(2*pi/ln(2)) * BT * exp(-2*pi^2 * BT^2 * t^2 / ln(2))
 *
 * where `t` is measured in symbol periods.
 */
function gaussianPulse(t: number, bt: number): number {
  const ln2 = Math.LN2;
  const pi2 = Math.PI * Math.PI;
  const coefficient = Math.sqrt((2 * Math.PI) / ln2) * bt;
  const exponent = (-2 * pi2 * bt * bt * t * t) / ln2;
  return coefficient * Math.exp(exponent);
}

// =============================================================================
// Audio context singleton (browser-side)
// =============================================================================

let sharedCtx: AudioContext | null = null;

function getAudioContext(sampleRate: number): AudioContext {
  if (
    sharedCtx &&
    sharedCtx.state !== "closed" &&
    sharedCtx.sampleRate === sampleRate
  ) {
    return sharedCtx;
  }
  // Close old context if sample rate changed
  if (sharedCtx && sharedCtx.state !== "closed") {
    sharedCtx.close().catch(() => {});
  }
  sharedCtx = new AudioContext({ sampleRate });
  return sharedCtx;
}

// =============================================================================
// FT8 TX Audio Player
// =============================================================================

export class Ft8TxAudioPlayer {
  /** Currently playing source node (for stopAll) */
  private activeSource: AudioBufferSourceNode | null = null;

  /**
   * Generate GFSK audio samples from tone symbols.
   *
   * The algorithm computes a continuous-phase GFSK waveform:
   * 1. For each output sample, determine the fractional symbol position.
   * 2. Compute instantaneous frequency as a Gaussian-weighted sum of nearby
   *    symbol tone values, providing smooth frequency transitions.
   * 3. Accumulate phase from instantaneous frequency (continuous phase).
   * 4. Output sin(phase).
   *
   * @returns Float32Array of audio samples at the requested sample rate.
   */
  generateAudio(options: Ft8TxAudioOptions): Float32Array {
    const { symbols, baseFreqHz, mode } = options;
    const sampleRate = options.sampleRate ?? 48_000;
    const params = MODE_PARAMS[mode];

    // Validate inputs
    if (baseFreqHz < 200 || baseFreqHz > 3000) {
      throw new RangeError(`baseFreqHz must be 200-3000, got ${baseFreqHz}`);
    }
    if (symbols.length !== params.expectedSymbols) {
      throw new RangeError(
        `${mode} requires exactly ${params.expectedSymbols} symbols, got ${symbols.length}`,
      );
    }
    for (let i = 0; i < symbols.length; i++) {
      if (symbols[i] < 0 || symbols[i] > 7 || !Number.isInteger(symbols[i])) {
        throw new RangeError(
          `Symbol ${i} out of range: expected integer 0-7, got ${symbols[i]}`,
        );
      }
    }

    const { symbolPeriod, toneSpacing, bt } = params;
    const totalDuration = symbols.length * symbolPeriod;
    const totalSamples = Math.ceil(totalDuration * sampleRate);
    const output = new Float32Array(totalSamples);

    // Gaussian window half-width in symbol periods.
    // Evaluate over +/-2 symbol periods for practical accuracy.
    const windowHalf = 2;

    // Pre-compute dt for phase accumulation
    const dt = 1 / sampleRate;

    let phase = 0;

    for (let i = 0; i < totalSamples; i++) {
      const t = i * dt; // current time in seconds
      const symPos = t / symbolPeriod; // fractional symbol position

      // Compute instantaneous frequency as Gaussian-weighted sum of
      // nearby symbol tone values
      let weightedTone = 0;
      let weightSum = 0;

      // Range of symbol indices to consider
      const symCenter = Math.floor(symPos);
      const symStart = Math.max(0, symCenter - windowHalf);
      const symEnd = Math.min(symbols.length - 1, symCenter + windowHalf);

      for (let s = symStart; s <= symEnd; s++) {
        // Distance from current position to symbol center, in symbol periods
        const dist = symPos - (s + 0.5);
        const weight = gaussianPulse(dist, bt);
        weightedTone += symbols[s] * weight;
        weightSum += weight;
      }

      // Normalize the weighted tone value
      if (weightSum > 0) {
        weightedTone /= weightSum;
      }

      // Instantaneous frequency
      const instFreq = baseFreqHz + weightedTone * toneSpacing;

      // Accumulate phase (continuous phase GFSK)
      phase += 2 * Math.PI * instFreq * dt;

      // Keep phase in [0, 2pi) to avoid floating point drift
      if (phase > 2 * Math.PI) {
        phase -= 2 * Math.PI;
      }

      output[i] = Math.sin(phase);
    }

    return output;
  }

  /**
   * Play the generated audio through the Web Audio API.
   *
   * Creates an AudioBuffer from the GFSK waveform and plays it using an
   * AudioBufferSourceNode. Returns a handle with a done promise and stop method.
   */
  play(options: Ft8TxAudioOptions): Ft8TxPlaybackHandle {
    const sampleRate = options.sampleRate ?? 48_000;
    const params = MODE_PARAMS[options.mode];
    const durationSec = options.symbols.length * params.symbolPeriod;

    // Stop any currently playing audio first
    this.stopAll();

    // Generate the GFSK audio samples
    const samples = this.generateAudio(options);

    // Get or create audio context
    const ctx = getAudioContext(sampleRate);
    // Create AudioBuffer and copy samples
    const buffer = ctx.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(samples, 0);

    // Create source node
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    this.activeSource = source;

    // Build the done promise
    const done = new Promise<void>((resolve, reject) => {
      source.onended = () => {
        this.activeSource = null;
        resolve();
      };

      // Resume context if suspended (browser autoplay policy)
      if (ctx.state === "suspended") {
        ctx
          .resume()
          .then(() => {
            source.start(0);
          })
          .catch(reject);
      } else {
        source.start(0);
      }
    });

    const stop = () => {
      try {
        source.stop();
      } catch {
        // Already stopped or not started — ignore
      }
      this.activeSource = null;
    };

    return { done, durationSec, stop };
  }

  /**
   * Stop any currently playing audio immediately.
   */
  stopAll(): void {
    if (this.activeSource) {
      try {
        this.activeSource.stop();
      } catch {
        // Already stopped — ignore
      }
      this.activeSource = null;
    }
  }
}
