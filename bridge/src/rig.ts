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

// ============================================================================
// Types
// ============================================================================

export type RigBackend = "hamlib" | "flrig" | "none";

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
    return parseRigctldNumber(resp, "getSMeter");
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
    return val;
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
  private readonly config: Required<RigControllerConfig>;
  private backend: RigBackend = "none";
  private hamlib: HamlibBackend | null = null;
  private flrig: FlrigBackend | null = null;
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

  // Event handlers
  private statusHandlers: RigStatusHandler[] = [];
  private errorHandlers: RigErrorHandler[] = [];

  constructor(config?: RigControllerConfig) {
    this.config = {
      hamlibHost: config?.hamlibHost ?? "127.0.0.1",
      hamlibPort: config?.hamlibPort ?? 4533,
      flrigHost: config?.flrigHost ?? "127.0.0.1",
      flrigPort: config?.flrigPort ?? 12345,
      pollInterval: config?.pollInterval ?? 200,
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

    if (this.hamlib) {
      this.hamlib.disconnect();
      this.hamlib = null;
    }

    if (this.flrig) {
      this.flrig.disconnect();
      this.flrig = null;
    }

    // Try Hamlib first
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

  // --------------------------------------------------------------------------
  // Set Commands
  // --------------------------------------------------------------------------

  async setFrequency(hz: number): Promise<void> {
    if (this.backend === "hamlib" && this.hamlib) {
      await this.hamlib.setFrequency(hz);
    } else if (this.backend === "flrig" && this.flrig) {
      await this.flrig.setFrequency(hz);
    } else {
      throw new Error("No rig backend connected");
    }
  }

  async setMode(mode: string): Promise<void> {
    if (this.backend === "hamlib" && this.hamlib) {
      await this.hamlib.setMode(mode);
    } else if (this.backend === "flrig" && this.flrig) {
      await this.flrig.setMode(mode);
    } else {
      throw new Error("No rig backend connected");
    }
  }

  async setPTT(on: boolean): Promise<void> {
    if (this.backend === "hamlib" && this.hamlib) {
      await this.hamlib.setPTT(on);
    } else {
      throw new Error("PTT control requires Hamlib backend");
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

      status = {
        connected: true,
        frequency: freq,
        mode: modeInfo.mode,
        ptt,
      };
    } else if (this.backend === "flrig" && this.flrig) {
      const freq = await this.flrig.getFrequency();
      const mode = await this.flrig.getMode();
      const vfo = await this.flrig.getVFO();

      status = {
        connected: true,
        frequency: freq,
        mode,
        vfo: vfo === "B" ? "B" : "A",
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
      a.split === b.split
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
}
