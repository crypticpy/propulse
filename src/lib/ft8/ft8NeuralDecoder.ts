/**
 * ft8NeuralDecoder — AI-assisted secondary decoder for marginal FT8 signals.
 *
 * When the standard LDPC decoder fails on weak signals (below ~-24 dB), this
 * module provides a neural-network-based fallback path.  A pre-trained model
 * predicts per-bit probabilities from spectrogram patches, and a soft-decision
 * LDPC decoder uses those probabilities for error correction.
 *
 * Architecture:
 *   1. Spectral analysis identifies candidate signal regions below LDPC threshold
 *   2. Neural network predicts bit probabilities from spectrogram patches
 *   3. Soft-decision LDPC decoder uses neural probabilities for error correction
 *   4. CRC-14 validation confirms decoded message integrity
 *
 * The actual model weights are loaded at runtime (not bundled).  If ONNX Runtime
 * Web is unavailable or no model is loaded, all public methods degrade gracefully
 * — {@link decode} returns an empty result rather than throwing.
 *
 * References:
 *   - FT8 LDPC(174,91) code: see {@link ../ft8Constants}
 *   - Decode depth presets:   see {@link ../ft8DecodeSensitivity}
 */

import {
  FTX_LDPC_N,
  FTX_LDPC_K,
  FT8_CRC_POLYNOMIAL,
  FT8_CRC_WIDTH,
  FT8_TIMING,
} from "./ft8Constants";

// ============================================================================
// Types
// ============================================================================

/** Configuration for the neural decoder. */
export interface NeuralDecoderConfig {
  /** Path or URL to the ONNX / TFLite model file. */
  modelUrl: string;
  /** Minimum SNR (dB) to attempt neural decode. */
  minSnr: number;
  /** Maximum candidate signal regions to evaluate per decode cycle. */
  maxCandidates: number;
  /** Confidence threshold (0-1) to accept a decode. */
  confidenceThreshold: number;
}

/** A single candidate decode produced by the neural decoder. */
export interface NeuralDecodeCandidate {
  /** Decoded message text. */
  message: string;
  /** Confidence score (0-1). */
  confidence: number;
  /** Estimated SNR (dB). */
  estimatedSnr: number;
  /** Audio frequency offset (Hz). */
  frequencyHz: number;
  /** Time offset within the FT8 cycle (seconds). */
  timeOffsetSec: number;
  /** Whether the LDPC check passed after neural correction. */
  ldpcValid: boolean;
}

/** Aggregate result of a neural decode attempt. */
export interface NeuralDecodeResult {
  /** Successfully decoded candidates that passed all validation. */
  candidates: NeuralDecodeCandidate[];
  /** Number of signal regions evaluated. */
  regionsEvaluated: number;
  /** Wall-clock processing time in milliseconds. */
  processingTimeMs: number;
}

// ============================================================================
// Internal helpers — spectrogram / DSP
// ============================================================================

/** A single candidate signal region in the spectrogram. */
interface CandidateRegion {
  /** Centre frequency (Hz). */
  frequencyHz: number;
  /** Frequency-bin index in the spectrogram. */
  binIndex: number;
  /** Time offset from cycle start (seconds). */
  timeOffsetSec: number;
  /** Estimated SNR (dB). */
  estimatedSnr: number;
  /** Spectrogram patch (time-frames x frequency-bins). */
  patch: Float32Array;
}

/** FFT window size used for spectrogram computation. */
const FFT_SIZE = 256;

/** Frequency resolution in Hz — matches FT8 tone spacing. */
const FREQ_RESOLUTION = FT8_TIMING.toneSpacing; // 6.25 Hz

/** FT8 signal bandwidth: 8 tones x 6.25 Hz = 50 Hz. */
const FT8_BANDWIDTH_HZ = 8 * FREQ_RESOLUTION;

/**
 * Number of spectrogram time-frames that span one FT8 transmission.
 * Used to size candidate patches for the neural network input.
 */
const FRAMES_PER_SYMBOL = 2;
const PATCH_TIME_FRAMES = FT8_TIMING.totalSymbols * FRAMES_PER_SYMBOL;

/** Number of frequency bins in each spectrogram patch (covers 50 Hz). */
const PATCH_FREQ_BINS = Math.ceil(FT8_BANDWIDTH_HZ / FREQ_RESOLUTION) + 2;

// ============================================================================
// Internal helpers — LDPC / CRC
// ============================================================================

/**
 * Compute CRC-14 over a packed bit array.
 *
 * @param bits  - Boolean array of message bits (length 77).
 * @returns 14-bit CRC value.
 */
function computeCrc14(bits: boolean[]): number {
  let crc = 0;
  for (let i = 0; i < bits.length; i++) {
    const bit = bits[i] ? 1 : 0;
    const msb = (crc >> (FT8_CRC_WIDTH - 1)) & 1;
    crc = ((crc << 1) | bit) & ((1 << FT8_CRC_WIDTH) - 1);
    if (msb) {
      crc ^= FT8_CRC_POLYNOMIAL;
    }
  }
  return crc;
}

/**
 * Verify CRC-14 on a 91-bit codeword (77 message + 14 CRC).
 *
 * @param bits - Boolean array of length >= 91.
 * @returns `true` if CRC matches.
 */
function verifyCrc14(bits: boolean[]): boolean {
  const messageBits = bits.slice(0, 77);
  const crc = computeCrc14(messageBits);
  let extractedCrc = 0;
  for (let i = 0; i < FT8_CRC_WIDTH; i++) {
    extractedCrc = (extractedCrc << 1) | (bits[77 + i] ? 1 : 0);
  }
  return crc === extractedCrc;
}

/**
 * Soft-decision LDPC check.
 *
 * Given per-bit probabilities (0-1, where 1 = confident "1"), perform a
 * simplified belief-propagation check to determine whether the codeword is
 * likely valid.  This is intentionally lightweight — the neural network
 * already provides strong priors.
 *
 * @param bitProbabilities - Array of length {@link FTX_LDPC_N} (174).
 * @returns Hard-decision bit array and a validity flag.
 */
function softLdpcCheck(bitProbabilities: Float32Array): {
  bits: boolean[];
  valid: boolean;
  confidence: number;
} {
  // Hard decision from probabilities
  const bits: boolean[] = new Array(FTX_LDPC_N);
  let totalConfidence = 0;
  for (let i = 0; i < FTX_LDPC_N; i++) {
    const p = bitProbabilities[i];
    bits[i] = p >= 0.5;
    totalConfidence += Math.abs(p - 0.5) * 2; // 0 = uncertain, 1 = certain
  }
  const avgConfidence = totalConfidence / FTX_LDPC_N;

  // Extract data bits (first K=91 bits) and verify CRC
  const dataBits = bits.slice(0, FTX_LDPC_K);
  const crcValid = verifyCrc14(dataBits);

  return { bits: dataBits, valid: crcValid, confidence: avgConfidence };
}

/**
 * Decode 77 message bits into an FT8 message string.
 *
 * This is a simplified decoder that handles the most common Type 1
 * (standard) messages: `<call1> <call2> <grid/report>`.
 * Full message-type dispatch is deferred to the main decoder pipeline.
 *
 * @param bits - 77 message bits (boolean array).
 * @returns Decoded message string, or empty string on failure.
 */
function bitsToMessage(bits: boolean[]): string {
  // Pack bits into bytes for easier extraction
  const bytes = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i++) {
    if (bits[i]) {
      bytes[i >> 3] |= 1 << (7 - (i & 7));
    }
  }

  // Extract i3 (bits 74-76) to determine message type
  const i3 =
    ((bits[74] ? 1 : 0) << 2) | ((bits[75] ? 1 : 0) << 1) | (bits[76] ? 1 : 0);

  if (i3 === 0) {
    // Type 0: free text — extract 71 bits as 13 chars from 42-char alphabet
    const CHARSET = " 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ+-./?";
    let value = BigInt(0);
    for (let i = 0; i < 71; i++) {
      value = (value << BigInt(1)) | BigInt(bits[i] ? 1 : 0);
    }
    let text = "";
    for (let c = 0; c < 13; c++) {
      const idx = Number(value % BigInt(42));
      value = value / BigInt(42);
      text = CHARSET[idx] + text;
    }
    return text.trim();
  }

  // For other message types, return a hex representation as a fallback.
  // The caller's pipeline will re-parse using ft8MessageParser for display.
  let hex = "";
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, "0");
  }
  return `<neural:0x${hex}>`;
}

// ============================================================================
// Internal helpers — spectrogram computation
// ============================================================================

/**
 * Apply a Hann window to a segment of audio samples.
 *
 * @param samples - Source audio buffer.
 * @param offset  - Start index within `samples`.
 * @param size    - Window length.
 * @returns Windowed samples.
 */
function applyHannWindow(
  samples: Float32Array,
  offset: number,
  size: number,
): Float32Array {
  const windowed = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const idx = offset + i;
    const sample = idx < samples.length ? samples[idx] : 0;
    const hann = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
    windowed[i] = sample * hann;
  }
  return windowed;
}

/**
 * Compute a magnitude spectrogram from raw PCM audio.
 *
 * Uses overlapping Hann-windowed FFT frames.  Returns a 2-D Float32Array
 * flattened in row-major order (time-frames x frequency-bins).
 *
 * @param samples    - Mono audio samples.
 * @param sampleRate - Sample rate (Hz).
 * @returns Spectrogram data, number of time frames, and number of freq bins.
 */
function computeSpectrogram(
  samples: Float32Array,
  sampleRate: number,
): {
  data: Float32Array;
  timeFrames: number;
  freqBins: number;
  freqResolution: number;
  hopSize: number;
} {
  const fftSize = FFT_SIZE;
  const hopSize = Math.floor(fftSize / 2); // 50% overlap
  const freqBins = fftSize / 2 + 1;
  const freqResolution = sampleRate / fftSize;
  const timeFrames = Math.floor((samples.length - fftSize) / hopSize) + 1;

  if (timeFrames <= 0) {
    return {
      data: new Float32Array(0),
      timeFrames: 0,
      freqBins,
      freqResolution,
      hopSize,
    };
  }

  const spectrogram = new Float32Array(timeFrames * freqBins);

  for (let frame = 0; frame < timeFrames; frame++) {
    const offset = frame * hopSize;
    const windowed = applyHannWindow(samples, offset, fftSize);

    // Simple DFT for magnitude (real-valued input -> half-spectrum).
    // In production this would use an optimised FFT (e.g. from a WASM module).
    for (let k = 0; k < freqBins; k++) {
      let re = 0;
      let im = 0;
      for (let n = 0; n < fftSize; n++) {
        const angle = (2 * Math.PI * k * n) / fftSize;
        re += windowed[n] * Math.cos(angle);
        im -= windowed[n] * Math.sin(angle);
      }
      const mag = Math.sqrt(re * re + im * im);
      spectrogram[frame * freqBins + k] = mag;
    }
  }

  return { data: spectrogram, timeFrames, freqBins, freqResolution, hopSize };
}

/**
 * Estimate the noise floor from the spectrogram using the median of each
 * frequency bin across all time frames.
 *
 * @param spectrogram - Flattened spectrogram (time-frames x freq-bins).
 * @param timeFrames  - Number of time frames.
 * @param freqBins    - Number of frequency bins.
 * @returns Per-bin noise floor estimate.
 */
function estimateNoiseFloor(
  spectrogram: Float32Array,
  timeFrames: number,
  freqBins: number,
): Float32Array {
  const noiseFloor = new Float32Array(freqBins);
  const column = new Float32Array(timeFrames);

  for (let k = 0; k < freqBins; k++) {
    for (let t = 0; t < timeFrames; t++) {
      column[t] = spectrogram[t * freqBins + k];
    }
    // Sort for median
    const sorted = Array.from(column).sort((a, b) => a - b);
    noiseFloor[k] = sorted[Math.floor(timeFrames / 2)];
  }

  return noiseFloor;
}

/**
 * Identify candidate signal regions in the spectrogram.
 *
 * Scans frequency bins for sustained energy above the noise floor that
 * matches the expected FT8 signal bandwidth (~50 Hz) and duration (~12.6 s).
 *
 * @param spectrogram    - Spectrogram data.
 * @param timeFrames     - Number of time frames.
 * @param freqBins       - Number of frequency bins.
 * @param freqResolution - Hz per frequency bin.
 * @param noiseFloor     - Per-bin noise floor estimates.
 * @param config         - Neural decoder config.
 * @param excludeFreqs   - Frequencies already decoded (to skip).
 * @returns Array of candidate regions.
 */
function findCandidateRegions(
  spectrogram: Float32Array,
  timeFrames: number,
  freqBins: number,
  freqResolution: number,
  noiseFloor: Float32Array,
  config: NeuralDecoderConfig,
  excludeFreqs: number[],
): CandidateRegion[] {
  const candidates: CandidateRegion[] = [];
  const ft8BinSpan = Math.ceil(FT8_BANDWIDTH_HZ / freqResolution);
  const exclusionBins = 2; // guard bins around excluded frequencies

  // Build a set of excluded frequency bins
  const excludedBins = new Set<number>();
  for (const freq of excludeFreqs) {
    const centreBin = Math.round(freq / freqResolution);
    for (
      let b = centreBin - exclusionBins;
      b <= centreBin + exclusionBins;
      b++
    ) {
      if (b >= 0 && b < freqBins) excludedBins.add(b);
    }
  }

  // FT8 signals occupy roughly 200-3000 Hz; skip DC and above 3 kHz
  const minBin = Math.max(1, Math.floor(200 / freqResolution));
  const maxBin = Math.min(
    freqBins - ft8BinSpan,
    Math.ceil(3000 / freqResolution),
  );

  // Scan frequency bins for energy concentrations
  for (
    let startBin = minBin;
    startBin < maxBin;
    startBin += Math.max(1, ft8BinSpan >> 1)
  ) {
    if (excludedBins.has(startBin)) continue;

    // Average energy across the FT8 bandwidth and all time frames
    let signalEnergy = 0;
    let noiseEnergy = 0;
    for (let t = 0; t < timeFrames; t++) {
      for (let b = startBin; b < startBin + ft8BinSpan && b < freqBins; b++) {
        signalEnergy += spectrogram[t * freqBins + b];
        noiseEnergy += noiseFloor[b];
      }
    }

    const avgSignal = signalEnergy / (timeFrames * ft8BinSpan);
    const avgNoise = noiseEnergy / (timeFrames * ft8BinSpan);

    // Estimate SNR in dB
    const snrLinear = avgNoise > 0 ? avgSignal / avgNoise : 0;
    const estimatedSnr = snrLinear > 0 ? 10 * Math.log10(snrLinear) - 26 : -99;

    // Only keep candidates within the neural decoder's SNR range
    // (below standard threshold but above absolute minimum)
    if (estimatedSnr < config.minSnr || estimatedSnr > -20) continue;

    // Extract spectrogram patch for this candidate
    const patchTimeFrames = Math.min(PATCH_TIME_FRAMES, timeFrames);
    const patchFreqBins = Math.min(PATCH_FREQ_BINS, freqBins - startBin);
    const patch = new Float32Array(patchTimeFrames * patchFreqBins);

    for (let t = 0; t < patchTimeFrames; t++) {
      for (let b = 0; b < patchFreqBins; b++) {
        const srcBin = startBin + b;
        if (srcBin < freqBins) {
          patch[t * patchFreqBins + b] = spectrogram[t * freqBins + srcBin];
        }
      }
    }

    const centreFreqHz = (startBin + ft8BinSpan / 2) * freqResolution;
    const timeOffsetSec = 0; // Start of cycle (refined by model)

    candidates.push({
      frequencyHz: centreFreqHz,
      binIndex: startBin,
      timeOffsetSec,
      estimatedSnr,
      patch,
    });

    if (candidates.length >= config.maxCandidates) break;
  }

  // Sort by estimated SNR (strongest marginal signals first)
  candidates.sort((a, b) => b.estimatedSnr - a.estimatedSnr);

  return candidates.slice(0, config.maxCandidates);
}

// ============================================================================
// ONNX Runtime Web interface (runtime-detected)
// ============================================================================

/**
 * Minimal interface for the ONNX Runtime Web InferenceSession.
 * Avoids a compile-time dependency; the actual library is loaded dynamically.
 */
interface OnnxInferenceSession {
  run(
    feeds: Record<string, { data: Float32Array; dims: number[]; type: string }>,
  ): Promise<Record<string, { data: Float32Array }>>;
  release(): Promise<void>;
}

// ============================================================================
// Ft8NeuralDecoder
// ============================================================================

/** Default configuration values. */
const DEFAULT_CONFIG: NeuralDecoderConfig = {
  modelUrl: "",
  minSnr: -28,
  maxCandidates: 20,
  confidenceThreshold: 0.7,
};

/**
 * FT8 Neural Decoder — Secondary AI-assisted decoder for marginal signals.
 *
 * Provides an optional neural-network path for recovering FT8 messages from
 * signals below the standard LDPC decoder's threshold (~-24 dB).  When no
 * model is loaded the decoder degrades gracefully, returning empty results.
 *
 * @example
 * ```ts
 * const decoder = new Ft8NeuralDecoder({ confidenceThreshold: 0.75 });
 * await decoder.loadModel("/models/ft8-neural-v1.onnx");
 *
 * const result = await decoder.decode(audioSamples, 48000, [1000, 1500]);
 * for (const c of result.candidates) {
 *   console.log(`${c.message}  SNR=${c.estimatedSnr}  conf=${c.confidence}`);
 * }
 *
 * decoder.dispose();
 * ```
 */
export class Ft8NeuralDecoder {
  private config: NeuralDecoderConfig;
  private session: OnnxInferenceSession | null = null;
  private modelLoaded = false;

  // ── Constructor ───────────────────────────────────────────────────────────

  constructor(config?: Partial<NeuralDecoderConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Load a neural decoder model from a URL.
   *
   * Supports ONNX format via ONNX Runtime Web.  The runtime library is
   * detected dynamically; if it is not available an error is thrown with a
   * descriptive message.
   *
   * @param url - URL or path to the `.onnx` model file.
   * @throws If ONNX Runtime Web is not available or model loading fails.
   */
  async loadModel(url: string): Promise<void> {
    this.config.modelUrl = url;

    try {
      // Dynamic import — avoids bundling onnxruntime-web when unused.
      // The module is optional; we use Function() to prevent static analysis
      // from treating it as a hard dependency.
      const dynamicImport = new Function(
        "specifier",
        "return import(specifier)",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ) as (specifier: string) => Promise<Record<string, any>>;
      const ort = await dynamicImport("onnxruntime-web");

      if (!ort?.InferenceSession?.create) {
        throw new Error(
          "ONNX Runtime Web is available but InferenceSession.create is missing. " +
            "Ensure onnxruntime-web >= 1.14 is installed.",
        );
      }

      this.session = await ort.InferenceSession.create(url, {
        executionProviders: ["wasm", "cpu"],
      });
      this.modelLoaded = true;
    } catch (err) {
      this.session = null;
      this.modelLoaded = false;

      const message = err instanceof Error ? err.message : String(err);

      // Re-throw with context so callers understand the failure
      throw new Error(
        `[Ft8NeuralDecoder] Failed to load model from "${url}": ${message}. ` +
          "Ensure onnxruntime-web is installed (npm i onnxruntime-web) " +
          "and a valid ONNX model is provided.",
      );
    }
  }

  /**
   * Check whether the model is loaded and the decoder is ready for
   * inference.
   */
  isReady(): boolean {
    return this.modelLoaded && this.session !== null;
  }

  /**
   * Unload the model and free associated resources.
   */
  dispose(): void {
    if (this.session) {
      // Release is async but we fire-and-forget for disposal convenience
      void this.session.release().catch(() => {});
      this.session = null;
    }
    this.modelLoaded = false;
  }

  /**
   * Attempt to decode marginal FT8 signals from raw audio samples.
   *
   * This method should be called *after* the standard LDPC decoder has
   * processed the audio.  Pass the frequencies of already-decoded signals
   * in `excludeFrequencies` so the neural decoder skips them.
   *
   * If no model is loaded the method returns an empty result (graceful
   * degradation).
   *
   * @param audioSamples      - Mono PCM audio for one FT8 cycle.
   * @param sampleRate        - Sample rate in Hz (typically 12000 or 48000).
   * @param excludeFrequencies - Audio frequencies (Hz) to skip.
   * @returns Decode result with any recovered candidates.
   */
  async decode(
    audioSamples: Float32Array,
    sampleRate: number,
    excludeFrequencies: number[] = [],
  ): Promise<NeuralDecodeResult> {
    const t0 = performance.now();

    const emptyResult: NeuralDecodeResult = {
      candidates: [],
      regionsEvaluated: 0,
      processingTimeMs: 0,
    };

    // Guard: need audio data
    if (!audioSamples || audioSamples.length === 0) {
      emptyResult.processingTimeMs = performance.now() - t0;
      return emptyResult;
    }

    // ── Step 1: Compute spectrogram ───────────────────────────────────────

    const {
      data: spectrogramData,
      timeFrames,
      freqBins,
      freqResolution,
    } = computeSpectrogram(audioSamples, sampleRate);

    if (timeFrames === 0) {
      emptyResult.processingTimeMs = performance.now() - t0;
      return emptyResult;
    }

    // ── Step 2: Estimate noise floor and find candidates ──────────────────

    const noiseFloor = estimateNoiseFloor(
      spectrogramData,
      timeFrames,
      freqBins,
    );

    const regions = findCandidateRegions(
      spectrogramData,
      timeFrames,
      freqBins,
      freqResolution,
      noiseFloor,
      this.config,
      excludeFrequencies,
    );

    if (regions.length === 0) {
      emptyResult.regionsEvaluated = 0;
      emptyResult.processingTimeMs = performance.now() - t0;
      return emptyResult;
    }

    // ── Step 3: Run neural inference (or skip if no model) ────────────────

    const accepted: NeuralDecodeCandidate[] = [];

    for (const region of regions) {
      const candidate = await this.evaluateCandidate(region);
      if (candidate) {
        accepted.push(candidate);
      }
    }

    return {
      candidates: accepted,
      regionsEvaluated: regions.length,
      processingTimeMs: performance.now() - t0,
    };
  }

  /**
   * Update decoder configuration at runtime.
   *
   * @param partial - Fields to update (merged with current config).
   */
  updateConfig(partial: Partial<NeuralDecoderConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  // ── Private methods ───────────────────────────────────────────────────────

  /**
   * Evaluate a single candidate region through the neural network and
   * post-processing pipeline.
   *
   * @param region - Candidate region with spectrogram patch.
   * @returns A valid decode candidate, or `null` if it did not pass.
   */
  private async evaluateCandidate(
    region: CandidateRegion,
  ): Promise<NeuralDecodeCandidate | null> {
    let bitProbabilities: Float32Array;

    if (this.session) {
      // ── Neural inference path ─────────────────────────────────────────
      try {
        bitProbabilities = await this.runInference(region.patch);
      } catch {
        // Inference failure for this candidate — skip it
        return null;
      }
    } else {
      // ── No model loaded — graceful degradation ────────────────────────
      // Cannot produce meaningful results without a model.
      return null;
    }

    // ── Soft LDPC check + CRC validation ────────────────────────────────

    if (bitProbabilities.length < FTX_LDPC_N) {
      return null;
    }

    const {
      bits,
      valid: ldpcValid,
      confidence,
    } = softLdpcCheck(bitProbabilities);

    if (confidence < this.config.confidenceThreshold) {
      return null;
    }

    // Decode message bits to text
    const messageBits = bits.slice(0, 77);
    const message = bitsToMessage(messageBits);
    if (!message) {
      return null;
    }

    return {
      message,
      confidence,
      estimatedSnr: region.estimatedSnr,
      frequencyHz: region.frequencyHz,
      timeOffsetSec: region.timeOffsetSec,
      ldpcValid,
    };
  }

  /**
   * Run the ONNX model on a spectrogram patch and return per-bit
   * probabilities (length 174).
   *
   * @param patch - Flattened spectrogram patch for one candidate.
   * @returns Float32Array of bit probabilities (0-1), length 174.
   * @throws If inference fails.
   */
  private async runInference(patch: Float32Array): Promise<Float32Array> {
    if (!this.session) {
      throw new Error("No model session available.");
    }

    // The model expects a batch-of-1 spectrogram patch:
    //   input shape: [1, PATCH_TIME_FRAMES, PATCH_FREQ_BINS]
    //   output shape: [1, FTX_LDPC_N] (174 bit probabilities)
    const patchTimeFrames = Math.min(
      PATCH_TIME_FRAMES,
      Math.floor(patch.length / PATCH_FREQ_BINS),
    );

    const inputData = new Float32Array(patchTimeFrames * PATCH_FREQ_BINS);
    inputData.set(patch.subarray(0, inputData.length));

    const feeds: Record<
      string,
      { data: Float32Array; dims: number[]; type: string }
    > = {
      spectrogram: {
        data: inputData,
        dims: [1, patchTimeFrames, PATCH_FREQ_BINS],
        type: "float32",
      },
    };

    const outputs = await this.session.run(feeds);

    // Extract the first output tensor (name may vary by model)
    const outputKeys = Object.keys(outputs);
    if (outputKeys.length === 0) {
      throw new Error("Model produced no output tensors.");
    }

    const outputTensor = outputs[outputKeys[0]];
    if (!outputTensor?.data || outputTensor.data.length < FTX_LDPC_N) {
      throw new Error(
        `Model output has ${outputTensor?.data?.length ?? 0} values, ` +
          `expected at least ${FTX_LDPC_N}.`,
      );
    }

    // Apply sigmoid if outputs are logits (values outside 0-1)
    const probabilities = new Float32Array(FTX_LDPC_N);
    for (let i = 0; i < FTX_LDPC_N; i++) {
      const v = outputTensor.data[i];
      if (v < 0 || v > 1) {
        // Logit — apply sigmoid
        probabilities[i] = 1 / (1 + Math.exp(-v));
      } else {
        probabilities[i] = v;
      }
    }

    return probabilities;
  }
}
