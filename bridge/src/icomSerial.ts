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
  setMode,
  setPtt,
  readLevel,
  setLevel,
  readFunction,
  setFunction,
  setAgc,
  setVfo,
  setSplit,
  setRit,
  setXit,
  setCwSpeed,
  setIfShift,
  startScope,
  stopScope,
  startScopeDataOutput,
  stopScopeDataOutput,
  setAntenna,
  parseLevelResponse,
  parseFunctionResponse,
} from "./civ/commands.js";
import {
  type CivAddress,
  CivCmd,
  CIV_CONTROLLER_ADDR,
  ICOM_MODELS,
} from "./civ/types.js";
import { CivSession } from "./civ/session.js";
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

// ─── Event Handler Types ──────────────────────────────────────────────────────

type StatusHandler = (status: RigStatus) => void;
type SmeterHandler = (dbm: number) => void;
type ErrorHandler = (error: string) => void;
type SpectrumHandler = (line: CivSpectrumLine) => void;

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_POLL_INTERVAL = 200;

// ─── IcomSerialBackend ────────────────────────────────────────────────────────

export class IcomSerialBackend {
  private readonly config: Required<IcomSerialConfig>;
  private readonly addr: CivAddress;
  private serial: SerialPort | null = null;
  private readonly session: CivSession;
  private _isConnected = false;

  // Audio capture (resolved from USB audio device)
  private audioCapture: AudioCapture | null = null;
  private audioPcmDispose: (() => void) | null = null;
  private audioHandlers: Array<(samples: Int16Array, sr: number) => void> = [];

  // Event handlers
  private statusHandlers: StatusHandler[] = [];
  private smeterHandlers: SmeterHandler[] = [];
  private errorHandlers: ErrorHandler[] = [];
  private spectrumHandlers: SpectrumHandler[] = [];

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
    this.session = new CivSession(
      {
        logTag: "icom-serial",
        isReady: () => this._isConnected && this.serial?.isOpen === true,
        write: (frame, done) => {
          if (!this.serial?.isOpen) {
            done(new Error("Serial port not open"));
            return;
          }
          this.serial.write(frame, done);
        },
      },
      {
        onSpectrumLine: (line) => this.emitSpectrumLine(line),
        onStatus: (status) => this.emitStatus(status),
        onSmeter: (dbm) => this.emitSmeter(dbm),
        onFatalPollError: (message) => {
          this.emitError(message);
          this.stop();
        },
      },
      this.addr,
    );
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

    this.session.resetParser();

    this.serial.on("data", (data: Buffer) => {
      this.session.handleIncomingData(data);
    });

    this.serial.on("error", (err: Error) => {
      this.emitError(`Serial error: ${err.message}`);
    });

    this.serial.on("close", () => {
      this._isConnected = false;
      this.session.stopPolling();
    });

    this._isConnected = true;
    this.session.startPolling(this.config.pollInterval);
  }

  /** Stop the backend: close serial, stop polling, stop audio */
  stop(): void {
    this.session.stopPolling();
    this.session.resetSpectrum();
    this.stopAudio();
    this.session.resetPollState();

    this.session.cancelPending();

    if (this.serial) {
      try {
        this.serial.removeAllListeners();
        if (this.serial.isOpen) this.serial.close();
      } catch {
        // Ignore close errors
      }
      this.serial = null;
    }

    this.session.resetParser();
    this._isConnected = false;
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
    if (this.audioCapture) {
      if (this.audioCapture.isRunning()) return true;
      // Stale capture object from a prior ffmpeg failure — recreate it.
      this.stopAudio();
    }

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
    await this.session.sendAndWaitOk(
      setFrequency(this.addr, hz),
      "Set frequency",
    );
  }

  async setMode(mode: string, _passband?: number): Promise<void> {
    await this.session.sendAndWaitOk(setMode(this.addr, mode), "Set mode");
  }

  async setPTT(on: boolean): Promise<void> {
    await this.session.sendAndWaitOk(setPtt(this.addr, on), "Set PTT");
  }

  async setVFO(vfo: "A" | "B"): Promise<void> {
    await this.session.sendAndWaitOk(setVfo(this.addr, vfo), "Set VFO");
  }

  async setSplit(on: boolean): Promise<void> {
    await this.session.sendAndWaitOk(setSplit(this.addr, on), "Set split");
  }

  async setFunc(func: string, on: boolean): Promise<void> {
    await this.session.sendAndWaitOk(
      setFunction(this.addr, func, on),
      `Set function ${func}`,
    );
  }

  async setLevel(level: string, value: number): Promise<void> {
    await this.session.sendAndWaitOk(
      setLevel(this.addr, level, value),
      `Set level ${level}`,
    );
  }

  async getLevel(level: string): Promise<number> {
    const frame = await this.session.sendCommand(readLevel(this.addr, level));
    if (!frame) return 0;
    return parseLevelResponse(frame) ?? 0;
  }

  async getFunc(func: string): Promise<boolean> {
    const frame = await this.session.sendCommand(readFunction(this.addr, func));
    if (!frame) return false;
    return parseFunctionResponse(frame) ?? false;
  }

  async setAgc(mode: number): Promise<void> {
    await this.session.sendAndWaitOk(setAgc(this.addr, mode), "Set AGC");
  }

  async setPassband(hz: number): Promise<void> {
    // ICOM radios select filter width via the mode command with a filter number
    // (1=FIL1 widest, 2=FIL2 medium, 3=FIL3 narrowest).
    // Re-send the current mode with the appropriate filter selection.
    const currentMode = this.session.getLastStatus()?.mode;
    if (!currentMode) return;

    const isCw = currentMode === "CW" || currentMode === "CW-R";
    const isRtty = currentMode === "RTTY" || currentMode === "RTTY-R";
    let filter: number;

    if (isCw || isRtty) {
      // CW/RTTY filters: FIL1=500Hz, FIL2=250Hz, FIL3=50-100Hz
      filter = hz >= 400 ? 1 : hz >= 150 ? 2 : 3;
    } else {
      // SSB/AM/FM/DV: FIL1=wide, FIL2=medium, FIL3=narrow
      filter = hz >= 2000 ? 1 : hz >= 1000 ? 2 : 3;
    }

    await this.session.sendAndWaitOk(
      setMode(this.addr, currentMode, filter),
      "Set passband",
    );
  }

  async setAntenna(index: string): Promise<void> {
    const port = parseInt(index, 10);
    if (!isNaN(port)) {
      await this.session.sendAndWaitOk(
        setAntenna(this.addr, port),
        "Set antenna",
      );
    }
  }

  async setRit(enabled: boolean, offsetHz?: number): Promise<void> {
    const cmd = setRit(this.addr, enabled, offsetHz);
    await this.session.sendRaw(cmd);
  }

  async setXit(enabled: boolean, offsetHz?: number): Promise<void> {
    const cmd = setXit(this.addr, enabled, offsetHz);
    await this.session.sendRaw(cmd);
  }

  async setAnf(enabled: boolean): Promise<void> {
    await this.session.sendAndWaitOk(
      setFunction(this.addr, "ANF", enabled),
      "Set ANF",
    );
  }

  async setQsk(enabled: boolean): Promise<void> {
    await this.session.sendAndWaitOk(
      setFunction(this.addr, "BKIN", enabled),
      "Set QSK",
    );
  }

  async setVox(enabled: boolean): Promise<void> {
    await this.session.sendAndWaitOk(
      setFunction(this.addr, "VOX", enabled),
      "Set VOX",
    );
  }

  async setCwSpeed(wpm: number): Promise<void> {
    await this.session.sendAndWaitOk(
      setCwSpeed(this.addr, wpm),
      "Set CW speed",
    );
  }

  async setIfShift(hz: number): Promise<void> {
    await this.session.sendAndWaitOk(setIfShift(this.addr, hz), "Set IF shift");
  }

  // ── Spectrum Control ──────────────────────────────────────────────────────

  async startSpectrum(): Promise<void> {
    this.session.setSpectrumEnabled(true);
    console.log(
      `[icom-serial] Starting spectrum for addr 0x${this.addr.radio.toString(16)}`,
    );
    try {
      // Step 1: Turn scope display ON (0x27 0x10 0x01)
      await this.session.sendAndWaitOk(
        startScope(this.addr),
        "Enable scope display",
      );
      console.log("[icom-serial] Scope ON (0x27 0x10 0x01) — OK");

      // Step 2: Enable CI-V scope data output (0x27 0x11 0x01)
      // Without this, the scope turns on visually but doesn't stream data over CI-V.
      await this.session.sendAndWaitOk(
        startScopeDataOutput(this.addr),
        "Enable scope data output",
      );
      console.log(
        "[icom-serial] Scope Data Output ON (0x27 0x11 0x01) — OK, waiting for frames",
      );
    } catch (err: unknown) {
      console.error(
        `[icom-serial] Scope enable FAILED: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  }

  async stopSpectrum(): Promise<void> {
    this.session.setSpectrumEnabled(false);
    // Disable data output first, then scope display
    await this.session.sendAndWaitOk(
      stopScopeDataOutput(this.addr),
      "Disable scope data output",
    );
    await this.session.sendAndWaitOk(
      stopScope(this.addr),
      "Disable scope display",
    );
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
    for (const handler of this.spectrumHandlers) {
      try {
        handler(line);
      } catch {
        // Swallow
      }
    }
  }
}
