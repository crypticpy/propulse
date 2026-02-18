/**
 * ft8Encoder — FT8/FT4 message encoding pipeline.
 *
 * Converts a text message into a sequence of 79 tone symbols (values 0-7)
 * representing a valid FT8 transmission. The pipeline:
 *
 *   1. composeFt8Message()     — Generate message text from QSO params
 *   2. packMessage77()         — Pack text into 77-bit binary representation
 *   3. computeCrc14()          — Append 14-bit CRC -> 91 data bits
 *   4. ldpcEncode()            — LDPC(174,91) -> 174 coded bits
 *   5. bitsToSymbols()         — Group into 58 three-bit symbols, apply Gray code
 *   6. insertCostasAndMerge()  — Merge with Costas sync -> 79 final symbols
 *
 * References:
 *   - WSJT-X source (wsjt.sourceforge.io)
 *   - ft8_lib by Karlis Goba, YL3JG (github.com/kgoba/ft8_lib)
 *   - "The FT4 and FT8 Communication Protocols" (QEX, 2020)
 */

import {
  FT8_CHAR_TABLE_ALPHANUM,
  FT8_CHAR_TABLE_FULL,
  FT8_COSTAS,
  FT8_CRC_POLYNOMIAL,
  FT8_CRC_WIDTH,
  FT8_GRAY_MAP,
  FT8_MESSAGE_BITS,
  FTX_LDPC_GENERATOR,
  FTX_LDPC_K,
  FTX_LDPC_K_BYTES,
  FTX_LDPC_M,
  FTX_LDPC_N,
  I3_STANDARD,
  NTOKENS,
  PACKED_CQ,
  PACKED_CQ_ALPHA_START,
  REPORT_BASE,
  R_REPORT_BASE,
} from "./ft8Constants";

// ============================================================================
// Public Types
// ============================================================================

/** Result of encoding an FT8 message. */
export interface Ft8EncodedResult {
  /** 79 tone symbols, each in the range 0-7. */
  symbols: number[];
  /** The source message text that was encoded. */
  text: string;
}

/** Parameters for composing an FT8 message string. */
export interface Ft8ComposeParams {
  myCallsign: string;
  myGrid: string;
  type: "CQ" | "GRID" | "REPORT" | "RR73" | "73" | "FREE";
  targetCall?: string;
  report?: string;
  cqDirection?: string;
  freeText?: string;
}

// ============================================================================
// Step 1: Message Text Composition
// ============================================================================

/**
 * Compose the correct FT8 text message string for a given QSO stage.
 *
 * @param params  QSO stage parameters including callsigns, grid, report, etc.
 * @returns       The FT8 message text (max 13 characters for standard messages).
 */
export function composeFt8Message(params: Ft8ComposeParams): string {
  const my = params.myCallsign.toUpperCase().trim();
  const grid = params.myGrid.toUpperCase().trim().slice(0, 4);
  const target = params.targetCall?.toUpperCase().trim() ?? "";

  switch (params.type) {
    case "CQ": {
      const dir = params.cqDirection?.toUpperCase().trim();
      return dir ? `CQ ${dir} ${my} ${grid}` : `CQ ${my} ${grid}`;
    }
    case "GRID":
      return `${my} ${target} ${grid}`;
    case "REPORT":
      return `${my} ${target} ${params.report ?? "+00"}`;
    case "RR73":
      return `${my} ${target} RR73`;
    case "73":
      return `${my} ${target} 73`;
    case "FREE":
      return (params.freeText ?? "").toUpperCase().trim().slice(0, 13);
  }
}

// ============================================================================
// Step 2: 77-bit Message Packing
// ============================================================================

/**
 * Pack an FT8 message text string into a 77-bit binary representation.
 *
 * Supports Type 1 (standard) messages and Type 0 (free text) messages.
 * The 77 bits are stored in a Uint8Array of 10 bytes (80 bits, last 3 unused).
 *
 * @param message  The FT8 message text (e.g. "CQ K1ABC FN42")
 * @returns        Uint8Array containing the 77-bit packed message (10 bytes)
 */
export function packMessage77(message: string): Uint8Array {
  const msg = message.toUpperCase().trim();
  const parts = msg.split(/\s+/);

  // Try to parse as a standard Type 1 message
  const standardResult = tryPackStandard(parts, msg);
  if (standardResult) return standardResult;

  // Fall back to free text encoding (i3=0, n3=0)
  return packFreeText(msg);
}

/**
 * Attempt to pack the message as a Type 1 standard message.
 *
 * Type 1 layout (77 bits): c28 r1 c28 r1 g15 i3
 *   - First c28+r1: 29 bits for the first callsign/CQ field
 *   - Second c28+r1: 29 bits for the second callsign
 *   - g15: 15 bits for grid locator or signal report
 *   - i3: 3 bits for message type indicator (=1)
 *
 * Note: The r1 bits are set to 0 for normal (non-compound) callsigns.
 * The actual 77-bit layout in the ft8_lib implementation is:
 *   n28a(28) + r1a(1) + n28b(28) + r1b(1) + R(1) + g15(15) + i3(3) = 77
 *
 * @returns Uint8Array with 77-bit packed message, or null if not standard format
 */
function tryPackStandard(
  parts: string[],
  _fullMessage: string,
): Uint8Array | null {
  if (parts.length < 3) return null;

  let call1Value: number;
  let call2Value: number;
  let grid15Value: number;
  let rBit = 0; // R prefix flag for the grid15 field

  // ── CQ messages: "CQ [dir] CALL GRID" ───────────────────────────────
  if (parts[0] === "CQ") {
    let callIdx: number;
    let gridIdx: number;

    if (parts.length >= 4 && !isCallsign(parts[1])) {
      // CQ with direction: "CQ DX K1ABC FN42"
      const direction = parts[1];
      call1Value = packCqDirection(direction);
      callIdx = 2;
      gridIdx = 3;
    } else {
      // Plain CQ: "CQ K1ABC FN42"
      call1Value = PACKED_CQ;
      callIdx = 1;
      gridIdx = 2;
    }

    call2Value = packCallsign28(parts[callIdx]);
    if (call2Value < 0) return null;

    const gridStr = parts[gridIdx];
    if (gridStr && isGridLocator(gridStr)) {
      grid15Value = packGrid15(gridStr);
    } else {
      grid15Value = 0;
    }
  }
  // ── QSO messages: "CALL1 CALL2 GRID/REPORT/RR73/73" ────────────────
  else if (parts.length >= 3) {
    call1Value = packCallsign28(parts[0]);
    if (call1Value < 0) return null;

    call2Value = packCallsign28(parts[1]);
    if (call2Value < 0) return null;

    const thirdField = parts[2];

    if (isGridLocator(thirdField)) {
      grid15Value = packGrid15(thirdField);
    } else if (thirdField === "RR73") {
      grid15Value = GRID15_RR73_PACKED;
    } else if (thirdField === "RRR") {
      grid15Value = GRID15_RRR_PACKED;
    } else if (thirdField === "73") {
      grid15Value = GRID15_73_PACKED;
    } else {
      // Signal report: parse as R?[+-]nn
      const reportResult = parseReport(thirdField);
      if (reportResult === null) return null;
      grid15Value = reportResult.value;
      rBit = reportResult.hasR ? 1 : 0;
    }
  } else {
    return null;
  }

  // Assemble 77-bit message: n28a(28) + r1a(1) + n28b(28) + r1b(1) + R(1) + g15(15) + i3(3)
  return assembleBits77(
    call1Value,
    0,
    call2Value,
    0,
    rBit,
    grid15Value,
    I3_STANDARD,
  );
}

// Grid15 packed values for special tokens.
// In the ft8_lib implementation, the g15 field for these special tokens:
const GRID15_RR73_PACKED = 1;
const GRID15_RRR_PACKED = 2;
const GRID15_73_PACKED = 3;

/**
 * Pack a free text message into 77 bits using i3=0, n3=0 encoding.
 *
 * Free text uses a 42-character alphabet and encodes up to 13 characters
 * as a base-42 number packed into 71 bits. The remaining 6 bits are
 * i3(3) = 0 and n3(3) = 0.
 *
 * Layout: f71(71) + c3(3) + i3(3) = 77
 * where c3 = n3 = 0 (sub-type for free text) and i3 = 0.
 */
function packFreeText(message: string): Uint8Array {
  const text = message.toUpperCase().padEnd(13, " ").slice(0, 13);

  // Encode as base-42 number: accumulate left to right
  let value = BigInt(0);
  for (let i = 0; i < 13; i++) {
    const charIdx = FT8_CHAR_TABLE_FULL.indexOf(text[i]);
    const idx = charIdx >= 0 ? charIdx : 0; // Unknown chars become space
    value = value * 42n + BigInt(idx);
  }

  // Pack into 77 bits: 71-bit free text value + 3-bit n3(=0) + 3-bit i3(=0)
  const packed = value << 6n; // Shift left 6 bits for n3 + i3 (both 0)

  return bigintToBytes77(packed);
}

// ============================================================================
// Step 3: CRC-14 Calculation
// ============================================================================

/**
 * Compute a 14-bit CRC over a 77-bit message using the FT8 CRC polynomial.
 *
 * The algorithm processes the 77 message bits followed by 14 zero bits
 * through a standard CRC shift register. The final register value is the CRC.
 *
 * @param message77  Uint8Array containing the 77-bit message (10 bytes)
 * @returns          14-bit CRC value
 */
export function computeCrc14(message77: Uint8Array): number {
  const TOPBIT = 1 << (FT8_CRC_WIDTH - 1); // 0x2000
  let remainder = 0;

  // Process 77 message bits + 14 zero bits = 91 bits total
  const totalBits = FT8_MESSAGE_BITS + FT8_CRC_WIDTH; // 91

  for (let bitIdx = 0; bitIdx < totalBits; bitIdx++) {
    // Get the current bit from message (0 for the trailing 14 zero bits)
    let bit: number;
    if (bitIdx < FT8_MESSAGE_BITS) {
      const byteIdx = Math.floor(bitIdx / 8);
      const bitInByte = 7 - (bitIdx % 8);
      bit = (message77[byteIdx] >> bitInByte) & 1;
    } else {
      bit = 0;
    }

    // Shift the bit into the remainder
    remainder = (remainder << 1) | bit;

    // If the top bit is set, XOR with the polynomial
    if (remainder & TOPBIT) {
      remainder ^= FT8_CRC_POLYNOMIAL;
    }

    // Keep only 14 bits
    remainder &= (1 << FT8_CRC_WIDTH) - 1;
  }

  return remainder;
}

/**
 * Append the 14-bit CRC to the 77-bit message to produce a 91-bit data word.
 *
 * @param message77  Uint8Array containing the 77-bit message (10 bytes)
 * @returns          Uint8Array containing the 91-bit data word (12 bytes)
 */
export function appendCrc(message77: Uint8Array): Uint8Array {
  const crc = computeCrc14(message77);

  // Build 91-bit word: 77 message bits + 14 CRC bits
  // Convert message77 (10 bytes, 80 bits) to bigint
  let bits = BigInt(0);
  for (let i = 0; i < 10; i++) {
    bits = (bits << 8n) | BigInt(message77[i]);
  }
  // Discard the trailing 3 padding bits to get the 77 message bits
  bits >>= 3n;
  // Append the 14-bit CRC
  bits = (bits << 14n) | BigInt(crc);

  // Convert 91-bit value to 12 bytes (96 bits total, last 5 bits unused)
  // Shift left by 5 to align 91 bits to byte boundary
  const shifted = bits << 5n;
  const out = new Uint8Array(FTX_LDPC_K_BYTES);
  for (let i = 0; i < 12; i++) {
    out[i] = Number((shifted >> BigInt((11 - i) * 8)) & 0xffn);
  }
  return out;
}

// ============================================================================
// Step 4: LDPC(174,91) Encoding
// ============================================================================

/**
 * Encode a 91-bit data word into 174 coded bits using the LDPC(174,91) code.
 *
 * The 91 data bits form the systematic part of the codeword.
 * The 83 parity bits are computed by multiplying the data bits by the
 * generator matrix (mod 2): parity[i] = XOR of data[j] for all j where
 * generator[i][j] = 1.
 *
 * @param data91  Uint8Array containing the 91-bit data word (12 bytes, last 5 bits unused)
 * @returns       Uint8Array containing the 174-bit codeword (22 bytes, last 6 bits unused)
 */
export function ldpcEncode(data91: Uint8Array): Uint8Array {
  // Compute 83 parity bits using the generator matrix
  const parity = new Uint8Array(11); // 83 bits = 11 bytes (last 5 bits unused)

  for (let i = 0; i < FTX_LDPC_M; i++) {
    // Compute parity bit i: dot product of data91 with generator row i (mod 2)
    let nsum = 0;
    for (let j = 0; j < FTX_LDPC_K_BYTES; j++) {
      nsum ^= parity8(data91[j] & FTX_LDPC_GENERATOR[i][j]);
    }

    // Set parity bit i in the parity array
    if (nsum) {
      const byteIdx = Math.floor(i / 8);
      const bitIdx = 7 - (i % 8);
      parity[byteIdx] |= 1 << bitIdx;
    }
  }

  // Combine: 91 data bits + 83 parity bits = 174 bits
  // Output as 22 bytes (176 bits, last 2 unused)
  const result = new Uint8Array(Math.ceil(FTX_LDPC_N / 8)); // 22 bytes

  // Copy 91 data bits (bytes 0-10 of data91, then first 3 bits of byte 11)
  // The data91 is 12 bytes with 91 significant bits (MSB-first, last 5 bits unused)
  // We need to write 91 data bits followed by 83 parity bits into 174 bits.

  // Write bit by bit for clarity and correctness
  for (let i = 0; i < FTX_LDPC_N; i++) {
    let bit: number;
    if (i < FTX_LDPC_K) {
      // Data bit from data91
      const byteIdx = Math.floor(i / 8);
      const bitInByte = 7 - (i % 8);
      bit = (data91[byteIdx] >> bitInByte) & 1;
    } else {
      // Parity bit
      const pi = i - FTX_LDPC_K;
      const byteIdx = Math.floor(pi / 8);
      const bitInByte = 7 - (pi % 8);
      bit = (parity[byteIdx] >> bitInByte) & 1;
    }

    if (bit) {
      const outByte = Math.floor(i / 8);
      const outBit = 7 - (i % 8);
      result[outByte] |= 1 << outBit;
    }
  }

  return result;
}

/**
 * Compute the parity (popcount mod 2) of a byte.
 *
 * Uses the cascading XOR trick: x ^= x>>4; x ^= x>>2; x ^= x>>1; return x&1.
 * This efficiently counts whether the number of set bits is odd (1) or even (0).
 */
function parity8(x: number): number {
  let v = x;
  v ^= v >> 4;
  v ^= v >> 2;
  v ^= v >> 1;
  return v & 1;
}

// ============================================================================
// Step 5: Bits to Symbols (Gray Code Mapping)
// ============================================================================

/**
 * Convert 174 coded bits into 58 data symbols with Gray code mapping.
 *
 * Groups the 174 bits into 58 groups of 3 bits each, then applies the
 * FT8 Gray code map to each 3-bit value.
 *
 * @param coded174  Uint8Array containing 174 coded bits (22 bytes)
 * @returns         Array of 58 Gray-coded symbol values (each 0-7)
 */
export function bitsToSymbols(coded174: Uint8Array): number[] {
  const symbols: number[] = new Array(58);

  for (let i = 0; i < 58; i++) {
    const bitOffset = i * 3;
    // Extract 3 bits starting at bitOffset
    let value = 0;
    for (let b = 0; b < 3; b++) {
      const globalBit = bitOffset + b;
      const byteIdx = Math.floor(globalBit / 8);
      const bitInByte = 7 - (globalBit % 8);
      const bit = (coded174[byteIdx] >> bitInByte) & 1;
      value = (value << 1) | bit;
    }
    // Apply Gray code mapping
    symbols[i] = FT8_GRAY_MAP[value];
  }

  return symbols;
}

// ============================================================================
// Step 6: Insert Costas Sync and Merge
// ============================================================================

/**
 * Build the complete 79-symbol FT8 sequence by inserting Costas sync
 * symbols and merging with the 58 data symbols.
 *
 * The 79-symbol layout:
 *   - Positions  0-6:  Costas sync (7 symbols)
 *   - Positions  7-35: Data symbols 0-28 (29 symbols)
 *   - Positions 36-42: Costas sync (7 symbols)
 *   - Positions 43-71: Data symbols 29-57 (29 symbols)
 *   - Positions 72-78: Costas sync (7 symbols)
 *
 * @param dataSymbols  Array of 58 Gray-coded data symbols (each 0-7)
 * @returns            Array of 79 tone symbols (each 0-7)
 */
export function insertCostasAndMerge(dataSymbols: number[]): number[] {
  const symbols = new Array<number>(79);

  // Insert three Costas sync groups
  for (let i = 0; i < 7; i++) {
    symbols[i] = FT8_COSTAS[i]; // Positions 0-6
    symbols[36 + i] = FT8_COSTAS[i]; // Positions 36-42
    symbols[72 + i] = FT8_COSTAS[i]; // Positions 72-78
  }

  // Insert 29 data symbols at positions 7-35
  for (let i = 0; i < 29; i++) {
    symbols[7 + i] = dataSymbols[i];
  }

  // Insert 29 data symbols at positions 43-71
  for (let i = 0; i < 29; i++) {
    symbols[43 + i] = dataSymbols[29 + i];
  }

  return symbols;
}

// ============================================================================
// Main Encoder Function
// ============================================================================

/**
 * Encode an FT8 text message into 79 tone symbols (values 0-7).
 *
 * This is the top-level entry point that runs the full encoding pipeline:
 *   message text -> 77-bit pack -> CRC-14 -> LDPC(174,91) -> Gray symbols -> Costas merge
 *
 * @param message  FT8 message text (e.g. "CQ K1ABC FN42")
 * @returns        Encoded result with 79 symbols and the source text
 */
export function encodeFt8Message(message: string): Ft8EncodedResult {
  const text = message.toUpperCase().trim();

  // Step 2: Pack into 77-bit message
  const message77 = packMessage77(text);

  // Step 3: Compute and append CRC-14 -> 91-bit data word
  const data91 = appendCrc(message77);

  // Step 4: LDPC encode -> 174 coded bits
  const coded174 = ldpcEncode(data91);

  // Step 5: Convert bits to 58 Gray-coded symbols
  const dataSymbols = bitsToSymbols(coded174);

  // Step 6: Insert Costas sync and merge -> 79 tone symbols
  const symbols = insertCostasAndMerge(dataSymbols);

  return { symbols, text };
}

// ============================================================================
// Callsign Packing (28-bit)
// ============================================================================

/**
 * Pack a standard callsign into a 28-bit value.
 *
 * Standard callsigns are normalized to 6 characters with a digit forced
 * into position [2] (third character). The encoding uses the 37-character
 * FT8 alphabet (space=0, 0-9=1-10, A-Z=11-36).
 *
 * Encoding formula:
 *   value = c[0]*36*10*27*27*27 + c[1]*10*27*27*27 + c[2]*27*27*27 + c[3]*27*27 + c[4]*27 + c[5]
 *
 * Where c[0] is from [A-Z, 0-9, space] (37 values),
 *       c[1] is from [A-Z, 0-9] (36 values),
 *       c[2] is a digit [0-9] (10 values),
 *       c[3..5] are from [A-Z, space] (27 values each).
 *
 * The result is offset by NTOKENS (2,063,592) to distinguish from special tokens.
 *
 * @param callsign  The callsign string (e.g. "K1ABC", "W2XYZ")
 * @returns         28-bit packed value, or -1 if the callsign cannot be packed
 */
export function packCallsign28(callsign: string): number {
  const call = callsign.toUpperCase().trim();

  // Handle special tokens
  if (call === "DE") return 0;
  if (call === "QRZ") return 1;
  if (call === "CQ") return PACKED_CQ;

  // Normalize to 6-character format with digit at position [2]
  const normalized = normalizeCallsign(call);
  if (!normalized) return -1;

  // Encode using the basecall formula
  const c0 = charIndex37(normalized[0]); // space, 0-9, A-Z
  const c1 = charIndex36(normalized[1]); // 0-9, A-Z (no space)
  const c2 = digitIndex(normalized[2]); // 0-9 only
  const c3 = letterSpaceIndex(normalized[3]); // space, A-Z
  const c4 = letterSpaceIndex(normalized[4]); // space, A-Z
  const c5 = letterSpaceIndex(normalized[5]); // space, A-Z

  if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0 || c4 < 0 || c5 < 0) return -1;

  const value =
    c0 * 36 * 10 * 27 * 27 * 27 +
    c1 * 10 * 27 * 27 * 27 +
    c2 * 27 * 27 * 27 +
    c3 * 27 * 27 +
    c4 * 27 +
    c5;

  return NTOKENS + value;
}

/**
 * Normalize a callsign to the 6-character FT8 standard format.
 *
 * FT8 requires a digit at position [2] (third character). Callsigns shorter
 * than 6 characters are left-padded with spaces. The function identifies
 * where the digit is in the original callsign and shifts accordingly.
 *
 * Examples:
 *   "K1ABC"   -> " K1ABC"  (pad left with space)
 *   "W2XYZ"   -> " W2XYZ"
 *   "VE3ABC"  -> "VE3ABC"  (already has digit at pos 2)
 *   "3D2RP"   -> "3D2RP "  (digit already at pos 2, pad right)
 *
 * @returns Normalized 6-char string, or null if callsign is invalid
 */
function normalizeCallsign(call: string): string | null {
  if (call.length < 1 || call.length > 6) return null;

  // If already 6 chars and digit is at position 2, use as-is
  if (call.length === 6) {
    if (isDigit(call[2])) return call;
    return null;
  }

  // Find the position of the first digit
  let digitPos = -1;
  for (let i = 0; i < call.length; i++) {
    if (isDigit(call[i])) {
      digitPos = i;
      break;
    }
  }
  if (digitPos < 0) return null; // No digit found

  // The digit needs to end up at position 2 in the 6-char format.
  // Pad left with spaces so the digit lands at index 2.
  const leftPad = 2 - digitPos;
  if (leftPad < 0) return null; // Digit is already past position 2 — unusual

  const padded = " ".repeat(leftPad) + call;
  // Right-pad to 6 characters
  const result = padded.padEnd(6, " ");

  if (result.length !== 6) return null;
  if (!isDigit(result[2])) return null;

  return result;
}

// ============================================================================
// CQ Direction Packing
// ============================================================================

/**
 * Pack a CQ direction modifier (e.g. "DX", "NA", "EU") into a 28-bit value.
 *
 * Alphabetic CQ modifiers (1-4 uppercase letters) are encoded as:
 *   value = 1003 + base-27 encoding of up to 4 letters
 *
 * Each letter is encoded as: A=1, B=2, ..., Z=26 (0 = end marker).
 *
 * @param direction  The CQ direction string (e.g. "DX")
 * @returns          28-bit packed value for the CQ direction
 */
function packCqDirection(direction: string): number {
  const dir = direction.toUpperCase().trim().slice(0, 4);

  // Check if it's a numeric CQ modifier (3 digits)
  if (/^\d{1,3}$/.test(dir)) {
    const num = parseInt(dir, 10);
    if (num >= 0 && num <= 999) {
      return 3 + num; // PACKED_CQ_NUM_START + nnn
    }
  }

  // Alphabetic modifier: encode as base-27 with letter values 1-26
  let value = 0;
  for (let i = 0; i < 4; i++) {
    value *= 27;
    if (i < dir.length) {
      const ch = dir.charCodeAt(i);
      if (ch >= 65 && ch <= 90) {
        // A-Z
        value += ch - 64; // A=1, B=2, ..., Z=26
      }
    }
  }

  return PACKED_CQ_ALPHA_START + value;
}

// ============================================================================
// Grid / Report Packing (15-bit)
// ============================================================================

/**
 * Pack a 4-character Maidenhead grid locator into a 15-bit value.
 *
 * Grid locators range from AA00 to RR99. The encoding is:
 *   value = (c1-'A')*18*10*10 + (c2-'A')*10*10 + (c3-'0')*10 + (c4-'0') + 1
 *
 * The +1 offset reserves value 0 for "no grid" / free text.
 *
 * @param grid  4-character grid locator (e.g. "FN42")
 * @returns     15-bit packed value (1-3240)
 */
export function packGrid15(grid: string): number {
  const g = grid.toUpperCase();
  if (g.length < 4) return 0;

  const c1 = g.charCodeAt(0) - 65; // A=0
  const c2 = g.charCodeAt(1) - 65;
  const c3 = g.charCodeAt(2) - 48; // '0'=0
  const c4 = g.charCodeAt(3) - 48;

  if (c1 < 0 || c1 > 17) return 0; // A-R
  if (c2 < 0 || c2 > 17) return 0;
  if (c3 < 0 || c3 > 9) return 0;
  if (c4 < 0 || c4 > 9) return 0;

  return c1 * 18 * 10 * 10 + c2 * 10 * 10 + c3 * 10 + c4 + 1;
}

/**
 * Parse a signal report string and return the packed grid15 value.
 *
 * Supports formats:
 *   - Plain report: "+05", "-15" -> mapped to report + 35
 *   - R-prefixed report: "R+05", "R-15" -> mapped to report + 35 + 61 offset
 *
 * @param report  Signal report string (e.g. "-15", "R+03")
 * @returns       Object with packed value and R-prefix flag, or null if invalid
 */
function parseReport(report: string): { value: number; hasR: boolean } | null {
  let str = report.toUpperCase();
  let hasR = false;

  if (str.startsWith("R")) {
    hasR = true;
    str = str.slice(1);
  }

  // Parse as [+-]nn
  const match = str.match(/^([+-])(\d{1,2})$/);
  if (!match) return null;

  const sign = match[1] === "+" ? 1 : -1;
  const magnitude = parseInt(match[2], 10);
  const db = sign * magnitude;

  if (db < -30 || db > 30) return null;

  // Encode: report + 35 gives range 5 (=-30dB) to 65 (=+30dB)
  const reportValue = db + 35;

  if (hasR) {
    // R-prefixed: offset into R_REPORT_BASE range
    return { value: R_REPORT_BASE + reportValue, hasR: true };
  }
  return { value: REPORT_BASE + reportValue, hasR: false };
}

// ============================================================================
// Bit Assembly Helpers
// ============================================================================

/**
 * Assemble the 77-bit Type 1 standard message from its component fields.
 *
 * Layout: n28a(28) + r1a(1) + n28b(28) + r1b(1) + R(1) + g15(15) + i3(3) = 77 bits
 *
 * @returns Uint8Array of 10 bytes containing the 77-bit message (last 3 bits unused)
 */
function assembleBits77(
  n28a: number,
  r1a: number,
  n28b: number,
  r1b: number,
  rFlag: number,
  g15: number,
  i3: number,
): Uint8Array {
  // Use BigInt for precise bit manipulation across the 77-bit field
  let bits = BigInt(0);

  // n28a: 28 bits
  bits = (bits << 28n) | BigInt(n28a & 0x0fffffff);
  // r1a: 1 bit
  bits = (bits << 1n) | BigInt(r1a & 1);
  // n28b: 28 bits
  bits = (bits << 28n) | BigInt(n28b & 0x0fffffff);
  // r1b: 1 bit
  bits = (bits << 1n) | BigInt(r1b & 1);
  // R flag: 1 bit
  bits = (bits << 1n) | BigInt(rFlag & 1);
  // g15: 15 bits
  bits = (bits << 15n) | BigInt(g15 & 0x7fff);
  // i3: 3 bits
  bits = (bits << 3n) | BigInt(i3 & 7);

  // Total: 28+1+28+1+1+15+3 = 77 bits
  return bigintToBytes77(bits);
}

/**
 * Convert a BigInt value (up to 77 bits) into a Uint8Array of 10 bytes.
 *
 * The 77 bits are stored MSB-first in the first 77 bit positions.
 * The last 3 bits of byte 9 are unused (zero-padded).
 */
function bigintToBytes77(value: bigint): Uint8Array {
  const result = new Uint8Array(10);
  // Shift left by 3 to align 77 bits to 80-bit (10 byte) boundary
  let shifted = value << 3n;
  for (let i = 9; i >= 0; i--) {
    result[i] = Number(shifted & 0xffn);
    shifted >>= 8n;
  }
  return result;
}

// ============================================================================
// Character Index Helpers
// ============================================================================

/**
 * Get the index of a character in the 37-char FT8 alphabet.
 * Space=0, 0-9=1-10, A-Z=11-36.
 */
function charIndex37(ch: string): number {
  const idx = FT8_CHAR_TABLE_ALPHANUM.indexOf(ch);
  return idx; // -1 if not found
}

/**
 * Get the index of a character in the 36-char subset (no space).
 * 0-9=0-9, A-Z=10-35.
 */
function charIndex36(ch: string): number {
  if (ch >= "0" && ch <= "9") return ch.charCodeAt(0) - 48; // 0-9
  if (ch >= "A" && ch <= "Z") return ch.charCodeAt(0) - 55; // 10-35
  return -1;
}

/**
 * Get the digit index (0-9) of a character.
 */
function digitIndex(ch: string): number {
  if (ch >= "0" && ch <= "9") return ch.charCodeAt(0) - 48;
  return -1;
}

/**
 * Get the letter/space index: space=0, A=1, B=2, ..., Z=26.
 */
function letterSpaceIndex(ch: string): number {
  if (ch === " ") return 0;
  if (ch >= "A" && ch <= "Z") return ch.charCodeAt(0) - 64; // A=1 ... Z=26
  return -1;
}

// ============================================================================
// Validation Helpers
// ============================================================================

/** Check if a character is a digit (0-9). */
function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

/** Check if a string looks like a standard amateur callsign. */
function isCallsign(s: string): boolean {
  // Must contain at least one letter and one digit
  return /[A-Z]/i.test(s) && /\d/.test(s) && s.length >= 3;
}

/** Check if a string is a valid 4-character Maidenhead grid locator. */
function isGridLocator(s: string): boolean {
  return /^[A-Ra-r]{2}\d{2}$/.test(s);
}
