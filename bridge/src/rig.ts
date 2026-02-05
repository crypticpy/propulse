/**
 * ProPulse Bridge — CAT (Computer Aided Transceiver) Control
 *
 * Supports two backends:
 *   1. Hamlib rigctld  — TCP text protocol on port 4532
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
  /** Hamlib rigctld port (default 4532) */
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
// Hamlib rigctld Backend
// ============================================================================

class HamlibBackend {
  private socket: Socket | null = null;
  private readonly host: string;
  private readonly port: number;
  private responseBuffer = "";
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
      // Send a simple frequency query to validate
      const resp = await this.sendCommand("f");
      const freq = parseInt(resp.trim(), 10);
      return !isNaN(freq);
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

      sock.on("connect", () => {
        this.socket = sock;
        resolve();
      });

      sock.on("data", (data: string) => {
        this.responseBuffer += data;
        // rigctld terminates responses with newline
        if (this.responseBuffer.includes("\n") && this.pendingResolve) {
          const response = this.responseBuffer.trim();
          this.responseBuffer = "";
          if (this.commandTimeout) {
            clearTimeout(this.commandTimeout);
            this.commandTimeout = null;
          }
          const resolver = this.pendingResolve;
          this.pendingResolve = null;
          this.pendingReject = null;
          resolver(response);
        }
      });

      sock.on("error", (err: Error) => {
        if (this.pendingReject) {
          const rejector = this.pendingReject;
          this.pendingResolve = null;
          this.pendingReject = null;
          rejector(err);
        }
        reject(err);
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
          rejector(new Error("Hamlib connection closed"));
        }
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
    this.pendingResolve = null;
    this.pendingReject = null;
  }

  get isConnected(): boolean {
    return this.socket !== null;
  }

  /** Send a rigctld command and wait for the response line */
  sendCommand(cmd: string): Promise<string> {
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
      this.responseBuffer = "";

      this.commandTimeout = setTimeout(() => {
        this.commandTimeout = null;
        if (this.pendingReject) {
          const rejector = this.pendingReject;
          this.pendingResolve = null;
          this.pendingReject = null;
          rejector(new Error("Hamlib command timed out"));
        }
      }, 3000);

      this.socket.write(cmd + "\n");
    });
  }

  async getFrequency(): Promise<number> {
    const resp = await this.sendCommand("f");
    return parseInt(resp.trim(), 10);
  }

  async getMode(): Promise<{ mode: string; passband: number }> {
    const resp = await this.sendCommand("m");
    const lines = resp.trim().split("\n");
    return {
      mode: lines[0] ?? "UNKNOWN",
      passband: parseInt(lines[1] ?? "0", 10),
    };
  }

  async getPTT(): Promise<boolean> {
    const resp = await this.sendCommand("t");
    return resp.trim() !== "0";
  }

  async getSMeter(): Promise<number> {
    const resp = await this.sendCommand("l STRENGTH");
    return parseInt(resp.trim(), 10);
  }

  async setFrequency(hz: number): Promise<void> {
    await this.sendCommand(`F ${Math.round(hz)}`);
  }

  async setMode(mode: string, passband = 0): Promise<void> {
    await this.sendCommand(`M ${mode} ${passband}`);
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
            // Extract value from XML-RPC response
            const value = extractXmlRpcValue(data);
            resolve(value);
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
    return parseInt(resp ?? "0", 10);
  }

  async getMode(): Promise<string> {
    const resp = await this.xmlRpcCall("rig.get_mode");
    return resp ?? "UNKNOWN";
  }

  async getVFO(): Promise<string> {
    const resp = await this.xmlRpcCall("rig.get_vfo");
    return resp ?? "A";
  }

  async getSMeter(): Promise<number> {
    const resp = await this.xmlRpcCall("rig.get_smeter");
    return parseInt(resp ?? "0", 10);
  }

  async setFrequency(hz: number): Promise<void> {
    await this.xmlRpcCall("rig.set_frequency", [Math.round(hz).toString()]);
  }

  async setMode(mode: string): Promise<void> {
    await this.xmlRpcCall("rig.set_mode", [mode]);
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
    .replace(/"/g, "&quot;");
}

function extractXmlRpcValue(xml: string): string | null {
  // Simple extraction: find the innermost <value> content
  // Handles <value><string>...</string></value> and <value>...</value>
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
      hamlibPort: config?.hamlibPort ?? 4532,
      flrigHost: config?.flrigHost ?? "127.0.0.1",
      flrigPort: config?.flrigPort ?? 12345,
      pollInterval: config?.pollInterval ?? 200,
    };
  }

  // --------------------------------------------------------------------------
  // Event Registration
  // --------------------------------------------------------------------------

  onStatus(handler: RigStatusHandler): void {
    this.statusHandlers.push(handler);
  }

  onError(handler: RigErrorHandler): void {
    this.errorHandlers.push(handler);
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  /** Auto-detect backend and start polling */
  async start(): Promise<RigBackend> {
    // Try Hamlib first
    this.hamlib = new HamlibBackend(
      this.config.hamlibHost,
      this.config.hamlibPort,
    );
    if (await this.hamlib.probe()) {
      this.backend = "hamlib";
      this.startPolling();
      return "hamlib";
    }
    this.hamlib.disconnect();
    this.hamlib = null;

    // Try Flrig
    this.flrig = new FlrigBackend(this.config.flrigHost, this.config.flrigPort);
    if (await this.flrig.probe()) {
      this.backend = "flrig";
      this.startPolling();
      return "flrig";
    }
    this.flrig = null;

    this.backend = "none";
    this.emitStatus({
      connected: false,
    });

    return "none";
  }

  /** Stop polling and disconnect */
  stop(): void {
    this.stopPolling();

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
        power: ptt ? 1 : 0,
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

      // Try to reconnect
      this.stopPolling();
      setTimeout(() => {
        this.start().catch(() => {
          // Silently fail — will retry on next explicit start
        });
      }, 5000);
    }
  }

  /** Shallow comparison of two RigStatus objects */
  private statusEquals(a: RigStatus, b: RigStatus | null): boolean {
    if (!b) return false;
    return (
      a.connected === b.connected &&
      a.frequency === b.frequency &&
      a.mode === b.mode &&
      a.power === b.power &&
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
        /* swallow */
      }
    }
  }

  private emitError(error: Error): void {
    for (const handler of this.errorHandlers) {
      try {
        handler(error);
      } catch {
        /* swallow */
      }
    }
  }
}
