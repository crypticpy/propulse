/**
 * FT8/FT4 decode sensitivity / depth configuration.
 *
 * Three decode depth presets control the trade-off between CPU usage
 * and weak-signal decoding capability.  These values are forwarded to
 * the WASM decoder worker via {@link serializeDecodeDepthForWorker}.
 *
 * The `sdrFt8DecodeDepth` setting in the settings store selects the
 * active depth; see {@link SettingsState.sdrFt8DecodeDepth}.
 */

// ── Types ───────────────────────────────────────────────────────────────────

export type Ft8DecodeDepth = "normal" | "deep" | "aggressive";

export interface Ft8DecodeDepthConfig {
  depth: Ft8DecodeDepth;
  label: string;
  description: string;
  /** Number of LDPC decode iterations */
  ldpcIterations: number;
  /** Subtraction passes for overlapping signals */
  subtractionPasses: number;
  /** SNR threshold for considering a decode valid (dB) */
  snrThreshold: number;
  /** Approximate CPU load multiplier (1.0 = baseline) */
  cpuLoadFactor: number;
}

// ── Depth presets ───────────────────────────────────────────────────────────

const DEPTH_CONFIGS: Record<Ft8DecodeDepth, Ft8DecodeDepthConfig> = {
  normal: {
    depth: "normal",
    label: "Normal",
    description:
      "Standard decode depth suitable for most conditions. " +
      "Low CPU usage with reliable decoding down to about -21 dB.",
    ldpcIterations: 25,
    subtractionPasses: 0,
    snrThreshold: -21,
    cpuLoadFactor: 1.0,
  },
  deep: {
    depth: "deep",
    label: "Deep",
    description:
      "Extended decode depth with signal subtraction for crowded bands. " +
      "Moderate CPU increase; recovers signals down to about -24 dB.",
    ldpcIterations: 40,
    subtractionPasses: 2,
    snrThreshold: -24,
    cpuLoadFactor: 1.5,
  },
  aggressive: {
    depth: "aggressive",
    label: "Aggressive",
    description:
      "Maximum decode depth for marginal conditions. " +
      "Significantly higher CPU usage; pushes the threshold to about -26 dB.",
    ldpcIterations: 60,
    subtractionPasses: 3,
    snrThreshold: -26,
    cpuLoadFactor: 2.5,
  },
};

/** Ordered list of depths from lightest to heaviest. */
const DEPTH_ORDER: Ft8DecodeDepth[] = ["normal", "deep", "aggressive"];

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Get configuration for a decode depth setting.
 *
 * Falls back to "normal" if an unrecognised depth value is passed.
 */
export function getDecodeDepthConfig(
  depth: Ft8DecodeDepth,
): Ft8DecodeDepthConfig {
  return DEPTH_CONFIGS[depth] ?? DEPTH_CONFIGS.normal;
}

/**
 * Get all available decode depth options, ordered from lightest to
 * heaviest CPU load.
 */
export function getDecodeDepthOptions(): Ft8DecodeDepthConfig[] {
  return DEPTH_ORDER.map((d) => DEPTH_CONFIGS[d]);
}

/**
 * Serialise decode depth config to the flat payload expected by the
 * WASM decoder worker thread.
 */
export function serializeDecodeDepthForWorker(depth: Ft8DecodeDepth): {
  maxIterations: number;
  subtractionPasses: number;
  minSnr: number;
} {
  const cfg = getDecodeDepthConfig(depth);
  return {
    maxIterations: cfg.ldpcIterations,
    subtractionPasses: cfg.subtractionPasses,
    minSnr: cfg.snrThreshold,
  };
}
