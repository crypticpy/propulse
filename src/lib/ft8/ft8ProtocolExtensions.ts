/**
 * ft8ProtocolExtensions — Protocol parameter definitions for Q65, FST4, and FST4W.
 *
 * Provides static protocol parameters, sub-mode definitions, and utility
 * functions for the Q65 and FST4 protocol families. These are stub
 * definitions — the WASM decoders are not yet built, but the parameter
 * data is complete and can be used for UI display, cycle timing, and
 * future decoder integration.
 *
 * References:
 *   - WSJT-X source (wsjt.sourceforge.io)
 *   - Joe Taylor, K1JT: "Q65 — A New Digital Protocol"
 *   - Joe Taylor, K1JT: "FST4 and FST4W Protocols"
 */

// ============================================================================
// Q65 Protocol Parameters
// ============================================================================

/** Protocol parameters for Q65. */
export const Q65_PARAMS = {
  toneCount: 65,
  symbolCount: 85,
  /** Available sub-modes with their cycle times */
  subModes: {
    "Q65-15": { cycleSec: 15, symbolPeriod: 0.167 },
    "Q65-30": { cycleSec: 30, symbolPeriod: 0.333 },
    "Q65-60": { cycleSec: 60, symbolPeriod: 0.667 },
    "Q65-120": { cycleSec: 120, symbolPeriod: 1.333 },
    "Q65-300": { cycleSec: 300, symbolPeriod: 3.333 },
  },
  /** Uses 65-FSK modulation */
  modulationType: "65-FSK" as const,
  /** Message payload size */
  messageBits: 77,
} as const;

// ============================================================================
// FST4 Protocol Parameters
// ============================================================================

/** Protocol parameters for FST4. */
export const FST4_PARAMS = {
  toneCount: 4,
  /** Available sub-modes */
  subModes: {
    "FST4-15": { cycleSec: 15, symbolCount: 160, symbolPeriod: 0.0893 },
    "FST4-30": { cycleSec: 30, symbolCount: 160, symbolPeriod: 0.179 },
    "FST4-60": { cycleSec: 60, symbolCount: 160, symbolPeriod: 0.357 },
    "FST4-120": { cycleSec: 120, symbolCount: 320, symbolPeriod: 0.357 },
    "FST4-300": { cycleSec: 300, symbolCount: 720, symbolPeriod: 0.4 },
    "FST4-900": { cycleSec: 900, symbolCount: 720, symbolPeriod: 1.2 },
    "FST4-1800": { cycleSec: 1800, symbolCount: 720, symbolPeriod: 2.4 },
  },
  modulationType: "4-GFSK" as const,
  messageBits: 77,
} as const;

// ============================================================================
// FST4W (Weak Signal) Protocol Parameters
// ============================================================================

/** FST4W (weak signal) parameters. */
export const FST4W_PARAMS = {
  toneCount: 4,
  subModes: {
    "FST4W-120": { cycleSec: 120, symbolCount: 160, symbolPeriod: 0.683 },
    "FST4W-300": { cycleSec: 300, symbolCount: 160, symbolPeriod: 1.792 },
    "FST4W-900": { cycleSec: 900, symbolCount: 160, symbolPeriod: 5.376 },
    "FST4W-1800": { cycleSec: 1800, symbolCount: 160, symbolPeriod: 10.752 },
  },
  modulationType: "4-GFSK" as const,
  messageBits: 50,
} as const;

// ============================================================================
// Sub-mode Types
// ============================================================================

export type Q65SubMode = keyof typeof Q65_PARAMS.subModes;
export type FST4SubMode = keyof typeof FST4_PARAMS.subModes;
export type FST4WSubMode = keyof typeof FST4W_PARAMS.subModes;

// ============================================================================
// Derived Protocol Info
// ============================================================================

/** Decode pipeline requirements for a protocol. */
export interface DecodePipelineRequirements {
  protocol: string;
  decoderType: "wasm" | "worker";
  modulationType: string;
  messageBits: number;
  cycleSec: number;
  /** Whether WASM decoder exists for this protocol */
  wasmAvailable: boolean;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get cycle timing for a protocol/sub-mode.
 *
 * Accepts protocol strings like "Q65-30", "FST4-120", "FST4W-300".
 * Returns the cycle period, symbol period, and symbol count for the
 * specified sub-mode, or null if not recognized.
 *
 * @param protocol  Protocol string (e.g. "Q65-60", "FST4-300", "FST4W-120")
 * @returns         Timing parameters, or null if not found
 */
export function getCycleTiming(
  protocol: string,
): { cycleSec: number; symbolPeriod: number; symbolCount: number } | null {
  const key = protocol.toUpperCase();

  // Check Q65 sub-modes
  if (key in Q65_PARAMS.subModes) {
    const mode = Q65_PARAMS.subModes[key as Q65SubMode];
    return {
      cycleSec: mode.cycleSec,
      symbolPeriod: mode.symbolPeriod,
      symbolCount: Q65_PARAMS.symbolCount,
    };
  }

  // Check FST4 sub-modes
  if (key in FST4_PARAMS.subModes) {
    const mode = FST4_PARAMS.subModes[key as FST4SubMode];
    return {
      cycleSec: mode.cycleSec,
      symbolPeriod: mode.symbolPeriod,
      symbolCount: mode.symbolCount,
    };
  }

  // Check FST4W sub-modes
  if (key in FST4W_PARAMS.subModes) {
    const mode = FST4W_PARAMS.subModes[key as FST4WSubMode];
    return {
      cycleSec: mode.cycleSec,
      symbolPeriod: mode.symbolPeriod,
      symbolCount: mode.symbolCount,
    };
  }

  return null;
}

/**
 * Check if a protocol string is a supported extension.
 *
 * @param protocol  Protocol string to check
 * @returns         True if the protocol is recognized
 */
export function isSupportedProtocol(protocol: string): boolean {
  return getSupportedProtocols().includes(protocol.toUpperCase());
}

/**
 * Get all supported protocol names.
 *
 * @returns  Array of all supported protocol/sub-mode strings
 */
export function getSupportedProtocols(): string[] {
  return [
    ...Object.keys(Q65_PARAMS.subModes),
    ...Object.keys(FST4_PARAMS.subModes),
    ...Object.keys(FST4W_PARAMS.subModes),
  ];
}

/**
 * Get the decode pipeline requirements for a protocol.
 *
 * Returns the decoder type, modulation, message bits, cycle time, and
 * WASM availability for a given protocol/sub-mode string. Currently all
 * extended protocols return `wasmAvailable: false` since the WASM decoders
 * are not yet built.
 *
 * @param protocol  Protocol string (e.g. "Q65-60", "FST4-300")
 * @returns         Pipeline requirements for the protocol
 * @throws          Error if the protocol is not recognized
 */
export function getDecodePipelineRequirements(
  protocol: string,
): DecodePipelineRequirements {
  const key = protocol.toUpperCase();

  // Q65 sub-modes
  if (key in Q65_PARAMS.subModes) {
    const mode = Q65_PARAMS.subModes[key as Q65SubMode];
    return {
      protocol: key,
      decoderType: "wasm",
      modulationType: Q65_PARAMS.modulationType,
      messageBits: Q65_PARAMS.messageBits,
      cycleSec: mode.cycleSec,
      wasmAvailable: false, // Stub — WASM decoder not yet built
    };
  }

  // FST4 sub-modes
  if (key in FST4_PARAMS.subModes) {
    const mode = FST4_PARAMS.subModes[key as FST4SubMode];
    return {
      protocol: key,
      decoderType: "wasm",
      modulationType: FST4_PARAMS.modulationType,
      messageBits: FST4_PARAMS.messageBits,
      cycleSec: mode.cycleSec,
      wasmAvailable: false,
    };
  }

  // FST4W sub-modes
  if (key in FST4W_PARAMS.subModes) {
    const mode = FST4W_PARAMS.subModes[key as FST4WSubMode];
    return {
      protocol: key,
      decoderType: "wasm",
      modulationType: FST4W_PARAMS.modulationType,
      messageBits: FST4W_PARAMS.messageBits,
      cycleSec: mode.cycleSec,
      wasmAvailable: false,
    };
  }

  throw new Error(
    `Unsupported protocol: "${protocol}". ` +
      `Supported protocols: ${getSupportedProtocols().join(", ")}`,
  );
}
