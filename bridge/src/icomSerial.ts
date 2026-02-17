/**
 * ICOM Serial Backend — Direct USB CI-V Radio Control
 *
 * Communicates directly with ICOM radios over USB serial using the CI-V
 * protocol. Replaces both Hamlib (rig control) and WFView (spectrum) for
 * ICOM radios with a single direct serial connection.
 *
 * Features:
 * - Full rig control: frequency, mode, PTT, VFO, split, levels, functions
 * - Spectrum/waterfall data from CI-V scope output
 * - Half-duplex command queue with timeouts
 * - Handles unsolicited CI-V frames (front-panel changes, scope data)
 * - S-meter, SWR, ALC, power metering
 */

import { SerialPort } from "serialport";
import { CivFrameParser, type CivFrame } from "./civ/codec.js";
import { AudioCapture } from "./audioCapture.js";
import { resolveAudioDevice } from "./audioResolver.js";
import {
  readFrequency,
  setFrequency,
  readMode,
  setMode,
  readPtt,
  setPtt,
  readSmeter,
  readPowerMeter,
  readSwrMeter,
  readAlcMeter,
  readLevel,
  setLevel,
  readFunction,
  setFunction,
  setAgc,
  setVfo,
  setSplit,
  readSplit,
  setRit,
  setXit,
  readRit,
  readXit,
  readRitXitOffset,
  setCwSpeed,
  setIfShift,
  startScope,
  stopScope,
  setAntenna,
  parseFrequencyResponse,
  parseModeResponse,
  parsePttResponse,
  parseMeterResponse,
  parseLevelResponse,
  parseFunctionResponse,
  parseSplitResponse,
  parseRitXitEnableResponse,
  parseRitXitOffsetResponse,
  parseIfShiftResponse,
  parseAgcResponse,
} from "./civ/commands.js";
import {
  type CivAddress,
  CivCmd,
  CIV_CONTROLLER_ADDR,
  CIV_SCOPE_SUB,
  CIV_MODE_TO_STRING,
  ICOM_MODELS,
  ScopeMode,
  rawSmeterToDbm,
} from "./civ/types.js";
import { decodeBcdFrequency, decodeBcdByte } from "./civ/codec.js";
import type { RigStatus } from "./types.js";
import type { CivSpectrumLine } from "./civ.js";

// ─── Configuration ────────────────────────────────────────────────────────────

export interface IcomSerialConfig {
  /** Serial port path (e.g. "/dev/tty.SLAB_USBtoUART", "COM3") */
  port: string;
  /** Baud rate (default 19200 for IC-7300) */
  baudRate: number;
  /** Radio's CI-V address (e.g. 0x94 for IC-7300) */
  radioAddress: number;
  /** Controller address (default 0xE0) */
  controllerAddress?: number;
  /** Poll interval in ms (default 200) */
  pollInterval?: number;
}

// ─── Command Queue Types ──────────────────────────────────────────────────────

interface PendingCommand {
  /** The CI-V command byte we're waiting for a response to */
  expectedCmd: number;
  /** Optional sub-command for more specific matching */
  expectedSub?: number;
  /** Resolve the promise with the response frame */
  resolve: (frame: CivFrame | null) => void;
  /** Timeout handle */
  timer: ReturnType<typeof setTimeout>;
}

// ─── Event Handler Types ──────────────────────────────────────────────────────

type StatusHandler = (status: RigStatus) => void;
type SmeterHandler = (dbm: number) => void;
type ErrorHandler = (error: string) => void;
type SpectrumHandler = (line: CivSpectrumLine) => void;

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

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_POLL_INTERVAL = 200;
const COMMAND_TIMEOUT_MS = 500;
const MAX_CONSECUTIVE_ERRORS = 10;
const ASSEMBLY_TIMEOUT_MS = 500;

// ─── IcomSerialBackend ────────────────────────────────────────────────────────

export class IcomSerialBackend {
  private readonly config: Required<IcomSerialConfig>;
  private readonly addr: CivAddress;
  private serial: SerialPort | null = null;
  private frameParser = new CivFrameParser();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private pendingCommand: PendingCommand | null = null;
  private consecutiveErrors = 0;
  private _isConnected = false;

  // Last known state for change detection
  private lastStatus: RigStatus | null = null;
  private lastSmeterDbm: number | null = null;

  // Spectrum assembly
  private assembly: LineAssembly | null = null;
  private assemblyTimer: ReturnType<typeof setTimeout> | null = null;
  private spectrumEnabled = false;

  // Audio capture (resolved from USB audio device)
  private audioCapture: AudioCapture | null = null;
  private audioPcmDispose: (() => void) | null = null;
  private audioHandlers: Array<(samples: Int16Array, sr: number) => void> = [];

  // Event handlers
  private statusHandlers: StatusHandler[] = [];
  private smeterHandlers: SmeterHandler[] = [];
  private errorHandlers: ErrorHandler[] = [];
  private spectrumHandlers: SpectrumHandler[] = [];

  // Track which optional fields are unsupported (avoid repeated errors)
  private warnedUnsupported = new Set<string>();
  private scopeFrameCount = 0;
  private spectrumLineCount = 0;

  constructor(config: IcomSerialConfig) {
    this.config = {
      port: config.port,
      baudRate: config.baudRate,
      radioAddress: config.radioAddress,
      controllerAddress: config.controllerAddress ?? CIV_CONTROLLER_ADDR,
      pollInterval: config.pollInterval ?? DEFAULT_POLL_INTERVAL,
    };
    this.addr = {
      radio: this.config.radioAddress,
      controller: this.config.controllerAddress,
    };
  }

  // ── Public API ────────────────────────────────────────────────────────────

  get isConnected(): boolean {
    return this._isConnected;
  }

  get modelName(): string {
    return (
      ICOM_MODELS[this.config.radioAddress] ??
      `ICOM (0x${this.config.radioAddress.toString(16)})`
    );
  }

  /** Probe: try to open the serial port and get a frequency response */
  async probe(): Promise<boolean> {
    try {
      const frame = await this.openAndQuery();
      return frame !== null;
    } catch {
      return false;
    }
  }

  /** Start the backend: open serial, begin polling */
  async start(): Promise<void> {
    if (this._isConnected) return;

    this.serial = new SerialPort({
      path: this.config.port,
      baudRate: this.config.baudRate,
      autoOpen: false,
    });

    await new Promise<void>((resolve, reject) => {
      this.serial!.open((err) => {
        if (err)
          reject(
            new Error(`Failed to open ${this.config.port}: ${err.message}`),
          );
        else resolve();
      });
    });

    this.frameParser.reset();
    this.consecutiveErrors = 0;

    this.serial.on("data", (data: Buffer) => {
      this.handleIncomingData(data);
    });

    this.serial.on("error", (err: Error) => {
      this.emitError(`Serial error: ${err.message}`);
    });

    this.serial.on("close", () => {
      this._isConnected = false;
      this.stopPolling();
    });

    this._isConnected = true;
    this.startPolling();
  }

  /** Stop the backend: close serial, stop polling, stop audio */
  stop(): void {
    this.stopPolling();
    this.stopSpectrumInternal();
    this.stopAudio();

    if (this.pendingCommand) {
      clearTimeout(this.pendingCommand.timer);
      this.pendingCommand.resolve(null);
      this.pendingCommand = null;
    }

    if (this.serial) {
      try {
        this.serial.removeAllListeners();
        if (this.serial.isOpen) this.serial.close();
      } catch {
        // Ignore close errors
      }
      this.serial = null;
    }

    this.frameParser.reset();
    this._isConnected = false;
    this.lastStatus = null;
  }

  // ── Event Registration ────────────────────────────────────────────────────

  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.push(handler);
    return () => {
      const idx = this.statusHandlers.indexOf(handler);
      if (idx >= 0) this.statusHandlers.splice(idx, 1);
    };
  }

  onSmeter(handler: SmeterHandler): () => void {
    this.smeterHandlers.push(handler);
    return () => {
      const idx = this.smeterHandlers.indexOf(handler);
      if (idx >= 0) this.smeterHandlers.splice(idx, 1);
    };
  }

  onError(handler: ErrorHandler): () => void {
    this.errorHandlers.push(handler);
    return () => {
      const idx = this.errorHandlers.indexOf(handler);
      if (idx >= 0) this.errorHandlers.splice(idx, 1);
    };
  }

  onSpectrum(handler: SpectrumHandler): () => void {
    this.spectrumHandlers.push(handler);
    return () => {
      const idx = this.spectrumHandlers.indexOf(handler);
      if (idx >= 0) this.spectrumHandlers.splice(idx, 1);
    };
  }

  // ── Audio ──────────────────────────────────────────────────────────────────

  /** Subscribe to native USB audio PCM data. */
  onAudio(
    handler: (samples: Int16Array, sampleRate: number) => void,
  ): () => void {
    this.audioHandlers.push(handler);
    return () => {
      const idx = this.audioHandlers.indexOf(handler);
      if (idx >= 0) this.audioHandlers.splice(idx, 1);
    };
  }

  /**
   * Resolve the radio's USB audio device and start capturing.
   * Uses the modular audioResolver to auto-detect the correct OS device.
   */
  async startAudio(): Promise<boolean> {
    if (this.audioCapture) return true; // already running

    console.log(
      `[icom-serial] Resolving audio device for serial port ${this.config.port}`,
    );
    const match = await resolveAudioDevice(this.config.port, "ICOM");
    if (!match) {
      console.warn(
        "[icom-serial] No audio device found — resolveAudioDevice returned null",
      );
      return false;
    }

    console.log(
      `[icom-serial] Audio device resolved: ${match.deviceName} (${match.deviceId}) via ${match.matchMethod}`,
    );

    this.audioCapture = new AudioCapture({
      device: match.deviceId,
      sampleRate: 48000,
    });

    this.audioPcmDispose = this.audioCapture.onPcm((samples, sr) => {
      for (const handler of this.audioHandlers) {
        try {
          handler(samples, sr);
        } catch {
          // Swallow handler errors
        }
      }
    });

    this.audioCapture.start();
    return true;
  }

  /** Stop native USB audio capture. */
  stopAudio(): void {
    if (this.audioPcmDispose) {
      this.audioPcmDispose();
      this.audioPcmDispose = null;
    }
    if (this.audioCapture) {
      this.audioCapture.stop();
      this.audioCapture = null;
    }
  }

  // ── Rig Control Commands ──────────────────────────────────────────────────

  async setFrequency(hz: number): Promise<void> {
    await this.sendAndWaitOk(setFrequency(this.addr, hz));
  }

  async setMode(mode: string, _passband?: number): Promise<void> {
    await this.sendAndWaitOk(setMode(this.addr, mode));
  }

  async setPTT(on: boolean): Promise<void> {
    await this.sendAndWaitOk(setPtt(this.addr, on));
  }

  async setVFO(vfo: "A" | "B"): Promise<void> {
    await this.sendAndWaitOk(setVfo(this.addr, vfo));
  }

  async setSplit(on: boolean): Promise<void> {
    await this.sendAndWaitOk(setSplit(this.addr, on));
  }

  async setFunc(func: string, on: boolean): Promise<void> {
    await this.sendAndWaitOk(setFunction(this.addr, func, on));
  }

  async setLevel(level: string, value: number): Promise<void> {
    await this.sendAndWaitOk(setLevel(this.addr, level, value));
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
    await this.sendAndWaitOk(setAgc(this.addr, mode));
  }

  async setPassband(hz: number): Promise<void> {
    // CI-V doesn't have a direct passband command — set filter width via mode
    // For now, this is a no-op. Filter width is set implicitly via setMode.
    void hz;
  }

  async setAntenna(index: string): Promise<void> {
    const port = parseInt(index, 10);
    if (!isNaN(port)) {
      await this.sendAndWaitOk(setAntenna(this.addr, port));
    }
  }

  async setRit(enabled: boolean, offsetHz?: number): Promise<void> {
    const cmd = setRit(this.addr, enabled, offsetHz);
    await this.writeRaw(cmd);
  }

  async setXit(enabled: boolean, offsetHz?: number): Promise<void> {
    const cmd = setXit(this.addr, enabled, offsetHz);
    await this.writeRaw(cmd);
  }

  async setAnf(enabled: boolean): Promise<void> {
    await this.sendAndWaitOk(setFunction(this.addr, "ANF", enabled));
  }

  async setQsk(enabled: boolean): Promise<void> {
    await this.sendAndWaitOk(setFunction(this.addr, "BKIN", enabled));
  }

  async setVox(enabled: boolean): Promise<void> {
    await this.sendAndWaitOk(setFunction(this.addr, "VOX", enabled));
  }

  async setCwSpeed(wpm: number): Promise<void> {
    await this.sendAndWaitOk(setCwSpeed(this.addr, wpm));
  }

  async setIfShift(hz: number): Promise<void> {
    await this.sendAndWaitOk(setIfShift(this.addr, hz));
  }

  // ── Spectrum Control ──────────────────────────────────────────────────────

  async startSpectrum(): Promise<void> {
    this.spectrumEnabled = true;
    console.log(
      `[icom-serial] Starting spectrum (scope enable cmd 0x27 sub 0x10) for addr 0x${this.addr.radio.toString(16)}`,
    );
    try {
      await this.sendAndWaitOk(startScope(this.addr));
      console.log("[icom-serial] Scope enable OK — waiting for scope frames");
    } catch (err: unknown) {
      console.error(
        `[icom-serial] Scope enable FAILED: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  }

  async stopSpectrum(): Promise<void> {
    this.spectrumEnabled = false;
    this.stopSpectrumInternal();
    await this.sendAndWaitOk(stopScope(this.addr));
  }

  // ── Internal: Incoming Data ───────────────────────────────────────────────

  private handleIncomingData(data: Buffer): void {
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

    // OK/NG responses always match
    if (frame.isOk || frame.isNg) return true;

    // Data response: command must match
    if (frame.command === this.pendingCommand.expectedCmd) {
      // If sub-command is specified, it must also match
      if (
        this.pendingCommand.expectedSub !== undefined &&
        frame.subCommand !== this.pendingCommand.expectedSub
      ) {
        return false;
      }
      return true;
    }

    return false;
  }

  /** Handle unsolicited CI-V frames (frequency changes from front panel, scope data) */
  private handleUnsolicitedFrame(frame: CivFrame): void {
    // Scope wave data
    if (
      frame.command === CivCmd.SCOPE_DATA &&
      frame.subCommand === CIV_SCOPE_SUB.WAVE_DATA &&
      this.spectrumEnabled
    ) {
      this.scopeFrameCount++;
      if (this.scopeFrameCount <= 3) {
        console.log(
          `[icom-serial] Scope frame #${this.scopeFrameCount} received (${frame.data.length} bytes)`,
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
            this.handleScopePixels(scopeData, seq, seqMax);
          }
        }
      }
      return;
    }

    // Unsolicited frequency change (echoed as cmd 0x00 or 0x03 from radio)
    if (frame.command === 0x00 || frame.command === CivCmd.READ_FREQ) {
      if (frame.data.length >= 5) {
        const freq = decodeBcdFrequency(frame.data, 0);
        if (freq > 0 && this.lastStatus) {
          this.lastStatus = { ...this.lastStatus, frequency: freq };
          this.emitStatus(this.lastStatus);
        }
      }
    }

    // Unsolicited mode change (echoed as cmd 0x01 or 0x04)
    if (frame.command === 0x01 || frame.command === CivCmd.READ_MODE) {
      if (frame.data.length >= 1) {
        const modeByte = frame.data[0];
        const mode = CIV_MODE_TO_STRING[modeByte];
        if (mode && this.lastStatus) {
          this.lastStatus = { ...this.lastStatus, mode };
          this.emitStatus(this.lastStatus);
        }
      }
    }
  }

  // ── Internal: Polling ─────────────────────────────────────────────────────

  private startPolling(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => {
      void this.pollCycle();
    }, this.config.pollInterval);
    // Run first poll immediately
    void this.pollCycle();
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private pollCount = 0;

  private async pollCycle(): Promise<void> {
    if (!this._isConnected || !this.serial?.isOpen) return;

    this.pollCount++;
    const isDebugPoll = this.pollCount <= 3 || this.pollCount % 50 === 0;

    try {
      const status = await this.readFullStatus();
      this.consecutiveErrors = 0;

      if (isDebugPoll) {
        console.log(
          `[icom-serial] Poll #${this.pollCount}: freq=${status.frequency ?? "?"} mode=${status.mode ?? "?"} smeter=${status.smeter !== undefined ? status.smeter.toFixed(1) : "null"} ptt=${status.ptt ?? "?"}`,
        );
      }

      // Emit S-meter separately (always changes)
      if (status.smeter !== undefined) {
        const dbm = status.smeter;
        if (dbm !== this.lastSmeterDbm) {
          this.lastSmeterDbm = dbm;
          this.emitSmeter(dbm);
        }
      }

      // Emit status if anything changed (excluding smeter)
      if (this.hasStatusChanged(status)) {
        this.lastStatus = status;
        this.emitStatus(status);
      }
    } catch (err) {
      this.consecutiveErrors++;
      if (isDebugPoll || this.consecutiveErrors <= 3) {
        console.warn(
          `[icom-serial] Poll #${this.pollCount} error (${this.consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      if (this.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        this.emitError(
          `Too many consecutive errors (${this.consecutiveErrors}), disconnecting`,
        );
        this.stop();
      }
    }
  }

  private async readFullStatus(): Promise<RigStatus> {
    const status: RigStatus = { connected: true };

    // Frequency (required)
    const freqFrame = await this.sendCommand(readFrequency(this.addr));
    if (freqFrame) {
      const freq = parseFrequencyResponse(freqFrame);
      if (freq !== null) status.frequency = freq;
    }

    // Mode (required)
    const modeFrame = await this.sendCommand(readMode(this.addr));
    if (modeFrame) {
      const result = parseModeResponse(modeFrame);
      if (result) status.mode = result.mode;
    }

    // PTT
    const pttFrame = await this.sendCommand(readPtt(this.addr));
    if (pttFrame) {
      const ptt = parsePttResponse(pttFrame);
      if (ptt !== null) status.ptt = ptt;
    }

    // S-meter
    const smeterFrame = await this.sendCommand(readSmeter(this.addr));
    if (smeterFrame) {
      // Debug: log raw frame bytes to diagnose MK2 meter format
      if (smeterFrame.data.length >= 3) {
        const hexBytes = Buffer.from(smeterFrame.data).toString("hex");
        const raw = parseMeterResponse(smeterFrame);
        if (raw !== null) {
          if (raw > 241 && !this.warnedUnsupported.has("SMETER_RANGE")) {
            this.warnedUnsupported.add("SMETER_RANGE");
            console.warn(
              `[icom-serial] S-meter raw=${raw} exceeds max 241 (frame: ${hexBytes}), clamping`,
            );
          }
          status.smeter = rawSmeterToDbm(raw);
        }
      }
    }

    // TX metering (only when transmitting)
    if (status.ptt) {
      const txMeter: NonNullable<RigStatus["txMeter"]> = {};

      const pwrFrame = await this.sendCommand(readPowerMeter(this.addr));
      if (pwrFrame) {
        const raw = parseMeterResponse(pwrFrame);
        if (raw !== null) txMeter.powerW = (raw / 241) * 100; // Scale to watts
      }

      const swrFrame = await this.sendCommand(readSwrMeter(this.addr));
      if (swrFrame) {
        const raw = parseMeterResponse(swrFrame);
        if (raw !== null) txMeter.swr = 1 + (raw / 241) * 2; // 1.0 to 3.0 scale
      }

      const alcFrame = await this.sendCommand(readAlcMeter(this.addr));
      if (alcFrame) {
        const raw = parseMeterResponse(alcFrame);
        if (raw !== null) txMeter.alc = raw / 241;
      }

      status.txMeter = txMeter;
    }

    // Split
    const splitFrame = await this.sendCommand(readSplit(this.addr));
    if (splitFrame) {
      const split = parseSplitResponse(splitFrame);
      if (split !== null) status.split = split;
    }

    // RIT
    await this.pollOptional("RIT", async () => {
      const ritFrame = await this.sendCommand(readRit(this.addr));
      if (ritFrame) {
        const enabled = parseRitXitEnableResponse(ritFrame);
        if (enabled !== null) {
          const offsetFrame = await this.sendCommand(
            readRitXitOffset(this.addr),
          );
          const offsetHz = offsetFrame
            ? (parseRitXitOffsetResponse(offsetFrame) ?? 0)
            : 0;
          status.rit = { enabled, offsetHz };
        }
      }
    });

    // XIT
    await this.pollOptional("XIT", async () => {
      const xitFrame = await this.sendCommand(readXit(this.addr));
      if (xitFrame) {
        const enabled = parseRitXitEnableResponse(xitFrame);
        if (enabled !== null) {
          status.xit = { enabled, offsetHz: status.rit?.offsetHz ?? 0 };
        }
      }
    });

    // ANF
    await this.pollOptional("ANF", async () => {
      const frame = await this.sendCommand(readFunction(this.addr, "ANF"));
      if (frame) {
        const val = parseFunctionResponse(frame);
        if (val !== null) status.anf = val;
      }
    });

    // QSK (BKIN)
    await this.pollOptional("QSK", async () => {
      const frame = await this.sendCommand(readFunction(this.addr, "BKIN"));
      if (frame) {
        const val = parseFunctionResponse(frame);
        if (val !== null) status.qsk = val;
      }
    });

    // VOX
    await this.pollOptional("VOX", async () => {
      const frame = await this.sendCommand(readFunction(this.addr, "VOX"));
      if (frame) {
        const val = parseFunctionResponse(frame);
        if (val !== null) status.vox = val;
      }
    });

    // AGC
    await this.pollOptional("AGC", async () => {
      const frame = await this.sendCommand(readFunction(this.addr, "AGC"));
      if (frame) {
        const val = parseAgcResponse(frame);
        if (val !== null) status.agcMode = val;
      }
    });

    // CW Speed
    await this.pollOptional("KEYSPD", async () => {
      const frame = await this.sendCommand(readLevel(this.addr, "KEYSPD"));
      if (frame) {
        const val = parseLevelResponse(frame);
        if (val !== null) status.cwSpeed = val;
      }
    });

    // IF Shift
    await this.pollOptional("IF_SHIFT", async () => {
      const frame = await this.sendCommand(readLevel(this.addr, "IF_SHIFT"));
      if (frame) {
        const raw = parseLevelResponse(frame);
        if (raw !== null) status.ifShift = parseIfShiftResponse(raw);
      }
    });

    return status;
  }

  /** Poll an optional field, suppressing repeated errors for unsupported features */
  private async pollOptional(
    name: string,
    fn: () => Promise<void>,
  ): Promise<void> {
    if (this.warnedUnsupported.has(name)) return;
    try {
      await fn();
    } catch {
      this.warnedUnsupported.add(name);
    }
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

  // ── Internal: Command Queue ───────────────────────────────────────────────

  /**
   * Send a CI-V frame and wait for the response.
   * Returns the response frame, or null on timeout/error.
   */
  private sendCommand(frame: Buffer): Promise<CivFrame | null> {
    if (!this._isConnected || !this.serial?.isOpen) {
      return Promise.resolve(null);
    }

    // Extract expected command byte from the frame
    // Frame format: FE FE [to] [from] [cmd] [sub?] ... FD
    const cmd = frame[4]; // command byte
    const sub = frame.length > 6 ? frame[5] : undefined; // sub-command if present

    return new Promise((resolve) => {
      // If there's already a pending command, reject it
      if (this.pendingCommand) {
        clearTimeout(this.pendingCommand.timer);
        this.pendingCommand.resolve(null);
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
        resolve,
        timer,
      };

      this.serial!.write(frame, (err) => {
        if (err) {
          if (this.pendingCommand?.timer === timer) {
            clearTimeout(timer);
            this.pendingCommand = null;
          }
          resolve(null);
        }
      });
    });
  }

  /** Send a command and only wait for OK/NG acknowledgment */
  private async sendAndWaitOk(frame: Buffer): Promise<boolean> {
    const response = await this.sendCommand(frame);
    return response?.isOk ?? false;
  }

  /** Write raw bytes without waiting for response (for multi-frame commands like RIT/XIT) */
  private writeRaw(data: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.serial?.isOpen) {
        reject(new Error("Serial port not open"));
        return;
      }
      this.serial.write(data, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /** Open serial port temporarily to probe for a radio (used by probe()) */
  private async openAndQuery(): Promise<CivFrame | null> {
    const port = new SerialPort({
      path: this.config.port,
      baudRate: this.config.baudRate,
      autoOpen: false,
    });

    return new Promise((resolve) => {
      let resolved = false;
      const parser = new CivFrameParser();

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          try {
            port.close();
          } catch {
            // ignore
          }
          resolve(null);
        }
      }, 2000);

      port.on("data", (data: Buffer) => {
        const frames = parser.append(data);
        for (const frame of frames) {
          if ((frame.command === CivCmd.READ_FREQ || frame.isOk) && !resolved) {
            resolved = true;
            clearTimeout(timer);
            try {
              port.close();
            } catch {
              // ignore
            }
            resolve(frame);
            return;
          }
        }
      });

      port.on("error", () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve(null);
        }
      });

      port.open((err) => {
        if (err) {
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            resolve(null);
          }
          return;
        }
        const cmd = readFrequency(this.addr);
        port.write(cmd);
      });
    });
  }

  // ── Internal: Spectrum Assembly ───────────────────────────────────────────

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

  private handleScopePixels(
    scopeData: Buffer,
    seq: number,
    _seqMax: number,
  ): void {
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
    if (this.assemblyTimer) {
      clearTimeout(this.assemblyTimer);
      this.assemblyTimer = null;
    }

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

    this.assembly = null;
    this.emitSpectrumLine(line);
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

  private stopSpectrumInternal(): void {
    if (this.assemblyTimer) {
      clearTimeout(this.assemblyTimer);
      this.assemblyTimer = null;
    }
    this.assembly = null;
    this.spectrumEnabled = false;
  }

  // ── Internal: Event Emission ──────────────────────────────────────────────

  private emitStatus(status: RigStatus): void {
    for (const handler of this.statusHandlers) {
      try {
        handler(status);
      } catch {
        // Swallow handler errors
      }
    }
  }

  private emitSmeter(dbm: number): void {
    for (const handler of this.smeterHandlers) {
      try {
        handler(dbm);
      } catch {
        // Swallow
      }
    }
  }

  private emitError(msg: string): void {
    for (const handler of this.errorHandlers) {
      try {
        handler(msg);
      } catch {
        // Swallow
      }
    }
  }

  private emitSpectrumLine(line: CivSpectrumLine): void {
    this.spectrumLineCount++;
    if (this.spectrumLineCount <= 3 || this.spectrumLineCount % 100 === 0) {
      console.log(
        `[icom-serial] Spectrum line #${this.spectrumLineCount}: center=${(line.centerHz / 1e6).toFixed(3)}MHz span=${(line.spanHz / 1e3).toFixed(0)}kHz bins=${line.pixels.length} handlers=${this.spectrumHandlers.length}`,
      );
    }
    for (const handler of this.spectrumHandlers) {
      try {
        handler(line);
      } catch {
        // Swallow
      }
    }
  }
}
