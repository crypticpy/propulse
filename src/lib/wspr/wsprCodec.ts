/**
 * wsprCodec — WSPR (Weak Signal Propagation Reporter) protocol encoding.
 *
 * Implements the WSPR message encoding pipeline:
 *   1. packWsprMessage()      — Pack callsign, grid, power into 50 bits
 *   2. convolutionalEncode()  — Rate 1/2, K=32 convolutional code -> 162 raw symbols
 *   3. interleaveWspr()       — Bit-reversal interleaving over 256 positions
 *   4. mergeWsprSync()        — Merge with 162-bit sync vector using 4-FSK
 *
 * The output is 162 channel symbols, each in the range 0-3, representing
 * a 4-FSK WSPR transmission lasting approximately 110.6 seconds.
 *
 * References:
 *   - WSJT-X source (wsjt.sourceforge.io)
 *   - Joe Taylor, K1JT: "The WSPR Protocol"
 *   - Andy Talbot, G4JNT: "WSPR encoding/decoding description"
 */

// ============================================================================
// WSPR Protocol Parameters
// ============================================================================

/** WSPR transmission parameters. */
export const WSPR_PARAMS = {
  /** Symbol period in seconds */
  symbolPeriod: 0.6827,
  /** Tone spacing in Hz */
  toneSpacing: 1.4648,
  /** Number of symbols */
  symbolCount: 162,
  /** Total duration in seconds */
  duration: 110.6,
  /** Cycle period in seconds (2 minutes) */
  cyclePeriod: 120,
  /** Number of tones (4-FSK) */
  toneCount: 4,
  /** Audio bandwidth in Hz */
  bandwidth: 6,
} as const;

// ============================================================================
// Public Types
// ============================================================================

/** WSPR message data. */
export interface WsprMessage {
  callsign: string;
  grid: string; // 4-char Maidenhead
  powerDbm: number; // 0-60 in steps matching allowed power levels
}

/** Encoded WSPR result. */
export interface WsprEncodedResult {
  /** 162 channel symbols (each 0-3) */
  symbols: number[];
  /** Source message data */
  message: WsprMessage;
}

/** A decoded WSPR spot. */
export interface WsprSpot {
  callsign: string;
  grid: string;
  powerDbm: number;
  snr: number;
  frequencyHz: number;
  drift: number; // Hz/min
  timestamp: string;
  distanceKm?: number;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Valid WSPR power levels in dBm.
 *
 * These correspond to values where the last digit is 0, 3, or 7
 * (i.e. values n where n mod 10 is in {0, 3, 7}).
 */
const VALID_POWER_LEVELS: readonly number[] = [
  0, 3, 7, 10, 13, 17, 20, 23, 27, 30, 33, 37, 40, 43, 47, 50, 53, 57, 60,
];

/**
 * Convolutional encoder polynomials for WSPR.
 * Rate 1/2, constraint length K=32.
 */
const CONV_POLY_0 = 0xf2d05351;
const CONV_POLY_1 = 0xe4613c47;

/**
 * WSPR sync vector (162 bits).
 *
 * Predefined pseudo-random pattern used for synchronization.
 * Each value is 0 or 1; merged with data symbols using 4-FSK:
 *   channel_symbol = sync[i] + 2 * data[i]
 *
 * Source: WSJT-X wsprd/wsprd_utils.c
 */
const WSPR_SYNC_VECTOR: readonly number[] = [
  1, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1, 0, 0, 1, 0, 1, 1, 1,
  1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 0, 0,
  1, 1, 0, 1, 0, 0, 0, 1, 1, 0, 1, 0, 0, 0, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
  0, 1, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0,
  1, 0, 0, 1, 0, 0, 1, 1, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 0, 1, 1, 1, 0, 0,
  0, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1, 0, 0,
  0, 1, 1, 0, 0, 0,
];

// ============================================================================
// Main Encoder Function
// ============================================================================

/**
 * Encode a WSPR message into 162 channel symbols (values 0-3).
 *
 * This is the top-level entry point that runs the full encoding pipeline:
 *   message -> 50-bit pack -> convolutional code -> interleave -> sync merge
 *
 * @param message  WSPR message data (callsign, grid, power)
 * @returns        Encoded result with 162 symbols and the source message
 * @throws         Error if the power level is invalid
 */
export function encodeWsprMessage(message: WsprMessage): WsprEncodedResult {
  // Validate power level
  if (!isValidWsprPower(message.powerDbm)) {
    throw new Error(
      `Invalid WSPR power level: ${message.powerDbm} dBm. ` +
        `Must be one of: ${VALID_POWER_LEVELS.join(", ")}`,
    );
  }

  // Step 1: Pack message into 50 bits
  const packed = packWsprMessage(message);

  // Step 2: Convolutional encoding -> 162 raw data symbols (each 0 or 1)
  const convolved = convolutionalEncode(packed, 50);

  // Step 3: Interleave
  const interleaved = interleaveWspr(convolved);

  // Step 4: Merge with sync vector
  const symbols = mergeWsprSync(interleaved);

  return { symbols, message };
}

// ============================================================================
// Step 1: Message Packing (50 bits)
// ============================================================================

/**
 * Pack a WSPR message into 50 bits.
 *
 * The 50-bit WSPR payload encodes:
 *   - Callsign: 28 bits (base-36 encoding)
 *   - Grid: 15 bits (Maidenhead 4-char encoding)
 *   - Power: 7 bits (0-60 dBm, constrained to valid levels)
 *
 * The callsign is normalized to a 6-character format. The first character
 * can be a space, letter, or digit. The second character must be a letter
 * or digit. The third must be a digit. Characters 4-6 must be letters or
 * spaces.
 *
 * @param message  WSPR message data
 * @returns        Uint8Array containing the 50-bit packed message (7 bytes, last 6 bits unused)
 */
export function packWsprMessage(message: WsprMessage): Uint8Array {
  const callsignValue = packWsprCallsign(message.callsign);
  const gridValue = packWsprGrid(message.grid);
  const powerValue = message.powerDbm;

  // Assemble 50 bits: callsign(28) + grid(15) + power(7)
  // Use BigInt for precise bit manipulation
  let bits = BigInt(0);
  bits = (bits << 28n) | BigInt(callsignValue & 0x0fffffff);
  bits = (bits << 15n) | BigInt(gridValue & 0x7fff);
  bits = (bits << 7n) | BigInt(powerValue & 0x7f);

  // Total: 28 + 15 + 7 = 50 bits
  // Store in 7 bytes (56 bits, last 6 unused)
  let shifted = bits << 6n;
  const result = new Uint8Array(7);
  for (let i = 6; i >= 0; i--) {
    result[i] = Number(shifted & 0xffn);
    shifted >>= 8n;
  }

  return result;
}

/**
 * Pack a WSPR callsign into a 28-bit value.
 *
 * Callsign is normalized to 6 characters with a digit at position [2].
 * Encoding: c[0]*36*10*27*27*27 + c[1]*10*27*27*27 + c[2]*27*27*27
 *           + c[3]*27*27 + c[4]*27 + c[5]
 *
 * Character encoding:
 *   c[0]: space=0, A-Z=1-26, 0-9=27-36
 *   c[1]: A-Z=0-25, 0-9=26-35
 *   c[2]: 0-9 (numeric digit)
 *   c[3..5]: space=0, A-Z=1-26
 */
function packWsprCallsign(callsign: string): number {
  const call = callsign.toUpperCase().trim();
  const normalized = normalizeWsprCallsign(call);

  const c0 = wsprCharIndex0(normalized[0]);
  const c1 = wsprCharIndex1(normalized[1]);
  const c2 = wsprDigitIndex(normalized[2]);
  const c3 = wsprLetterSpaceIndex(normalized[3]);
  const c4 = wsprLetterSpaceIndex(normalized[4]);
  const c5 = wsprLetterSpaceIndex(normalized[5]);

  return (
    c0 * 36 * 10 * 27 * 27 * 27 +
    c1 * 10 * 27 * 27 * 27 +
    c2 * 27 * 27 * 27 +
    c3 * 27 * 27 +
    c4 * 27 +
    c5
  );
}

/**
 * Normalize a callsign to 6-character WSPR format with digit at position [2].
 */
function normalizeWsprCallsign(call: string): string {
  if (call.length < 1 || call.length > 6) {
    return call.padEnd(6, " ").slice(0, 6);
  }

  // If already 6 chars and digit at position 2, return as-is
  if (call.length === 6 && isDigit(call[2])) return call;

  // Find position of first digit
  let digitPos = -1;
  for (let i = 0; i < call.length; i++) {
    if (isDigit(call[i])) {
      digitPos = i;
      break;
    }
  }
  if (digitPos < 0) return call.padEnd(6, " ").slice(0, 6);

  // Left-pad so digit lands at position 2
  const leftPad = 2 - digitPos;
  if (leftPad < 0) return call.padEnd(6, " ").slice(0, 6);

  const padded = " ".repeat(leftPad) + call;
  return padded.padEnd(6, " ").slice(0, 6);
}

/**
 * Pack a 4-character Maidenhead grid for WSPR (15 bits).
 *
 * Encoding: (179 - 10*lon_field - lon_digit) * 180 + 10*lat_field + lat_digit
 * where lon is derived from first two chars, lat from last two.
 */
function packWsprGrid(grid: string): number {
  const g = grid.toUpperCase();
  if (g.length < 4) return 0;

  const lonField = g.charCodeAt(0) - 65; // A=0 .. R=17
  const latField = g.charCodeAt(1) - 65;
  const lonDigit = g.charCodeAt(2) - 48; // 0-9
  const latDigit = g.charCodeAt(3) - 48;

  if (lonField < 0 || lonField > 17) return 0;
  if (latField < 0 || latField > 17) return 0;
  if (lonDigit < 0 || lonDigit > 9) return 0;
  if (latDigit < 0 || latDigit > 9) return 0;

  const lon = 179 - 10 * lonField - lonDigit;
  const lat = 10 * latField + latDigit;

  return lon * 180 + lat;
}

// ============================================================================
// Step 2: Convolutional Encoding
// ============================================================================

/**
 * Apply convolutional encoding (rate 1/2, K=32) to WSPR data.
 *
 * The convolutional encoder uses two generator polynomials:
 *   G0 = 0xF2D05351 (poly 0)
 *   G1 = 0xE4613C47 (poly 1)
 *
 * For each input bit, the encoder outputs two bits (one from each polynomial).
 * The 50 message bits produce 100 code bits. With tail bits (K-1 = 31 zeros)
 * appended, the total input is 81 bits producing 162 code bits.
 *
 * @param data  Packed message bytes
 * @param bits  Number of significant bits in the data
 * @returns     Array of 162 code bits (each 0 or 1)
 */
export function convolutionalEncode(data: Uint8Array, bits: number): number[] {
  const totalBits = bits + 31; // Message bits + tail bits (K-1 zeros)
  const output: number[] = new Array(totalBits * 2);
  let shiftReg = 0;

  for (let i = 0; i < totalBits; i++) {
    // Get current bit (0 for tail bits beyond the message)
    let bit: number;
    if (i < bits) {
      const byteIdx = Math.floor(i / 8);
      const bitInByte = 7 - (i % 8);
      bit = (data[byteIdx] >> bitInByte) & 1;
    } else {
      bit = 0;
    }

    // Shift the bit into the register (MSB side)
    shiftReg = ((shiftReg << 1) | bit) >>> 0;

    // Compute output bits using the two polynomials
    output[i * 2] = parity32(shiftReg & CONV_POLY_0);
    output[i * 2 + 1] = parity32(shiftReg & CONV_POLY_1);
  }

  return output;
}

/**
 * Compute parity (popcount mod 2) of a 32-bit integer.
 */
function parity32(x: number): number {
  let v = x >>> 0;
  v ^= v >>> 16;
  v ^= v >>> 8;
  v ^= v >>> 4;
  v ^= v >>> 2;
  v ^= v >>> 1;
  return v & 1;
}

// ============================================================================
// Step 3: Interleaving
// ============================================================================

/**
 * Interleave WSPR symbols using bit-reversal permutation.
 *
 * The interleaving operates over 256 positions using an 8-bit reversal.
 * Only positions that map to indices < 162 are used (the others are discarded
 * since WSPR uses 162 symbols, not 256).
 *
 * @param symbols  Array of 162 code bits (each 0 or 1)
 * @returns        Interleaved array of 162 code bits
 */
export function interleaveWspr(symbols: number[]): number[] {
  const result: number[] = new Array(162);
  let destIdx = 0;

  for (let i = 0; i < 256; i++) {
    const reversed = reverseBits8(i);
    if (reversed < 162) {
      result[reversed] = symbols[destIdx];
      destIdx++;
    }
  }

  return result;
}

/**
 * Reverse the bits of an 8-bit value.
 */
function reverseBits8(x: number): number {
  let v = x & 0xff;
  v = ((v & 0xf0) >>> 4) | ((v & 0x0f) << 4);
  v = ((v & 0xcc) >>> 2) | ((v & 0x33) << 2);
  v = ((v & 0xaa) >>> 1) | ((v & 0x55) << 1);
  return v;
}

// ============================================================================
// Step 4: Sync Vector Merge
// ============================================================================

/**
 * Merge interleaved data symbols with the WSPR sync vector.
 *
 * Each channel symbol is computed as:
 *   channel_symbol[i] = sync[i] + 2 * data[i]
 *
 * This produces 4-FSK symbols in the range 0-3:
 *   - sync=0, data=0 -> 0
 *   - sync=1, data=0 -> 1
 *   - sync=0, data=1 -> 2
 *   - sync=1, data=1 -> 3
 *
 * @param dataSymbols  Array of 162 interleaved code bits (each 0 or 1)
 * @returns            Array of 162 channel symbols (each 0-3)
 */
export function mergeWsprSync(dataSymbols: number[]): number[] {
  const sync = WSPR_SYNC_VECTOR;
  const result: number[] = new Array(162);

  for (let i = 0; i < 162; i++) {
    result[i] = sync[i] + 2 * dataSymbols[i];
  }

  return result;
}

/**
 * Get the WSPR sync vector (162 bits).
 *
 * @returns  A copy of the 162-element sync vector (each value 0 or 1)
 */
export function getWsprSyncVector(): number[] {
  return [...WSPR_SYNC_VECTOR];
}

// ============================================================================
// Power Level Utilities
// ============================================================================

/**
 * Get the list of valid WSPR power levels in dBm.
 *
 * WSPR power levels correspond to values where the last digit is 0, 3, or 7:
 * {0, 3, 7, 10, 13, 17, 20, 23, 27, 30, 33, 37, 40, 43, 47, 50, 53, 57, 60}
 *
 * @returns  Array of valid power levels
 */
export function getValidPowerLevels(): number[] {
  return [...VALID_POWER_LEVELS];
}

/**
 * Check if a power level is valid for WSPR.
 *
 * @param dbm  Power level in dBm
 * @returns    True if the power level is in the valid set
 */
export function isValidWsprPower(dbm: number): boolean {
  return VALID_POWER_LEVELS.includes(dbm);
}

// ============================================================================
// Character Index Helpers (WSPR-specific)
// ============================================================================

/**
 * WSPR character index for position 0: space=0, A-Z=1-26, 0-9=27-36.
 */
function wsprCharIndex0(ch: string): number {
  if (ch === " ") return 0;
  if (ch >= "A" && ch <= "Z") return ch.charCodeAt(0) - 64; // A=1..Z=26
  if (ch >= "0" && ch <= "9") return ch.charCodeAt(0) - 48 + 27; // 0=27..9=36
  return 0;
}

/**
 * WSPR character index for position 1: A-Z=0-25, 0-9=26-35.
 */
function wsprCharIndex1(ch: string): number {
  if (ch >= "A" && ch <= "Z") return ch.charCodeAt(0) - 65; // A=0..Z=25
  if (ch >= "0" && ch <= "9") return ch.charCodeAt(0) - 48 + 26; // 0=26..9=35
  return 0;
}

/**
 * WSPR digit index for position 2: 0-9.
 */
function wsprDigitIndex(ch: string): number {
  if (ch >= "0" && ch <= "9") return ch.charCodeAt(0) - 48;
  return 0;
}

/**
 * WSPR letter/space index for positions 3-5: space=0, A-Z=1-26.
 */
function wsprLetterSpaceIndex(ch: string): number {
  if (ch === " ") return 0;
  if (ch >= "A" && ch <= "Z") return ch.charCodeAt(0) - 64; // A=1..Z=26
  return 0;
}

// ============================================================================
// Validation Helpers
// ============================================================================

/** Check if a character is a digit (0-9). */
function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}
