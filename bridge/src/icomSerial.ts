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
import { readFrequency } from "./civ/commands.js";
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
    await this.session.setFrequency(hz);
  }

  async setMode(mode: string, _passband?: number): Promise<void> {
    await this.session.setMode(mode, _passband);
  }

  async setPTT(on: boolean): Promise<void> {
    await this.session.setPTT(on);
  }

  async setVFO(vfo: "A" | "B"): Promise<void> {
    await this.session.setVFO(vfo);
  }

  async setSplit(on: boolean): Promise<void> {
    await this.session.setSplit(on);
  }

  async setFunc(func: string, on: boolean): Promise<void> {
    await this.session.setFunc(func, on);
  }

  async setLevel(level: string, value: number): Promise<void> {
    await this.session.setLevel(level, value);
  }

  async getLevel(level: string): Promise<number> {
    return this.session.getLevel(level);
  }

  async getFunc(func: string): Promise<boolean> {
    return this.session.getFunc(func);
  }

  async setAgc(mode: number): Promise<void> {
    await this.session.setAgc(mode);
  }

  async setPassband(hz: number): Promise<void> {
    await this.session.setPassband(hz);
  }

  async setAntenna(index: string): Promise<void> {
    await this.session.setAntenna(index);
  }

  async setRit(enabled: boolean, offsetHz?: number): Promise<void> {
    await this.session.setRit(enabled, offsetHz);
  }

  async setXit(enabled: boolean, offsetHz?: number): Promise<void> {
    await this.session.setXit(enabled, offsetHz);
  }

  async setAnf(enabled: boolean): Promise<void> {
    await this.session.setAnf(enabled);
  }

  async setQsk(enabled: boolean): Promise<void> {
    await this.session.setQsk(enabled);
  }

  async setVox(enabled: boolean): Promise<void> {
    await this.session.setVox(enabled);
  }

  async setCwSpeed(wpm: number): Promise<void> {
    await this.session.setCwSpeed(wpm);
  }

  async setIfShift(hz: number): Promise<void> {
    await this.session.setIfShift(hz);
  }

  // ── Spectrum Control ──────────────────────────────────────────────────────

  async startSpectrum(): Promise<void> {
    await this.session.startSpectrum();
  }

  async stopSpectrum(): Promise<void> {
    await this.session.stopSpectrum();
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
