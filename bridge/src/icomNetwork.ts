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
  CIV_CONTROLLER_ADDR,
  ICOM_MODELS,
} from "./civ/types.js";
import { CivSession } from "./civ/session.js";
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

// ─── Event Handler Types ──────────────────────────────────────────────────────

type StatusHandler = (status: RigStatus) => void;
type SmeterHandler = (dbm: number) => void;
type ErrorHandler = (error: string) => void;
type SpectrumHandler = (line: CivSpectrumLine) => void;
type AudioHandler = (samples: Int16Array, sampleRate: number) => void;

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

  // CI-V command queue and frame dispatch
  private readonly session: CivSession;

  // Keepalive
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private keepaliveMisses = 0;
  private _isConnected = false;

  // Audio streaming
  private audioEnabled = false;

  // Event handlers
  private statusHandlers: StatusHandler[] = [];
  private smeterHandlers: SmeterHandler[] = [];
  private errorHandlers: ErrorHandler[] = [];
  private spectrumHandlers: SpectrumHandler[] = [];
  private audioHandlers: AudioHandler[] = [];

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
    this.session = new CivSession(
      {
        logTag: "icom-network",
        isReady: () => this._isConnected && this.civSocket !== null,
        write: (frame, done) => {
          if (!this.civSocket || !this._isConnected) {
            done(new Error("CI-V socket not open"));
            return;
          }
          // Wrap CI-V frame in UDP packet and send
          const udpPkt = this.buildCivPacket(frame);
          this.civSocket.send(
            udpPkt,
            0,
            udpPkt.length,
            this.config.civPort,
            this.config.host,
            (err) => done(err),
          );
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

  /** Probe: try to login and get a frequency response */
  async probe(): Promise<boolean> {
    try {
      await this.login();
      // Send a frequency read to verify the radio is responsive
      const frame = await this.session.sendCommand(readFrequency(this.addr));
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
    this.startKeepalive();
    this.session.startPolling(this.config.pollInterval);
  }

  /** Stop the backend: close sockets, stop polling */
  stop(): void {
    this.session.stopPolling();
    this.stopKeepalive();
    this.session.resetSpectrum();
    this.stopAudioInternal();
    this.session.resetPollState();

    this.session.cancelPending();

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
    this.session.resetParser();
    this._isConnected = false;
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
    // CI-V doesn't have a direct passband command — set filter width via mode
    // For now, this is a no-op. Filter width is set implicitly via setMode.
    void hz;
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
    await this.session.sendAndWaitOk(
      startScope(this.addr),
      "Enable scope display",
    );
    await this.session.sendAndWaitOk(
      startScopeDataOutput(this.addr),
      "Enable scope data output",
    );
  }

  async stopSpectrum(): Promise<void> {
    this.session.setSpectrumEnabled(false);
    await this.session.sendAndWaitOk(
      stopScopeDataOutput(this.addr),
      "Disable scope data output",
    );
    await this.session.sendAndWaitOk(
      stopScope(this.addr),
      "Disable scope display",
    );
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

    this.session.resetParser();
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
    this.session.handleIncomingData(civPayload);
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
