/**
 * FT8 Auto-Sequence Engine — QSO state machine for automated FT8/FT4 exchanges.
 *
 * Manages the automated exchange of messages between two stations during an
 * FT8 or FT4 QSO. The engine operates as a self-contained state machine that:
 *
 *   1. Accepts decoded messages from the receiver pipeline via handleDecode()
 *   2. Determines whether each decode is relevant to the current QSO
 *   3. Advances the state machine and emits TX requests for the next message
 *   4. Tracks signal reports exchanged in both directions
 *   5. Emits a complete QSO record when the exchange finishes
 *
 * Two operating modes:
 *   - CQ mode:   Operator calls CQ and responds to the first answering station
 *   - Call mode:  Operator calls a specific station and completes the exchange
 *
 * Event delivery is callback-based with no external dependencies.
 */

import { composeFt8Message, encodeFt8Message } from "./ft8Encoder";
import { extractCallInfo } from "./ft8MessageParser";
import type { FT8TxMessage } from "./ft8TxTypes";

// ============================================================================
// Public Types
// ============================================================================

/** Configuration for the auto-sequencer. */
export interface Ft8AutoSequencerConfig {
  myCallsign: string;
  myGrid: string;
  mode: "FT8" | "FT4";
  txFreqHz: number;
}

/** All possible states of the auto-sequencer state machine. */
export type AutoSeqState =
  | "IDLE"
  // CQ mode states
  | "CQ_SENT"
  | "CALL_RECEIVED"
  | "REPORT_SENT"
  | "WAITING_RR73"
  // Call mode states
  | "CALLING"
  | "REPORT_RECEIVED"
  | "RR73_SENT"
  // Terminal state (both modes)
  | "QSO_COMPLETE";

/** The operating mode of the sequencer. */
export type AutoSeqMode = "cq" | "call";

/** A transmit request emitted when the sequencer needs to send a message. */
export interface AutoSeqTxRequest {
  /** The composed FT8 message text. */
  message: string;
  /** The 79 tone symbols (FT8) ready for audio generation. */
  symbols: number[];
  /** The QSO stage type of the message. */
  type: FT8TxMessage["type"];
}

/** Complete QSO record emitted when a QSO finishes successfully. */
export interface AutoSeqQsoResult {
  callsign: string;
  grid?: string;
  reportSent: string;
  reportReceived: string;
  startTime: string;
  endTime: string;
  mode: "FT8" | "FT4";
  frequency: number;
}

/** A decoded message fed into the sequencer from the decoder pipeline. */
export interface AutoSeqDecode {
  message: string;
  snr: number;
  deltaFrequency: number;
  time: string;
}

// ============================================================================
// Internal Types
// ============================================================================

type TxRequestCallback = (req: AutoSeqTxRequest) => void;
type QsoCompleteCallback = (result: AutoSeqQsoResult) => void;
type StateChangeCallback = (state: AutoSeqState, detail?: string) => void;

/**
 * Cycle timing reference (not used directly — timing is driven externally):
 *   FT8: 15 s per cycle, timeout after 3 cycles = 45 s
 *   FT4: 7.5 s per cycle, timeout after 3 cycles = ~22 s
 */

/** Maximum consecutive no-response cycles before re-transmitting. */
const RETRY_CYCLE_THRESHOLD = 3;

/** Maximum total retries before halting. */
const MAX_RETRIES = 5;

/** Delay (ms) before re-issuing CQ after a completed QSO in CQ mode. */
const RE_CQ_DELAY_MS = 2_000;

// ============================================================================
// Ft8AutoSequencer
// ============================================================================

/**
 * FT8/FT4 QSO auto-sequencer state machine.
 *
 * Usage:
 *   const seq = new Ft8AutoSequencer({ myCallsign: "K1ABC", myGrid: "FN42", mode: "FT8", txFreqHz: 1500 });
 *   seq.onTxRequest((req) => audioPlayer.play({ symbols: req.symbols, ... }));
 *   seq.onQsoComplete((result) => logger.log(result));
 *   seq.onStateChange((state, detail) => ui.update(state, detail));
 *
 *   // Operator initiates CQ
 *   seq.startCQ();
 *
 *   // Feed every decode from the receiver
 *   seq.handleDecode({ message: "K1ABC W2XYZ FN31", snr: -5, deltaFrequency: 0, time: "..." });
 */
export class Ft8AutoSequencer {
  // ── Configuration ────────────────────────────────────────────────────────
  private config: Ft8AutoSequencerConfig;

  // ── State machine ────────────────────────────────────────────────────────
  private _state: AutoSeqState = "IDLE";
  private _seqMode: AutoSeqMode | null = null;
  private _targetCallsign: string | null = null;
  private _cqDirection: string | undefined = undefined;

  // ── QSO tracking ─────────────────────────────────────────────────────────
  private _targetGrid: string | undefined = undefined;
  private _reportSent: string = "";
  private _reportReceived: string = "";
  private _qsoStartTime: string = "";

  // ── Retry / timeout tracking ─────────────────────────────────────────────
  private _cyclesSinceResponse: number = 0;
  private _totalRetries: number = 0;

  // ── Re-CQ timer ──────────────────────────────────────────────────────────
  private _reCqTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Event listeners ──────────────────────────────────────────────────────
  private _txRequestListeners: Set<TxRequestCallback> = new Set();
  private _qsoCompleteListeners: Set<QsoCompleteCallback> = new Set();
  private _stateChangeListeners: Set<StateChangeCallback> = new Set();

  // ========================================================================
  // Constructor
  // ========================================================================

  constructor(config: Ft8AutoSequencerConfig) {
    this.config = { ...config };
    this.config.myCallsign = this.config.myCallsign.toUpperCase().trim();
    this.config.myGrid = this.config.myGrid.toUpperCase().trim();
  }

  // ========================================================================
  // Public Getters
  // ========================================================================

  /** Current state of the auto-sequencer. */
  get state(): AutoSeqState {
    return this._state;
  }

  /** Current operating mode, or null if idle. */
  get seqMode(): AutoSeqMode | null {
    return this._seqMode;
  }

  /** The callsign of the station we are in QSO with, or null. */
  get targetCallsign(): string | null {
    return this._targetCallsign;
  }

  // ========================================================================
  // Start / Stop
  // ========================================================================

  /**
   * Begin calling CQ.
   *
   * Transitions from IDLE to CQ_SENT and emits the initial CQ TX request.
   * Subsequent decodes are monitored for responses to our CQ.
   *
   * @param cqDirection  Optional directed CQ qualifier (e.g. "DX", "NA").
   */
  startCQ(cqDirection?: string): void {
    this.resetQsoState();
    this._seqMode = "cq";
    this._cqDirection = cqDirection;
    this._qsoStartTime = new Date().toISOString();
    this.transitionTo("CQ_SENT", cqDirection ? `CQ ${cqDirection}` : "CQ");
    this.emitCQ();
  }

  /**
   * Begin calling a specific station.
   *
   * Transitions from IDLE to CALLING and emits the initial call TX request
   * containing our callsign, their callsign, and our grid.
   *
   * @param targetCallsign  The callsign of the station to call.
   */
  callStation(targetCallsign: string): void {
    this.resetQsoState();
    this._seqMode = "call";
    this._targetCallsign = targetCallsign.toUpperCase().trim();
    this._qsoStartTime = new Date().toISOString();
    this.transitionTo("CALLING", this._targetCallsign);
    this.emitCallMessage();
  }

  /**
   * Halt the sequencer immediately.
   *
   * Cancels any pending re-CQ timer and returns to IDLE without emitting
   * a QSO complete event.
   */
  halt(): void {
    this.clearReCqTimer();
    this.resetQsoState();
    this.transitionTo("IDLE", "halted by operator");
  }

  // ========================================================================
  // Decode Processing
  // ========================================================================

  /**
   * Process a decoded message from the receiver pipeline.
   *
   * This method should be called for every decode in each receive cycle.
   * The sequencer determines if the message is relevant to the current QSO
   * and advances the state machine accordingly.
   *
   * @param decode  The decoded message with SNR and timing metadata.
   */
  handleDecode(decode: AutoSeqDecode): void {
    if (this._state === "IDLE") return;

    const info = extractCallInfo(decode.message);

    // Determine if this message is relevant to us
    if (!this.isRelevantMessage(info, decode.message)) return;

    // Reset the no-response cycle counter since we got a relevant decode
    this._cyclesSinceResponse = 0;
    this._totalRetries = 0;

    // Dispatch based on current state and mode
    if (this._seqMode === "cq") {
      this.handleCqModeDecode(decode, info);
    } else if (this._seqMode === "call") {
      this.handleCallModeDecode(decode, info);
    }
  }

  // ========================================================================
  // Configuration Update
  // ========================================================================

  /**
   * Update the sequencer configuration without restarting.
   *
   * Useful for changing TX frequency, grid, or mode mid-session.
   * Callsign changes take effect on the next transmitted message.
   *
   * @param partial  Partial configuration to merge.
   */
  updateConfig(partial: Partial<Ft8AutoSequencerConfig>): void {
    if (partial.myCallsign !== undefined) {
      this.config.myCallsign = partial.myCallsign.toUpperCase().trim();
    }
    if (partial.myGrid !== undefined) {
      this.config.myGrid = partial.myGrid.toUpperCase().trim();
    }
    if (partial.mode !== undefined) {
      this.config.mode = partial.mode;
    }
    if (partial.txFreqHz !== undefined) {
      this.config.txFreqHz = partial.txFreqHz;
    }
  }

  // ========================================================================
  // Event Subscriptions
  // ========================================================================

  /**
   * Subscribe to TX request events.
   *
   * Called when the sequencer needs to transmit a message. The consumer is
   * responsible for scheduling and playing the audio.
   *
   * @returns  Unsubscribe function.
   */
  onTxRequest(cb: TxRequestCallback): () => void {
    this._txRequestListeners.add(cb);
    return () => {
      this._txRequestListeners.delete(cb);
    };
  }

  /**
   * Subscribe to QSO completion events.
   *
   * Called when a QSO exchange is fully completed and ready to be logged.
   *
   * @returns  Unsubscribe function.
   */
  onQsoComplete(cb: QsoCompleteCallback): () => void {
    this._qsoCompleteListeners.add(cb);
    return () => {
      this._qsoCompleteListeners.delete(cb);
    };
  }

  /**
   * Subscribe to state change events.
   *
   * Called whenever the sequencer transitions to a new state. The optional
   * detail string provides human-readable context.
   *
   * @returns  Unsubscribe function.
   */
  onStateChange(cb: StateChangeCallback): () => void {
    this._stateChangeListeners.add(cb);
    return () => {
      this._stateChangeListeners.delete(cb);
    };
  }

  // ========================================================================
  // Timeout / Retry (called externally per cycle, or internally via timer)
  // ========================================================================

  /**
   * Notify the sequencer that a receive cycle has completed without any
   * relevant decode. Call this at the end of each RX cycle if handleDecode
   * was never called with a relevant message.
   *
   * This drives the retry and timeout logic:
   *   - After RETRY_CYCLE_THRESHOLD consecutive silent cycles, re-transmit
   *   - After MAX_RETRIES total re-transmissions, halt
   */
  notifyRxCycleEnd(): void {
    if (this._state === "IDLE" || this._state === "QSO_COMPLETE") return;

    this._cyclesSinceResponse++;

    if (this._cyclesSinceResponse >= RETRY_CYCLE_THRESHOLD) {
      this._totalRetries++;
      this._cyclesSinceResponse = 0;

      if (this._totalRetries > MAX_RETRIES) {
        // Too many retries — give up
        this.transitionTo("IDLE", "no response after maximum retries");
        this.resetQsoState();
        return;
      }

      // Re-transmit the current message
      this.retransmitCurrentStage();
    }
  }

  // ========================================================================
  // CQ Mode State Transitions
  // ========================================================================

  /**
   * Handle a relevant decode while in CQ mode.
   *
   * CQ flow: CQ_SENT -> CALL_RECEIVED -> REPORT_SENT -> WAITING_RR73 -> QSO_COMPLETE
   */
  private handleCqModeDecode(
    decode: AutoSeqDecode,
    info: ReturnType<typeof extractCallInfo>,
  ): void {
    switch (this._state) {
      case "CQ_SENT": {
        // Someone responded to our CQ with "{theirCall} {myCall} {theirGrid}"
        // The sender is addressing us (callsign === myCallsign means we are the target)
        if (
          info.senderCallsign &&
          info.callsign?.toUpperCase() === this.config.myCallsign
        ) {
          this._targetCallsign = info.senderCallsign.toUpperCase();
          this._targetGrid = info.grid;
          this._qsoStartTime = this._qsoStartTime || new Date().toISOString();
          this.transitionTo("CALL_RECEIVED", this._targetCallsign);

          // Send signal report to them
          const report = this.formatSnrReport(decode.snr);
          this._reportSent = report;
          this.emitTxRequest("REPORT", report);
          this.transitionTo(
            "REPORT_SENT",
            `sent ${report} to ${this._targetCallsign}`,
          );
        }
        break;
      }

      case "REPORT_SENT": {
        // Waiting for their R+report or RR73
        if (!this.isFromTarget(info)) break;

        if (info.signalReport) {
          const rpt = info.signalReport.toUpperCase();

          if (rpt === "RR73" || rpt === "73") {
            // They sent RR73 directly — QSO complete
            this._reportReceived = rpt;
            this.emitTxRequest("73");
            this.completeQso();
          } else {
            // They sent R+report — store their report, send RR73
            this._reportReceived = rpt;
            this.transitionTo("WAITING_RR73", `received ${rpt}`);
            this.emitTxRequest("RR73");
          }
        }
        break;
      }

      case "WAITING_RR73": {
        // Waiting for their 73 or RR73 to confirm
        if (!this.isFromTarget(info)) break;

        if (info.signalReport) {
          const rpt = info.signalReport.toUpperCase();
          if (rpt === "RR73" || rpt === "73") {
            this.completeQso();
          } else {
            // They may have re-sent their report — re-send RR73
            this.emitTxRequest("RR73");
          }
        }
        break;
      }

      default:
        break;
    }
  }

  // ========================================================================
  // Call Mode State Transitions
  // ========================================================================

  /**
   * Handle a relevant decode while in Call mode.
   *
   * Call flow: CALLING -> REPORT_RECEIVED -> RR73_SENT -> QSO_COMPLETE
   */
  private handleCallModeDecode(
    decode: AutoSeqDecode,
    info: ReturnType<typeof extractCallInfo>,
  ): void {
    switch (this._state) {
      case "CALLING": {
        // Waiting for their report: "{theirCall} {myCall} {report}"
        if (!this.isFromTarget(info)) break;

        if (info.signalReport) {
          const rpt = info.signalReport.toUpperCase();
          this._reportReceived = rpt;

          // Capture their grid if included
          if (info.grid && !this._targetGrid) {
            this._targetGrid = info.grid;
          }

          this.transitionTo("REPORT_RECEIVED", `received ${rpt}`);

          // Send R+report (our report of their signal)
          const report = this.formatSnrReport(decode.snr);
          this._reportSent = report;
          // In call mode, the response to their report is R+report,
          // but composeFt8Message REPORT type sends plain report.
          // We prepend "R" to the report string for the R+report exchange.
          this.emitTxRequest("REPORT", `R${report}`);
          this.transitionTo("RR73_SENT", `sent R${report}`);
        } else if (info.grid) {
          // They sent us a grid — they may be requesting our grid back
          // This can happen if they didn't hear our first call clearly
          if (!this._targetGrid) {
            this._targetGrid = info.grid;
          }
          // Re-send our calling message
          this.emitCallMessage();
        }
        break;
      }

      case "RR73_SENT": {
        // Waiting for their RR73 or 73
        if (!this.isFromTarget(info)) break;

        if (info.signalReport) {
          const rpt = info.signalReport.toUpperCase();
          if (rpt === "RR73" || rpt === "73") {
            // QSO complete — send final 73
            this.emitTxRequest("73");
            this.completeQso();
          } else {
            // They re-sent their report — re-send our R+report
            const report = this.formatSnrReport(decode.snr);
            this._reportSent = report;
            this.emitTxRequest("REPORT", `R${report}`);
          }
        }
        break;
      }

      default:
        break;
    }
  }

  // ========================================================================
  // Message Relevance Detection
  // ========================================================================

  /**
   * Determine whether a decoded message is relevant to our current QSO.
   *
   * A message is relevant if:
   *   1. It addresses our callsign (callsign field === myCallsign), OR
   *   2. It is from our target station (senderCallsign === targetCallsign)
   *
   * In CQ_SENT state, we accept any message addressing us as a potential
   * responder, even if we don't have a target yet.
   */
  private isRelevantMessage(
    info: ReturnType<typeof extractCallInfo>,
    _rawMessage: string,
  ): boolean {
    const myCall = this.config.myCallsign;

    // Check if the message addresses our callsign
    if (info.callsign?.toUpperCase() === myCall) {
      return true;
    }

    // Check if the message is from our current target
    if (
      this._targetCallsign &&
      info.senderCallsign?.toUpperCase() === this._targetCallsign
    ) {
      return true;
    }

    // In Fox multi-signal messages, check if any pair addresses us
    if (info.isFoxMulti && info.foxCallPairs) {
      for (const pair of info.foxCallPairs) {
        if (pair.receiver.toUpperCase() === myCall) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if the decoded message is from our target station.
   */
  private isFromTarget(info: ReturnType<typeof extractCallInfo>): boolean {
    if (!this._targetCallsign) return false;
    return info.senderCallsign?.toUpperCase() === this._targetCallsign;
  }

  // ========================================================================
  // TX Message Emission
  // ========================================================================

  /**
   * Emit the CQ message as a TX request.
   */
  private emitCQ(): void {
    const text = composeFt8Message({
      myCallsign: this.config.myCallsign,
      myGrid: this.config.myGrid,
      type: "CQ",
      cqDirection: this._cqDirection,
    });
    const encoded = encodeFt8Message(text);
    this.notifyTxRequest({
      message: encoded.text,
      symbols: encoded.symbols,
      type: "CQ",
    });
  }

  /**
   * Emit the initial call message (used in Call mode).
   *
   * Sends "{myCall} {theirCall} {myGrid}".
   */
  private emitCallMessage(): void {
    if (!this._targetCallsign) return;
    const text = composeFt8Message({
      myCallsign: this.config.myCallsign,
      myGrid: this.config.myGrid,
      type: "GRID",
      targetCall: this._targetCallsign,
    });
    const encoded = encodeFt8Message(text);
    this.notifyTxRequest({
      message: encoded.text,
      symbols: encoded.symbols,
      type: "GRID",
    });
  }

  /**
   * Emit a TX request for a specific QSO stage.
   *
   * @param type    The message type to compose.
   * @param report  Optional signal report string (for REPORT type).
   */
  private emitTxRequest(type: FT8TxMessage["type"], report?: string): void {
    if (!this._targetCallsign) return;

    const text = composeFt8Message({
      myCallsign: this.config.myCallsign,
      myGrid: this.config.myGrid,
      type,
      targetCall: this._targetCallsign,
      report,
    });
    const encoded = encodeFt8Message(text);
    this.notifyTxRequest({
      message: encoded.text,
      symbols: encoded.symbols,
      type,
    });
  }

  /**
   * Re-transmit the message appropriate for the current state.
   *
   * Called when the retry threshold is reached after silent cycles.
   */
  private retransmitCurrentStage(): void {
    switch (this._state) {
      case "CQ_SENT":
        this.emitCQ();
        break;
      case "CALLING":
        this.emitCallMessage();
        break;
      case "REPORT_SENT":
        if (this._reportSent) {
          this.emitTxRequest("REPORT", this._reportSent);
        }
        break;
      case "WAITING_RR73":
        this.emitTxRequest("RR73");
        break;
      case "RR73_SENT":
        if (this._reportSent) {
          this.emitTxRequest("REPORT", `R${this._reportSent}`);
        }
        break;
      default:
        break;
    }
  }

  // ========================================================================
  // QSO Completion
  // ========================================================================

  /**
   * Finalize the current QSO, emit the result, and reset.
   *
   * In CQ mode, automatically schedules a re-CQ after a brief delay.
   */
  private completeQso(): void {
    this.transitionTo("QSO_COMPLETE", this._targetCallsign ?? undefined);

    const result: AutoSeqQsoResult = {
      callsign: this._targetCallsign ?? "",
      grid: this._targetGrid,
      reportSent: this._reportSent,
      reportReceived: this._reportReceived,
      startTime: this._qsoStartTime,
      endTime: new Date().toISOString(),
      mode: this.config.mode,
      frequency: this.config.txFreqHz,
    };

    this.notifyQsoComplete(result);

    const wasCqMode = this._seqMode === "cq";
    const savedDirection = this._cqDirection;

    // Reset QSO state
    this.resetQsoState();

    // In CQ mode, automatically re-start CQ after a brief delay
    if (wasCqMode) {
      this._reCqTimer = setTimeout(() => {
        this._reCqTimer = null;
        this.startCQ(savedDirection);
      }, RE_CQ_DELAY_MS);
    } else {
      this.transitionTo("IDLE");
    }
  }

  // ========================================================================
  // State Management
  // ========================================================================

  /**
   * Transition to a new state and notify listeners.
   */
  private transitionTo(newState: AutoSeqState, detail?: string): void {
    const oldState = this._state;
    this._state = newState;

    if (oldState !== newState) {
      this.notifyStateChange(newState, detail);
    }
  }

  /**
   * Reset all QSO-related state to defaults.
   */
  private resetQsoState(): void {
    this._targetCallsign = null;
    this._targetGrid = undefined;
    this._reportSent = "";
    this._reportReceived = "";
    this._qsoStartTime = "";
    this._cyclesSinceResponse = 0;
    this._totalRetries = 0;
    this._seqMode = null;
    this._cqDirection = undefined;
  }

  /**
   * Clear any pending re-CQ timer.
   */
  private clearReCqTimer(): void {
    if (this._reCqTimer !== null) {
      clearTimeout(this._reCqTimer);
      this._reCqTimer = null;
    }
  }

  // ========================================================================
  // Signal Report Formatting
  // ========================================================================

  /**
   * Format an SNR value as a standard FT8 signal report string.
   *
   * The value is clamped to the range -30 to +30 and formatted as "+XX" or "-XX".
   *
   * @param snr  Signal-to-noise ratio in dB from the decoder.
   * @returns    Formatted report string (e.g. "+05", "-12", "+00").
   */
  private formatSnrReport(snr: number): string {
    const clamped = Math.max(-30, Math.min(30, Math.round(snr)));
    const sign = clamped >= 0 ? "+" : "-";
    const magnitude = Math.abs(clamped).toString().padStart(2, "0");
    return `${sign}${magnitude}`;
  }

  // ========================================================================
  // Event Notification Helpers
  // ========================================================================

  private notifyTxRequest(req: AutoSeqTxRequest): void {
    for (const cb of this._txRequestListeners) {
      try {
        cb(req);
      } catch {
        // Listener errors must not break the state machine
      }
    }
  }

  private notifyQsoComplete(result: AutoSeqQsoResult): void {
    for (const cb of this._qsoCompleteListeners) {
      try {
        cb(result);
      } catch {
        // Listener errors must not break the state machine
      }
    }
  }

  private notifyStateChange(state: AutoSeqState, detail?: string): void {
    for (const cb of this._stateChangeListeners) {
      try {
        cb(state, detail);
      } catch {
        // Listener errors must not break the state machine
      }
    }
  }
}
