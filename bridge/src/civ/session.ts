/**
 * CI-V Session — half-duplex command queue, frame dispatch, scope assembly,
 * polling, rig-control.
 *
 * The serial and network backends speak the same CI-V session protocol: one
 * command in flight at a time, a timeout per command, a response matcher that
 * knows the difference between an ACK and a data read, and a dispatcher that
 * routes everything else to the unsolicited-frame handlers. Scope sweeps arrive
 * split across a header frame and a run of pixel frames, and are reassembled
 * here into one spectrum line. Status polling and the rig-control setters live
 * here too.
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
  parseAgcResponse,
  parseFrequencyResponse,
  parseFunctionResponse,
  parseIfShiftResponse,
  parseLevelResponse,
  parseMeterResponse,
  parseModeResponse,
  parsePttResponse,
  parseRitXitEnableResponse,
  parseRitXitOffsetResponse,
  parseSplitResponse,
  readAlcMeter,
  readFrequency,
  readFunction,
  readLevel,
  readMode,
  readPowerMeter,
  readPtt,
  readRit,
  readRitXitOffset,
  readSmeter,
  readSplit,
  readSwrMeter,
  readXit,
  setAgc as buildSetAgc,
  setAntenna as buildSetAntenna,
  setCwSpeed as buildSetCwSpeed,
  setFrequency as buildSetFrequency,
  setFunction as buildSetFunction,
  setIfShift as buildSetIfShift,
  setLevel as buildSetLevel,
  setMode as buildSetMode,
  setPtt as buildSetPtt,
  setRit as buildSetRit,
  setSplit as buildSetSplit,
  setVfo as buildSetVfo,
  setXit as buildSetXit,
  startScope,
  startScopeDataOutput,
  stopScope,
  stopScopeDataOutput,
} from "./commands.js";
import {
  CivCmd,
  CIV_MODE_TO_STRING,
  CIV_SCOPE_SUB,
  rawSmeterToDbm,
  ScopeMode,
  SMETER_MAX_RAW,
  type CivAddress,
  type CivSpectrumLine,
} from "./types.js";
import type { RigStatus } from "../types.js";

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

/** Disconnect after this many thrown poll cycles in a row */
export const MAX_CONSECUTIVE_ERRORS = 10;

/** How many poll cycles between RIT/XIT/function/level refreshes */
export const OPTIONAL_POLL_INTERVAL_CYCLES = 5;

/** How many thrown poll cycles to log before going quiet */
const POLL_ERROR_LOG_LIMIT = 3;

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
 * own, and for status the poll cycle assembled.
 */
export interface CivSessionHandlers {
  /** One scope sweep, reassembled from its header and pixel frames. */
  onSpectrumLine(line: CivSpectrumLine): void;

  /** The radio reported a frequency nobody asked for (front-panel change). */
  onUnsolicitedFrequency?(hz: number): void;

  /** The radio reported a mode nobody asked for. */
  onUnsolicitedMode?(mode: string): void;

  /**
   * Status changed (excluding S-meter, which has its own hook). The first
   * successful poll always fires this; later ones only fire on a real diff.
   */
  onStatus?(status: RigStatus): void;

  /** S-meter reading in dBm, only when the value moved. */
  onSmeter?(dbm: number): void;

  /**
   * The poll cycle threw {@link MAX_CONSECUTIVE_ERRORS} times in a row.
   * The backend should disconnect — closing the link is transport-specific.
   */
  onFatalPollError?(message: string): void;
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
  private readonly addr: CivAddress;
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

  // Polling
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private pollInFlight = false;
  private pollCount = 0;
  private consecutiveErrors = 0;
  private lastStatus: RigStatus | null = null;
  private lastSmeterDbm: number | null = null;
  private readonly warnedUnsupported = new Set<string>();

  constructor(
    transport: CivTransport,
    handlers: CivSessionHandlers,
    addr: CivAddress,
  ) {
    this.transport = transport;
    this.handlers = handlers;
    this.addr = addr;
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

  // ── Poll lifecycle ──────────────────────────────────────────────────────

  /**
   * Last assembled status, or null before the first successful poll (and
   * after {@link resetPollState}). Backends that still own a setter which
   * reads "current mode" go through this rather than keeping a second copy.
   */
  getLastStatus(): RigStatus | null {
    return this.lastStatus;
  }

  /**
   * Start the poll timer. The first cycle runs immediately. Calling this
   * while a timer is already running is a no-op. Consecutive-error count
   * resets, matching the backends' previous start() behaviour.
   */
  startPolling(intervalMs: number): void {
    if (this.pollTimer) return;
    this.consecutiveErrors = 0;
    this.pollTimer = setInterval(() => {
      void this.pollNow();
    }, intervalMs);
    void this.pollNow();
  }

  /** Cancel the poll timer. An in-flight cycle is allowed to finish. */
  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Drop last status and the in-flight flag. Call when the link closes.
   * `warnedUnsupported` and `pollCount` persist for the session's lifetime,
   * matching the previous per-backend copies.
   */
  resetPollState(): void {
    this.pollInFlight = false;
    this.lastStatus = null;
    this.lastSmeterDbm = null;
  }

  /**
   * Run one poll cycle if none is already in flight. Used by the timer and
   * by tests; backends do not call this directly.
   */
  pollNow(): Promise<void> {
    if (this.pollInFlight) return Promise.resolve();
    this.pollInFlight = true;
    return this.pollCycle().finally(() => {
      this.pollInFlight = false;
    });
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
          this.handlers.onUnsolicitedFrequency?.(freq);
          if (this.lastStatus) {
            this.lastStatus = { ...this.lastStatus, frequency: freq };
            this.handlers.onStatus?.(this.lastStatus);
          }
        }
      }
    }

    // Unsolicited mode change (echoed as cmd 0x01 or 0x04)
    if (frame.command === 0x01 || frame.command === CivCmd.READ_MODE) {
      if (frame.data.length >= 1) {
        const modeByte = frame.data[0];
        const mode = CIV_MODE_TO_STRING[modeByte];
        if (mode) {
          this.handlers.onUnsolicitedMode?.(mode);
          if (this.lastStatus) {
            this.lastStatus = { ...this.lastStatus, mode };
            this.handlers.onStatus?.(this.lastStatus);
          }
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

  // ── Polling ───────────────────────────────────────────────────────────────

  private async pollCycle(): Promise<void> {
    if (!this.transport.isReady()) return;

    this.pollCount++;
    const pollOptionalFields =
      !this.lastStatus || this.pollCount % OPTIONAL_POLL_INTERVAL_CYCLES === 0;

    try {
      const status = await this.readFullStatus(pollOptionalFields);
      this.consecutiveErrors = 0;

      if (status.smeter !== undefined) {
        const dbm = status.smeter;
        if (dbm !== this.lastSmeterDbm) {
          this.lastSmeterDbm = dbm;
          try {
            this.handlers.onSmeter?.(dbm);
          } catch {
            // Swallow, matching the backends' emitSmeter.
          }
        }
      }

      if (this.hasStatusChanged(status)) {
        this.lastStatus = status;
        try {
          this.handlers.onStatus?.(status);
        } catch {
          // Swallow, matching the backends' emitStatus.
        }
      }
    } catch (err) {
      this.consecutiveErrors++;
      if (this.consecutiveErrors <= POLL_ERROR_LOG_LIMIT) {
        console.warn(
          `[${this.transport.logTag}] Poll error (${this.consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      if (this.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        this.handlers.onFatalPollError?.(
          `Too many consecutive errors (${this.consecutiveErrors}), disconnecting`,
        );
      }
    }
  }

  private async readFullStatus(
    pollOptionalFields: boolean,
  ): Promise<RigStatus> {
    const status: RigStatus = this.lastStatus
      ? { ...this.lastStatus, connected: true }
      : { connected: true };

    const freqFrame = await this.sendCommand(readFrequency(this.addr));
    if (freqFrame) {
      const freq = parseFrequencyResponse(freqFrame);
      if (freq !== null) status.frequency = freq;
    }

    const modeFrame = await this.sendCommand(readMode(this.addr));
    if (modeFrame) {
      const result = parseModeResponse(modeFrame);
      if (result) status.mode = result.mode;
    }

    const pttFrame = await this.sendCommand(readPtt(this.addr));
    if (pttFrame) {
      const ptt = parsePttResponse(pttFrame);
      if (ptt !== null) status.ptt = ptt;
    }

    const smeterFrame = await this.sendCommand(readSmeter(this.addr));
    if (smeterFrame) {
      const raw = parseMeterResponse(smeterFrame);
      if (raw !== null) {
        if (
          raw > SMETER_MAX_RAW &&
          !this.warnedUnsupported.has("SMETER_RANGE")
        ) {
          this.warnedUnsupported.add("SMETER_RANGE");
          const hexBytes = Buffer.from(smeterFrame.data).toString("hex");
          console.warn(
            `[${this.transport.logTag}] S-meter raw=${raw} exceeds max ${SMETER_MAX_RAW} (frame: ${hexBytes}), clamping`,
          );
        }
        status.smeter = rawSmeterToDbm(raw);
      }
    }

    if (status.ptt) {
      const txMeter: NonNullable<RigStatus["txMeter"]> = {};

      const pwrFrame = await this.sendCommand(readPowerMeter(this.addr));
      if (pwrFrame) {
        const raw = parseMeterResponse(pwrFrame);
        if (raw !== null) txMeter.powerW = (raw / 241) * 100;
      }

      const swrFrame = await this.sendCommand(readSwrMeter(this.addr));
      if (swrFrame) {
        const raw = parseMeterResponse(swrFrame);
        if (raw !== null) txMeter.swr = 1 + (raw / 241) * 2;
      }

      const alcFrame = await this.sendCommand(readAlcMeter(this.addr));
      if (alcFrame) {
        const raw = parseMeterResponse(alcFrame);
        if (raw !== null) txMeter.alc = raw / 241;
      }

      status.txMeter = txMeter;
    }

    const splitFrame = await this.sendCommand(readSplit(this.addr));
    if (splitFrame) {
      const split = parseSplitResponse(splitFrame);
      if (split !== null) status.split = split;
    }

    if (pollOptionalFields) {
      await this.pollOptional("RIT", async () => {
        const ritFrame = this.requireOptionalFrame(
          "RIT",
          await this.sendCommand(readRit(this.addr)),
        );
        const enabled = parseRitXitEnableResponse(ritFrame);
        if (enabled === null) {
          throw new Error("RIT parse failed");
        }
        const offsetFrame = this.requireOptionalFrame(
          "RIT_OFFSET",
          await this.sendCommand(readRitXitOffset(this.addr)),
        );
        const offsetHz = parseRitXitOffsetResponse(offsetFrame);
        if (offsetHz === null) {
          throw new Error("RIT offset parse failed");
        }
        status.rit = { enabled, offsetHz };
      });

      await this.pollOptional("XIT", async () => {
        const xitFrame = this.requireOptionalFrame(
          "XIT",
          await this.sendCommand(readXit(this.addr)),
        );
        const enabled = parseRitXitEnableResponse(xitFrame);
        if (enabled === null) {
          throw new Error("XIT parse failed");
        }
        status.xit = { enabled, offsetHz: status.rit?.offsetHz ?? 0 };
      });

      await this.pollOptional("ANF", async () => {
        const frame = this.requireOptionalFrame(
          "ANF",
          await this.sendCommand(readFunction(this.addr, "ANF")),
        );
        const val = parseFunctionResponse(frame);
        if (val === null) {
          throw new Error("ANF parse failed");
        }
        status.anf = val;
      });

      await this.pollOptional("QSK", async () => {
        const frame = this.requireOptionalFrame(
          "QSK",
          await this.sendCommand(readFunction(this.addr, "BKIN")),
        );
        const val = parseFunctionResponse(frame);
        if (val === null) {
          throw new Error("QSK parse failed");
        }
        status.qsk = val;
      });

      await this.pollOptional("VOX", async () => {
        const frame = this.requireOptionalFrame(
          "VOX",
          await this.sendCommand(readFunction(this.addr, "VOX")),
        );
        const val = parseFunctionResponse(frame);
        if (val === null) {
          throw new Error("VOX parse failed");
        }
        status.vox = val;
      });

      await this.pollOptional("AGC", async () => {
        const frame = this.requireOptionalFrame(
          "AGC",
          await this.sendCommand(readFunction(this.addr, "AGC")),
        );
        const val = parseAgcResponse(frame);
        if (val === null) {
          throw new Error("AGC parse failed");
        }
        status.agcMode = val;
      });

      await this.pollOptional("KEYSPD", async () => {
        const frame = this.requireOptionalFrame(
          "KEYSPD",
          await this.sendCommand(readLevel(this.addr, "KEYSPD")),
        );
        const val = parseLevelResponse(frame);
        if (val === null) {
          throw new Error("KEYSPD parse failed");
        }
        status.cwSpeed = val;
      });

      await this.pollOptional("IF_SHIFT", async () => {
        const frame = this.requireOptionalFrame(
          "IF_SHIFT",
          await this.sendCommand(readLevel(this.addr, "IF_SHIFT")),
        );
        const raw = parseLevelResponse(frame);
        if (raw === null) {
          throw new Error("IF_SHIFT parse failed");
        }
        status.ifShift = parseIfShiftResponse(raw);
      });
    }

    return status;
  }

  private async pollOptional(
    name: string,
    fn: () => Promise<void>,
  ): Promise<void> {
    if (this.warnedUnsupported.has(name)) return;
    try {
      await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const shouldDisable =
        message.includes("timed out") || message.includes("rejected by radio");
      if (shouldDisable) {
        this.warnedUnsupported.add(name);
        console.warn(
          `[${this.transport.logTag}] Disabling optional poll ${name}: ${message}`,
        );
      } else {
        console.warn(
          `[${this.transport.logTag}] Optional poll ${name} failed: ${message}`,
        );
      }
    }
  }

  private requireOptionalFrame(name: string, frame: CivFrame | null): CivFrame {
    if (!frame) {
      throw new Error(`${name} timed out`);
    }
    if (frame.isNg) {
      throw new Error(`${name} rejected by radio`);
    }
    return frame;
  }

  /** Check if status has meaningfully changed (excluding S-meter) */
  private hasStatusChanged(status: RigStatus): boolean {
    if (!this.lastStatus) return true;
    const prev = this.lastStatus;
    return (
      prev.frequency !== status.frequency ||
      prev.mode !== status.mode ||
      prev.ptt !== status.ptt ||
      prev.vfo !== status.vfo ||
      prev.split !== status.split ||
      prev.anf !== status.anf ||
      prev.qsk !== status.qsk ||
      prev.vox !== status.vox ||
      prev.agcMode !== status.agcMode ||
      prev.cwSpeed !== status.cwSpeed ||
      prev.ifShift !== status.ifShift ||
      prev.rit?.enabled !== status.rit?.enabled ||
      prev.rit?.offsetHz !== status.rit?.offsetHz ||
      prev.xit?.enabled !== status.xit?.enabled
    );
  }

  // ── Rig control ───────────────────────────────────────────────────────────

  async setFrequency(hz: number): Promise<void> {
    await this.sendAndWaitOk(
      buildSetFrequency(this.addr, hz),
      "Set frequency",
    );
  }

  async setMode(mode: string, _passband?: number): Promise<void> {
    await this.sendAndWaitOk(buildSetMode(this.addr, mode), "Set mode");
  }

  async setPTT(on: boolean): Promise<void> {
    await this.sendAndWaitOk(buildSetPtt(this.addr, on), "Set PTT");
  }

  async setVFO(vfo: "A" | "B"): Promise<void> {
    await this.sendAndWaitOk(buildSetVfo(this.addr, vfo), "Set VFO");
  }

  async setSplit(on: boolean): Promise<void> {
    await this.sendAndWaitOk(buildSetSplit(this.addr, on), "Set split");
  }

  async setFunc(func: string, on: boolean): Promise<void> {
    await this.sendAndWaitOk(
      buildSetFunction(this.addr, func, on),
      `Set function ${func}`,
    );
  }

  async setLevel(level: string, value: number): Promise<void> {
    await this.sendAndWaitOk(
      buildSetLevel(this.addr, level, value),
      `Set level ${level}`,
    );
  }

  async getLevel(level: string): Promise<number> {
    const frame = await this.sendCommand(readLevel(this.addr, level));
    if (!frame) return 0;
    return parseLevelResponse(frame) ?? 0;
  }

  async getFunc(func: string): Promise<boolean> {
    const frame = await this.sendCommand(readFunction(this.addr, func));
    if (!frame) return false;
    return parseFunctionResponse(frame) ?? false;
  }

  async setAgc(mode: number): Promise<void> {
    await this.sendAndWaitOk(buildSetAgc(this.addr, mode), "Set AGC");
  }

  /**
   * Map a passband width in Hz to ICOM FIL1–3 and re-send the current mode
   * with that filter. No-ops until a poll has populated lastStatus.mode.
   *
   * Both backends used to carry this; the network copy was a no-op. The
   * serial mapping is the one that actually changes the radio, so it is
   * the shared behaviour.
   */
  async setPassband(hz: number): Promise<void> {
    const currentMode = this.lastStatus?.mode;
    if (!currentMode) return;

    const isCw = currentMode === "CW" || currentMode === "CW-R";
    const isRtty = currentMode === "RTTY" || currentMode === "RTTY-R";
    let filter: number;

    if (isCw || isRtty) {
      filter = hz >= 400 ? 1 : hz >= 150 ? 2 : 3;
    } else {
      filter = hz >= 2000 ? 1 : hz >= 1000 ? 2 : 3;
    }

    await this.sendAndWaitOk(
      buildSetMode(this.addr, currentMode, filter),
      "Set passband",
    );
  }

  async setAntenna(index: string): Promise<void> {
    const port = parseInt(index, 10);
    if (!isNaN(port)) {
      await this.sendAndWaitOk(
        buildSetAntenna(this.addr, port),
        "Set antenna",
      );
    }
  }

  async setRit(enabled: boolean, offsetHz?: number): Promise<void> {
    await this.sendRaw(buildSetRit(this.addr, enabled, offsetHz));
  }

  async setXit(enabled: boolean, offsetHz?: number): Promise<void> {
    await this.sendRaw(buildSetXit(this.addr, enabled, offsetHz));
  }

  async setAnf(enabled: boolean): Promise<void> {
    await this.sendAndWaitOk(
      buildSetFunction(this.addr, "ANF", enabled),
      "Set ANF",
    );
  }

  async setQsk(enabled: boolean): Promise<void> {
    await this.sendAndWaitOk(
      buildSetFunction(this.addr, "BKIN", enabled),
      "Set QSK",
    );
  }

  async setVox(enabled: boolean): Promise<void> {
    await this.sendAndWaitOk(
      buildSetFunction(this.addr, "VOX", enabled),
      "Set VOX",
    );
  }

  async setCwSpeed(wpm: number): Promise<void> {
    await this.sendAndWaitOk(
      buildSetCwSpeed(this.addr, wpm),
      "Set CW speed",
    );
  }

  async setIfShift(hz: number): Promise<void> {
    await this.sendAndWaitOk(
      buildSetIfShift(this.addr, hz),
      "Set IF shift",
    );
  }

  async startSpectrum(): Promise<void> {
    this.setSpectrumEnabled(true);
    console.log(
      `[${this.transport.logTag}] Starting spectrum for addr 0x${this.addr.radio.toString(16)}`,
    );
    try {
      await this.sendAndWaitOk(startScope(this.addr), "Enable scope display");
      console.log(
        `[${this.transport.logTag}] Scope ON (0x27 0x10 0x01) — OK`,
      );
      await this.sendAndWaitOk(
        startScopeDataOutput(this.addr),
        "Enable scope data output",
      );
      console.log(
        `[${this.transport.logTag}] Scope Data Output ON (0x27 0x11 0x01) — OK, waiting for frames`,
      );
    } catch (err: unknown) {
      console.error(
        `[${this.transport.logTag}] Scope enable FAILED: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  }

  async stopSpectrum(): Promise<void> {
    this.setSpectrumEnabled(false);
    await this.sendAndWaitOk(
      stopScopeDataOutput(this.addr),
      "Disable scope data output",
    );
    await this.sendAndWaitOk(stopScope(this.addr), "Disable scope display");
  }
}
