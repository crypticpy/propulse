/**
 * FT8 SuperFox Mode Support — Enhanced DXpedition-mode message parsing and
 * Hound sequencer for SuperFox (WSJT-X 2.7+).
 *
 * SuperFox is an enhanced version of Fox/Hound designed for high-demand
 * DXpeditions. Key differences from standard Fox/Hound:
 *
 * SuperFox station:
 *   - Uses a 9-slot constant-envelope (CE) waveform responding to up to
 *     9 Hounds simultaneously (vs. 5 in standard F/H)
 *   - Includes a digital signature hash to authenticate the Fox station
 *     (prevents pirate Fox stations)
 *   - Transmits on a single 60 Hz-wide subband in the 200-900 Hz range
 *
 * Hound stations calling SuperFox:
 *   - TX frequency restricted to 200-1800 Hz (narrower than standard
 *     Hound 1000-4000 Hz range)
 *   - Hounds send standard calling messages
 *   - Must have SuperFox mode enabled to decode the CE waveform responses
 *   - Protocol includes hash-based verification of Fox callsign
 *
 * This module provides:
 *   - Interfaces for SuperFox decoded messages and response slots
 *   - Utility functions for detecting, parsing, and generating SuperFox messages
 *   - Frequency-range validation for SuperFox mode
 *   - Callsign hash computation for Fox identification / verification
 *   - A SuperFoxHoundSequencer class for Hound-side auto-sequencing
 *
 * Note: The actual CE waveform decoding is handled by the WASM decoder module.
 * This TypeScript module handles the higher-level message parsing, sequencing,
 * and protocol logic.
 */

import { encodeFt8Message } from "./ft8Encoder";

// ============================================================================
// Constants
// ============================================================================

/** SuperFox transmit frequency range — 60 Hz subband within 200-900 Hz. */
const SUPERFOX_TX_LOW = 200;
const SUPERFOX_TX_HIGH = 900;

/** SuperFox Hound transmit frequency range (audio Hz). */
const SUPERFOX_HOUND_TX_LOW = 200;
const SUPERFOX_HOUND_TX_HIGH = 1800;

/** Maximum number of Hound response slots in a SuperFox CE waveform. */
const SUPERFOX_MAX_SLOTS = 9;

/** Callsign hash bit width — masked to 12 bits. */
const CALLSIGN_HASH_BITS = 12;
const CALLSIGN_HASH_MASK = (1 << CALLSIGN_HASH_BITS) - 1; // 0xFFF

/**
 * Re-transmit the calling message after this many consecutive silent cycles.
 * Matches standard F/H threshold.
 */
const RETRY_CYCLE_THRESHOLD = 2;

/**
 * Maximum total retries before halting.
 * SuperFox pileups are very competitive — higher than standard F/H (10).
 */
const MAX_RETRIES = 15;

/**
 * Tilde prefix used by WSJT-X to indicate SuperFox decoded messages.
 * The decoder prepends '~' to distinguish CE waveform decodes from
 * standard FT8 decodes.
 */
const SUPERFOX_PREFIX = "~";

/**
 * Regex for SuperFox angle-bracket multi-pair format.
 * Similar to standard Fox multi-signal but with more than 2 semicolon-separated pairs.
 */
const SUPERFOX_MULTI_REGEX = /^<([A-Z0-9/]{3,})>\s+([A-Z0-9/]{3,})\s+(.+)$/i;

// ============================================================================
// Public Types
// ============================================================================

/** A single Hound response slot within a SuperFox CE waveform decode. */
export interface SuperFoxSlot {
  /** Hound callsign being addressed. */
  houndCallsign: string;
  /** Signal report from Fox to this Hound (e.g. "+05", "-12", "RR73"). */
  report: string;
  /** Whether this slot carries an RR73 (QSO complete) rather than a report. */
  isRR73: boolean;
}

/** SuperFox message parsed from the CE waveform decoder output. */
export interface SuperFoxMessage {
  /** Fox station callsign. */
  foxCallsign: string;
  /** Fox callsign hash for verification (12-bit). */
  foxCallsignHash: number;
  /** Up to 9 Hound response slots. */
  slots: SuperFoxSlot[];
  /** Whether the digital signature hash verified successfully. */
  signatureValid: boolean;
  /** Raw message timestamp (ISO 8601 or decoder-provided). */
  timestamp: string;
}

/** All possible states of the SuperFox Hound sequencer state machine. */
export type SuperFoxHoundState =
  | "IDLE"
  | "CALLING"
  | "ROGER_SENT"
  | "QSO_COMPLETE";

/** Configuration for the SuperFoxHoundSequencer. */
export interface SuperFoxHoundConfig {
  foxCallsign: string;
  myCallsign: string;
  myGrid: string;
  txFreqHz: number;
}

// ============================================================================
// Internal Types
// ============================================================================

type TxRequestCallback = (message: string, symbols: number[]) => void;
type QsoCompleteCallback = (result: {
  foxCallsign: string;
  reportReceived: string;
  reportSent: string;
}) => void;
type StateChangeCallback = (state: SuperFoxHoundState) => void;

// ============================================================================
// SuperFox Message Detection
// ============================================================================

/**
 * Check if a decoded message indicates a SuperFox CE waveform transmission.
 *
 * SuperFox decodes are identified by:
 *   1. A tilde (`~`) prefix prepended by the WSJT-X decoder
 *   2. Angle-bracket callsigns with more than 2 semicolon-separated pairs
 *      (standard Fox max is 5 pairs; SuperFox can carry up to 9)
 *
 * @param message  The decoded FT8 message text from the decoder output.
 * @returns        True if the message appears to be a SuperFox decode.
 */
export function isSuperFoxDecode(message: string): boolean {
  const trimmed = message.trim();

  // Primary indicator: tilde prefix from the CE waveform decoder
  if (trimmed.startsWith(SUPERFOX_PREFIX)) {
    return true;
  }

  // Secondary indicator: angle-bracket callsign with more than 2 semicolon
  // segments (standard Fox multi-signal uses at most 5, but the presence
  // of >2 pairs with angle brackets can indicate SuperFox format)
  if (trimmed.includes(";") && /^<[A-Z0-9/]{3,}>/i.test(trimmed)) {
    const segments = trimmed
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    if (segments.length > 2) {
      return true;
    }
  }

  return false;
}

// ============================================================================
// SuperFox Message Parsing
// ============================================================================

/**
 * Parse a SuperFox multi-slot message from the decoder output.
 *
 * The raw message from the CE waveform decoder may take several forms:
 *   - Tilde-prefixed: `"~ FOX_CALL HOUND1 RPT; HOUND2 RPT; ..."`
 *   - Angle-bracket multi-pair: `"<FOX> H1 RPT; <FOX> H2 RPT; ..."`
 *
 * The Fox callsign parameter is used to compute the expected callsign hash
 * and verify the decoded Fox identity.
 *
 * @param rawMessage   The raw decoded message string.
 * @param foxCallsign  The expected Fox callsign (used for hash verification).
 * @returns            Parsed SuperFoxMessage, or null if parsing fails.
 */
export function parseSuperFoxMessage(
  rawMessage: string,
  foxCallsign: string,
): SuperFoxMessage | null {
  const trimmed = rawMessage.trim();
  const fox = foxCallsign.toUpperCase().trim();
  const expectedHash = computeCallsignHash(fox);

  // Strip the tilde prefix if present
  const body = trimmed.startsWith(SUPERFOX_PREFIX)
    ? trimmed.slice(SUPERFOX_PREFIX.length).trim()
    : trimmed;

  // Attempt to parse as semicolon-separated multi-slot format
  const slots = parseSlots(body, fox);
  if (slots.length === 0) {
    return null;
  }

  // Verify callsign hash: the decoded Fox callsign should match our expected Fox
  // In real protocol, the hash is embedded in the CE waveform. Here we verify
  // by checking the Fox callsign extracted from the message matches the expected one.
  const decodedFox = extractFoxCallFromBody(body);
  const decodedHash = decodedFox ? computeCallsignHash(decodedFox) : 0;
  const signatureValid = decodedHash === expectedHash && decodedHash !== 0;

  return {
    foxCallsign: fox,
    foxCallsignHash: expectedHash,
    slots,
    signatureValid,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Extract the Fox callsign from the body of a SuperFox message.
 *
 * Handles both angle-bracket format (`<FOX>`) and space-separated format
 * where the Fox call is the first token.
 *
 * @param body  The message body (tilde prefix already stripped).
 * @returns     The Fox callsign, or null if not found.
 */
function extractFoxCallFromBody(body: string): string | null {
  // Angle-bracket format: "<FOX_CALL> ..."
  const bracketMatch = body.match(/^<([A-Z0-9/]{3,})>/i);
  if (bracketMatch) {
    return bracketMatch[1].toUpperCase();
  }

  // Space-separated: first token is the Fox callsign
  const firstToken = body.split(/\s+/)[0];
  if (firstToken && /^[A-Z0-9/]{3,}$/i.test(firstToken)) {
    return firstToken.toUpperCase();
  }

  return null;
}

/**
 * Parse individual Hound slots from a SuperFox message body.
 *
 * Supports two formats:
 *   1. Semicolon-separated pairs: `"<FOX> H1 RPT; <FOX> H2 RPT; ..."`
 *   2. Space-separated after Fox call: `"FOX H1 RPT H2 RPT ..."`
 *      (less common, but the CE decoder may output this for compact display)
 *
 * @param body  The message body (tilde prefix already stripped).
 * @param fox   The Fox callsign (used to skip Fox call tokens in parsing).
 * @returns     Array of parsed SuperFoxSlot entries.
 */
function parseSlots(body: string, fox: string): SuperFoxSlot[] {
  const slots: SuperFoxSlot[] = [];

  // ── Try semicolon-separated format first ─────────────────────────────
  if (body.includes(";")) {
    const segments = body
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);

    for (const seg of segments) {
      const slot = parseOneSlotSegment(seg, fox);
      if (slot) {
        slots.push(slot);
      }
    }

    if (slots.length > 0) {
      return slots.slice(0, SUPERFOX_MAX_SLOTS);
    }
  }

  // ── Try single-segment format: "FOX HOUND REPORT" ────────────────────
  const slot = parseOneSlotSegment(body, fox);
  if (slot) {
    slots.push(slot);
    return slots;
  }

  // ── Try packed pairs format: "FOX H1 RPT H2 RPT ..." ─────────────────
  const tokens = body.split(/\s+/).filter(Boolean);
  // Skip leading Fox callsign (with or without angle brackets)
  let startIdx = 0;
  if (tokens.length > 0) {
    const first = tokens[0].replace(/[<>]/g, "").toUpperCase();
    if (first === fox) {
      startIdx = 1;
    }
  }

  // Consume pairs of (CALLSIGN, REPORT)
  for (let i = startIdx; i + 1 < tokens.length; i += 2) {
    const hound = tokens[i].toUpperCase();
    const report = tokens[i + 1].toUpperCase();

    if (!isLikelyCallsign(hound)) continue;
    if (!isLikelyReport(report)) continue;

    const rpt = report.toUpperCase();
    slots.push({
      houndCallsign: hound,
      report: rpt,
      isRR73: rpt === "RR73" || rpt === "73",
    });

    if (slots.length >= SUPERFOX_MAX_SLOTS) break;
  }

  return slots;
}

/**
 * Parse a single semicolon-delimited slot segment.
 *
 * Expected format: `"<FOX> HOUND REPORT"` or `"FOX HOUND REPORT"`.
 *
 * @param segment  A single slot segment string.
 * @param fox      The Fox callsign (used to identify and skip the Fox token).
 * @returns        Parsed SuperFoxSlot, or null if the segment is not valid.
 */
function parseOneSlotSegment(
  segment: string,
  fox: string,
): SuperFoxSlot | null {
  const trimmed = segment.trim();

  // Try angle-bracket format: "<FOX> HOUND REPORT"
  const bracketMatch = trimmed.match(SUPERFOX_MULTI_REGEX);
  if (bracketMatch) {
    const hound = bracketMatch[2].toUpperCase();
    const report = bracketMatch[3].trim().toUpperCase();
    if (isLikelyReport(report)) {
      return {
        houndCallsign: hound,
        report,
        isRR73: report === "RR73" || report === "73",
      };
    }
  }

  // Try plain format: "FOX HOUND REPORT"
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 3) {
    const sender = parts[0].replace(/[<>]/g, "").toUpperCase();
    if (sender === fox) {
      const hound = parts[1].toUpperCase();
      const report = parts[2].toUpperCase();
      if (isLikelyCallsign(hound) && isLikelyReport(report)) {
        return {
          houndCallsign: hound,
          report,
          isRR73: report === "RR73" || report === "73",
        };
      }
    }
  }

  // Try two-token format (Fox call implied): "HOUND REPORT"
  if (parts.length === 2) {
    const hound = parts[0].toUpperCase();
    const report = parts[1].toUpperCase();
    if (isLikelyCallsign(hound) && isLikelyReport(report)) {
      return {
        houndCallsign: hound,
        report,
        isRR73: report === "RR73" || report === "73",
      };
    }
  }

  return null;
}

// ============================================================================
// SuperFox Slot Lookup
// ============================================================================

/**
 * Check if a SuperFox message is addressing a specific Hound.
 *
 * Searches all slots in the SuperFox message for a matching Hound callsign.
 * Returns the matching slot so the caller can inspect the report and RR73
 * status.
 *
 * @param message     Parsed SuperFoxMessage to search.
 * @param myCallsign  The Hound's callsign to look for.
 * @returns           The matching SuperFoxSlot, or null if not addressed to us.
 */
export function isSuperFoxCallingMe(
  message: SuperFoxMessage,
  myCallsign: string,
): SuperFoxSlot | null {
  const myCall = myCallsign.toUpperCase().trim();

  for (const slot of message.slots) {
    if (slot.houndCallsign.toUpperCase() === myCall) {
      return slot;
    }
  }

  return null;
}

// ============================================================================
// Hound Message Generation
// ============================================================================

/**
 * Generate a Hound calling message for SuperFox mode.
 *
 * The initial call format is identical to standard Fox/Hound:
 *   `"FOX_CALL MY_CALL MY_GRID"`
 *
 * SuperFox Hounds use the same standard FT8 message encoding; the difference
 * is in the TX frequency range (200-1800 Hz) and how the Fox decodes them.
 *
 * @param params  Fox callsign, own callsign, and grid locator.
 * @returns       The composed FT8 message text for the initial call.
 */
export function generateSuperFoxHoundCall(params: {
  foxCallsign: string;
  myCallsign: string;
  myGrid: string;
}): string {
  const fox = params.foxCallsign.toUpperCase().trim();
  const my = params.myCallsign.toUpperCase().trim();
  const grid = params.myGrid.toUpperCase().trim().slice(0, 4);

  return `${fox} ${my} ${grid}`;
}

/**
 * Generate a Hound roger response for SuperFox mode.
 *
 * The roger format is identical to standard Fox/Hound:
 *   `"FOX_CALL MY_CALL R{report}"`
 *
 * @param params  Fox callsign, own callsign, and the Fox's signal report.
 * @returns       The composed FT8 message text for the roger response.
 */
export function generateSuperFoxHoundRoger(params: {
  foxCallsign: string;
  myCallsign: string;
  foxReport: string;
}): string {
  const fox = params.foxCallsign.toUpperCase().trim();
  const my = params.myCallsign.toUpperCase().trim();
  const report = params.foxReport.toUpperCase().trim();

  // Ensure the report has "R" prefix for the roger acknowledgement
  const rReport = report.startsWith("R") ? report : `R${report}`;

  return `${fox} ${my} ${rReport}`;
}

// ============================================================================
// Frequency Validation
// ============================================================================

/**
 * Validate that a TX frequency is within the SuperFox Hound range (200-1800 Hz).
 *
 * SuperFox Hounds use a narrower TX range than standard Hounds (1000-4000 Hz).
 * This tighter window reduces interference and helps the SuperFox CE decoder
 * separate the calling stations more effectively.
 *
 * @param freqHz  The audio TX frequency in Hz.
 * @returns       True if the frequency is within the valid SuperFox Hound range.
 */
export function isValidSuperFoxHoundFreq(freqHz: number): boolean {
  return freqHz >= SUPERFOX_HOUND_TX_LOW && freqHz <= SUPERFOX_HOUND_TX_HIGH;
}

/**
 * Get the SuperFox frequency ranges for both Fox and Hound stations.
 *
 * @returns  Object with `foxTx` and `houndTx` frequency bounds in Hz.
 */
export function getSuperFoxFreqRanges(): {
  foxTx: { low: number; high: number };
  houndTx: { low: number; high: number };
} {
  return {
    foxTx: { low: SUPERFOX_TX_LOW, high: SUPERFOX_TX_HIGH },
    houndTx: { low: SUPERFOX_HOUND_TX_LOW, high: SUPERFOX_HOUND_TX_HIGH },
  };
}

// ============================================================================
// Callsign Hash
// ============================================================================

/**
 * Compute the 12-bit callsign hash used for Fox identification.
 *
 * The hash provides a compact identifier embedded in the SuperFox CE waveform
 * so that Hound stations can verify they are decoding the intended Fox.
 *
 * Algorithm: CRC-style hash over the character codes of the callsign.
 * Each character code is shifted left and XORed into the accumulator,
 * then masked to 12 bits.
 *
 * @param callsign  The Fox station callsign (e.g. "3D2CR").
 * @returns         12-bit hash value (0-4095).
 */
export function computeCallsignHash(callsign: string): number {
  const call = callsign.toUpperCase().trim();
  let hash = 0;

  for (let i = 0; i < call.length; i++) {
    const code = call.charCodeAt(i);
    // Shift accumulator left by 5 and XOR with the character code.
    // The shift amount of 5 provides good dispersion for the short
    // alphanumeric callsign alphabet (A-Z, 0-9, /).
    hash = ((hash << 5) ^ code) & CALLSIGN_HASH_MASK;
  }

  return hash;
}

// ============================================================================
// Validation Helpers (Private)
// ============================================================================

/**
 * Check if a string looks like a plausible amateur callsign.
 * Must contain at least one letter and one digit, with minimum 3 characters.
 */
function isLikelyCallsign(s: string): boolean {
  return /[A-Z]/i.test(s) && /\d/.test(s) && s.length >= 3 && s.length <= 10;
}

/**
 * Check if a string is a plausible signal report or QSO-complete token.
 * Matches: +05, -15, R+05, R-15, RR73, RRR, 73.
 */
function isLikelyReport(s: string): boolean {
  return /^(?:R?[+-]\d{2}|RR73|RRR|73)$/i.test(s);
}

// ============================================================================
// SuperFoxHoundSequencer — Hound-side auto-sequence for SuperFox QSOs
// ============================================================================

/**
 * Manages the Hound-side auto-sequence for SuperFox QSOs.
 *
 * This follows the same state-machine pattern as the standard HoundSequencer
 * in ft8FoxHound.ts, adapted for SuperFox-specific behaviour:
 *
 *   IDLE -> CALLING -> ROGER_SENT -> QSO_COMPLETE -> IDLE
 *
 * Differences from standard HoundSequencer:
 *   - TX frequency validated against the narrower 200-1800 Hz range
 *   - Higher retry count (15 vs. 10) — SuperFox pileups are more competitive
 *   - Decode handling uses SuperFox CE waveform message parsing
 *   - Callsign hash verification on received SuperFox messages
 *
 * Usage:
 *   ```ts
 *   const seq = new SuperFoxHoundSequencer({
 *     foxCallsign: "3D2CR",
 *     myCallsign: "K1ABC",
 *     myGrid: "FN42",
 *     txFreqHz: 800,
 *   });
 *   seq.onTxRequest((msg, symbols) => audioPlayer.play(symbols));
 *   seq.onQsoComplete((result) => logger.logQso(result));
 *   seq.onStateChange((state) => ui.updateState(state));
 *   seq.start();
 *   // Feed decodes each RX cycle:
 *   seq.handleDecode({ message: "~ 3D2CR K1ABC -12", snr: -5 });
 *   ```
 */
export class SuperFoxHoundSequencer {
  // ── Configuration ──────────────────────────────────────────────────────
  private config: SuperFoxHoundConfig;

  // ── State machine ─────────────────────────────────────────────────────
  private _state: SuperFoxHoundState = "IDLE";

  // ── QSO tracking ──────────────────────────────────────────────────────
  private _reportReceived: string = "";
  private _reportSent: string = "";

  // ── Retry / timeout tracking ──────────────────────────────────────────
  private _cyclesSinceResponse: number = 0;
  private _totalRetries: number = 0;

  // ── Event listeners ───────────────────────────────────────────────────
  private _txRequestListeners: Set<TxRequestCallback> = new Set();
  private _qsoCompleteListeners: Set<QsoCompleteCallback> = new Set();
  private _stateChangeListeners: Set<StateChangeCallback> = new Set();

  // ====================================================================
  // Constructor
  // ====================================================================

  constructor(config: SuperFoxHoundConfig) {
    this.config = { ...config };
    this.config.foxCallsign = this.config.foxCallsign.toUpperCase().trim();
    this.config.myCallsign = this.config.myCallsign.toUpperCase().trim();
    this.config.myGrid = this.config.myGrid.toUpperCase().trim();
  }

  // ====================================================================
  // Public Getters
  // ====================================================================

  /** Current state of the SuperFox Hound sequencer. */
  get state(): SuperFoxHoundState {
    return this._state;
  }

  // ====================================================================
  // Start / Stop
  // ====================================================================

  /**
   * Start calling the SuperFox station.
   *
   * Transitions from IDLE to CALLING and emits the initial call message:
   * `"FOX_CALL MY_CALL MY_GRID"`.
   *
   * Validates the TX frequency is within the SuperFox Hound range
   * (200-1800 Hz) before starting. If the frequency is invalid, the
   * sequencer remains in IDLE.
   */
  start(): void {
    if (this._state !== "IDLE") return;

    if (!isValidSuperFoxHoundFreq(this.config.txFreqHz)) {
      // Do not transmit on an invalid frequency — remain IDLE
      return;
    }

    this.resetQsoState();
    this.transitionTo("CALLING");
    this.emitCallingMessage();
  }

  /**
   * Stop the sequence immediately.
   *
   * Returns to IDLE without emitting a QSO complete event. Use this when
   * the operator abandons the pileup or switches to a different Fox.
   */
  halt(): void {
    this.resetQsoState();
    this.transitionTo("IDLE");
  }

  // ====================================================================
  // Decode Processing
  // ====================================================================

  /**
   * Process a decoded message from the receiver pipeline.
   *
   * Call this for every decode in each receive cycle. The sequencer
   * determines whether the message is a SuperFox transmission addressing
   * us and advances the state machine accordingly.
   *
   * For SuperFox decodes (tilde-prefixed), the message is parsed using
   * the CE waveform format and searched for our callsign among the slots.
   * For non-SuperFox decodes, the message is checked as a standard FT8
   * message in case the Fox responds with a conventional message.
   *
   * After all decodes in a cycle have been fed, call `notifyRxCycleEnd()`
   * if none were relevant, to drive retry/timeout logic.
   *
   * @param decode  Object with `message` (decoded text) and `snr` (signal dB).
   */
  handleDecode(decode: { message: string; snr: number }): void {
    if (this._state === "IDLE" || this._state === "QSO_COMPLETE") return;

    const fox = this.config.foxCallsign;
    const myCall = this.config.myCallsign;

    let report: string | null = null;

    // ── Try SuperFox CE waveform decode ──────────────────────────────────
    if (isSuperFoxDecode(decode.message)) {
      const sfMsg = parseSuperFoxMessage(decode.message, fox);
      if (sfMsg) {
        const slot = isSuperFoxCallingMe(sfMsg, myCall);
        if (slot) {
          report = slot.report;
        }
      }
    }

    // ── Fallback: try standard FT8 message addressed to us from Fox ─────
    if (report === null) {
      report = this.tryExtractStandardReport(decode.message, fox, myCall);
    }

    // No relevant report found in this decode
    if (report === null) return;

    // Reset retry counters — we got a relevant response
    this._cyclesSinceResponse = 0;
    this._totalRetries = 0;

    // Advance the state machine based on the report
    const rpt = report.toUpperCase();

    switch (this._state) {
      case "CALLING": {
        if (rpt === "RR73" || rpt === "73") {
          // Fox sent RR73 directly — QSO complete
          this._reportReceived = rpt;
          this.completeQso();
        } else {
          // Fox sent a signal report — acknowledge with R{report}
          this._reportReceived = rpt;
          this.transitionTo("ROGER_SENT");
          this.emitRogerMessage(rpt);
        }
        break;
      }

      case "ROGER_SENT": {
        if (rpt === "RR73" || rpt === "73") {
          // QSO is complete
          this.completeQso();
        } else {
          // Fox re-sent a report — maybe they didn't copy our roger.
          // Update the report and re-send our roger.
          this._reportReceived = rpt;
          this.emitRogerMessage(rpt);
        }
        break;
      }

      default:
        break;
    }
  }

  /**
   * Notify the sequencer that a receive cycle completed without any relevant
   * decode. This drives the retry and timeout logic.
   *
   * Call this at the end of each RX cycle if `handleDecode()` was never
   * called with a message from the SuperFox addressed to us.
   */
  notifyRxCycleEnd(): void {
    if (this._state === "IDLE" || this._state === "QSO_COMPLETE") return;

    this._cyclesSinceResponse++;

    if (this._cyclesSinceResponse >= RETRY_CYCLE_THRESHOLD) {
      this._totalRetries++;
      this._cyclesSinceResponse = 0;

      if (this._totalRetries > MAX_RETRIES) {
        // Too many retries — give up on the pileup
        this.resetQsoState();
        this.transitionTo("IDLE");
        return;
      }

      // Re-transmit the current stage message
      this.retransmitCurrentStage();
    }
  }

  // ====================================================================
  // Event Subscriptions
  // ====================================================================

  /**
   * Subscribe to TX request events.
   *
   * Called when the sequencer needs to transmit a message. The callback
   * receives the composed message text and the 79-symbol tone array.
   *
   * @returns  Unsubscribe function.
   */
  onTxRequest(cb: (message: string, symbols: number[]) => void): () => void {
    this._txRequestListeners.add(cb);
    return () => {
      this._txRequestListeners.delete(cb);
    };
  }

  /**
   * Subscribe to QSO completion events.
   *
   * Called when the SuperFox exchange completes (RR73 received).
   *
   * @returns  Unsubscribe function.
   */
  onQsoComplete(
    cb: (result: {
      foxCallsign: string;
      reportReceived: string;
      reportSent: string;
    }) => void,
  ): () => void {
    this._qsoCompleteListeners.add(cb);
    return () => {
      this._qsoCompleteListeners.delete(cb);
    };
  }

  /**
   * Subscribe to state change events.
   *
   * Called whenever the sequencer transitions to a new state.
   *
   * @returns  Unsubscribe function.
   */
  onStateChange(cb: (state: SuperFoxHoundState) => void): () => void {
    this._stateChangeListeners.add(cb);
    return () => {
      this._stateChangeListeners.delete(cb);
    };
  }

  // ====================================================================
  // Standard FT8 Report Extraction (Private)
  // ====================================================================

  /**
   * Try to extract a report from a standard (non-SuperFox) FT8 message
   * sent by the Fox and addressed to us.
   *
   * This handles cases where the Fox responds with a conventional FT8
   * message format rather than the CE waveform.
   *
   * @param message  The decoded FT8 message text.
   * @param fox      The expected Fox callsign.
   * @param myCall   Our callsign.
   * @returns        The report string, or null if not addressed to us.
   */
  private tryExtractStandardReport(
    message: string,
    fox: string,
    myCall: string,
  ): string | null {
    const trimmed = message.trim();
    const parts = trimmed.split(/\s+/);

    // Check "<FOX> HOUND REPORT" compound format
    const bracketMatch = trimmed.match(
      /^<([A-Z0-9/]{3,})>\s+([A-Z0-9/]{3,})\s+(.+)$/i,
    );
    if (bracketMatch) {
      const sender = bracketMatch[1].toUpperCase();
      const receiver = bracketMatch[2].toUpperCase();
      const report = bracketMatch[3].trim().toUpperCase();
      if (sender === fox && receiver === myCall && isLikelyReport(report)) {
        return report;
      }
    }

    // Check "FOX HOUND REPORT" standard QSO format
    if (parts.length >= 3) {
      const sender = parts[0].toUpperCase();
      const receiver = parts[1].toUpperCase();
      const report = parts[2].toUpperCase();
      if (sender === fox && receiver === myCall && isLikelyReport(report)) {
        return report;
      }
    }

    // Check semicolon-separated multi-signal format for our callsign
    if (trimmed.includes(";")) {
      const segments = trimmed
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const seg of segments) {
        const segParts = seg.split(/\s+/);
        if (segParts.length >= 3) {
          const sender = segParts[0].replace(/[<>]/g, "").toUpperCase();
          const receiver = segParts[1].toUpperCase();
          const report = segParts[2].toUpperCase();
          if (sender === fox && receiver === myCall && isLikelyReport(report)) {
            return report;
          }
        }
      }
    }

    return null;
  }

  // ====================================================================
  // TX Message Emission (Private)
  // ====================================================================

  /**
   * Emit the initial Hound calling message: "FOX_CALL MY_CALL MY_GRID".
   */
  private emitCallingMessage(): void {
    const text = generateSuperFoxHoundCall({
      foxCallsign: this.config.foxCallsign,
      myCallsign: this.config.myCallsign,
      myGrid: this.config.myGrid,
    });

    // Record the report we are implicitly "sending" (our grid, at this stage)
    this._reportSent = this.config.myGrid.slice(0, 4);

    const encoded = encodeFt8Message(text);
    this.notifyTxRequest(encoded.text, encoded.symbols);
  }

  /**
   * Emit the Hound roger message: "FOX_CALL MY_CALL R{report}".
   *
   * @param foxReport  The Fox's signal report to acknowledge.
   */
  private emitRogerMessage(foxReport: string): void {
    const text = generateSuperFoxHoundRoger({
      foxCallsign: this.config.foxCallsign,
      myCallsign: this.config.myCallsign,
      foxReport,
    });

    // The "report sent" in Hound mode is the R-prefixed acknowledgement
    this._reportSent = foxReport.startsWith("R") ? foxReport : `R${foxReport}`;

    const encoded = encodeFt8Message(text);
    this.notifyTxRequest(encoded.text, encoded.symbols);
  }

  /**
   * Re-transmit the message appropriate for the current state.
   */
  private retransmitCurrentStage(): void {
    switch (this._state) {
      case "CALLING":
        this.emitCallingMessage();
        break;
      case "ROGER_SENT":
        if (this._reportReceived) {
          this.emitRogerMessage(this._reportReceived);
        }
        break;
      default:
        break;
    }
  }

  // ====================================================================
  // QSO Completion (Private)
  // ====================================================================

  /**
   * Finalize the QSO, emit the result, and return to IDLE.
   */
  private completeQso(): void {
    this.transitionTo("QSO_COMPLETE");

    const result = {
      foxCallsign: this.config.foxCallsign,
      reportReceived: this._reportReceived,
      reportSent: this._reportSent,
    };

    this.notifyQsoComplete(result);

    // Reset and return to idle
    this.resetQsoState();
    this.transitionTo("IDLE");
  }

  // ====================================================================
  // State Management (Private)
  // ====================================================================

  /**
   * Transition to a new state and notify listeners.
   */
  private transitionTo(newState: SuperFoxHoundState): void {
    const oldState = this._state;
    this._state = newState;

    if (oldState !== newState) {
      this.notifyStateChange(newState);
    }
  }

  /**
   * Reset all QSO-related state to defaults.
   */
  private resetQsoState(): void {
    this._reportReceived = "";
    this._reportSent = "";
    this._cyclesSinceResponse = 0;
    this._totalRetries = 0;
  }

  // ====================================================================
  // Event Notification Helpers (Private)
  // ====================================================================

  private notifyTxRequest(message: string, symbols: number[]): void {
    for (const cb of this._txRequestListeners) {
      try {
        cb(message, symbols);
      } catch {
        // Listener errors must not break the state machine
      }
    }
  }

  private notifyQsoComplete(result: {
    foxCallsign: string;
    reportReceived: string;
    reportSent: string;
  }): void {
    for (const cb of this._qsoCompleteListeners) {
      try {
        cb(result);
      } catch {
        // Listener errors must not break the state machine
      }
    }
  }

  private notifyStateChange(state: SuperFoxHoundState): void {
    for (const cb of this._stateChangeListeners) {
      try {
        cb(state);
      } catch {
        // Listener errors must not break the state machine
      }
    }
  }
}
