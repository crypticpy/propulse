/**
 * CI-V Protocol Types — ICOM Communication Interface V
 *
 * Constants, address tables, mode mappings, and type definitions
 * shared by both the serial and network backends.
 */

// ─── Frame Constants ──────────────────────────────────────────────────────────

/** CI-V preamble byte (two consecutive = frame start) */
export const CIV_PREAMBLE = 0xfe;

/** CI-V end-of-message delimiter */
export const CIV_EOM = 0xfd;

/** CI-V OK response command byte */
export const CIV_OK = 0xfb;

/** CI-V NG (error) response command byte */
export const CIV_NG = 0xfa;

/** Default controller (PC) address */
export const CIV_CONTROLLER_ADDR = 0xe0;

/** Broadcast address — all radios respond */
export const CIV_BROADCAST_ADDR = 0x00;

// ─── Addressing ───────────────────────────────────────────────────────────────

export interface CivAddress {
  /** Radio's CI-V address (e.g. 0x94 for IC-7300) */
  radio: number;
  /** Controller address (default 0xE0) */
  controller: number;
}

/** Known ICOM model CI-V addresses */
export const ICOM_MODELS: Record<number, string> = {
  0x94: "IC-7300",
  0xb6: "IC-7300MK2",
  0xa4: "IC-705",
  0xa2: "IC-9700",
  0x98: "IC-7610",
  0x8e: "IC-7851",
  0x96: "IC-R8600",
  0x70: "IC-7100",
  0x76: "IC-7200",
  0x5c: "IC-746",
  0x7c: "IC-746PRO",
  0x6e: "IC-756PROIII",
};

/** Reverse lookup: model name → CI-V address */
export const ICOM_MODEL_ADDRESSES: Record<string, number> = Object.fromEntries(
  Object.entries(ICOM_MODELS).map(([addr, name]) => [name, Number(addr)]),
);

// ─── Command Constants ────────────────────────────────────────────────────────

/** CI-V command bytes */
export const CivCmd = {
  /** Read operating frequency (response: 5-byte BCD freq) */
  READ_FREQ: 0x03,
  /** Read operating mode (response: mode byte + filter byte) */
  READ_MODE: 0x04,
  /** Set operating frequency (data: 5-byte BCD freq) */
  SET_FREQ: 0x05,
  /** Set operating mode (data: mode byte [+ filter byte]) */
  SET_MODE: 0x06,
  /** Select VFO (sub: 0x00=A, 0x01=B, 0xA0=equal, 0xB0=swap) */
  SET_VFO: 0x07,
  /** Split on/off (sub: 0x00=off, 0x01=on) */
  SPLIT: 0x0f,
  /** Set/read level values (sub: level sub-command) */
  LEVELS: 0x14,
  /** Read meters (sub: meter sub-command) */
  METERS: 0x15,
  /** Set/read functions (sub: function sub-command) */
  FUNCTIONS: 0x16,
  /** Extended commands (various sub-commands) */
  EXTENDED: 0x1a,
  /** PTT control (sub: 0x00 read/set TX state) */
  PTT: 0x1c,
  /** RIT/XIT control */
  RIT_XIT: 0x21,
  /** Scope control commands */
  SCOPE_CTRL: 0x27,
  /** Scope waveform data (incoming from radio) */
  SCOPE_DATA: 0x27,
} as const;

// ─── Mode Mapping ─────────────────────────────────────────────────────────────

/** CI-V mode byte → human-readable string */
export const CIV_MODE_TO_STRING: Record<number, string> = {
  0x00: "LSB",
  0x01: "USB",
  0x02: "AM",
  0x03: "CW",
  0x04: "RTTY",
  0x05: "FM",
  0x06: "WFM",
  0x07: "CW-R",
  0x08: "RTTY-R",
  0x17: "DV",
  0x22: "DD",
};

/** Human-readable string → CI-V mode byte */
export const CIV_STRING_TO_MODE: Record<string, number> = Object.fromEntries(
  Object.entries(CIV_MODE_TO_STRING).map(([byte, name]) => [
    name,
    Number(byte),
  ]),
);

// ─── Level Sub-commands (cmd 0x14) ────────────────────────────────────────────

/** Named level → CI-V 0x14 sub-command */
export const CIV_LEVEL_SUB: Record<string, number> = {
  AF: 0x01,
  RF: 0x02,
  SQL: 0x03,
  IF_SHIFT: 0x07,
  RFPOWER: 0x0a,
  MICGAIN: 0x0b,
  KEYSPD: 0x0c,
  NOTCH_FREQ: 0x0d,
  COMP: 0x12,
  MONITOR: 0x15,
  VOXGAIN: 0x16,
  ANTIVOX: 0x17,
  NR_LEVEL: 0x06,
  NB_LEVEL: 0x05,
};

// ─── Function Sub-commands (cmd 0x16) ─────────────────────────────────────────

/** Named function → CI-V 0x16 sub-command */
export const CIV_FUNC_SUB: Record<string, number> = {
  PREAMP: 0x02,
  AGC: 0x12,
  NB: 0x22,
  NR: 0x40,
  ANF: 0x41,
  TONE: 0x42,
  TSQL: 0x43,
  COMP: 0x44,
  MONITOR: 0x45,
  VOX: 0x46,
  BKIN: 0x47, // QSK / Full break-in
  MANUAL_NOTCH: 0x48,
};

// ─── Meter Sub-commands (cmd 0x15) ────────────────────────────────────────────

/** Named meter → CI-V 0x15 sub-command */
export const CIV_METER_SUB: Record<string, number> = {
  SMETER: 0x02,
  SQUELCH: 0x05,
  RFPOWER: 0x11,
  SWR: 0x12,
  ALC: 0x13,
  COMP: 0x14,
  VD: 0x15,
  ID: 0x16,
};

// ─── VFO Constants ────────────────────────────────────────────────────────────

/** VFO selection sub-commands for cmd 0x07 */
export const CIV_VFO = {
  A: 0x00,
  B: 0x01,
  EQUAL: 0xa0,
  SWAP: 0xb0,
} as const;

// ─── Scope Constants ──────────────────────────────────────────────────────────

/** Scope display modes */
export enum ScopeMode {
  Center = 0x00,
  Fixed = 0x01,
  ScrollCenter = 0x02,
  ScrollFixed = 0x03,
}

/** Scope sub-commands (within cmd 0x27) */
export const CIV_SCOPE_SUB = {
  WAVE_DATA: 0x00,
  ON: 0x10,
  OFF: 0x11,
  READ_MAIN: 0x14,
  READ_SUB: 0x15,
} as const;

// ─── S-Meter Conversion ──────────────────────────────────────────────────────

/** Maximum raw S-meter value from CI-V (0x0241 = 241 decimal) */
export const SMETER_MAX_RAW = 241;

/** dBm floor for pixel-to-dB mapping */
export const DB_FLOOR = -125;

/** dBm range for pixel-to-dB mapping (-125 to -40) */
export const DB_RANGE = 85;

/** Maximum pixel value from CI-V spectrum */
export const MAX_PIXEL_VALUE = 200;

/**
 * Convert raw CI-V S-meter value (0-241) to dBm.
 * 0 = S0 (-54 dBm), 120 = S9 (0 dBm), 241 = S9+60 (+60 dBm).
 *
 * The scale is approximately linear:
 *   0-120 maps to S0-S9 (-54 to 0 dBm)
 *   121-241 maps to S9+1 to S9+60 (1 to 60 dBm)
 */
export function rawSmeterToDbm(raw: number): number {
  // Clamp to valid CI-V range — BCD decode can produce values > 241
  // if the radio sends non-standard nibbles (e.g. MK2 variants)
  const clamped = Math.max(0, Math.min(SMETER_MAX_RAW, raw));
  if (clamped <= 0) return -54;
  if (clamped <= 120) {
    // S0 to S9: linear from -54 to 0
    return -54 + (clamped / 120) * 54;
  }
  // S9+ range: linear from 0 to +60
  return ((clamped - 120) / 121) * 60;
}

/**
 * Convert a CI-V pixel amplitude (0-200) to a dBm value.
 * Maps linearly: 0 → -125 dBm, 200 → -40 dBm.
 */
export function pixelToDb(pixel: number): number {
  return DB_FLOOR + (pixel / MAX_PIXEL_VALUE) * DB_RANGE;
}
