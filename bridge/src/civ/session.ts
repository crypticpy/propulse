/**
 * CI-V Session — half-duplex command queue, frame dispatch, scope assembly
 *
 * The serial and network backends speak the same CI-V session protocol: one
 * command in flight at a time, a timeout per command, a response matcher that
 * knows the difference between an ACK and a data read, and a dispatcher that
 * routes everything else to the unsolicited-frame handlers. Scope sweeps arrive
 * split across a header frame and a run of pixel frames, and are reassembled
 * here into one spectrum line.
 *
 * Only the bytes differ — serial writes to a port, network wraps each frame in
 * an RS-BA1 UDP packet — so the transport supplies the bytes and this module
 * supplies the session.
 */

import {
  CivFrameParser,
  decodeBcdByte,
  decodeBcdFrequency,
  type CivFrame,
} from "./codec.js";
import {
  CivCmd,
  CIV_MODE_TO_STRING,
  CIV_SCOPE_SUB,
  ScopeMode,
  type CivSpectrumLine,
} from "./types.js";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Timeout for waiting on CI-V command responses (ms) */
export const COMMAND_TIMEOUT_MS = 500;

/** Timeout for discarding incomplete spectrum assemblies (ms) */
export const ASSEMBLY_TIMEOUT_MS = 500;

/** How many unsolicited frames to log before going quiet */
const UNSOLICITED_LOG_LIMIT = 20;

/** How many scope frames to log before going quiet */
const SCOPE_LOG_LIMIT = 3;

/** How many completed spectrum lines to log before going quiet */
const SPECTRUM_LOG_LIMIT = 3;

// ─── Transport ────────────────────────────────────────────────────────────────

/** Whether a command expects an explicit ACK/NG or a data response frame */
export type CivResponseKind = "ack" | "data";

/**
 * The minimum a transport must provide for a CI-V session to run on it.
 *
 * Framing is the transport's problem on the way in: a serial port delivers an
 * arbitrarily split byte stream, a network backend delivers the CI-V payload of
 * one UDP packet. Either way the bytes go to {@link CivSession.handleIncomingData},
 * which buffers and re-frames them.
 */
export interface CivTransport {
  /** Tag used in diagnostic logs, e.g. "icom-serial" */
  readonly logTag: string;

  /**
   * True when the backend is connected and the underlying channel can carry a
   * frame right now. Commands sent while this is false resolve to null.
   */
  isReady(): boolean;

  /**
   * Write one encoded CI-V frame to the radio. Any packet wrapping the
   * transport needs (RS-BA1 headers, sequence numbers) happens here.
   * `done` is called with a write error, or with nothing on success.
   */
  write(frame: Buffer, done: (err?: Error | null) => void): void;
}

// ─── Session handlers ─────────────────────────────────────────────────────────

/**
 * The backend-side hooks the dispatcher calls for frames the radio sent on its
 * own: scope sweeps and front-panel changes.
 */
export interface CivSessionHandlers {
  /** One scope sweep, reassembled from its header and pixel frames. */
  onSpectrumLine(line: CivSpectrumLine): void;

  /** The radio reported a frequency nobody asked for (front-panel change). */
  onUnsolicitedFrequency(hz: number): void;

  /** The radio reported a mode nobody asked for. */
  onUnsolicitedMode(mode: string): void;
}

// ─── Spectrum Assembly ────────────────────────────────────────────────────────

interface LineAssembly {
  scopeMode: ScopeMode;
  scopeIndex: number;
  startFreqHz: number;
  endFreqHz: number;
  seqMax: number;
  lastSeq: number;
  pixels: number[];
  lastUpdateMs: number;
}

// ─── Command Queue Types ──────────────────────────────────────────────────────

interface PendingCommand {
  /** The CI-V command byte we're waiting for a response to */
  expectedCmd: number;
  /** Optional sub-command for more specific matching */
  expectedSub?: number;
  /** Whether this command expects an ACK/NG or a data response frame */
  responseKind: CivResponseKind;
  /** Resolve the promise with the response frame */
  resolve: (frame: CivFrame | null) => void;
  /** Timeout handle */
  timer: ReturnType<typeof setTimeout>;
}

// ─── CivSession ───────────────────────────────────────────────────────────────

export class CivSession {
  private readonly transport: CivTransport;
  private readonly handlers: CivSessionHandlers;
  private readonly frameParser = new CivFrameParser();
  private pendingCommand: PendingCommand | null = null;
  private commandQueue: Promise<void> = Promise.resolve();
  private unsolicitedFrameCount = 0;
  private scopeFrameCount = 0;
  private spectrumLineCount = 0;

  // Spectrum assembly
  private assembly: LineAssembly | null = null;
  private assemblyTimer: ReturnType<typeof setTimeout> | null = null;
  private spectrumEnabled = false;

  constructor(transport: CivTransport, handlers: CivSessionHandlers) {
    this.transport = transport;
    this.handlers = handlers;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Drop buffered bytes. Call when the link opens and when it closes. */
  resetParser(): void {
    this.frameParser.reset();
    this.unsolicitedFrameCount = 0;
    this.scopeFrameCount = 0;
  }

  /** Fail the in-flight command, if any. Call when the link closes. */
  cancelPending(): void {
    if (this.pendingCommand) {
      clearTimeout(this.pendingCommand.timer);
      this.pendingCommand.resolve(null);
      this.pendingCommand = null;
    }
  }

  // ── Scope ─────────────────────────────────────────────────────────────────

  /**
   * Turn scope assembly on or off. Wave frames arriving while this is off are
   * dropped; turning it off also discards any half-assembled line. The backend
   * calls this around the scope on/off command sequences.
   */
  setSpectrumEnabled(enabled: boolean): void {
    this.spectrumEnabled = enabled;
    if (!enabled) {
      this.clearAssemblyTimeout();
      this.assembly = null;
    }
  }

  /** Drop all scope state. Call when the link closes. */
  resetSpectrum(): void {
    this.setSpectrumEnabled(false);
    this.spectrumLineCount = 0;
  }

  // ── Incoming Data ─────────────────────────────────────────────────────────

  /**
   * Feed raw CI-V bytes in: a serial chunk, or the CI-V payload of one UDP
   * packet. Complete frames are routed to the pending command or, failing
   * that, to the unsolicited handlers.
   */
  handleIncomingData(data: Buffer): void {
    const frames = this.frameParser.append(data);

    for (const frame of frames) {
      // Route to pending command resolver if it matches
      if (this.pendingCommand && this.matchesPending(frame)) {
        const pending = this.pendingCommand;
        this.pendingCommand = null;
        clearTimeout(pending.timer);
        pending.resolve(frame);
        continue;
      }

      // Handle unsolicited frames
      this.handleUnsolicitedFrame(frame);
    }
  }

  /** Check if a frame matches the pending command */
  private matchesPending(frame: CivFrame): boolean {
    if (!this.pendingCommand) return false;
    const pending = this.pendingCommand;

    if (pending.responseKind === "ack") {
      // ACK commands expect an explicit OK/NG.
      if (frame.isOk || frame.isNg) return true;

      // Some radios echo command responses instead of sending 0xFB.
      if (frame.command !== pending.expectedCmd) return false;
      if (
        pending.expectedSub !== undefined &&
        frame.subCommand !== pending.expectedSub
      ) {
        return false;
      }
      return true;
    }

    // Data reads should never resolve from a plain OK (that can be stale).
    if (frame.isOk) return false;
    // NG belongs to the current read and should fail fast (no timeout wait).
    if (frame.isNg) return true;

    if (frame.command !== pending.expectedCmd) return false;
    if (
      pending.expectedSub !== undefined &&
      frame.subCommand !== pending.expectedSub
    ) {
      return false;
    }
    return true;
  }

  /** Handle unsolicited CI-V frames (frequency changes from front panel, scope data) */
  private handleUnsolicitedFrame(frame: CivFrame): void {
    // Log the first UNSOLICITED_LOG_LIMIT unsolicited frames for diagnostics, then go quiet
    this.unsolicitedFrameCount++;
    if (this.unsolicitedFrameCount <= UNSOLICITED_LOG_LIMIT) {
      console.log(
        `[${this.transport.logTag}] Unsolicited frame #${this.unsolicitedFrameCount}: cmd=0x${frame.command.toString(16)} sub=${frame.subCommand !== undefined ? "0x" + frame.subCommand.toString(16) : "none"} data=${frame.data.length}b from=0x${frame.from.toString(16)} spectrumEnabled=${this.spectrumEnabled}`,
      );
    }

    // Scope wave data
    if (
      frame.command === CivCmd.SCOPE_DATA &&
      frame.subCommand === CIV_SCOPE_SUB.WAVE_DATA &&
      this.spectrumEnabled
    ) {
      this.scopeFrameCount++;
      if (this.scopeFrameCount <= SCOPE_LOG_LIMIT) {
        console.log(
          `[${this.transport.logTag}] Scope frame #${this.scopeFrameCount} received (${frame.data.length} bytes)`,
        );
      }
      const scopeData = frame.data.subarray(1); // skip sub-command byte
      if (scopeData.length >= 3) {
        const scopeIndex = scopeData[0];
        const seq = decodeBcdByte(scopeData[1]);
        const seqMax = decodeBcdByte(scopeData[2]);
        if (seq >= 1 && seqMax >= 1) {
          if (seq === 1) {
            this.handleScopeHeader(scopeData, scopeIndex, seqMax);
          } else {
            this.handleScopePixels(scopeData, seq);
          }
        }
      }
      return;
    }

    // Unsolicited frequency change (echoed as cmd 0x00 or 0x03 from radio)
    if (frame.command === 0x00 || frame.command === CivCmd.READ_FREQ) {
      if (frame.data.length >= 5) {
        const freq = decodeBcdFrequency(frame.data, 0);
        if (freq > 0) {
          this.handlers.onUnsolicitedFrequency(freq);
        }
      }
    }

    // Unsolicited mode change (echoed as cmd 0x01 or 0x04)
    if (frame.command === 0x01 || frame.command === CivCmd.READ_MODE) {
      if (frame.data.length >= 1) {
        const modeByte = frame.data[0];
        const mode = CIV_MODE_TO_STRING[modeByte];
        if (mode) {
          this.handlers.onUnsolicitedMode(mode);
        }
      }
    }
  }

  // ── Command Queue ─────────────────────────────────────────────────────────

  /**
   * Send a CI-V frame and wait for the response.
   * Returns the response frame, or null on timeout/error.
   */
  sendCommand(
    frame: Buffer,
    responseKind: CivResponseKind = "data",
  ): Promise<CivFrame | null> {
    if (!this.transport.isReady()) {
      return Promise.resolve(null);
    }

    // Extract expected command byte from the frame
    // Frame format: FE FE [to] [from] [cmd] [sub?] ... FD
    const cmd = frame[4]; // command byte
    const sub =
      this.commandUsesSubCommand(cmd) && frame.length > 6
        ? frame[5]
        : undefined;

    return this.runInCommandQueue(
      () =>
        new Promise((resolve) => {
          if (!this.transport.isReady()) {
            resolve(null);
            return;
          }

          // Should never happen because runInCommandQueue serializes writes.
          if (this.pendingCommand) {
            clearTimeout(this.pendingCommand.timer);
            this.pendingCommand.resolve(null);
            this.pendingCommand = null;
          }

          const timer = setTimeout(() => {
            if (this.pendingCommand?.timer === timer) {
              this.pendingCommand = null;
              resolve(null);
            }
          }, COMMAND_TIMEOUT_MS);

          this.pendingCommand = {
            expectedCmd: cmd,
            expectedSub: sub,
            responseKind,
            resolve,
            timer,
          };

          this.transport.write(frame, (err) => {
            if (err) {
              if (this.pendingCommand?.timer === timer) {
                clearTimeout(timer);
                this.pendingCommand = null;
              }
              resolve(null);
            }
          });
        }),
    );
  }

  /** Send a command and require an explicit OK acknowledgment. */
  async sendAndWaitOk(frame: Buffer, label: string): Promise<void> {
    const response = await this.sendCommand(frame, "ack");
    if (!response) {
      throw new Error(`${label} timed out`);
    }
    if (response.isNg) {
      throw new Error(`${label} rejected by radio`);
    }
    if (response.isOk || response.command === frame[4]) {
      return;
    }
    if (!response.isOk) {
      throw new Error(`${label} got unexpected response`);
    }
  }

  /**
   * Write raw bytes without waiting for a response, still taking its turn in
   * the queue (used for multi-frame commands like RIT/XIT).
   */
  sendRaw(data: Buffer): Promise<void> {
    return this.runInCommandQueue(
      () =>
        new Promise((resolve, reject) => {
          this.transport.write(data, (err) => {
            if (err) reject(err);
            else resolve();
          });
        }),
    );
  }

  private runInCommandQueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.commandQueue.then(task, task);
    this.commandQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private commandUsesSubCommand(cmd: number): boolean {
    return (
      cmd === CivCmd.PTT ||
      cmd === CivCmd.LEVELS ||
      cmd === CivCmd.METERS ||
      cmd === CivCmd.FUNCTIONS ||
      cmd === CivCmd.RIT_XIT ||
      cmd === CivCmd.SCOPE_CTRL
    );
  }

  // ── Scope Assembly ────────────────────────────────────────────────────────

  /**
   * First frame of a scope sweep (sequence 1), carrying the sweep's mode and
   * frequency edges. `scopeData` has the sub-command byte already stripped.
   */
  private handleScopeHeader(
    scopeData: Buffer,
    scopeIndex: number,
    seqMax: number,
  ): void {
    if (scopeData.length < 15) return;

    const scopeMode = scopeData[3] as ScopeMode;
    const startFreqHz = decodeBcdFrequency(scopeData, 4);
    const endFreqHz = decodeBcdFrequency(scopeData, 9);

    this.assembly = {
      scopeMode,
      scopeIndex,
      startFreqHz,
      endFreqHz,
      seqMax,
      lastSeq: 1,
      pixels: [],
      lastUpdateMs: Date.now(),
    };

    if (seqMax === 1) {
      for (let i = 15; i < scopeData.length; i++) {
        this.assembly.pixels.push(scopeData[i]);
      }
      this.emitCompleteLine();
      return;
    }

    this.resetAssemblyTimeout();
  }

  /** A continuation frame of a scope sweep (sequence > 1). */
  private handleScopePixels(scopeData: Buffer, seq: number): void {
    if (!this.assembly) return;

    if (seq !== this.assembly.lastSeq + 1) {
      this.assembly = null;
      return;
    }

    this.assembly.lastSeq = seq;
    this.assembly.lastUpdateMs = Date.now();

    for (let i = 3; i < scopeData.length; i++) {
      this.assembly.pixels.push(scopeData[i]);
    }

    if (seq === this.assembly.seqMax) {
      this.emitCompleteLine();
    } else {
      this.resetAssemblyTimeout();
    }
  }

  private emitCompleteLine(): void {
    this.clearAssemblyTimeout();

    if (!this.assembly || this.assembly.pixels.length === 0) {
      this.assembly = null;
      return;
    }

    const { scopeMode, scopeIndex, startFreqHz, endFreqHz, pixels } =
      this.assembly;

    let centerHz: number;
    let spanHz: number;

    if (scopeMode === ScopeMode.Center) {
      centerHz = startFreqHz;
      spanHz = endFreqHz * 2;
    } else {
      centerHz = (startFreqHz + endFreqHz) / 2;
      spanHz = endFreqHz - startFreqHz;
    }

    if (spanHz <= 0) {
      this.assembly = null;
      return;
    }

    const line: CivSpectrumLine = {
      centerHz,
      spanHz,
      pixels: new Uint8Array(pixels),
      scopeMode,
      scopeIndex,
    };

    this.spectrumLineCount++;
    if (this.spectrumLineCount <= SPECTRUM_LOG_LIMIT) {
      console.log(
        `[${this.transport.logTag}] Spectrum line #${this.spectrumLineCount}: center=${(line.centerHz / 1e6).toFixed(3)}MHz span=${(line.spanHz / 1e3).toFixed(0)}kHz bins=${line.pixels.length}`,
      );
    }

    this.assembly = null;
    this.handlers.onSpectrumLine(line);
  }

  private resetAssemblyTimeout(): void {
    if (this.assemblyTimer) {
      clearTimeout(this.assemblyTimer);
    }
    this.assemblyTimer = setTimeout(() => {
      this.assemblyTimer = null;
      this.assembly = null;
    }, ASSEMBLY_TIMEOUT_MS);
  }

  private clearAssemblyTimeout(): void {
    if (this.assemblyTimer) {
      clearTimeout(this.assemblyTimer);
      this.assemblyTimer = null;
    }
  }
}
