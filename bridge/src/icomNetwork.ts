/**
 * ICOM Network Backend — RS-BA1 UDP Radio Control
 *
 * Communicates with ICOM radios over the network using ICOM's RS-BA1 protocol,
 * which uses 3 UDP channels:
 *   - Control (port 50001): Login/logout, keepalive, radio discovery
 *   - CI-V    (port 50002): CI-V commands wrapped in UDP packets
 *   - Audio   (port 50003): PCM audio stream
 *
 * This is the network counterpart to IcomSerialBackend, sharing the same
 * CI-V command builders and frame parser. Enables control of ICOM radios
 * over LAN without a USB cable.
 *
 * Based on reverse-engineering from wfview project.
 *
 * Features:
 * - Full rig control: frequency, mode, PTT, VFO, split, levels, functions
 * - Spectrum/waterfall data from CI-V scope output
 * - Half-duplex command queue with timeouts
 * - Handles unsolicited CI-V frames (front-panel changes, scope data)
 * - S-meter, SWR, ALC, power metering
 * - Network audio streaming (LPCM 16-bit LE)
 * - Automatic keepalive and reconnection
 */

import dgram from "node:dgram";
import { CivFrameParser, type CivFrame } from "./civ/codec.js";
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
  startScopeDataOutput,
  stopScopeDataOutput,
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

export interface IcomNetworkConfig {
  /** Radio hostname or IP address */
  host: string;
  /** Control channel port (default 50001) */
  controlPort?: number;
  /** CI-V channel port (default 50002) */
  civPort?: number;
  /** Audio channel port (default 50003) */
  audioPort?: number;
  /** RS-BA1 username (16 chars max, null-padded) */
  username: string;
  /** RS-BA1 password (16 chars max, null-padded) */
  password: string;
  /** Radio's CI-V address (default 0x94 for IC-7300) */
  radioAddress?: number;
  /** Controller address (default 0xE0) */
  controllerAddress?: number;
  /** Poll interval in ms (default 200) */
  pollInterval?: number;
}

// ─── RS-BA1 Protocol Constants ───────────────────────────────────────────────

const DEFAULT_CONTROL_PORT = 50001;
const DEFAULT_CIV_PORT = 50002;
const DEFAULT_AUDIO_PORT = 50003;
const DEFAULT_POLL_INTERVAL = 200;

/** Keepalive interval for the control channel (ms) */
const KEEPALIVE_INTERVAL_MS = 500;

/** Timeout for waiting on CI-V command responses (ms) */
const COMMAND_TIMEOUT_MS = 500;

/** Max consecutive errors before disconnecting */
const MAX_CONSECUTIVE_ERRORS = 10;

/** Timeout for discarding incomplete spectrum assemblies (ms) */
const ASSEMBLY_TIMEOUT_MS = 500;

/** Login timeout (ms) */
const LOGIN_TIMEOUT_MS = 5000;

/** Keepalive miss count before reconnect attempt */
const MAX_KEEPALIVE_MISSES = 5;

/** Minimum UDP packet header size */
const UDP_HEADER_SIZE = 7;

/** RS-BA1 packet types */
const PKT_TYPE = {
  CONTROL: 0x00,
  CIV: 0x01,
  AUDIO: 0x04,
  LOGIN_REQ: 0x05,
  LOGIN_RESP: 0x06,
} as const;

/** Default audio sample rate */
const DEFAULT_AUDIO_SAMPLE_RATE = 48000;
const OPTIONAL_POLL_INTERVAL_CYCLES = 5;

// ─── Command Queue Types ──────────────────────────────────────────────────────

interface PendingCommand {
  /** The CI-V command byte we're waiting for a response to */
  expectedCmd: number;
  /** Optional sub-command for more specific matching */
  expectedSub?: number;
  /** Whether this command expects an ACK/NG or a data response frame */
  responseKind: "ack" | "data";
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
type AudioHandler = (samples: Int16Array, sampleRate: number) => void;

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

// ─── IcomNetworkBackend ──────────────────────────────────────────────────────

export class IcomNetworkBackend {
  private readonly config: {
    host: string;
    controlPort: number;
    civPort: number;
    audioPort: number;
    username: string;
    password: string;
    radioAddress: number;
    controllerAddress: number;
    pollInterval: number;
  };
  private readonly addr: CivAddress;

  // UDP sockets
  private controlSocket: dgram.Socket | null = null;
  private civSocket: dgram.Socket | null = null;
  private audioSocket: dgram.Socket | null = null;

  // Session state
  private sessionSentId = 0;
  private sessionRcvdId = 0;
  private civSeq = 0;
  private controlSeq = 0;

  // CI-V frame parser
  private frameParser = new CivFrameParser();

  // Polling and keepalive
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private pollInFlight = false;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private keepaliveMisses = 0;
  private pendingCommand: PendingCommand | null = null;
  private consecutiveErrors = 0;
  private _isConnected = false;
  private commandQueue: Promise<void> = Promise.resolve();

  // Last known state for change detection
  private lastStatus: RigStatus | null = null;
  private lastSmeterDbm: number | null = null;

  // Spectrum assembly
  private assembly: LineAssembly | null = null;
  private assemblyTimer: ReturnType<typeof setTimeout> | null = null;
  private spectrumEnabled = false;

  // Audio streaming
  private audioEnabled = false;

  // Event handlers
  private statusHandlers: StatusHandler[] = [];
  private smeterHandlers: SmeterHandler[] = [];
  private errorHandlers: ErrorHandler[] = [];
  private spectrumHandlers: SpectrumHandler[] = [];
  private audioHandlers: AudioHandler[] = [];

  // Track which optional fields are unsupported (avoid repeated errors)
  private warnedUnsupported = new Set<string>();

  constructor(config: IcomNetworkConfig) {
    this.config = {
      host: config.host,
      controlPort: config.controlPort ?? DEFAULT_CONTROL_PORT,
      civPort: config.civPort ?? DEFAULT_CIV_PORT,
      audioPort: config.audioPort ?? DEFAULT_AUDIO_PORT,
      username: config.username,
      password: config.password,
      radioAddress: config.radioAddress ?? 0x94,
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

  /** Probe: try to login and get a frequency response */
  async probe(): Promise<boolean> {
    try {
      await this.login();
      // Send a frequency read to verify the radio is responsive
      const frame = await this.sendCommand(readFrequency(this.addr));
      this.closeAllSockets();
      return frame !== null;
    } catch {
      this.closeAllSockets();
      return false;
    }
  }

  /** Start the backend: login, begin polling and keepalive */
  async start(): Promise<void> {
    if (this._isConnected) return;

    await this.login();
    this._isConnected = true;
    this.consecutiveErrors = 0;
    this.startKeepalive();
    this.startPolling();
  }

  /** Stop the backend: close sockets, stop polling */
  stop(): void {
    this.stopPolling();
    this.stopKeepalive();
    this.stopSpectrumInternal();
    this.stopAudioInternal();
    this.pollInFlight = false;

    if (this.pendingCommand) {
      clearTimeout(this.pendingCommand.timer);
      this.pendingCommand.resolve(null);
      this.pendingCommand = null;
    }

    // Send logout packet before closing
    if (this.controlSocket && this._isConnected) {
      try {
        const logoutPkt = this.buildControlPacket(
          Buffer.from([0x00]),
          PKT_TYPE.CONTROL,
        );
        this.controlSocket.send(
          logoutPkt,
          0,
          logoutPkt.length,
          this.config.controlPort,
          this.config.host,
        );
      } catch {
        // Ignore logout send errors
      }
    }

    this.closeAllSockets();
    this.frameParser.reset();
    this._isConnected = false;
    this.lastStatus = null;
    this.sessionSentId = 0;
    this.sessionRcvdId = 0;
    this.civSeq = 0;
    this.controlSeq = 0;
    this.keepaliveMisses = 0;
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

  onAudio(handler: AudioHandler): () => void {
    this.audioHandlers.push(handler);
    return () => {
      const idx = this.audioHandlers.indexOf(handler);
      if (idx >= 0) this.audioHandlers.splice(idx, 1);
    };
  }

  // ── Rig Control Commands ──────────────────────────────────────────────────

  async setFrequency(hz: number): Promise<void> {
    await this.sendAndWaitOk(setFrequency(this.addr, hz), "Set frequency");
  }

  async setMode(mode: string, _passband?: number): Promise<void> {
    await this.sendAndWaitOk(setMode(this.addr, mode), "Set mode");
  }

  async setPTT(on: boolean): Promise<void> {
    await this.sendAndWaitOk(setPtt(this.addr, on), "Set PTT");
  }

  async setVFO(vfo: "A" | "B"): Promise<void> {
    await this.sendAndWaitOk(setVfo(this.addr, vfo), "Set VFO");
  }

  async setSplit(on: boolean): Promise<void> {
    await this.sendAndWaitOk(setSplit(this.addr, on), "Set split");
  }

  async setFunc(func: string, on: boolean): Promise<void> {
    await this.sendAndWaitOk(
      setFunction(this.addr, func, on),
      `Set function ${func}`,
    );
  }

  async setLevel(level: string, value: number): Promise<void> {
    await this.sendAndWaitOk(
      setLevel(this.addr, level, value),
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
    await this.sendAndWaitOk(setAgc(this.addr, mode), "Set AGC");
  }

  async setPassband(hz: number): Promise<void> {
    // CI-V doesn't have a direct passband command — set filter width via mode
    // For now, this is a no-op. Filter width is set implicitly via setMode.
    void hz;
  }

  async setAntenna(index: string): Promise<void> {
    const port = parseInt(index, 10);
    if (!isNaN(port)) {
      await this.sendAndWaitOk(setAntenna(this.addr, port), "Set antenna");
    }
  }

  async setRit(enabled: boolean, offsetHz?: number): Promise<void> {
    const cmd = setRit(this.addr, enabled, offsetHz);
    await this.sendCivRaw(cmd);
  }

  async setXit(enabled: boolean, offsetHz?: number): Promise<void> {
    const cmd = setXit(this.addr, enabled, offsetHz);
    await this.sendCivRaw(cmd);
  }

  async setAnf(enabled: boolean): Promise<void> {
    await this.sendAndWaitOk(setFunction(this.addr, "ANF", enabled), "Set ANF");
  }

  async setQsk(enabled: boolean): Promise<void> {
    await this.sendAndWaitOk(
      setFunction(this.addr, "BKIN", enabled),
      "Set QSK",
    );
  }

  async setVox(enabled: boolean): Promise<void> {
    await this.sendAndWaitOk(setFunction(this.addr, "VOX", enabled), "Set VOX");
  }

  async setCwSpeed(wpm: number): Promise<void> {
    await this.sendAndWaitOk(setCwSpeed(this.addr, wpm), "Set CW speed");
  }

  async setIfShift(hz: number): Promise<void> {
    await this.sendAndWaitOk(setIfShift(this.addr, hz), "Set IF shift");
  }

  // ── Spectrum Control ──────────────────────────────────────────────────────

  async startSpectrum(): Promise<void> {
    this.spectrumEnabled = true;
    await this.sendAndWaitOk(startScope(this.addr), "Enable scope display");
    await this.sendAndWaitOk(
      startScopeDataOutput(this.addr),
      "Enable scope data output",
    );
  }

  async stopSpectrum(): Promise<void> {
    this.spectrumEnabled = false;
    this.stopSpectrumInternal();
    await this.sendAndWaitOk(
      stopScopeDataOutput(this.addr),
      "Disable scope data output",
    );
    await this.sendAndWaitOk(stopScope(this.addr), "Disable scope display");
  }

  // ── Audio Stream Control ──────────────────────────────────────────────────

  async startAudioStream(): Promise<void> {
    if (this.audioEnabled) return;
    this.audioEnabled = true;

    // Open audio socket if not already open
    if (!this.audioSocket) {
      this.audioSocket = dgram.createSocket("udp4");
      this.audioSocket.on("message", (msg: Buffer) => {
        this.handleAudioPacket(msg);
      });
      this.audioSocket.on("error", (err: Error) => {
        this.emitError(`Audio socket error: ${err.message}`);
      });
      // Bind to a random port for receiving audio
      await new Promise<void>((resolve, reject) => {
        this.audioSocket!.bind(0, () => resolve());
        this.audioSocket!.once("error", reject);
      });
    }

    // Send an audio start/connect packet to the radio
    const audioPkt = this.buildAudioConnectPacket();
    this.audioSocket.send(
      audioPkt,
      0,
      audioPkt.length,
      this.config.audioPort,
      this.config.host,
    );
  }

  stopAudioStream(): void {
    this.stopAudioInternal();
  }

  // ── Internal: RS-BA1 Login Sequence ────────────────────────────────────────

  /**
   * Perform the RS-BA1 login sequence:
   * 1. Create control UDP socket
   * 2. Send login packet with username + password
   * 3. Wait for login response with session IDs
   * 4. Create CI-V socket using session IDs
   */
  private async login(): Promise<void> {
    // Create control socket
    this.controlSocket = dgram.createSocket("udp4");

    await new Promise<void>((resolve, reject) => {
      this.controlSocket!.bind(0, () => resolve());
      this.controlSocket!.once("error", reject);
    });

    // Send login request and wait for response
    const sessionIds = await new Promise<{ sentId: number; rcvdId: number }>(
      (resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error("RS-BA1 login timed out"));
        }, LOGIN_TIMEOUT_MS);

        const onMessage = (msg: Buffer) => {
          if (msg.length < UDP_HEADER_SIZE) return;

          const pktType = msg[6];
          if (pktType === PKT_TYPE.LOGIN_RESP) {
            clearTimeout(timer);
            this.controlSocket!.removeListener("message", onMessage);

            // Extract session IDs from response
            const sentId = msg.readUInt16LE(0);
            const rcvdId = msg.readUInt16LE(2);

            resolve({ sentId: rcvdId, rcvdId: sentId });
          }
        };

        this.controlSocket!.on("message", onMessage);

        // Build and send login packet
        const loginPkt = this.buildLoginPacket();
        this.controlSocket!.send(
          loginPkt,
          0,
          loginPkt.length,
          this.config.controlPort,
          this.config.host,
          (err) => {
            if (err) {
              clearTimeout(timer);
              reject(new Error(`Login send failed: ${err.message}`));
            }
          },
        );
      },
    );

    this.sessionSentId = sessionIds.sentId;
    this.sessionRcvdId = sessionIds.rcvdId;

    // Set up control socket for keepalive responses
    this.controlSocket.on("message", (msg: Buffer) => {
      this.handleControlPacket(msg);
    });

    this.controlSocket.on("error", (err: Error) => {
      this.emitError(`Control socket error: ${err.message}`);
    });

    // Create CI-V socket
    this.civSocket = dgram.createSocket("udp4");

    await new Promise<void>((resolve, reject) => {
      this.civSocket!.bind(0, () => resolve());
      this.civSocket!.once("error", reject);
    });

    this.civSocket.on("message", (msg: Buffer) => {
      this.handleCivPacket(msg);
    });

    this.civSocket.on("error", (err: Error) => {
      this.emitError(`CI-V socket error: ${err.message}`);
    });

    this.frameParser.reset();
  }

  // ── Internal: Packet Builders ──────────────────────────────────────────────

  /**
   * Build a login packet with username and password.
   * Username and password are each 16 bytes, null-padded.
   */
  private buildLoginPacket(): Buffer {
    const userBuf = Buffer.alloc(16);
    const passBuf = Buffer.alloc(16);
    userBuf.write(this.config.username.substring(0, 16), "utf-8");
    passBuf.write(this.config.password.substring(0, 16), "utf-8");

    const header = this.buildPacketHeader(PKT_TYPE.LOGIN_REQ);
    return Buffer.concat([header, userBuf, passBuf]);
  }

  /**
   * Build a UDP packet header.
   * [u16 LE seq] [u16 LE sentId] [u16 LE rcvdId] [u8 type]
   */
  private buildPacketHeader(type: number): Buffer {
    const header = Buffer.alloc(UDP_HEADER_SIZE);
    header.writeUInt16LE(this.controlSeq++, 0);
    header.writeUInt16LE(this.sessionSentId, 2);
    header.writeUInt16LE(this.sessionRcvdId, 4);
    header[6] = type;
    return header;
  }

  /** Build a control-channel packet (keepalive, etc.) */
  private buildControlPacket(payload: Buffer, type: number): Buffer {
    const header = this.buildPacketHeader(type);
    return Buffer.concat([header, payload]);
  }

  /** Build a CI-V packet wrapping a CI-V frame for UDP transport */
  private buildCivPacket(civFrame: Buffer): Buffer {
    const header = Buffer.alloc(UDP_HEADER_SIZE + 2);
    header.writeUInt16LE(this.civSeq++, 0);
    header.writeUInt16LE(this.sessionSentId, 2);
    header.writeUInt16LE(this.sessionRcvdId, 4);
    header[6] = PKT_TYPE.CIV;
    header.writeUInt16LE(this.civSeq, 7); // inner sequence
    return Buffer.concat([header, civFrame]);
  }

  /** Build an audio connect/start packet */
  private buildAudioConnectPacket(): Buffer {
    const header = Buffer.alloc(UDP_HEADER_SIZE);
    header.writeUInt16LE(0, 0);
    header.writeUInt16LE(this.sessionSentId, 2);
    header.writeUInt16LE(this.sessionRcvdId, 4);
    header[6] = PKT_TYPE.AUDIO;
    return header;
  }

  // ── Internal: Incoming Packet Handlers ─────────────────────────────────────

  /** Handle a packet from the control channel */
  private handleControlPacket(msg: Buffer): void {
    if (msg.length < UDP_HEADER_SIZE) return;
    // Any response from the radio resets the keepalive miss counter
    this.keepaliveMisses = 0;
  }

  /** Handle a packet from the CI-V channel */
  private handleCivPacket(msg: Buffer): void {
    if (msg.length <= UDP_HEADER_SIZE) return;

    // Extract CI-V payload (skip the UDP header)
    const civPayload = msg.subarray(UDP_HEADER_SIZE);
    this.handleIncomingData(civPayload);
  }

  /** Handle a packet from the audio channel */
  private handleAudioPacket(msg: Buffer): void {
    if (msg.length <= UDP_HEADER_SIZE) return;
    if (!this.audioEnabled) return;

    const pktType = msg[6];
    if (pktType !== PKT_TYPE.AUDIO) return;

    // Audio payload starts after the header
    const audioPayload = msg.subarray(UDP_HEADER_SIZE);
    if (audioPayload.length < 2) return;

    // Convert raw bytes to Int16Array (LPCM 16-bit LE)
    const sampleCount = Math.floor(audioPayload.length / 2);
    const samples = new Int16Array(sampleCount);
    for (let i = 0; i < sampleCount; i++) {
      samples[i] = audioPayload.readInt16LE(i * 2);
    }

    this.emitAudio(samples, DEFAULT_AUDIO_SAMPLE_RATE);
  }

  // ── Internal: CI-V Data Processing ─────────────────────────────────────────

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
    // Scope wave data
    if (
      frame.command === CivCmd.SCOPE_DATA &&
      frame.subCommand === CIV_SCOPE_SUB.WAVE_DATA &&
      this.spectrumEnabled
    ) {
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
      this.triggerPollCycle();
    }, this.config.pollInterval);
    // Run first poll immediately
    this.triggerPollCycle();
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private triggerPollCycle(): void {
    if (this.pollInFlight) return;
    this.pollInFlight = true;
    void this.pollCycle().finally(() => {
      this.pollInFlight = false;
    });
  }

  private pollCount = 0;

  private async pollCycle(): Promise<void> {
    if (!this._isConnected) return;
    this.pollCount++;
    const pollOptionalFields =
      !this.lastStatus || this.pollCount % OPTIONAL_POLL_INTERVAL_CYCLES === 0;

    try {
      const status = await this.readFullStatus(pollOptionalFields);
      this.consecutiveErrors = 0;

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
    } catch {
      this.consecutiveErrors++;
      if (this.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        this.emitError(
          `Too many consecutive errors (${this.consecutiveErrors}), disconnecting`,
        );
        this.stop();
      }
    }
  }

  private async readFullStatus(
    pollOptionalFields: boolean,
  ): Promise<RigStatus> {
    const status: RigStatus = this.lastStatus
      ? { ...this.lastStatus, connected: true }
      : { connected: true };

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
      const raw = parseMeterResponse(smeterFrame);
      if (raw !== null) status.smeter = rawSmeterToDbm(raw);
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

    if (pollOptionalFields) {
      // RIT
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

      // XIT
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

      // ANF
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

      // QSK (BKIN)
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

      // VOX
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

      // AGC
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

      // CW Speed
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

      // IF Shift
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

  /** Poll an optional field, suppressing repeated errors for unsupported features */
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
          `[icom-network] Disabling optional poll ${name}: ${message}`,
        );
      } else {
        console.warn(`[icom-network] Optional poll ${name} failed: ${message}`);
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

  // ── Internal: Keepalive ─────────────────────────────────────────────────

  private startKeepalive(): void {
    if (this.keepaliveTimer) return;
    this.keepaliveTimer = setInterval(() => {
      this.sendKeepalive();
    }, KEEPALIVE_INTERVAL_MS);
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  private sendKeepalive(): void {
    if (!this.controlSocket || !this._isConnected) return;

    this.keepaliveMisses++;

    if (this.keepaliveMisses > MAX_KEEPALIVE_MISSES) {
      this.emitError("Keepalive timeout — radio not responding");
      // Attempt reconnection
      this.stop();
      return;
    }

    const keepalivePkt = this.buildControlPacket(
      Buffer.alloc(0),
      PKT_TYPE.CONTROL,
    );
    this.controlSocket.send(
      keepalivePkt,
      0,
      keepalivePkt.length,
      this.config.controlPort,
      this.config.host,
    );
  }

  // ── Internal: Command Queue ───────────────────────────────────────────────

  /**
   * Send a CI-V frame over UDP and wait for the response.
   * Returns the response frame, or null on timeout/error.
   */
  private sendCommand(
    frame: Buffer,
    responseKind: "ack" | "data" = "data",
  ): Promise<CivFrame | null> {
    if (!this._isConnected || !this.civSocket) {
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
          if (!this._isConnected || !this.civSocket) {
            resolve(null);
            return;
          }

          // Should never happen because runInCommandQueue serializes sends.
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

          // Wrap CI-V frame in UDP packet and send
          const udpPkt = this.buildCivPacket(frame);
          this.civSocket!.send(
            udpPkt,
            0,
            udpPkt.length,
            this.config.civPort,
            this.config.host,
            (err) => {
              if (err) {
                if (this.pendingCommand?.timer === timer) {
                  clearTimeout(timer);
                  this.pendingCommand = null;
                }
                resolve(null);
              }
            },
          );
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

  /** Send a command and require an explicit OK acknowledgment. */
  private async sendAndWaitOk(frame: Buffer, label: string): Promise<void> {
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

  /** Send raw CI-V bytes without waiting for response (for multi-frame commands like RIT/XIT) */
  private sendCivRaw(data: Buffer): Promise<void> {
    return this.runInCommandQueue(
      () =>
        new Promise((resolve, reject) => {
          if (!this.civSocket || !this._isConnected) {
            reject(new Error("CI-V socket not open"));
            return;
          }
          const udpPkt = this.buildCivPacket(data);
          this.civSocket.send(
            udpPkt,
            0,
            udpPkt.length,
            this.config.civPort,
            this.config.host,
            (err) => {
              if (err) reject(err);
              else resolve();
            },
          );
        }),
    );
  }

  // ── Internal: Socket Cleanup ──────────────────────────────────────────────

  private closeAllSockets(): void {
    if (this.controlSocket) {
      try {
        this.controlSocket.removeAllListeners();
        this.controlSocket.close();
      } catch {
        // Ignore close errors
      }
      this.controlSocket = null;
    }

    if (this.civSocket) {
      try {
        this.civSocket.removeAllListeners();
        this.civSocket.close();
      } catch {
        // Ignore close errors
      }
      this.civSocket = null;
    }

    if (this.audioSocket) {
      try {
        this.audioSocket.removeAllListeners();
        this.audioSocket.close();
      } catch {
        // Ignore close errors
      }
      this.audioSocket = null;
    }
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

  private stopAudioInternal(): void {
    this.audioEnabled = false;
    if (this.audioSocket) {
      try {
        this.audioSocket.removeAllListeners();
        this.audioSocket.close();
      } catch {
        // Ignore close errors
      }
      this.audioSocket = null;
    }
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

  private emitAudio(samples: Int16Array, sampleRate: number): void {
    for (const handler of this.audioHandlers) {
      try {
        handler(samples, sampleRate);
      } catch {
        // Swallow
      }
    }
  }
}
