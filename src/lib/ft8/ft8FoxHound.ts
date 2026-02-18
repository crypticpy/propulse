/**
 * FT8 Fox/Hound Mode Support — DXpedition-mode message parsing and Hound sequencer.
 *
 * Fox/Hound is a special FT8 operating mode designed for DXpeditions where a
 * single "Fox" station (the DXpedition) works multiple "Hound" stations
 * (regular operators) simultaneously.
 *
 * Fox behaviour:
 *   - Transmits compound messages with angle-bracket callsigns: <CALL>
 *   - Sends multi-signal messages to up to 5 Hounds per cycle, separated by ";"
 *   - Transmits in the 300-900 Hz audio frequency range
 *
 * Hound behaviour:
 *   - Calls the Fox in the 1000-4000 Hz range
 *   - Fixed exchange sequence:
 *       1. "FOX_CALL MY_CALL MY_GRID"       (initial call)
 *       2. "FOX_CALL MY_CALL R{report}"      (roger their report)
 *       3. QSO complete upon receiving RR73
 *
 * This module provides:
 *   - Utility functions for detecting and parsing Fox messages
 *   - Hound message generation helpers
 *   - Frequency-range validation
 *   - A HoundSequencer class that manages the Hound-side auto-sequence
 */

import { encodeFt8Message } from "./ft8Encoder";
import { extractCallInfo } from "./ft8MessageParser";
import type { FoxCallPair } from "./ft8MessageParser";

// Re-export FoxCallPair so consumers can import everything from this module
export type { FoxCallPair };

// ============================================================================
// Constants
// ============================================================================

/** Fox transmit frequency range (audio Hz). */
const FOX_TX_LOW = 300;
const FOX_TX_HIGH = 900;

/** Hound transmit frequency range (audio Hz). */
const HOUND_TX_LOW = 1000;
const HOUND_TX_HIGH = 4000;

/** Angle-bracket compound callsign pattern. */
const COMPOUND_CALL_REGEX = /<[A-Z0-9/]{3,}>/i;

/** Re-transmit the calling message after this many consecutive silent cycles. */
const RETRY_CYCLE_THRESHOLD = 2;

/** Maximum total retries before halting (Fox pileups are competitive). */
const MAX_RETRIES = 10;

// ============================================================================
// Public Types
// ============================================================================

/** All possible states of the Hound sequencer state machine. */
export type HoundState = "IDLE" | "CALLING" | "ROGER_SENT" | "QSO_COMPLETE";

/** Configuration for the HoundSequencer. */
export interface HoundSequencerConfig {
  foxCallsign: string;
  myCallsign: string;
  myGrid: string;
  txFreqHz: number;
}

/** Result emitted when a Fox/Hound QSO completes. */
export interface HoundQsoResult {
  foxCallsign: string;
  reportReceived: string;
  reportSent: string;
}

// ============================================================================
// Internal Types
// ============================================================================

type TxRequestCallback = (message: string, symbols: number[]) => void;
type QsoCompleteCallback = (result: HoundQsoResult) => void;
type StateChangeCallback = (state: HoundState) => void;

// ============================================================================
// Fox Message Detection
// ============================================================================

/**
 * Check if a decoded message is from a Fox station.
 *
 * Fox messages are identified by the presence of angle-bracket compound
 * callsigns (e.g. `<K1ABC>`) or semicolon-separated multi-signal pairs.
 *
 * @param message  The decoded FT8 message text.
 * @returns        True if the message appears to be from a Fox station.
 */
export function isFoxMessage(message: string): boolean {
  const trimmed = message.trim();
  return COMPOUND_CALL_REGEX.test(trimmed) || isFoxMultiMessage(trimmed);
}

/**
 * Check if a decoded message is a Fox multi-call message.
 *
 * Fox multi-signal messages contain two or more call pairs separated by
 * semicolons (e.g. `<K1ABC> W2XYZ +05; <K1ABC> N3DEF -12`).
 *
 * @param message  The decoded FT8 message text.
 * @returns        True if the message is a multi-call Fox message.
 */
export function isFoxMultiMessage(message: string): boolean {
  const info = extractCallInfo(message);
  return info.isFoxMulti === true;
}

// ============================================================================
// Fox Message Parsing
// ============================================================================

/**
 * Extract all call pairs from a Fox multi-signal message.
 *
 * Each pair contains the Fox callsign (sender), the Hound callsign (receiver),
 * and the signal report or grid. Returns an empty array for non-Fox-multi
 * messages.
 *
 * @param message  The decoded FT8 message text.
 * @returns        Array of Fox call pairs, or empty array if not a multi-call.
 */
export function parseFoxMultiDecode(message: string): FoxCallPair[] {
  const info = extractCallInfo(message);
  if (info.isFoxMulti && info.foxCallPairs) {
    return info.foxCallPairs;
  }
  return [];
}

/**
 * Check if a Fox message is addressing a specific Hound callsign.
 *
 * Handles both single compound messages (`<FOX> HOUND REPORT`) and
 * multi-signal messages where the Hound may appear in any pair.
 *
 * @param message     The decoded FT8 message text.
 * @param myCallsign  The Hound's callsign to look for.
 * @returns           True if the message addresses the given callsign.
 */
export function isFoxCallingMe(message: string, myCallsign: string): boolean {
  const myCall = myCallsign.toUpperCase().trim();
  const info = extractCallInfo(message);

  // Check multi-signal messages
  if (info.isFoxMulti && info.foxCallPairs) {
    return info.foxCallPairs.some(
      (pair) => pair.receiver.toUpperCase() === myCall,
    );
  }

  // Check single compound message: <FOX> HOUND REPORT/GRID
  if (info.isCompound && info.callsign?.toUpperCase() === myCall) {
    return true;
  }

  return false;
}

/**
 * Extract the signal report from a Fox message addressed to a specific Hound.
 *
 * Searches both single compound messages and multi-signal pairs for a match
 * against the given callsign, then returns the associated report string.
 *
 * @param message     The decoded FT8 message text.
 * @param myCallsign  The Hound's callsign to look for.
 * @returns           The report string (e.g. "+05", "RR73"), or null if not found.
 */
export function extractFoxReport(
  message: string,
  myCallsign: string,
): string | null {
  const myCall = myCallsign.toUpperCase().trim();
  const info = extractCallInfo(message);

  // Check multi-signal messages first
  if (info.isFoxMulti && info.foxCallPairs) {
    const match = info.foxCallPairs.find(
      (pair) => pair.receiver.toUpperCase() === myCall,
    );
    if (match) return match.report;
  }

  // Check single compound message
  if (info.isCompound && info.callsign?.toUpperCase() === myCall) {
    // The report could be in signalReport or grid field depending on content
    if (info.signalReport) return info.signalReport;
    if (info.grid) return info.grid;
  }

  return null;
}

// ============================================================================
// Hound Message Generation
// ============================================================================

/**
 * Generate the appropriate Hound response message for a Fox/Hound exchange.
 *
 * Hound exchange sequence:
 *   1. **calling**: `"FOX_CALL MY_CALL MY_GRID"` — initial call to the Fox
 *   2. **roger_report**: `"FOX_CALL MY_CALL R{report}"` — acknowledge their report
 *
 * After receiving RR73, the QSO is complete and no further message is needed.
 *
 * @param params  Parameters for the message including stage and callsigns.
 * @returns       The composed FT8 message text.
 */
export function generateHoundMessage(params: {
  foxCallsign: string;
  myCallsign: string;
  myGrid: string;
  /** Stage of the exchange. */
  stage: "calling" | "roger_report";
  /** Fox's signal report to acknowledge (for roger_report stage). */
  foxReport?: string;
}): string {
  const fox = params.foxCallsign.toUpperCase().trim();
  const my = params.myCallsign.toUpperCase().trim();
  const grid = params.myGrid.toUpperCase().trim().slice(0, 4);

  switch (params.stage) {
    case "calling":
      // Hound initial call: "FOX_CALL MY_CALL MY_GRID"
      return `${fox} ${my} ${grid}`;

    case "roger_report": {
      // Hound roger: "FOX_CALL MY_CALL R{report}"
      const report = params.foxReport ?? "+00";
      // Ensure report has "R" prefix for the roger acknowledgement
      const rReport = report.startsWith("R") ? report : `R${report}`;
      return `${fox} ${my} ${rReport}`;
    }
  }
}

// ============================================================================
// Frequency Validation
// ============================================================================

/**
 * Validate that a TX frequency is within the Hound calling range (1000-4000 Hz).
 *
 * Hound stations must transmit in this range to avoid interfering with
 * the Fox's TX window and to comply with Fox/Hound protocol conventions.
 *
 * @param freqHz  The audio TX frequency in Hz.
 * @returns       True if the frequency is within the valid Hound range.
 */
export function isValidHoundTxFreq(freqHz: number): boolean {
  return freqHz >= HOUND_TX_LOW && freqHz <= HOUND_TX_HIGH;
}

/**
 * Get the recommended Hound TX frequency range.
 *
 * @returns  Object with `low` and `high` boundaries in Hz.
 */
export function getHoundTxRange(): { low: number; high: number } {
  return { low: HOUND_TX_LOW, high: HOUND_TX_HIGH };
}

/**
 * Get the Fox TX frequency range.
 *
 * @returns  Object with `low` and `high` boundaries in Hz.
 */
export function getFoxTxRange(): { low: number; high: number } {
  return { low: FOX_TX_LOW, high: FOX_TX_HIGH };
}

// ============================================================================
// HoundSequencer — Hound-side auto-sequence state machine
// ============================================================================

/**
 * Manages the Hound-side auto-sequence for Fox/Hound QSOs.
 *
 * This is a simpler state machine than the general auto-sequencer since
 * Fox/Hound has a fixed, predictable exchange pattern:
 *
 *   IDLE -> CALLING -> ROGER_SENT -> QSO_COMPLETE -> IDLE
 *
 * The sequencer:
 *   - Emits TX requests with both message text and encoded tone symbols
 *   - Re-transmits after 2 consecutive silent cycles (pileup recovery)
 *   - Halts after 10 total retries (Fox pileups are competitive)
 *   - Fires events for state changes, TX requests, and QSO completion
 *
 * Usage:
 *   ```ts
 *   const seq = new HoundSequencer({
 *     foxCallsign: "3D2CR",
 *     myCallsign: "K1ABC",
 *     myGrid: "FN42",
 *     txFreqHz: 1500,
 *   });
 *   seq.onTxRequest((msg, symbols) => audioPlayer.play(symbols));
 *   seq.onQsoComplete((result) => logger.logQso(result));
 *   seq.onStateChange((state) => ui.updateState(state));
 *   seq.start();
 *   // Feed decodes each cycle:
 *   seq.handleDecode({ message: "<3D2CR> K1ABC -12", snr: -5 });
 *   ```
 */
export class HoundSequencer {
  // ── Configuration ──────────────────────────────────────────────────────
  private config: HoundSequencerConfig;

  // ── State machine ─────────────────────────────────────────────────────
  private _state: HoundState = "IDLE";

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

  constructor(config: HoundSequencerConfig) {
    this.config = { ...config };
    this.config.foxCallsign = this.config.foxCallsign.toUpperCase().trim();
    this.config.myCallsign = this.config.myCallsign.toUpperCase().trim();
    this.config.myGrid = this.config.myGrid.toUpperCase().trim();
  }

  // ====================================================================
  // Public Getters
  // ====================================================================

  /** Current state of the Hound sequencer. */
  get state(): HoundState {
    return this._state;
  }

  // ====================================================================
  // Start / Stop
  // ====================================================================

  /**
   * Start calling the Fox station.
   *
   * Transitions from IDLE to CALLING and emits the initial call message:
   * `"FOX_CALL MY_CALL MY_GRID"`.
   *
   * Validates the TX frequency is within the Hound range before starting.
   * If the frequency is invalid, the sequencer remains in IDLE.
   */
  start(): void {
    if (this._state !== "IDLE") return;

    if (!isValidHoundTxFreq(this.config.txFreqHz)) {
      // Emit a state change with context but stay IDLE — do not transmit
      // on an invalid frequency.
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
   * Call this for every decode in each receive cycle. The sequencer checks
   * whether the Fox is addressing us and advances the state machine.
   *
   * After all decodes in a cycle have been fed, call `notifyRxCycleEnd()`
   * if none were relevant, to drive retry/timeout logic.
   *
   * @param decode  Object with `message` (decoded text) and `snr` (signal dB).
   */
  handleDecode(decode: { message: string; snr: number }): void {
    if (this._state === "IDLE" || this._state === "QSO_COMPLETE") return;

    const foxCall = this.config.foxCallsign;
    const myCall = this.config.myCallsign;

    // Check if this message is from the Fox and addressed to us
    if (!isFoxCallingMe(decode.message, myCall)) {
      // Also check non-compound messages from the Fox (e.g. standard QSO format)
      const info = extractCallInfo(decode.message);
      const senderMatch = info.senderCallsign?.toUpperCase() === foxCall;
      const receiverMatch = info.callsign?.toUpperCase() === myCall;
      if (!(senderMatch && receiverMatch)) return;
    }

    // Reset retry counters — we got a relevant response
    this._cyclesSinceResponse = 0;
    this._totalRetries = 0;

    // Extract the report from the Fox message
    const report = extractFoxReport(decode.message, myCall);

    switch (this._state) {
      case "CALLING": {
        // Fox replied with a signal report — acknowledge with R{report}
        if (report) {
          const rpt = report.toUpperCase();

          if (rpt === "RR73" || rpt === "73") {
            // Fox sent RR73 directly (rare but possible) — QSO complete
            this._reportReceived = rpt;
            this.completeQso();
          } else {
            // Store the report and send roger
            this._reportReceived = rpt;
            this.transitionTo("ROGER_SENT");
            this.emitRogerMessage(rpt);
          }
        }
        break;
      }

      case "ROGER_SENT": {
        // Waiting for RR73 to confirm the QSO
        if (report) {
          const rpt = report.toUpperCase();

          if (rpt === "RR73" || rpt === "73") {
            // QSO is complete
            this.completeQso();
          } else {
            // Fox re-sent a report — maybe they didn't copy our roger.
            // Update the report and re-send our roger.
            this._reportReceived = rpt;
            this.emitRogerMessage(rpt);
          }
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
   * called with a message from the Fox addressed to us.
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
   * Called when the Fox/Hound exchange completes (RR73 received).
   *
   * @returns  Unsubscribe function.
   */
  onQsoComplete(cb: (result: HoundQsoResult) => void): () => void {
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
  onStateChange(cb: (state: HoundState) => void): () => void {
    this._stateChangeListeners.add(cb);
    return () => {
      this._stateChangeListeners.delete(cb);
    };
  }

  // ====================================================================
  // TX Message Emission (Private)
  // ====================================================================

  /**
   * Emit the initial Hound calling message: "FOX_CALL MY_CALL MY_GRID".
   */
  private emitCallingMessage(): void {
    const text = generateHoundMessage({
      foxCallsign: this.config.foxCallsign,
      myCallsign: this.config.myCallsign,
      myGrid: this.config.myGrid,
      stage: "calling",
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
    const text = generateHoundMessage({
      foxCallsign: this.config.foxCallsign,
      myCallsign: this.config.myCallsign,
      myGrid: this.config.myGrid,
      stage: "roger_report",
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

    const result: HoundQsoResult = {
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
  private transitionTo(newState: HoundState): void {
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

  private notifyQsoComplete(result: HoundQsoResult): void {
    for (const cb of this._qsoCompleteListeners) {
      try {
        cb(result);
      } catch {
        // Listener errors must not break the state machine
      }
    }
  }

  private notifyStateChange(state: HoundState): void {
    for (const cb of this._stateChangeListeners) {
      try {
        cb(state);
      } catch {
        // Listener errors must not break the state machine
      }
    }
  }
}
