/**
 * Worker <-> main thread message types for the FT8/FT4 decoder Web Worker.
 *
 * The Worker receives PCM audio samples and returns decoded messages.
 */

// ============================================================================
// Worker Inbound Messages (main thread -> Worker)
// ============================================================================

/**
 * Flat decode-depth config passed to the worker at init. Produced by
 * {@link serializeDecodeDepthForWorker} from the `sdrFt8DecodeDepth` setting.
 */
export interface Ft8DecodeDepthWorkerConfig {
  /** Number of LDPC decode iterations (higher = deeper, slower). */
  maxIterations: number;
  /** Subtraction passes for overlapping signals. */
  subtractionPasses: number;
  /** SNR threshold for a valid decode (dB). */
  minSnr: number;
}

export type Ft8WorkerInbound =
  | {
      type: "init";
      protocol: "FT8" | "FT4";
      decodeDepth?: Ft8DecodeDepthWorkerConfig;
    }
  | { type: "audio"; samples: Float32Array; sampleRate: number }
  | { type: "setProtocol"; protocol: "FT8" | "FT4" }
  | { type: "stop" };

// ============================================================================
// Worker Outbound Messages (Worker -> main thread)
// ============================================================================

export type Ft8WorkerOutbound =
  | { type: "ready" }
  | {
      type: "decodes";
      results: Ft8RawDecode[];
      cycleStartMs: number;
      protocol: "FT8" | "FT4";
    }
  | { type: "cycleProgress"; progress: number }
  | { type: "error"; message: string };

// ============================================================================
// Raw Decode Result
// ============================================================================

/** Raw decode result before conversion to WsjtxDecode */
export interface Ft8RawDecode {
  /** Audio frequency offset in Hz */
  freqHz: number;
  /** Time offset in seconds from cycle start */
  timeSec: number;
  /** Signal-to-noise ratio estimate (dB) */
  snr: number;
  /** Decoded FT8/FT4 message text */
  message: string;
  /** LDPC error count (0 = perfect) */
  ldpcErrors: number;
  /** Raw candidate score */
  score: number;
}
