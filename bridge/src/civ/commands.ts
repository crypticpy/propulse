/**
 * CI-V Command Builders + Response Parsers
 *
 * High-level functions for constructing CI-V command frames and
 * parsing response data for all radio control operations.
 */

import {
  buildFrame,
  buildFrameWithSub,
  encodeBcdFrequency,
  decodeBcdFrequency,
  encodeBcdLevel,
  decodeBcdLevel,
  encodeBcdOffset,
  decodeBcdOffset,
  decodeBcdByte,
  type CivFrame,
} from "./codec.js";

import {
  CivCmd,
  CIV_MODE_TO_STRING,
  CIV_STRING_TO_MODE,
  CIV_LEVEL_SUB,
  CIV_FUNC_SUB,
  CIV_METER_SUB,
  CIV_VFO,
  CIV_SCOPE_SUB,
  type CivAddress,
} from "./types.js";

// ─── Frequency ────────────────────────────────────────────────────────────────

/** Build: Read operating frequency */
export function readFrequency(addr: CivAddress): Buffer {
  return buildFrame(addr.radio, addr.controller, CivCmd.READ_FREQ);
}

/** Build: Set operating frequency */
export function setFrequency(addr: CivAddress, hz: number): Buffer {
  return buildFrame(
    addr.radio,
    addr.controller,
    CivCmd.SET_FREQ,
    encodeBcdFrequency(hz),
  );
}

/** Parse: Frequency response (cmd 0x03 echo or 0x05 echo) → Hz */
export function parseFrequencyResponse(frame: CivFrame): number | null {
  // Data is 5-byte BCD frequency
  if (frame.data.length < 5) return null;
  return decodeBcdFrequency(frame.data, 0);
}

// ─── Mode ─────────────────────────────────────────────────────────────────────

/** Build: Read operating mode */
export function readMode(addr: CivAddress): Buffer {
  return buildFrame(addr.radio, addr.controller, CivCmd.READ_MODE);
}

/** Build: Set operating mode (with optional filter width 1-3) */
export function setMode(
  addr: CivAddress,
  mode: string,
  filter?: number,
): Buffer {
  const modeByte = CIV_STRING_TO_MODE[mode.toUpperCase()];
  if (modeByte === undefined) {
    // Fallback: try parsing as number
    const parsed = parseInt(mode, 16);
    if (isNaN(parsed)) {
      throw new Error(`Unknown CI-V mode: ${mode}`);
    }
    const data =
      filter != null ? Buffer.from([parsed, filter]) : Buffer.from([parsed]);
    return buildFrame(addr.radio, addr.controller, CivCmd.SET_MODE, data);
  }
  const data =
    filter != null ? Buffer.from([modeByte, filter]) : Buffer.from([modeByte]);
  return buildFrame(addr.radio, addr.controller, CivCmd.SET_MODE, data);
}

/** Parse: Mode response → { mode: string, filter: number } */
export function parseModeResponse(
  frame: CivFrame,
): { mode: string; filter: number } | null {
  if (frame.data.length < 1) return null;
  const modeByte = frame.data[0];
  const mode = CIV_MODE_TO_STRING[modeByte] ?? `0x${modeByte.toString(16)}`;
  const filter = frame.data.length >= 2 ? frame.data[1] : 1;
  return { mode, filter };
}

// ─── PTT ──────────────────────────────────────────────────────────────────────

/** Build: Read PTT state */
export function readPtt(addr: CivAddress): Buffer {
  return buildFrameWithSub(addr.radio, addr.controller, CivCmd.PTT, 0x00);
}

/** Build: Set PTT (true = TX, false = RX) */
export function setPtt(addr: CivAddress, on: boolean): Buffer {
  return buildFrameWithSub(
    addr.radio,
    addr.controller,
    CivCmd.PTT,
    0x00,
    Buffer.from([on ? 0x01 : 0x00]),
  );
}

/** Parse: PTT response → boolean */
export function parsePttResponse(frame: CivFrame): boolean | null {
  // sub 0x00, data[1] = 0x00 (RX) or 0x01 (TX)
  if (frame.data.length < 2) return null;
  return frame.data[1] !== 0x00;
}

// ─── VFO ──────────────────────────────────────────────────────────────────────

/** Build: Select VFO A or B */
export function setVfo(addr: CivAddress, vfo: "A" | "B"): Buffer {
  const sub = vfo === "A" ? CIV_VFO.A : CIV_VFO.B;
  return buildFrame(
    addr.radio,
    addr.controller,
    CivCmd.SET_VFO,
    Buffer.from([sub]),
  );
}

/** Build: VFO A=B (equalize) */
export function vfoEqual(addr: CivAddress): Buffer {
  return buildFrame(
    addr.radio,
    addr.controller,
    CivCmd.SET_VFO,
    Buffer.from([CIV_VFO.EQUAL]),
  );
}

/** Build: VFO swap */
export function vfoSwap(addr: CivAddress): Buffer {
  return buildFrame(
    addr.radio,
    addr.controller,
    CivCmd.SET_VFO,
    Buffer.from([CIV_VFO.SWAP]),
  );
}

// ─── Split ────────────────────────────────────────────────────────────────────

/** Build: Set split on/off */
export function setSplit(addr: CivAddress, on: boolean): Buffer {
  return buildFrame(
    addr.radio,
    addr.controller,
    CivCmd.SPLIT,
    Buffer.from([on ? 0x01 : 0x00]),
  );
}

/** Build: Read split state */
export function readSplit(addr: CivAddress): Buffer {
  return buildFrame(addr.radio, addr.controller, CivCmd.SPLIT);
}

/** Parse: Split response → boolean */
export function parseSplitResponse(frame: CivFrame): boolean | null {
  if (frame.data.length < 1) return null;
  return frame.data[0] !== 0x00;
}

// ─── Meters (cmd 0x15) ───────────────────────────────────────────────────────

/** Build: Read a named meter */
export function readMeter(addr: CivAddress, meter: string): Buffer {
  const sub = CIV_METER_SUB[meter.toUpperCase()];
  if (sub === undefined) throw new Error(`Unknown meter: ${meter}`);
  return buildFrameWithSub(addr.radio, addr.controller, CivCmd.METERS, sub);
}

/** Build: Read S-meter */
export function readSmeter(addr: CivAddress): Buffer {
  return readMeter(addr, "SMETER");
}

/** Build: Read RF power meter */
export function readPowerMeter(addr: CivAddress): Buffer {
  return readMeter(addr, "RFPOWER");
}

/** Build: Read SWR meter */
export function readSwrMeter(addr: CivAddress): Buffer {
  return readMeter(addr, "SWR");
}

/** Build: Read ALC meter */
export function readAlcMeter(addr: CivAddress): Buffer {
  return readMeter(addr, "ALC");
}

/**
 * Parse: Meter response → raw 0-241 value.
 * Caller is responsible for converting to appropriate unit.
 */
export function parseMeterResponse(frame: CivFrame): number | null {
  // sub(1) + 2-byte BCD value
  if (frame.data.length < 3) return null;
  return decodeBcdLevel(frame.data, 1);
}

// ─── Levels (cmd 0x14) ───────────────────────────────────────────────────────

/** Build: Read a named level */
export function readLevel(addr: CivAddress, name: string): Buffer {
  const sub = CIV_LEVEL_SUB[name.toUpperCase()];
  if (sub === undefined) throw new Error(`Unknown level: ${name}`);
  return buildFrameWithSub(addr.radio, addr.controller, CivCmd.LEVELS, sub);
}

/** Build: Set a named level (0-255) */
export function setLevel(
  addr: CivAddress,
  name: string,
  value: number,
): Buffer {
  const sub = CIV_LEVEL_SUB[name.toUpperCase()];
  if (sub === undefined) throw new Error(`Unknown level: ${name}`);
  return buildFrameWithSub(
    addr.radio,
    addr.controller,
    CivCmd.LEVELS,
    sub,
    encodeBcdLevel(value),
  );
}

/** Parse: Level response → 0-255 value */
export function parseLevelResponse(frame: CivFrame): number | null {
  // sub(1) + 2-byte BCD value
  if (frame.data.length < 3) return null;
  return decodeBcdLevel(frame.data, 1);
}

// ─── Functions (cmd 0x16) ─────────────────────────────────────────────────────

/** Build: Read a named function state */
export function readFunction(addr: CivAddress, name: string): Buffer {
  const sub = CIV_FUNC_SUB[name.toUpperCase()];
  if (sub === undefined) throw new Error(`Unknown function: ${name}`);
  return buildFrameWithSub(addr.radio, addr.controller, CivCmd.FUNCTIONS, sub);
}

/** Build: Set a named function on/off */
export function setFunction(
  addr: CivAddress,
  name: string,
  on: boolean,
): Buffer {
  const sub = CIV_FUNC_SUB[name.toUpperCase()];
  if (sub === undefined) throw new Error(`Unknown function: ${name}`);
  return buildFrameWithSub(
    addr.radio,
    addr.controller,
    CivCmd.FUNCTIONS,
    sub,
    Buffer.from([on ? 0x01 : 0x00]),
  );
}

/** Parse: Function response → boolean */
export function parseFunctionResponse(frame: CivFrame): boolean | null {
  // sub(1) + on/off(1)
  if (frame.data.length < 2) return null;
  return frame.data[1] !== 0x00;
}

// ─── AGC ──────────────────────────────────────────────────────────────────────

/**
 * Build: Set AGC mode.
 * CI-V AGC function (0x16, sub 0x12):
 *   0x00 = off (FAST on some radios), 0x01 = FAST, 0x02 = MID, 0x03 = SLOW
 *
 * We map from our convention (0=OFF, 1=FAST, 2=MED, 3=SLOW).
 */
export function setAgc(addr: CivAddress, mode: number): Buffer {
  // Map mode to CI-V value
  const civValue = Math.max(0, Math.min(3, mode));
  return buildFrameWithSub(
    addr.radio,
    addr.controller,
    CivCmd.FUNCTIONS,
    CIV_FUNC_SUB.AGC,
    Buffer.from([civValue]),
  );
}

/** Parse: AGC response → mode number */
export function parseAgcResponse(frame: CivFrame): number | null {
  if (frame.data.length < 2) return null;
  return frame.data[1];
}

// ─── RIT / XIT (cmd 0x21) ────────────────────────────────────────────────────

/** Build: Set RIT on/off with optional offset */
export function setRit(
  addr: CivAddress,
  enabled: boolean,
  offsetHz?: number,
): Buffer {
  // Sub 0x01 = RIT on/off: data = [0x00 off / 0x01 on]
  const frames: Buffer[] = [
    buildFrameWithSub(
      addr.radio,
      addr.controller,
      CivCmd.RIT_XIT,
      0x01,
      Buffer.from([enabled ? 0x01 : 0x00]),
    ),
  ];

  if (offsetHz !== undefined) {
    // Sub 0x03 = RIT offset: data = BCD offset
    frames.push(
      buildFrameWithSub(
        addr.radio,
        addr.controller,
        CivCmd.RIT_XIT,
        0x03,
        encodeBcdOffset(offsetHz),
      ),
    );
  }

  return Buffer.concat(frames);
}

/** Build: Set XIT on/off with optional offset */
export function setXit(
  addr: CivAddress,
  enabled: boolean,
  offsetHz?: number,
): Buffer {
  // Sub 0x02 = XIT on/off: data = [0x00 off / 0x01 on]
  const frames: Buffer[] = [
    buildFrameWithSub(
      addr.radio,
      addr.controller,
      CivCmd.RIT_XIT,
      0x02,
      Buffer.from([enabled ? 0x01 : 0x00]),
    ),
  ];

  if (offsetHz !== undefined) {
    // Sub 0x03 = shared offset register
    frames.push(
      buildFrameWithSub(
        addr.radio,
        addr.controller,
        CivCmd.RIT_XIT,
        0x03,
        encodeBcdOffset(offsetHz),
      ),
    );
  }

  return Buffer.concat(frames);
}

/** Build: Read RIT state */
export function readRit(addr: CivAddress): Buffer {
  return buildFrameWithSub(addr.radio, addr.controller, CivCmd.RIT_XIT, 0x01);
}

/** Build: Read XIT state */
export function readXit(addr: CivAddress): Buffer {
  return buildFrameWithSub(addr.radio, addr.controller, CivCmd.RIT_XIT, 0x02);
}

/** Build: Read RIT/XIT offset */
export function readRitXitOffset(addr: CivAddress): Buffer {
  return buildFrameWithSub(addr.radio, addr.controller, CivCmd.RIT_XIT, 0x03);
}

/** Parse: RIT/XIT enable response → boolean */
export function parseRitXitEnableResponse(frame: CivFrame): boolean | null {
  if (frame.data.length < 2) return null;
  return frame.data[1] !== 0x00;
}

/** Parse: RIT/XIT offset response → Hz (signed) */
export function parseRitXitOffsetResponse(frame: CivFrame): number | null {
  // sub(1) + 3-byte BCD offset
  if (frame.data.length < 4) return null;
  return decodeBcdOffset(frame.data, 1);
}

// ─── CW Speed ─────────────────────────────────────────────────────────────────

/** Build: Set CW keyer speed in WPM */
export function setCwSpeed(addr: CivAddress, wpm: number): Buffer {
  return setLevel(addr, "KEYSPD", wpm);
}

/** Build: Read CW keyer speed */
export function readCwSpeed(addr: CivAddress): Buffer {
  return readLevel(addr, "KEYSPD");
}

// ─── IF Shift ─────────────────────────────────────────────────────────────────

/** Build: Set IF shift in Hz */
export function setIfShift(addr: CivAddress, hz: number): Buffer {
  // IF shift uses level sub 0x07, value 0-255 where 128 = center
  // Convert from Hz to 0-255 scale: 0 = -1200Hz, 128 = 0Hz, 255 = +1200Hz
  const normalized = Math.round(((hz + 1200) / 2400) * 255);
  return setLevel(addr, "IF_SHIFT", normalized);
}

/** Build: Read IF shift */
export function readIfShift(addr: CivAddress): Buffer {
  return readLevel(addr, "IF_SHIFT");
}

/**
 * Parse IF shift level response → Hz.
 * Level 0-255 maps to -1200Hz to +1200Hz, with 128 = 0Hz.
 */
export function parseIfShiftResponse(raw: number): number {
  return Math.round((raw / 255) * 2400 - 1200);
}

// ─── Scope / Waterfall ────────────────────────────────────────────────────────

/** Build: Enable scope data output */
export function startScope(addr: CivAddress): Buffer {
  return buildFrameWithSub(
    addr.radio,
    addr.controller,
    CivCmd.SCOPE_CTRL,
    CIV_SCOPE_SUB.ON,
  );
}

/** Build: Disable scope data output */
export function stopScope(addr: CivAddress): Buffer {
  return buildFrameWithSub(
    addr.radio,
    addr.controller,
    CivCmd.SCOPE_CTRL,
    CIV_SCOPE_SUB.OFF,
  );
}

// ─── Antenna ──────────────────────────────────────────────────────────────────

/**
 * Build: Set antenna port.
 * Uses extended command (0x1A sub 0x00) for antenna selection on some models,
 * or the simple approach of function toggle. Model-dependent.
 * For IC-7300: not applicable (single antenna port).
 * For IC-9700/7610: uses cmd 0x12 (ANT select).
 */
export function setAntenna(addr: CivAddress, port: number): Buffer {
  // Generic approach: send cmd 0x12 with port index
  return buildFrame(
    addr.radio,
    addr.controller,
    0x12,
    Buffer.from([port & 0xff]),
  );
}

// ─── Broadcast Query ──────────────────────────────────────────────────────────

/**
 * Build: Broadcast read-frequency to discover the radio's CI-V address.
 * Send to address 0x00; any radio on the bus will respond with its address
 * in the "from" field.
 */
export function broadcastReadFrequency(controllerAddr: number): Buffer {
  return buildFrame(0x00, controllerAddr, CivCmd.READ_FREQ);
}

// ─── Scope Data Parsing Helpers ───────────────────────────────────────────────

/**
 * Parse scope wave data header (sequence 1).
 * Returns null if the data is too short.
 */
export function parseScopeHeader(scopeData: Buffer): {
  scopeIndex: number;
  seq: number;
  seqMax: number;
  scopeMode: number;
  startFreqHz: number;
  endFreqHz: number;
} | null {
  if (scopeData.length < 15) return null;
  return {
    scopeIndex: scopeData[0],
    seq: decodeBcdByte(scopeData[1]),
    seqMax: decodeBcdByte(scopeData[2]),
    scopeMode: scopeData[3],
    startFreqHz: decodeBcdFrequency(scopeData, 4),
    endFreqHz: decodeBcdFrequency(scopeData, 9),
  };
}

/**
 * Parse scope wave data pixel sequence (seq 2..N).
 * Returns pixel bytes starting at offset 3.
 */
export function parseScopePixels(scopeData: Buffer): {
  scopeIndex: number;
  seq: number;
  seqMax: number;
  pixels: Uint8Array;
} | null {
  if (scopeData.length < 4) return null;
  return {
    scopeIndex: scopeData[0],
    seq: decodeBcdByte(scopeData[1]),
    seqMax: decodeBcdByte(scopeData[2]),
    pixels: new Uint8Array(scopeData.subarray(3)),
  };
}
