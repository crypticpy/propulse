/**
 * ProPulse Bridge — Rotator Control (Hamlib rotctld)
 *
 * Speaks the rotctld TCP text protocol (default 127.0.0.1:4533):
 *   `p`             → two lines: azimuth, elevation
 *   `P <az> <el>`   → "RPRT 0" on success, non-zero code on error
 *   `S`             → stop all motion
 *
 * Disabled by default. Set `BRIDGE_ROTOR=1` to enable the client;
 * `ROTCTLD_HOST` / `ROTCTLD_PORT` override the connection defaults.
 *
 * The controller never moves the rotator on its own: polling only issues `p`.
 * Motion happens exclusively through an explicit setHeading()/stop() call.
 */

import { Socket } from "node:net";
import type { RotorStatus } from "./types.js";

// ============================================================================
// Configuration
// ============================================================================

export const ROTOR_DEFAULT_HOST = "127.0.0.1";
export const ROTOR_DEFAULT_PORT = 4533;
export const ROTOR_MAX_AZIMUTH_DEG = 360;
export const ROTOR_MAX_ELEVATION_DEG = 90;

type EnvSource = Record<string, string | undefined>;

export interface RotorConfig {
  host: string;
  port: number;
  /** Position poll interval in ms (default 1000) */
  pollIntervalMs?: number;
}

/**
 * The rotor client is opt-in: only `BRIDGE_ROTOR=1` enables it. Host/port
 * variables configure an enabled client, they never enable one on their own.
 */
export function isRotorEnabled(env: EnvSource): boolean {
  return env.BRIDGE_ROTOR === "1";
}

export function resolveRotorConfig(env: EnvSource): RotorConfig {
  const host = env.ROTCTLD_HOST?.trim() || ROTOR_DEFAULT_HOST;
  const parsedPort = Number.parseInt(env.ROTCTLD_PORT ?? "", 10);
  const port =
    Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65535
      ? parsedPort
      : ROTOR_DEFAULT_PORT;
  return { host, port };
}

// ============================================================================
// Pure Protocol Helpers (unit-testable without a socket)
// ============================================================================

export interface RotorPosition {
  azimuth: number;
  elevation: number;
}

export interface RotorHeading {
  azimuth: number;
  elevation: number;
}

/** Parse the two-line response to the rotctld `p` (get_pos) command. */
export function parseRotorPosition(response: string): RotorPosition {
  const trimmed = response.trim();
  if (trimmed.startsWith("RPRT")) {
    const code = Number.parseInt(trimmed.split(/\s+/)[1] ?? "", 10);
    throw new Error(
      `rotctld get_pos error: RPRT ${Number.isNaN(code) ? "?" : code}`,
    );
  }

  const lines = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const azimuth = Number.parseFloat(lines[0] ?? "");
  const elevation = Number.parseFloat(lines[1] ?? "");

  if (!Number.isFinite(azimuth) || !Number.isFinite(elevation)) {
    throw new Error(
      `rotctld get_pos: invalid response ${JSON.stringify(trimmed)}`,
    );
  }
  return { azimuth, elevation };
}

/** Format the rotctld `P` (set_pos) command for an already-validated heading. */
export function formatSetPositionCommand(heading: RotorHeading): string {
  return `P ${heading.azimuth.toFixed(2)} ${heading.elevation.toFixed(2)}`;
}

/** Parse an "RPRT <code>" acknowledgement; any non-zero code is an error. */
export function parseRotorReport(response: string, label: string): void {
  const trimmed = response.trim();
  const match = /^RPRT\s+(-?\d+)$/.exec(trimmed);
  if (!match) {
    throw new Error(
      `rotctld ${label}: unexpected response ${JSON.stringify(trimmed)}`,
    );
  }
  const code = Number.parseInt(match[1], 10);
  if (code !== 0) {
    throw new Error(`rotctld ${label} error: RPRT ${code}`);
  }
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Fill in a missing `elevation` on an untrusted `rotor.setHeading` payload
 * with the controller's last known elevation, before validation. Az/el
 * rotators must not be commanded back to 0° elevation just because a caller
 * (e.g. an azimuth-only "turn beam" click) omitted the field; fall back to 0
 * only when the current elevation is unknown (`null`).
 */
export function applyKnownElevationFallback(
  payload: unknown,
  knownElevation: number | null,
): unknown {
  if (typeof payload !== "object" || payload === null) return payload;
  const p = payload as Record<string, unknown>;
  if ((p.elevation === undefined || p.elevation === null) && knownElevation !== null) {
    return { ...p, elevation: knownElevation };
  }
  return payload;
}

export interface RotorInterlockState {
  /** A client currently holds manual PTT ownership. */
  manualPttOwned: boolean;
  /** An FT8 (or similar scheduled) transmission is in progress. */
  txActive: boolean;
  /** Last polled PTT state reported by the rig itself, if known. */
  rigPtt: boolean;
}

/**
 * Whether rotor commands should be blocked because the station is
 * transmitting by any means: a client-owned manual PTT, a scheduled TX
 * (e.g. FT8), or the rig's own polled PTT state (covers PTT keyed outside
 * the bridge, e.g. a footswitch or the radio's front panel).
 */
export function shouldBlockRotor(state: RotorInterlockState): boolean {
  return state.manualPttOwned || state.txActive || state.rigPtt;
}

/**
 * Validate an untrusted `rotor.setHeading` payload.
 * Azimuth is required (0–360). Elevation is optional (0–90, defaults to 0).
 */
export function validateRotorHeading(payload: unknown): RotorHeading {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("rotor.setHeading requires an object payload");
  }
  const p = payload as Record<string, unknown>;

  const azimuth = finiteNumber(p.azimuth);
  if (azimuth === undefined || azimuth < 0 || azimuth > ROTOR_MAX_AZIMUTH_DEG) {
    throw new Error(`Invalid azimuth: ${JSON.stringify(p.azimuth)}`);
  }

  if (p.elevation === undefined || p.elevation === null) {
    return { azimuth, elevation: 0 };
  }
  const elevation = finiteNumber(p.elevation);
  if (
    elevation === undefined ||
    elevation < 0 ||
    elevation > ROTOR_MAX_ELEVATION_DEG
  ) {
    throw new Error(`Invalid elevation: ${JSON.stringify(p.elevation)}`);
  }
  return { azimuth, elevation };
}

// ============================================================================
// rotctld TCP Client
// ============================================================================

type RotorStatusHandler = (status: RotorStatus) => void;

const COMMAND_TIMEOUT_MS = 3000;
const CONNECT_TIMEOUT_MS = 5000;
const DEFAULT_POLL_INTERVAL_MS = 1000;
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30_000;
/** Position delta (degrees) below which the rotator counts as parked. */
const MOVEMENT_EPSILON_DEG = 0.5;

const DISCONNECTED_STATUS: RotorStatus = {
  connected: false,
  azimuth: null,
  elevation: null,
  moving: false,
};

export class RotorController {
  private readonly host: string;
  private readonly port: number;
  private readonly pollIntervalMs: number;

  private socket: Socket | null = null;
  private connecting: Promise<void> | null = null;
  private connectingSocket: Socket | null = null;
  private connectingReject: ((error: Error) => void) | null = null;
  private responseBuffer = "";
  private pendingLines: string[] = [];
  private expectedLines = 1;
  private pendingResolve: ((value: string) => void) | null = null;
  private pendingReject: ((reason: Error) => void) | null = null;
  private commandTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private started = false;
  private closed = false;
  private reconnectAttempts = 0;
  private status: RotorStatus = { ...DISCONNECTED_STATUS };
  private statusHandlers: RotorStatusHandler[] = [];
  /**
   * Consulted immediately before a queued `setHeading`/`stop` command
   * connects or writes to rotctld. A non-null return rejects the command
   * with that reason — closes the PTT race between "command entered the
   * queue" and "command actually reached the wire".
   */
  private interlock: (() => string | null) | null = null;

  constructor(config: RotorConfig) {
    this.host = config.host;
    this.port = config.port;
    this.pollIntervalMs = config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  }

  // --------------------------------------------------------------------------
  // Lifecycle & events
  // --------------------------------------------------------------------------

  /**
   * Set (or clear) the PTT interlock consulted before a move/stop command
   * reaches rotctld. Safe to call before or after `start()`.
   */
  setInterlock(interlock: (() => string | null) | null): void {
    this.interlock = interlock;
  }

  onStatus(handler: RotorStatusHandler): () => void {
    this.statusHandlers.push(handler);
    return () => {
      const idx = this.statusHandlers.indexOf(handler);
      if (idx >= 0) this.statusHandlers.splice(idx, 1);
    };
  }

  getStatus(): RotorStatus {
    return { ...this.status };
  }

  /** Begin connecting and polling. Idempotent. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.reconnectAttempts = 0;
    this.schedulePoll(0);
  }

  /**
   * Stop polling, close the socket, and reject any queued or in-flight
   * command. Once shut down the controller never opens a new socket or
   * moves the rotator, even if a command was already waiting in the queue.
   * Does not itself move the rotator.
   */
  shutdown(): void {
    this.started = false;
    this.closed = true;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.connectingReject) {
      const reject = this.connectingReject;
      this.connectingReject = null;
      reject(new Error("rotor client shut down"));
    }
    this.closeSocket(new Error("rotor client shut down"));
    this.emit({ ...DISCONNECTED_STATUS });
  }

  // --------------------------------------------------------------------------
  // Commands
  // --------------------------------------------------------------------------

  async getPosition(): Promise<RotorPosition> {
    return parseRotorPosition(await this.command("p", 2));
  }

  /** Explicit move. Never called by polling. */
  async setHeading(heading: RotorHeading): Promise<void> {
    const response = await this.command(formatSetPositionCommand(heading), 1, {
      interlocked: true,
    });
    parseRotorReport(response, "set_pos");
    this.emitMotion(true);
  }

  /** Stop all rotator motion (rotctld `S`). */
  async stop(): Promise<void> {
    const response = await this.command("S", 1, { interlocked: true });
    parseRotorReport(response, "stop");
    this.emitMotion(false);
  }

  private emitMotion(moving: boolean): void {
    this.emit({
      connected: true,
      azimuth: this.status.azimuth,
      elevation: this.status.elevation,
      moving,
    });
  }

  // --------------------------------------------------------------------------
  // Polling
  // --------------------------------------------------------------------------

  private schedulePoll(delayMs: number): void {
    if (!this.started || this.pollTimer) return;
    this.pollTimer = setTimeout(() => {
      this.pollTimer = null;
      void this.poll();
    }, delayMs);
  }

  private async poll(): Promise<void> {
    if (!this.started) return;
    try {
      const position = await this.getPosition();
      this.reconnectAttempts = 0;
      this.emit({
        connected: true,
        azimuth: position.azimuth,
        elevation: position.elevation,
        moving: this.hasMoved(position),
      });
      this.schedulePoll(this.pollIntervalMs);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.closeSocket(new Error(message));
      this.emit({ ...DISCONNECTED_STATUS, error: message });
      const delay = Math.min(
        RECONNECT_BASE_DELAY_MS * 2 ** this.reconnectAttempts,
        RECONNECT_MAX_DELAY_MS,
      );
      this.reconnectAttempts += 1;
      this.schedulePoll(delay);
    }
  }

  private hasMoved(position: RotorPosition): boolean {
    const { azimuth, elevation } = this.status;
    if (azimuth === null || elevation === null) return false;
    return (
      Math.abs(position.azimuth - azimuth) > MOVEMENT_EPSILON_DEG ||
      Math.abs(position.elevation - elevation) > MOVEMENT_EPSILON_DEG
    );
  }

  private emit(next: RotorStatus): void {
    if (JSON.stringify(next) === JSON.stringify(this.status)) return;
    this.status = next;
    for (const handler of this.statusHandlers) handler({ ...next });
  }

  // --------------------------------------------------------------------------
  // Transport
  // --------------------------------------------------------------------------

  /** Serialize every command: rotctld accepts one request at a time. */
  private command(
    cmd: string,
    expectedLines = 1,
    options?: { interlocked?: boolean },
  ): Promise<string> {
    if (this.closed) {
      return Promise.reject(new Error("rotor client shut down"));
    }
    const run = async (): Promise<string> => {
      if (this.closed) {
        throw new Error("rotor client shut down");
      }
      // Checked before connecting so a command that never should have been
      // sent (PTT keyed while it waited in queue) never opens a socket.
      if (options?.interlocked) {
        const reason = this.interlock?.() ?? null;
        if (reason) {
          throw new Error(reason);
        }
      }
      await this.connect();
      return this.write(cmd, expectedLines);
    };
    const result = this.queue.then(run, run);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private connect(): Promise<void> {
    if (this.closed) {
      return Promise.reject(new Error("rotor client shut down"));
    }
    if (this.socket) return Promise.resolve();
    if (this.connecting) return this.connecting;

    const attempt = new Promise<void>((resolve, reject) => {
      const sock = new Socket();
      this.connectingSocket = sock;
      this.connectingReject = reject;
      sock.setEncoding("utf-8");
      sock.setTimeout(CONNECT_TIMEOUT_MS);
      let connected = false;

      sock.on("connect", () => {
        connected = true;
        sock.setTimeout(0);
        this.socket = sock;
        this.connectingSocket = null;
        this.connectingReject = null;
        resolve();
      });

      sock.on("data", (data: string) => this.onData(data));

      sock.on("error", (err: Error) => {
        this.failPending(err);
        if (!connected) reject(err);
      });

      sock.on("timeout", () => {
        sock.destroy();
        if (!connected) reject(new Error("rotctld connection timed out"));
      });

      sock.on("close", () => {
        if (this.socket === sock) this.socket = null;
        if (this.connectingSocket === sock) this.connectingSocket = null;
        this.failPending(new Error("rotctld connection closed"));
        this.responseBuffer = "";
      });

      sock.connect(this.port, this.host);
    }).finally(() => {
      this.connecting = null;
      this.connectingSocket = null;
      this.connectingReject = null;
    });

    this.connecting = attempt;
    return attempt;
  }

  private onData(data: string): void {
    this.responseBuffer += data;
    if (!this.pendingResolve) return;

    let newlineIndex = this.responseBuffer.indexOf("\n");
    while (newlineIndex >= 0) {
      this.pendingLines.push(this.responseBuffer.slice(0, newlineIndex).trimEnd());
      this.responseBuffer = this.responseBuffer.slice(newlineIndex + 1);

      if (this.pendingLines.length >= this.expectedLines) {
        const response = this.pendingLines.join("\n").trim();
        const resolver = this.pendingResolve;
        this.resetPending();
        resolver?.(response);
        return;
      }
      newlineIndex = this.responseBuffer.indexOf("\n");
    }
  }

  private write(cmd: string, expectedLines: number): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const socket = this.socket;
      if (!socket) {
        reject(new Error("rotctld not connected"));
        return;
      }

      this.pendingResolve = resolve;
      this.pendingReject = reject;
      this.responseBuffer = "";
      this.pendingLines = [];
      this.expectedLines = Math.max(1, Math.floor(expectedLines));

      this.commandTimer = setTimeout(() => {
        this.commandTimer = null;
        // Destroy the socket too: a late reply to the timed-out command
        // must not be consumed as the response to the next command.
        this.closeSocket(new Error("rotctld command timed out"));
      }, COMMAND_TIMEOUT_MS);

      socket.write(`${cmd}\n`);
    });
  }

  private resetPending(): void {
    if (this.commandTimer) {
      clearTimeout(this.commandTimer);
      this.commandTimer = null;
    }
    this.pendingResolve = null;
    this.pendingReject = null;
    this.pendingLines = [];
    this.expectedLines = 1;
  }

  private failPending(error: Error): void {
    const rejector = this.pendingReject;
    this.resetPending();
    rejector?.(error);
  }

  private closeSocket(error: Error): void {
    this.connecting = null;
    if (this.connectingSocket) {
      this.connectingSocket.removeAllListeners();
      this.connectingSocket.destroy();
      this.connectingSocket = null;
    }
    this.connectingReject = null;
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
      this.socket = null;
    }
    this.failPending(error);
    this.responseBuffer = "";
  }
}
