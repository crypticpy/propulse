/**
 * ProPulse Bridge — CAT (Computer Aided Transceiver) Control
 *
 * Supports two backends:
 *   1. Hamlib rigctld  — TCP text protocol on port 4533
 *   2. Flrig           — XML-RPC over HTTP on port 12345
 *
 * Auto-detects which backend is available at startup, then polls
 * the rig at 200 ms intervals for status updates.
 */

import { Socket } from "node:net";
import { request as httpRequest } from "node:http";
import type { RigStatus } from "./types.js";
import { IcomSerialBackend, type IcomSerialConfig } from "./icomSerial.js";
import { IcomNetworkBackend, type IcomNetworkConfig } from "./icomNetwork.js";
import type { CivSpectrumLine } from "./civ.js";

// ============================================================================
// Types
// ============================================================================

export type RigBackend =
  | "hamlib"
  | "flrig"
  | "icom-serial"
  | "icom-network"
  | "none";

export interface RigControllerConfig {
  /** Hamlib rigctld host (default 127.0.0.1) */
  hamlibHost?: string;
  /** Hamlib rigctld port (default 4533 — matches WFView's default) */
  hamlibPort?: number;
  /** Flrig host (default 127.0.0.1) */
  flrigHost?: string;
  /** Flrig port (default 12345) */
  flrigPort?: number;
  /** Polling interval in ms (default 200) */
  pollInterval?: number;
  /** ICOM direct serial CI-V configuration */
  icomSerial?: IcomSerialConfig;
  /** ICOM network (RS-BA1 UDP) configuration */
  icomNetwork?: IcomNetworkConfig;
}

type RigStatusHandler = (status: RigStatus) => void;
type RigErrorHandler = (error: Error) => void;

// ============================================================================
// Input Sanitization & Response Parsing
// ============================================================================

/**
 * Strip control characters from a string before sending to rigctld.
 * Prevents command injection via newline (\n, \r) or other control chars.
 */
function sanitizeCommandParam(param: string): string {
  let sanitized = "";
  for (const ch of param) {
    const code = ch.charCodeAt(0);
    if (code >= 0x20 && code !== 0x7f) {
      sanitized += ch;
    }
  }
  return sanitized.trim();
}

/**
 * Parse a rigctld numeric response, detecting error codes.
 * rigctld returns "RPRT <code>" for errors (code < 0 = error).
 * Throws on any non-numeric or error response instead of returning NaN.
 */
function parseRigctldNumber(resp: string, label: string): number {
  const trimmed = resp.trim();
  if (trimmed.startsWith("RPRT")) {
    const code = parseInt(trimmed.split(/\s+/)[1] ?? "", 10);
    throw new Error(`rigctld ${label} error: RPRT ${isNaN(code) ? "?" : code}`);
  }
  const n = parseInt(trimmed, 10);
  if (isNaN(n)) {
    throw new Error(
      `rigctld ${label}: invalid response ${JSON.stringify(trimmed)}`,
    );
  }
  return n;
}

// ============================================================================
// Hamlib rigctld Backend
// ============================================================================

class HamlibBackend {
  private socket: Socket | null = null;
  private readonly host: string;
  private readonly port: number;
  private responseBuffer = "";
  private pendingLines: string[] = [];
  private pendingExpectedLines = 1;
  private pendingResolve: ((value: string) => void) | null = null;
  private pendingReject: ((reason: Error) => void) | null = null;
  private commandTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(host: string, port: number) {
    this.host = host;
    this.port = port;
  }

  /** Attempt to connect and verify the backend is available */
  async probe(): Promise<boolean> {
    try {
      await this.connect();
      const resp = await this.sendCommand("f");
      const freq = parseRigctldNumber(resp, "probe");
      // Frequency 0 means no radio attached or uninitialized state
      return freq > 0;
    } catch {
      this.disconnect();
      return false;
    }
  }

  async connect(): Promise<void> {
    if (this.socket) return;

    return new Promise<void>((resolve, reject) => {
      const sock = new Socket();
      sock.setEncoding("utf-8");
      sock.setTimeout(5000);
      let connected = false;

      sock.on("connect", () => {
        connected = true;
        this.socket = sock;
        resolve();
      });

      sock.on("data", (data: string) => {
        this.responseBuffer += data;

        if (!this.pendingResolve) {
          return;
        }

        // rigctld responses are newline-delimited text lines.
        let newlineIndex = this.responseBuffer.indexOf("\n");
        while (newlineIndex >= 0) {
          const line = this.responseBuffer.slice(0, newlineIndex).trimEnd();
          this.responseBuffer = this.responseBuffer.slice(newlineIndex + 1);
          this.pendingLines.push(line);

          if (this.pendingLines.length >= this.pendingExpectedLines) {
            const response = this.pendingLines.join("\n").trim();
            this.pendingLines = [];
            this.pendingExpectedLines = 1;
            this.responseBuffer = "";

            if (this.commandTimeout) {
              clearTimeout(this.commandTimeout);
              this.commandTimeout = null;
            }
            const resolver = this.pendingResolve;
            this.pendingResolve = null;
            this.pendingReject = null;
            resolver(response);
            return;
          }

          newlineIndex = this.responseBuffer.indexOf("\n");
        }
      });

      sock.on("error", (err: Error) => {
        if (this.pendingReject) {
          const rejector = this.pendingReject;
          this.pendingResolve = null;
          this.pendingReject = null;
          rejector(err);
        }
        // Only reject the connect promise if we haven't connected yet.
        // Post-connect socket errors are handled by pendingReject above.
        if (!connected) {
          reject(err);
        }
      });

      sock.on("timeout", () => {
        sock.destroy();
        reject(new Error("Hamlib connection timed out"));
      });

      sock.on("close", () => {
        this.socket = null;
        if (this.pendingReject) {
          const rejector = this.pendingReject;
          this.pendingResolve = null;
          this.pendingReject = null;
          this.pendingLines = [];
          this.pendingExpectedLines = 1;
          rejector(new Error("Hamlib connection closed"));
        }
        this.responseBuffer = "";
      });

      sock.connect(this.port, this.host);
    });
  }

  disconnect(): void {
    if (this.commandTimeout) {
      clearTimeout(this.commandTimeout);
      this.commandTimeout = null;
    }
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
      this.socket = null;
    }
    this.responseBuffer = "";
    this.pendingLines = [];
    this.pendingExpectedLines = 1;
    this.pendingResolve = null;
    this.pendingReject = null;
  }

  get isConnected(): boolean {
    return this.socket !== null;
  }

  /** Send a rigctld command and wait for the response line(s) */
  sendCommand(cmd: string, expectedLines = 1): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      if (!this.socket) {
        reject(new Error("Hamlib not connected"));
        return;
      }

      // Only one command at a time
      if (this.pendingResolve) {
        reject(new Error("Hamlib command already in flight"));
        return;
      }

      this.pendingResolve = resolve;
      this.pendingReject = reject;
      // Clear response buffer: any data received between commands is
      // unsolicited rigctld output and must not be part of the new response.
      this.responseBuffer = "";
      this.pendingLines = [];
      this.pendingExpectedLines = Math.max(1, Math.floor(expectedLines));

      this.commandTimeout = setTimeout(() => {
        this.commandTimeout = null;
        if (this.pendingReject) {
          const rejector = this.pendingReject;
          this.pendingResolve = null;
          this.pendingReject = null;
          this.pendingLines = [];
          this.pendingExpectedLines = 1;
          rejector(new Error("Hamlib command timed out"));
        }
      }, 3000);

      this.socket.write(cmd + "\n");
    });
  }

  async getFrequency(): Promise<number> {
    const resp = await this.sendCommand("f");
    return parseRigctldNumber(resp, "getFrequency");
  }

  async getMode(): Promise<{ mode: string; passband: number }> {
    const resp = await this.sendCommand("m", 2);
    const lines = resp.trim().split("\n");
    const mode = lines[0]?.trim();
    if (!mode || mode.startsWith("RPRT")) {
      throw new Error(
        `rigctld getMode: invalid response ${JSON.stringify(resp)}`,
      );
    }
    const passband = lines[1] ? parseInt(lines[1].trim(), 10) : 0;
    return { mode, passband: isNaN(passband) ? 0 : passband };
  }

  async getPTT(): Promise<boolean> {
    const resp = await this.sendCommand("t");
    const val = parseRigctldNumber(resp, "getPTT");
    return val !== 0;
  }

  async getSMeter(): Promise<number> {
    const resp = await this.sendCommand("l STRENGTH");
    const raw = parseRigctldNumber(resp, "getSMeter");
    // Hamlib `l STRENGTH` returns dB relative to S9 (S9 = 0, S8 = -6, S1 = -48,
    // S9+10 = +10, etc.). Convert to absolute dBm where S9 = -73 dBm.
    return raw - 73;
  }

  async setFrequency(hz: number): Promise<void> {
    if (!Number.isFinite(hz) || hz < 0) {
      throw new Error(`Invalid frequency: ${hz}`);
    }
    await this.sendCommand(`F ${Math.round(hz)}`);
  }

  async setMode(mode: string, passband = 0): Promise<void> {
    const safe = sanitizeCommandParam(mode);
    if (!safe) {
      throw new Error("Mode string is empty after sanitization");
    }
    await this.sendCommand(`M ${safe} ${passband}`);
  }

  async setPTT(on: boolean): Promise<void> {
    await this.sendCommand(`T ${on ? 1 : 0}`);
  }

  async setFunc(func: string, on: boolean): Promise<void> {
    const safe = sanitizeCommandParam(func);
    await this.sendCommand(`U ${safe} ${on ? 1 : 0}`);
  }

  async setLevel(level: string, value: number): Promise<void> {
    const safe = sanitizeCommandParam(level);
    await this.sendCommand(`L ${safe} ${value}`);
  }

  async getLevel(level: string): Promise<number> {
    const safe = sanitizeCommandParam(level);
    const resp = await this.sendCommand(`l ${safe}`);
    return parseRigctldNumber(resp, `getLevel(${level})`);
  }

  async getFunc(func: string): Promise<boolean> {
    const safe = sanitizeCommandParam(func);
    const resp = await this.sendCommand(`u ${safe}`);
    return parseRigctldNumber(resp, `getFunc(${func})`) !== 0;
  }

  async setAntenna(ant: number): Promise<void> {
    await this.sendCommand(`Y ${ant}`);
  }

  async getVFO(): Promise<"A" | "B"> {
    const resp = await this.sendCommand("v");
    const trimmed = resp.trim().toUpperCase();
    // rigctld returns "VFOA", "VFOB", "Main", "Sub", "currVFO", etc.
    if (trimmed.includes("B") || trimmed.includes("SUB")) return "B";
    return "A";
  }

  async setVFO(vfo: string): Promise<void> {
    const target = vfo.toUpperCase() === "B" ? "VFOB" : "VFOA";
    await this.sendCommand(`V ${target}`);
  }
}

// ============================================================================
// Flrig XML-RPC Backend
// ============================================================================

class FlrigBackend {
  private readonly host: string;
  private readonly port: number;

  constructor(host: string, port: number) {
    this.host = host;
    this.port = port;
  }

  /** Attempt to probe Flrig availability */
  async probe(): Promise<boolean> {
    try {
      const resp = await this.xmlRpcCall("rig.get_vfo");
      return resp !== null;
    } catch {
      return false;
    }
  }

  /** Make an XML-RPC call to Flrig */
  private xmlRpcCall(
    method: string,
    params: string[] = [],
  ): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const paramsXml = params
        .map(
          (p) =>
            `<param><value><string>${escapeXml(p)}</string></value></param>`,
        )
        .join("");

      const body =
        `<?xml version="1.0"?>` +
        `<methodCall>` +
        `<methodName>${method}</methodName>` +
        `<params>${paramsXml}</params>` +
        `</methodCall>`;

      const req = httpRequest(
        {
          hostname: this.host,
          port: this.port,
          method: "POST",
          path: "/RPC2",
          headers: {
            "Content-Type": "text/xml",
            "Content-Length": Buffer.byteLength(body),
          },
          timeout: 3000,
        },
        (res) => {
          let data = "";
          res.setEncoding("utf-8");
          res.on("data", (chunk: string) => {
            data += chunk;
          });
          res.on("end", () => {
            try {
              // extractXmlRpcValue throws on fault responses
              const value = extractXmlRpcValue(data);
              resolve(value);
            } catch (err) {
              reject(err);
            }
          });
        },
      );

      req.on("error", (err: Error) => {
        reject(err);
      });

      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Flrig request timed out"));
      });

      req.write(body);
      req.end();
    });
  }

  async getFrequency(): Promise<number> {
    const resp = await this.xmlRpcCall("rig.get_frequency");
    if (resp === null) {
      throw new Error("Flrig: empty response for get_frequency");
    }
    const freq = parseInt(resp, 10);
    if (isNaN(freq)) {
      throw new Error(
        `Flrig: invalid frequency response ${JSON.stringify(resp)}`,
      );
    }
    return freq;
  }

  async getMode(): Promise<string> {
    const resp = await this.xmlRpcCall("rig.get_mode");
    if (resp === null) {
      throw new Error("Flrig: empty response for get_mode");
    }
    return resp;
  }

  async getVFO(): Promise<string> {
    const resp = await this.xmlRpcCall("rig.get_vfo");
    if (resp === null) {
      throw new Error("Flrig: empty response for get_vfo");
    }
    return resp;
  }

  async getSMeter(): Promise<number> {
    const resp = await this.xmlRpcCall("rig.get_smeter");
    if (resp === null) {
      throw new Error("Flrig: empty response for get_smeter");
    }
    const val = parseInt(resp, 10);
    if (isNaN(val)) {
      throw new Error(
        `Flrig: invalid S-meter response ${JSON.stringify(resp)}`,
      );
    }
    // Flrig rig.get_smeter returns 0-100 (meter percentage).
    // Convert to absolute dBm: 0% → -121 dBm (S1), 100% → -23 dBm (S9+50).
    const S1_DBM = -121;
    const DBM_RANGE = 98; // -23 - (-121)
    return S1_DBM + (Math.max(0, Math.min(100, val)) / 100) * DBM_RANGE;
  }

  async setFrequency(hz: number): Promise<void> {
    if (!Number.isFinite(hz) || hz < 0) {
      throw new Error(`Invalid frequency: ${hz}`);
    }
    await this.xmlRpcCall("rig.set_frequency", [Math.round(hz).toString()]);
  }

  async setMode(mode: string): Promise<void> {
    const safe = sanitizeCommandParam(mode);
    if (!safe) {
      throw new Error("Mode string is empty after sanitization");
    }
    await this.xmlRpcCall("rig.set_mode", [safe]);
  }

  async setVFO(vfo: string): Promise<void> {
    await this.xmlRpcCall("rig.set_vfo", [vfo]);
  }

  disconnect(): void {
    // HTTP is stateless — nothing to close
  }
}

// ============================================================================
// XML Helpers
// ============================================================================

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Extract the value from an XML-RPC response.
 * Throws on fault responses instead of silently returning null.
 */
function extractXmlRpcValue(xml: string): string | null {
  // Detect XML-RPC fault responses
  if (xml.includes("<fault>")) {
    const faultCode = xml.match(
      /<name>faultCode<\/name>\s*<value>\s*<int>(\d+)/,
    );
    const faultString = xml.match(
      /<name>faultString<\/name>\s*<value>\s*(?:<string>)?([^<]*)/,
    );
    throw new Error(
      `XML-RPC fault ${faultCode?.[1] ?? "?"}: ${faultString?.[1]?.trim() ?? "unknown error"}`,
    );
  }

  // Extract value: handles <value><string>...</string></value> and <value>...</value>
  const valueMatch = xml.match(/<value>(?:<[^>]+>)?([^<]*)/);
  return valueMatch ? valueMatch[1].trim() : null;
}

// ============================================================================
// RigController
// ============================================================================

export class RigController {
  private readonly config: {
    hamlibHost: string;
    hamlibPort: number;
    flrigHost: string;
    flrigPort: number;
    pollInterval: number;
    icomSerial?: IcomSerialConfig;
    icomNetwork?: IcomNetworkConfig;
  };
  private backend: RigBackend = "none";
  private hamlib: HamlibBackend | null = null;
  private flrig: FlrigBackend | null = null;
  private icomSerial: IcomSerialBackend | null = null;
  private icomNetwork: IcomNetworkBackend | null = null;
  private icomStatusDispose: (() => void) | null = null;
  private icomSmeterDispose: (() => void) | null = null;
  private icomErrorDispose: (() => void) | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private polling = false;
  private stopped = false;
  private startPromise: Promise<RigBackend> | null = null;
  private reconnectProbeTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly reconnectProbeDelayMs = 5000;

  // Connection health
  private consecutiveErrors = 0;
  private readonly maxConsecutiveErrors = 10;
  private lastSuccessfulPoll: number | null = null;

  // Last known status (for change detection)
  private lastStatus: RigStatus | null = null;
  private smeterWarned = false;
  private vfoWarned = false;
  private ritWarned = false;
  private xitWarned = false;
  private splitWarned = false;
  private anfWarned = false;
  private qskWarned = false;
  private voxWarned = false;
  private cwSpeedWarned = false;
  private ifShiftWarned = false;
  private txMeterWarned = false;

  // Event handlers
  private statusHandlers: RigStatusHandler[] = [];
  private errorHandlers: RigErrorHandler[] = [];
  private smeterHandlers: Array<(dbm: number) => void> = [];

  constructor(config?: RigControllerConfig) {
    this.config = {
      hamlibHost: config?.hamlibHost ?? "127.0.0.1",
      hamlibPort: config?.hamlibPort ?? 4533,
      flrigHost: config?.flrigHost ?? "127.0.0.1",
      flrigPort: config?.flrigPort ?? 12345,
      pollInterval: config?.pollInterval ?? 200,
      icomSerial: config?.icomSerial,
      icomNetwork: config?.icomNetwork,
    };
  }

  // --------------------------------------------------------------------------
  // Event Registration (returns disposer to prevent handler accumulation)
  // --------------------------------------------------------------------------

  onStatus(handler: RigStatusHandler): () => void {
    this.statusHandlers.push(handler);
    return () => {
      const idx = this.statusHandlers.indexOf(handler);
      if (idx >= 0) this.statusHandlers.splice(idx, 1);
    };
  }

  onError(handler: RigErrorHandler): () => void {
    this.errorHandlers.push(handler);
    return () => {
      const idx = this.errorHandlers.indexOf(handler);
      if (idx >= 0) this.errorHandlers.splice(idx, 1);
    };
  }

  onSmeter(handler: (dbm: number) => void): () => void {
    this.smeterHandlers.push(handler);
    return () => {
      const idx = this.smeterHandlers.indexOf(handler);
      if (idx >= 0) this.smeterHandlers.splice(idx, 1);
    };
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  /** Auto-detect backend and start polling */
  async start(): Promise<RigBackend> {
    this.stopped = false;

    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = this.startInternal().finally(() => {
      this.startPromise = null;
    });

    return this.startPromise;
  }

  private async startInternal(): Promise<RigBackend> {
    this.stopPolling();
    this.clearReconnectProbe();
    this.disposeIcomSerial();
    this.disposeIcomNetwork();

    if (this.hamlib) {
      this.hamlib.disconnect();
      this.hamlib = null;
    }

    if (this.flrig) {
      this.flrig.disconnect();
      this.flrig = null;
    }

    // Try ICOM serial first (direct USB CI-V, best latency)
    if (this.config.icomSerial) {
      try {
        this.icomSerial = new IcomSerialBackend(this.config.icomSerial);
        if (await this.icomSerial.probe()) {
          await this.icomSerial.start();
          this.backend = "icom-serial";
          this.lastStatus = null;
          this.wireIcomSerialEvents();
          return "icom-serial";
        }
      } catch {
        // ICOM serial probe failed, try next backend
      }
      if (this.icomSerial) {
        this.icomSerial.stop();
        this.icomSerial = null;
      }
    }

    // Try ICOM network (RS-BA1 UDP, second priority)
    if (this.config.icomNetwork) {
      try {
        this.icomNetwork = new IcomNetworkBackend(this.config.icomNetwork);
        if (await this.icomNetwork.probe()) {
          await this.icomNetwork.start();
          this.backend = "icom-network";
          this.lastStatus = null;
          this.wireIcomNetworkEvents();
          return "icom-network";
        }
      } catch {
        // ICOM network probe failed, try next backend
      }
      if (this.icomNetwork) {
        this.icomNetwork.stop();
        this.icomNetwork = null;
      }
    }

    // Try Hamlib
    this.hamlib = new HamlibBackend(
      this.config.hamlibHost,
      this.config.hamlibPort,
    );
    if (await this.hamlib.probe()) {
      this.backend = "hamlib";
      this.lastStatus = null;
      this.startPolling();
      return "hamlib";
    }
    this.hamlib.disconnect();
    this.hamlib = null;

    // Try Flrig
    this.flrig = new FlrigBackend(this.config.flrigHost, this.config.flrigPort);
    if (await this.flrig.probe()) {
      this.backend = "flrig";
      this.lastStatus = null;
      this.startPolling();
      return "flrig";
    }
    this.flrig = null;

    this.backend = "none";
    this.emitStatus({
      connected: false,
    });
    this.scheduleReconnectProbe();

    return "none";
  }

  /** Stop polling and disconnect */
  stop(): void {
    this.stopped = true;
    this.stopPolling();
    this.clearReconnectProbe();
    this.disposeIcomSerial();
    this.disposeIcomNetwork();

    if (this.hamlib) {
      this.hamlib.disconnect();
      this.hamlib = null;
    }

    if (this.flrig) {
      this.flrig.disconnect();
      this.flrig = null;
    }

    this.backend = "none";
    this.lastStatus = null;
    this.consecutiveErrors = 0;
  }

  /** Wire up event forwarding from IcomSerialBackend */
  private wireIcomSerialEvents(): void {
    if (!this.icomSerial) return;

    this.icomStatusDispose = this.icomSerial.onStatus((status) => {
      if (!this.statusEquals(status, this.lastStatus)) {
        this.lastStatus = status;
        this.emitStatus(status);
      }
      // Emit S-meter separately
      if (status.smeter != null) {
        this.emitSmeter(status.smeter);
      }
    });

    this.icomSmeterDispose = this.icomSerial.onSmeter((dbm) => {
      this.emitSmeter(dbm);
    });

    this.icomErrorDispose = this.icomSerial.onError((msg) => {
      this.emitError(new Error(msg));
      // Backend reported fatal error — clean up and reconnect
      this.disposeIcomSerial();
      this.backend = "none";
      this.lastStatus = null;
      this.emitStatus({ connected: false });
      this.scheduleReconnectProbe();
    });
  }

  /** Clean up ICOM serial backend and event handlers */
  private disposeIcomSerial(): void {
    this.icomStatusDispose?.();
    this.icomStatusDispose = null;
    this.icomSmeterDispose?.();
    this.icomSmeterDispose = null;
    this.icomErrorDispose?.();
    this.icomErrorDispose = null;

    if (this.icomSerial) {
      this.icomSerial.stop();
      this.icomSerial = null;
    }
  }

  /** Wire up event forwarding from IcomNetworkBackend */
  private wireIcomNetworkEvents(): void {
    if (!this.icomNetwork) return;

    this.icomStatusDispose = this.icomNetwork.onStatus((status) => {
      if (!this.statusEquals(status, this.lastStatus)) {
        this.lastStatus = status;
        this.emitStatus(status);
      }
      // Emit S-meter separately
      if (status.smeter != null) {
        this.emitSmeter(status.smeter);
      }
    });

    this.icomSmeterDispose = this.icomNetwork.onSmeter((dbm) => {
      this.emitSmeter(dbm);
    });

    this.icomErrorDispose = this.icomNetwork.onError((msg) => {
      this.emitError(new Error(msg));
      // Backend reported fatal error — clean up and reconnect
      this.disposeIcomNetwork();
      this.backend = "none";
      this.lastStatus = null;
      this.emitStatus({ connected: false });
      this.scheduleReconnectProbe();
    });
  }

  /** Clean up ICOM network backend and event handlers */
  private disposeIcomNetwork(): void {
    // Re-use the same dispose slots (only one ICOM backend active at a time)
    if (this.icomNetwork) {
      this.icomStatusDispose?.();
      this.icomStatusDispose = null;
      this.icomSmeterDispose?.();
      this.icomSmeterDispose = null;
      this.icomErrorDispose?.();
      this.icomErrorDispose = null;

      this.icomNetwork.stop();
      this.icomNetwork = null;
    }
  }

  getBackend(): RigBackend {
    return this.backend;
  }

  getStatusSnapshot(): RigStatus {
    if (this.lastStatus) {
      return { ...this.lastStatus };
    }
    return { connected: this.backend !== "none" };
  }

  getHealthInfo(): {
    backend: RigBackend;
    consecutiveErrors: number;
    lastSuccessfulPoll: number | null;
  } {
    return {
      backend: this.backend,
      consecutiveErrors: this.consecutiveErrors,
      lastSuccessfulPoll: this.lastSuccessfulPoll,
    };
  }

  /** Whether the active backend provides built-in spectrum data */
  get hasBuiltinSpectrum(): boolean {
    return (
      (this.backend === "icom-serial" && this.icomSerial !== null) ||
      (this.backend === "icom-network" && this.icomNetwork !== null)
    );
  }

  /** Whether the active backend provides built-in audio streaming */
  get hasBuiltinAudio(): boolean {
    return (
      (this.backend === "icom-network" && this.icomNetwork !== null) ||
      (this.backend === "icom-serial" && this.icomSerial !== null)
    );
  }

  /** Subscribe to spectrum data (works with icom-serial and icom-network backends) */
  onSpectrum(handler: (line: CivSpectrumLine) => void): (() => void) | null {
    if (this.backend === "icom-serial" && this.icomSerial) {
      return this.icomSerial.onSpectrum(handler);
    }
    if (this.backend === "icom-network" && this.icomNetwork) {
      return this.icomNetwork.onSpectrum(handler);
    }
    return null;
  }

  /** Subscribe to audio data (works with icom-network and icom-serial backends) */
  onAudio(
    handler: (samples: Int16Array, sampleRate: number) => void,
  ): (() => void) | null {
    if (this.backend === "icom-network" && this.icomNetwork) {
      return this.icomNetwork.onAudio(handler);
    }
    if (this.backend === "icom-serial" && this.icomSerial) {
      return this.icomSerial.onAudio(handler);
    }
    return null;
  }

  /** Start spectrum/scope data from the radio */
  async startSpectrum(): Promise<boolean> {
    if (this.backend === "icom-serial" && this.icomSerial) {
      await this.icomSerial.startSpectrum();
      return true;
    }
    if (this.backend === "icom-network" && this.icomNetwork) {
      await this.icomNetwork.startSpectrum();
      return true;
    }
    return false;
  }

  /** Stop spectrum/scope data */
  async stopSpectrum(): Promise<void> {
    if (this.backend === "icom-serial" && this.icomSerial) {
      await this.icomSerial.stopSpectrum();
    }
    if (this.backend === "icom-network" && this.icomNetwork) {
      await this.icomNetwork.stopSpectrum();
    }
  }

  /** Start audio stream from the active backend */
  async startAudio(): Promise<boolean> {
    if (this.backend === "icom-network" && this.icomNetwork) {
      await this.icomNetwork.startAudioStream();
      return true;
    }
    if (this.backend === "icom-serial" && this.icomSerial) {
      return this.icomSerial.startAudio();
    }
    return false;
  }

  /** Stop audio stream from the active backend */
  stopAudio(): void {
    if (this.backend === "icom-network" && this.icomNetwork) {
      this.icomNetwork.stopAudioStream();
    }
    if (this.backend === "icom-serial" && this.icomSerial) {
      this.icomSerial.stopAudio();
    }
  }

  /** Get the ICOM model name (when using icom-serial or icom-network backend) */
  getIcomModelName(): string | null {
    return this.icomSerial?.modelName ?? this.icomNetwork?.modelName ?? null;
  }

  // --------------------------------------------------------------------------
  // Set Commands
  // --------------------------------------------------------------------------

  async setFrequency(hz: number): Promise<void> {
    if (this.backend === "icom-serial" && this.icomSerial) {
      await this.icomSerial.setFrequency(hz);
    } else if (this.backend === "icom-network" && this.icomNetwork) {
      await this.icomNetwork.setFrequency(hz);
    } else if (this.backend === "hamlib" && this.hamlib) {
      await this.hamlib.setFrequency(hz);
    } else if (this.backend === "flrig" && this.flrig) {
      await this.flrig.setFrequency(hz);
    } else {
      throw new Error("No rig backend connected");
    }
  }

  async setMode(mode: string): Promise<void> {
    if (this.backend === "icom-serial" && this.icomSerial) {
      await this.icomSerial.setMode(mode);
    } else if (this.backend === "icom-network" && this.icomNetwork) {
      await this.icomNetwork.setMode(mode);
    } else if (this.backend === "hamlib" && this.hamlib) {
      await this.hamlib.setMode(mode);
    } else if (this.backend === "flrig" && this.flrig) {
      await this.flrig.setMode(mode);
    } else {
      throw new Error("No rig backend connected");
    }
  }

  async setPTT(on: boolean): Promise<void> {
    if (this.backend === "icom-serial" && this.icomSerial) {
      await this.icomSerial.setPTT(on);
    } else if (this.backend === "icom-network" && this.icomNetwork) {
      await this.icomNetwork.setPTT(on);
    } else if (this.backend === "hamlib" && this.hamlib) {
      await this.hamlib.setPTT(on);
    } else {
      throw new Error("PTT control requires Hamlib or ICOM backend");
    }
  }

  async setNb(enabled: boolean): Promise<void> {
    if (this.backend === "icom-serial" && this.icomSerial) {
      await this.icomSerial.setFunc("NB", enabled);
    } else if (this.backend === "icom-network" && this.icomNetwork) {
      await this.icomNetwork.setFunc("NB", enabled);
    } else if (this.backend === "hamlib" && this.hamlib) {
      await this.hamlib.setFunc("NB", enabled);
    } else {
      throw new Error("NB control requires Hamlib or ICOM backend");
    }
  }

  async setNr(enabled: boolean): Promise<void> {
    if (this.backend === "icom-serial" && this.icomSerial) {
      await this.icomSerial.setFunc("NR", enabled);
    } else if (this.backend === "icom-network" && this.icomNetwork) {
      await this.icomNetwork.setFunc("NR", enabled);
    } else if (this.backend === "hamlib" && this.hamlib) {
      await this.hamlib.setFunc("NR", enabled);
    } else {
      throw new Error("NR control requires Hamlib or ICOM backend");
    }
  }

  /**
   * Set AGC (Automatic Gain Control) mode.
   * @param mode 0=OFF, 1=FAST, 2=MED, 3=SLOW
   */
  async setAgc(mode: number): Promise<void> {
    if (this.backend === "icom-serial" && this.icomSerial) {
      await this.icomSerial.setAgc(mode);
    } else if (this.backend === "icom-network" && this.icomNetwork) {
      await this.icomNetwork.setAgc(mode);
    } else if (this.backend === "hamlib" && this.hamlib) {
      // AGC is a Hamlib level: 0 = off, 1 = fast, 2 = medium, 3 = slow
      await this.hamlib.setLevel("AGC", mode);
    } else {
      throw new Error("AGC control requires Hamlib or ICOM backend");
    }
  }

  /**
   * Set a named Hamlib level (e.g., "AF", "RF", "SQL", "RFPOWER", "MICGAIN",
   * "MONITOR_GAIN", "COMP", "VOXGAIN"). Values are floats 0.0-1.0 for most
   * levels, or specific dB values for PREAMP/ATT.
   */
  async setGainLevel(level: string, value: number): Promise<void> {
    if (this.backend === "icom-serial" && this.icomSerial) {
      await this.icomSerial.setLevel(level, value);
    } else if (this.backend === "icom-network" && this.icomNetwork) {
      await this.icomNetwork.setLevel(level, value);
    } else if (this.backend === "hamlib" && this.hamlib) {
      await this.hamlib.setLevel(level, value);
    } else {
      throw new Error("Gain control requires Hamlib or ICOM backend");
    }
  }

  /**
   * Toggle a named Hamlib function (e.g., "VOX", "COMP", "TUNER").
   */
  async setFunction(func: string, enabled: boolean): Promise<void> {
    if (this.backend === "icom-serial" && this.icomSerial) {
      await this.icomSerial.setFunc(func, enabled);
    } else if (this.backend === "icom-network" && this.icomNetwork) {
      await this.icomNetwork.setFunc(func, enabled);
    } else if (this.backend === "hamlib" && this.hamlib) {
      await this.hamlib.setFunc(func, enabled);
    } else {
      throw new Error("Function control requires Hamlib or ICOM backend");
    }
  }

  /**
   * Set filter passband width. Uses the Hamlib `M <mode> <passband>` command
   * with the current mode and the given passband in Hz.
   */
  async setPassband(passbandHz: number): Promise<void> {
    if (this.backend === "icom-serial" && this.icomSerial) {
      await this.icomSerial.setPassband(passbandHz);
    } else if (this.backend === "icom-network" && this.icomNetwork) {
      await this.icomNetwork.setPassband(passbandHz);
    } else if (this.backend === "hamlib" && this.hamlib) {
      const modeInfo = await this.hamlib.getMode();
      await this.hamlib.setMode(modeInfo.mode, passbandHz);
    } else {
      throw new Error("Filter control requires Hamlib or ICOM backend");
    }
  }

  /**
   * Set the antenna port. Maps the 1-indexed antenna number to Hamlib `Y <ant>`.
   */
  async setAntenna(antIndex: number): Promise<void> {
    if (this.backend === "icom-serial" && this.icomSerial) {
      await this.icomSerial.setAntenna(String(antIndex));
    } else if (this.backend === "icom-network" && this.icomNetwork) {
      await this.icomNetwork.setAntenna(String(antIndex));
    } else if (this.backend === "hamlib" && this.hamlib) {
      await this.hamlib.setAntenna(antIndex);
    } else {
      throw new Error("Antenna control requires Hamlib or ICOM backend");
    }
  }

  async setVFO(vfo: "A" | "B"): Promise<void> {
    if (this.backend === "icom-serial" && this.icomSerial) {
      await this.icomSerial.setVFO(vfo);
    } else if (this.backend === "icom-network" && this.icomNetwork) {
      await this.icomNetwork.setVFO(vfo);
    } else if (this.backend === "hamlib" && this.hamlib) {
      await this.hamlib.setVFO(vfo);
    } else if (this.backend === "flrig" && this.flrig) {
      await this.flrig.setVFO(vfo);
    } else {
      throw new Error("VFO control requires an active backend");
    }
  }

  /**
   * Set RIT (Receiver Incremental Tuning).
   * Enables/disables the function and optionally sets the offset in Hz.
   */
  async setRit(enabled: boolean, offsetHz?: number): Promise<void> {
    if (this.backend === "icom-serial" && this.icomSerial) {
      await this.icomSerial.setRit(enabled, offsetHz);
    } else if (this.backend === "icom-network" && this.icomNetwork) {
      await this.icomNetwork.setRit(enabled, offsetHz);
    } else if (this.backend === "hamlib" && this.hamlib) {
      await this.hamlib.setFunc("RIT", enabled);
      if (offsetHz !== undefined) {
        await this.hamlib.setLevel("RIT", offsetHz);
      }
    } else {
      throw new Error("RIT control requires Hamlib or ICOM backend");
    }
  }

  /**
   * Set XIT (Transmitter Incremental Tuning).
   * Enables/disables the function and optionally sets the offset in Hz.
   */
  async setXit(enabled: boolean, offsetHz?: number): Promise<void> {
    if (this.backend === "icom-serial" && this.icomSerial) {
      await this.icomSerial.setXit(enabled, offsetHz);
    } else if (this.backend === "icom-network" && this.icomNetwork) {
      await this.icomNetwork.setXit(enabled, offsetHz);
    } else if (this.backend === "hamlib" && this.hamlib) {
      await this.hamlib.setFunc("XIT", enabled);
      if (offsetHz !== undefined) {
        await this.hamlib.setLevel("XIT", offsetHz);
      }
    } else {
      throw new Error("XIT control requires Hamlib or ICOM backend");
    }
  }

  /**
   * Set split operation (TX on VFO-B, RX on VFO-A).
   * Uses the rigctld `S` command.
   */
  async setSplit(enabled: boolean): Promise<void> {
    if (this.backend === "icom-serial" && this.icomSerial) {
      await this.icomSerial.setSplit(enabled);
    } else if (this.backend === "icom-network" && this.icomNetwork) {
      await this.icomNetwork.setSplit(enabled);
    } else if (this.backend === "hamlib" && this.hamlib) {
      await this.hamlib.sendCommand(`S ${enabled ? 1 : 0} VFOB`);
    } else {
      throw new Error("Split control requires Hamlib or ICOM backend");
    }
  }

  /** Set ANF (Auto Notch Filter) on/off. */
  async setAnf(enabled: boolean): Promise<void> {
    if (this.backend === "icom-serial" && this.icomSerial) {
      await this.icomSerial.setAnf(enabled);
    } else if (this.backend === "icom-network" && this.icomNetwork) {
      await this.icomNetwork.setAnf(enabled);
    } else if (this.backend === "hamlib" && this.hamlib) {
      await this.hamlib.setFunc("ANF", enabled);
    } else {
      throw new Error("ANF control requires Hamlib or ICOM backend");
    }
  }

  /** Set QSK (full break-in CW) on/off. Uses Hamlib FBKIN function. */
  async setQsk(enabled: boolean): Promise<void> {
    if (this.backend === "icom-serial" && this.icomSerial) {
      await this.icomSerial.setQsk(enabled);
    } else if (this.backend === "icom-network" && this.icomNetwork) {
      await this.icomNetwork.setQsk(enabled);
    } else if (this.backend === "hamlib" && this.hamlib) {
      await this.hamlib.setFunc("FBKIN", enabled);
    } else {
      throw new Error("QSK control requires Hamlib or ICOM backend");
    }
  }

  /** Set VOX (voice-operated transmit) on/off. */
  async setVox(enabled: boolean): Promise<void> {
    if (this.backend === "icom-serial" && this.icomSerial) {
      await this.icomSerial.setVox(enabled);
    } else if (this.backend === "icom-network" && this.icomNetwork) {
      await this.icomNetwork.setVox(enabled);
    } else if (this.backend === "hamlib" && this.hamlib) {
      await this.hamlib.setFunc("VOX", enabled);
    } else {
      throw new Error("VOX control requires Hamlib or ICOM backend");
    }
  }

  /** Set IF shift in Hz. */
  async setIfShift(hz: number): Promise<void> {
    if (this.backend === "icom-serial" && this.icomSerial) {
      await this.icomSerial.setIfShift(hz);
    } else if (this.backend === "icom-network" && this.icomNetwork) {
      await this.icomNetwork.setIfShift(hz);
    } else if (this.backend === "hamlib" && this.hamlib) {
      await this.hamlib.setLevel("IF", hz);
    } else {
      throw new Error("IF shift control requires Hamlib or ICOM backend");
    }
  }

  /** Set CW keyer speed in WPM. */
  async setCwSpeed(wpm: number): Promise<void> {
    if (this.backend === "icom-serial" && this.icomSerial) {
      await this.icomSerial.setCwSpeed(wpm);
    } else if (this.backend === "icom-network" && this.icomNetwork) {
      await this.icomNetwork.setCwSpeed(wpm);
    } else if (this.backend === "hamlib" && this.hamlib) {
      await this.hamlib.setLevel("KEYSPD", wpm);
    } else {
      throw new Error("CW speed control requires Hamlib or ICOM backend");
    }
  }

  // --------------------------------------------------------------------------
  // Polling
  // --------------------------------------------------------------------------

  private startPolling(): void {
    if (this.pollTimer) return;

    this.pollTimer = setInterval(() => {
      if (!this.polling) {
        this.polling = true;
        this.poll()
          .catch((err: unknown) => {
            this.handlePollError(
              err instanceof Error ? err : new Error(String(err)),
            );
          })
          .finally(() => {
            this.polling = false;
          });
      }
    }, this.config.pollInterval);

    // Do an initial poll immediately
    this.polling = true;
    this.poll()
      .catch((err: unknown) => {
        this.handlePollError(
          err instanceof Error ? err : new Error(String(err)),
        );
      })
      .finally(() => {
        this.polling = false;
      });
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async poll(): Promise<void> {
    let status: RigStatus;

    if (this.backend === "hamlib" && this.hamlib) {
      const freq = await this.hamlib.getFrequency();
      const modeInfo = await this.hamlib.getMode();
      const ptt = await this.hamlib.getPTT();

      // S-meter — non-fatal, not all rigs support it
      let smeter: number | undefined;
      try {
        smeter = await this.hamlib.getSMeter();
      } catch (err) {
        // Log once so the user knows S-meter isn't available
        if (!this.smeterWarned) {
          this.smeterWarned = true;
          console.warn(
            `[rig] S-meter not available via Hamlib: ${err instanceof Error ? err.message : err}`,
          );
        }
      }

      // VFO — non-fatal, not all rigs support it
      let vfo: "A" | "B" | undefined;
      try {
        vfo = await this.hamlib.getVFO();
      } catch (err) {
        if (!this.vfoWarned) {
          this.vfoWarned = true;
          console.warn(
            `[rig] VFO query not available via Hamlib: ${err instanceof Error ? err.message : err}`,
          );
        }
      }

      // RIT — non-fatal
      let rit: { enabled: boolean; offsetHz: number } | undefined;
      try {
        const ritEnabled = await this.hamlib.getFunc("RIT");
        const ritOffset = await this.hamlib.getLevel("RIT");
        rit = { enabled: ritEnabled, offsetHz: ritOffset };
      } catch (err) {
        if (!this.ritWarned) {
          this.ritWarned = true;
          console.warn(
            `[rig] RIT not available via Hamlib: ${err instanceof Error ? err.message : err}`,
          );
        }
      }

      // XIT — non-fatal
      let xit: { enabled: boolean; offsetHz: number } | undefined;
      try {
        const xitEnabled = await this.hamlib.getFunc("XIT");
        const xitOffset = await this.hamlib.getLevel("XIT");
        xit = { enabled: xitEnabled, offsetHz: xitOffset };
      } catch (err) {
        if (!this.xitWarned) {
          this.xitWarned = true;
          console.warn(
            `[rig] XIT not available via Hamlib: ${err instanceof Error ? err.message : err}`,
          );
        }
      }

      // Split — non-fatal
      let split: boolean | undefined;
      try {
        const splitResp = await this.hamlib.sendCommand("s");
        const splitVal = parseInt(splitResp.trim(), 10);
        split = splitVal !== 0;
      } catch (err) {
        if (!this.splitWarned) {
          this.splitWarned = true;
          console.warn(
            `[rig] Split query not available via Hamlib: ${err instanceof Error ? err.message : err}`,
          );
        }
      }

      // ANF — non-fatal
      let anf: boolean | undefined;
      try {
        anf = await this.hamlib.getFunc("ANF");
      } catch (err) {
        if (!this.anfWarned) {
          this.anfWarned = true;
          console.warn(
            `[rig] ANF not available via Hamlib: ${err instanceof Error ? err.message : err}`,
          );
        }
      }

      // QSK (FBKIN) — non-fatal
      let qsk: boolean | undefined;
      try {
        qsk = await this.hamlib.getFunc("FBKIN");
      } catch (err) {
        if (!this.qskWarned) {
          this.qskWarned = true;
          console.warn(
            `[rig] QSK/FBKIN not available via Hamlib: ${err instanceof Error ? err.message : err}`,
          );
        }
      }

      // VOX — non-fatal
      let vox: boolean | undefined;
      try {
        vox = await this.hamlib.getFunc("VOX");
      } catch (err) {
        if (!this.voxWarned) {
          this.voxWarned = true;
          console.warn(
            `[rig] VOX not available via Hamlib: ${err instanceof Error ? err.message : err}`,
          );
        }
      }

      // CW speed — non-fatal
      let cwSpeed: number | undefined;
      try {
        cwSpeed = await this.hamlib.getLevel("KEYSPD");
      } catch (err) {
        if (!this.cwSpeedWarned) {
          this.cwSpeedWarned = true;
          console.warn(
            `[rig] CW speed not available via Hamlib: ${err instanceof Error ? err.message : err}`,
          );
        }
      }

      // IF shift — non-fatal
      let ifShift: number | undefined;
      try {
        ifShift = await this.hamlib.getLevel("IF");
      } catch (err) {
        if (!this.ifShiftWarned) {
          this.ifShiftWarned = true;
          console.warn(
            `[rig] IF shift not available via Hamlib: ${err instanceof Error ? err.message : err}`,
          );
        }
      }

      // AGC mode — non-fatal
      let agcMode: number | undefined;
      try {
        agcMode = await this.hamlib.getLevel("AGC");
      } catch {
        // AGC not available
      }

      // TX metering (power, SWR, ALC) — non-fatal
      let txMeter: { powerW?: number; swr?: number; alc?: number } | undefined;
      try {
        const powerW = await this.hamlib.getLevel("RFPOWER_METER_WATTS");
        txMeter = { powerW };
      } catch {
        // powerW not available, try individual meters
      }
      try {
        const swr = await this.hamlib.getLevel("SWR");
        txMeter = { ...txMeter, swr };
      } catch {
        // SWR not available
      }
      try {
        const alc = await this.hamlib.getLevel("ALC");
        txMeter = { ...txMeter, alc };
      } catch (err) {
        if (!this.txMeterWarned && !txMeter) {
          this.txMeterWarned = true;
          console.warn(
            `[rig] TX metering not available via Hamlib: ${err instanceof Error ? err.message : err}`,
          );
        }
      }

      status = {
        connected: true,
        frequency: freq,
        mode: modeInfo.mode,
        ptt,
        smeter,
        vfo,
        rit,
        xit,
        split,
        anf,
        qsk,
        vox,
        cwSpeed,
        ifShift,
        txMeter,
        agcMode,
      };
    } else if (this.backend === "flrig" && this.flrig) {
      const freq = await this.flrig.getFrequency();
      const mode = await this.flrig.getMode();
      const vfo = await this.flrig.getVFO();

      let smeter: number | undefined;
      try {
        smeter = await this.flrig.getSMeter();
      } catch (err) {
        if (!this.smeterWarned) {
          this.smeterWarned = true;
          console.warn(
            `[rig] S-meter not available via Flrig: ${err instanceof Error ? err.message : err}`,
          );
        }
      }

      status = {
        connected: true,
        frequency: freq,
        mode,
        vfo: vfo === "B" ? "B" : "A",
        smeter,
      };
    } else {
      return;
    }

    this.consecutiveErrors = 0;
    this.lastSuccessfulPoll = Date.now();

    // Only emit if status changed
    if (!this.statusEquals(status, this.lastStatus)) {
      this.lastStatus = status;
      this.emitStatus(status);
    }

    // Emit S-meter separately (changes too frequently for status diffing)
    if (status.smeter != null) {
      this.emitSmeter(status.smeter);
    }
  }

  private handlePollError(error: Error): void {
    this.consecutiveErrors++;

    if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
      this.emitError(
        new Error(
          `Rig connection lost after ${this.consecutiveErrors} consecutive errors: ${error.message}`,
        ),
      );
      this.emitStatus({ connected: false });
      this.lastStatus = null;

      this.stopPolling();
      this.backend = "none";

      this.disposeIcomSerial();
      this.disposeIcomNetwork();
      if (this.hamlib) {
        this.hamlib.disconnect();
        this.hamlib = null;
      }
      if (this.flrig) {
        this.flrig.disconnect();
        this.flrig = null;
      }

      this.scheduleReconnectProbe();
    }
  }

  private scheduleReconnectProbe(): void {
    if (this.reconnectProbeTimer || this.backend !== "none" || this.stopped)
      return;

    this.reconnectProbeTimer = setTimeout(() => {
      this.reconnectProbeTimer = null;
      if (this.backend !== "none" || this.stopped) return;

      this.start()
        .catch(() => {
          // Keep probing in the background until a backend comes online.
        })
        .finally(() => {
          if (this.backend === "none" && !this.stopped) {
            this.scheduleReconnectProbe();
          }
        });
    }, this.reconnectProbeDelayMs);
  }

  private clearReconnectProbe(): void {
    if (!this.reconnectProbeTimer) return;
    clearTimeout(this.reconnectProbeTimer);
    this.reconnectProbeTimer = null;
  }

  /** Shallow comparison of two RigStatus objects */
  private statusEquals(a: RigStatus, b: RigStatus | null): boolean {
    if (!b) return false;
    return (
      a.connected === b.connected &&
      a.frequency === b.frequency &&
      a.mode === b.mode &&
      a.power === b.power &&
      a.ptt === b.ptt &&
      a.vfo === b.vfo &&
      a.split === b.split &&
      a.rit?.enabled === b.rit?.enabled &&
      a.rit?.offsetHz === b.rit?.offsetHz &&
      a.xit?.enabled === b.xit?.enabled &&
      a.xit?.offsetHz === b.xit?.offsetHz &&
      a.anf === b.anf &&
      a.qsk === b.qsk &&
      a.vox === b.vox &&
      a.cwSpeed === b.cwSpeed &&
      a.ifShift === b.ifShift &&
      a.txMeter?.powerW === b.txMeter?.powerW &&
      a.txMeter?.swr === b.txMeter?.swr &&
      a.txMeter?.alc === b.txMeter?.alc
    );
  }

  // --------------------------------------------------------------------------
  // Event Emission
  // --------------------------------------------------------------------------

  private emitStatus(status: RigStatus): void {
    for (const handler of this.statusHandlers) {
      try {
        handler(status);
      } catch {
        /* swallow handler errors to prevent cascade failures */
      }
    }
  }

  private emitError(error: Error): void {
    for (const handler of this.errorHandlers) {
      try {
        handler(error);
      } catch {
        /* swallow handler errors to prevent cascade failures */
      }
    }
  }

  private emitSmeter(dbm: number): void {
    for (const handler of this.smeterHandlers) {
      handler(dbm);
    }
  }
}
