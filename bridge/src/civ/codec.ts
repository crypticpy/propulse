/**
 * CI-V Codec — Frame encoder/decoder and BCD utilities
 *
 * Handles the low-level byte-level encoding and decoding of CI-V frames.
 * Extracted from the original civ.ts spectrum parser for reuse by both
 * the serial and network backends.
 */

import { CIV_PREAMBLE, CIV_EOM, CIV_OK, CIV_NG } from "./types.js";

// ─── Parsed Frame ─────────────────────────────────────────────────────────────

export interface CivFrame {
  /** Destination address */
  to: number;
  /** Source address (radio that sent the frame) */
  from: number;
  /** Command byte */
  command: number;
  /** Sub-command byte (if present in data) */
  subCommand: number | undefined;
  /** Raw data payload (after to/from/command, may include sub-command) */
  data: Buffer;
  /** True if this is an OK acknowledgment (command = 0xFB) */
  isOk: boolean;
  /** True if this is an NG error (command = 0xFA) */
  isNg: boolean;
}

// ─── BCD Encoding/Decoding ────────────────────────────────────────────────────

/**
 * Decode a single BCD byte into its decimal value.
 * E.g. 0x94 → 94, 0x07 → 7
 */
export function decodeBcdByte(byte: number): number {
  const lo = byte & 0x0f;
  const hi = (byte >> 4) & 0x0f;
  return hi * 10 + lo;
}

/**
 * Parse a 5-byte BCD-encoded frequency (little-endian, 10 digits).
 * CI-V encodes frequencies as BCD with the least significant byte first.
 *
 * Example: 14.074.000 Hz = bytes [00, 40, 07, 14, 00] → 14074000
 */
export function decodeBcdFrequency(buf: Buffer, offset: number): number {
  let freq = 0;
  let multiplier = 1;
  for (let i = 0; i < 5; i++) {
    const byte = buf[offset + i];
    const lo = byte & 0x0f;
    const hi = (byte >> 4) & 0x0f;
    freq += lo * multiplier;
    multiplier *= 10;
    freq += hi * multiplier;
    multiplier *= 10;
  }
  return freq;
}

/**
 * Encode a frequency in Hz as 5-byte BCD (little-endian).
 * E.g. 14074000 → [0x00, 0x40, 0x07, 0x14, 0x00]
 */
export function encodeBcdFrequency(hz: number): Buffer {
  const buf = Buffer.alloc(5);
  let remaining = Math.round(hz);
  for (let i = 0; i < 5; i++) {
    const lo = remaining % 10;
    remaining = Math.floor(remaining / 10);
    const hi = remaining % 10;
    remaining = Math.floor(remaining / 10);
    buf[i] = (hi << 4) | lo;
  }
  return buf;
}

/**
 * Encode a 2-byte BCD level value (0-255 → big-endian BCD 0x0000-0x0255).
 * CI-V levels use big-endian BCD: d1 = high byte, d2 = low byte.
 *
 * Example: value 128 → d1=0x01 d2=0x28 (BCD "0128")
 */
export function encodeBcdLevel(value: number): Buffer {
  const clamped = Math.max(0, Math.min(255, Math.round(value)));
  const buf = Buffer.alloc(2);
  const lo = clamped % 100; // tens and units (0-99)
  const hi = Math.floor(clamped / 100); // hundreds (0-2)
  // d1 = high byte (hundreds digit as BCD)
  buf[0] = hi & 0x0f;
  // d2 = low byte (tens and units as BCD)
  buf[1] = ((Math.floor(lo / 10) & 0x0f) << 4) | (lo % 10);
  return buf;
}

/**
 * Decode a 2-byte big-endian BCD level value to a number (0-255).
 * CI-V format: d1 = high byte (hundreds BCD), d2 = low byte (tens+units BCD).
 *
 * Example: d1=0x00 d2=0x47 → 0*100 + 47 = 47
 */
export function decodeBcdLevel(buf: Buffer, offset: number): number {
  const d1 = buf[offset]; // high byte: hundreds (BCD)
  const d2 = buf[offset + 1]; // low byte: tens and units (BCD)
  return decodeBcdByte(d1) * 100 + decodeBcdByte(d2);
}

/**
 * Encode a signed RIT/XIT offset in Hz as CI-V BCD format.
 * Format: [sign] [2-byte BCD absolute value]
 * sign: 0x00 = positive, 0x01 = negative
 */
export function encodeBcdOffset(hz: number): Buffer {
  const sign = hz < 0 ? 0x01 : 0x00;
  const abs = Math.abs(Math.round(hz));
  const buf = Buffer.alloc(3);
  // 2-byte BCD for the absolute value (max 9999)
  const lo = abs % 100;
  const hi = Math.floor(abs / 100) % 100;
  buf[0] = ((Math.floor(lo / 10) & 0x0f) << 4) | (lo % 10);
  buf[1] = ((Math.floor(hi / 10) & 0x0f) << 4) | (hi % 10);
  buf[2] = sign;
  return buf;
}

/**
 * Decode a CI-V BCD offset (RIT/XIT) to signed Hz.
 */
export function decodeBcdOffset(buf: Buffer, offset: number): number {
  const lo = decodeBcdByte(buf[offset]);
  const hi = decodeBcdByte(buf[offset + 1]) * 100;
  const sign = buf[offset + 2] === 0x01 ? -1 : 1;
  return sign * (hi + lo);
}

// ─── Frame Construction ───────────────────────────────────────────────────────

/**
 * Build a complete CI-V frame: FE FE [to] [from] [cmd] [data...] FD
 */
export function buildFrame(
  to: number,
  from: number,
  command: number,
  data?: Buffer,
): Buffer {
  const dataLen = data ? data.length : 0;
  const frame = Buffer.alloc(4 + 1 + dataLen + 1); // preamble(2) + to + from + cmd + data + eom
  frame[0] = CIV_PREAMBLE;
  frame[1] = CIV_PREAMBLE;
  frame[2] = to;
  frame[3] = from;
  frame[4] = command;
  if (data) data.copy(frame, 5);
  frame[frame.length - 1] = CIV_EOM;
  return frame;
}

/**
 * Build a CI-V frame with a sub-command byte prepended to data.
 */
export function buildFrameWithSub(
  to: number,
  from: number,
  command: number,
  subCommand: number,
  data?: Buffer,
): Buffer {
  const subBuf = data
    ? Buffer.concat([Buffer.from([subCommand]), data])
    : Buffer.from([subCommand]);
  return buildFrame(to, from, command, subBuf);
}

// ─── Stateful Frame Parser ────────────────────────────────────────────────────

/** Maximum buffer size before truncation (64 KB) */
const MAX_BUFFER_SIZE = 65_536;

/**
 * Stateful CI-V frame parser.
 * Append raw bytes and get back fully parsed CivFrame objects.
 * Handles buffering across incomplete reads and multiple frames per chunk.
 */
export class CivFrameParser {
  private buffer: Buffer = Buffer.alloc(0);
  private _droppedFrames = 0;

  /** Number of frames dropped due to buffer overflow */
  get droppedFrames(): number {
    return this._droppedFrames;
  }

  /** Reset the parser state */
  reset(): void {
    this.buffer = Buffer.alloc(0);
  }

  /**
   * Append raw bytes and extract all complete CI-V frames.
   * Returns an array of parsed frames (may be empty).
   */
  append(chunk: Buffer): CivFrame[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    // Guard against unbounded buffer growth
    if (this.buffer.length > MAX_BUFFER_SIZE) {
      this.buffer = this.buffer.subarray(
        this.buffer.length - MAX_BUFFER_SIZE / 2,
      );
      this._droppedFrames++;
    }

    const frames: CivFrame[] = [];
    let searchStart = 0;

    while (searchStart < this.buffer.length - 3) {
      // Find FE FE preamble
      const preambleIdx = this.findPreamble(searchStart);
      if (preambleIdx < 0) break;

      // Find FD terminator after preamble
      const eomIdx = this.buffer.indexOf(CIV_EOM, preambleIdx + 2);
      if (eomIdx < 0) {
        // No terminator yet — keep buffered from preamble onward
        if (preambleIdx > 0) {
          this.buffer = this.buffer.subarray(preambleIdx);
        }
        return frames;
      }

      // Extract payload between FE FE and FD (exclusive)
      const payload = this.buffer.subarray(preambleIdx + 2, eomIdx);
      searchStart = eomIdx + 1;

      // Minimum valid: to(1) + from(1) + cmd(1) = 3 bytes
      if (payload.length >= 3) {
        const to = payload[0];
        const from = payload[1];
        const command = payload[2];
        const rest = payload.subarray(3);

        frames.push({
          to,
          from,
          command,
          subCommand: rest.length > 0 ? rest[0] : undefined,
          data: Buffer.from(rest), // copy to avoid referencing truncated buffer
          isOk: command === CIV_OK,
          isNg: command === CIV_NG,
        });
      }
    }

    // Remove consumed bytes
    if (searchStart > 0) {
      this.buffer = this.buffer.subarray(searchStart);
    }

    return frames;
  }

  /** Find two consecutive 0xFE bytes starting from the given offset. */
  private findPreamble(start: number): number {
    for (let i = start; i < this.buffer.length - 1; i++) {
      if (
        this.buffer[i] === CIV_PREAMBLE &&
        this.buffer[i + 1] === CIV_PREAMBLE
      ) {
        return i;
      }
    }
    return -1;
  }
}
