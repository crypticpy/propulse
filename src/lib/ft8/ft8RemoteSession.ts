/**
 * ft8RemoteSession.ts — WebSocket relay for operating a home FT8 station
 * from a remote browser. Supports host (at-the-radio) and client (remote
 * operator) roles communicating through a relay server.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Remote session configuration */
export interface Ft8RemoteConfig {
  /** WebSocket URL of the relay server */
  relayUrl: string;
  /** Session authentication token */
  authToken: string;
  /** Session ID */
  sessionId: string;
  /** Role: host (at the radio) or client (remote operator) */
  role: "host" | "client";
}

/** Messages exchanged over the relay */
export type Ft8RemoteMessage =
  | {
      type: "decode";
      decodes: Array<{
        message: string;
        snr: number;
        deltaFrequency: number;
        time: string;
      }>;
    }
  | { type: "tx_request"; message: string; symbols: number[]; freqHz: number }
  | { type: "tx_status"; active: boolean; timeRemainingMs: number }
  | { type: "state_sync"; state: Record<string, unknown> }
  | { type: "audio_chunk"; samples: string; sampleRate: number } // base64
  | { type: "heartbeat"; timestamp: number }
  | { type: "error"; message: string }
  | {
      type: "config";
      mode: "FT8" | "FT4";
      band: string;
      dialFreqHz: number;
    };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type ConnectionState = "DISCONNECTED" | "CONNECTING" | "CONNECTED";

const HEARTBEAT_INTERVAL_MS = 10_000;
const INITIAL_RECONNECT_MS = 1_000;
const MAX_RECONNECT_MS = 30_000;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * FT8 Remote Session — WebSocket relay for remote operation.
 *
 * State machine: DISCONNECTED -> CONNECTING -> CONNECTED -> DISCONNECTED
 *
 * Features:
 * - Auto-reconnect with exponential backoff (1 s, 2 s, 4 s, ... max 30 s)
 * - Heartbeat every 10 s for latency measurement
 * - JSON message serialization
 * - Clean teardown: close socket, clear timers, notify listeners
 */
export class Ft8RemoteSession {
  // Config -----------------------------------------------------------------
  private readonly config: Ft8RemoteConfig;

  // WebSocket --------------------------------------------------------------
  private ws: WebSocket | null = null;
  private state: ConnectionState = "DISCONNECTED";

  // Reconnect --------------------------------------------------------------
  private reconnectDelay = INITIAL_RECONNECT_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;

  // Heartbeat / latency ----------------------------------------------------
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private _latencyMs = 0;

  // Listeners --------------------------------------------------------------
  private messageListeners = new Set<(msg: Ft8RemoteMessage) => void>();
  private connectionListeners = new Set<(connected: boolean) => void>();
  private errorListeners = new Set<(error: string) => void>();

  // -----------------------------------------------------------------------
  // Constructor
  // -----------------------------------------------------------------------

  constructor(config: Ft8RemoteConfig) {
    this.config = config;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /** Connect to the relay server. Resolves once the socket is open. */
  connect(): Promise<void> {
    if (this.state === "CONNECTED") return Promise.resolve();
    this.intentionalClose = false;
    return this.openSocket();
  }

  /** Disconnect from the relay. No auto-reconnect will occur. */
  disconnect(): void {
    this.intentionalClose = true;
    this.cleanup();
    this.setState("DISCONNECTED");
  }

  /** Send a message to the remote peer */
  send(message: Ft8RemoteMessage): void {
    if (!this.ws || this.state !== "CONNECTED") {
      this.notifyError("Cannot send: not connected");
      return;
    }
    try {
      this.ws.send(JSON.stringify(message));
    } catch (err) {
      this.notifyError(
        `Send failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Subscribe to messages from the remote peer. Returns unsubscribe fn. */
  onMessage(cb: (message: Ft8RemoteMessage) => void): () => void {
    this.messageListeners.add(cb);
    return () => {
      this.messageListeners.delete(cb);
    };
  }

  /** Subscribe to connection state changes. Returns unsubscribe fn. */
  onConnectionChange(cb: (connected: boolean) => void): () => void {
    this.connectionListeners.add(cb);
    return () => {
      this.connectionListeners.delete(cb);
    };
  }

  /** Subscribe to errors. Returns unsubscribe fn. */
  onError(cb: (error: string) => void): () => void {
    this.errorListeners.add(cb);
    return () => {
      this.errorListeners.delete(cb);
    };
  }

  /** Get connection state */
  get isConnected(): boolean {
    return this.state === "CONNECTED";
  }

  /** Get latency to the relay (ms) */
  get latencyMs(): number {
    return this._latencyMs;
  }

  /** Get the session role */
  get role(): "host" | "client" {
    return this.config.role;
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private openSocket(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.setState("CONNECTING");

      const url = new URL(this.config.relayUrl);
      url.searchParams.set("session", this.config.sessionId);
      url.searchParams.set("role", this.config.role);
      url.searchParams.set("token", this.config.authToken);

      try {
        this.ws = new WebSocket(url.toString());
      } catch (err) {
        this.setState("DISCONNECTED");
        reject(
          new Error(
            `WebSocket creation failed: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
        return;
      }

      this.ws.onopen = () => {
        this.setState("CONNECTED");
        this.reconnectDelay = INITIAL_RECONNECT_MS;
        this.startHeartbeat();
        resolve();
      };

      this.ws.onclose = () => {
        this.stopHeartbeat();
        this.setState("DISCONNECTED");
        if (!this.intentionalClose) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = () => {
        // The browser fires `onerror` followed by `onclose`.  We avoid
        // rejecting twice by checking state.
        if (this.state === "CONNECTING") {
          reject(new Error("WebSocket connection failed"));
        }
        this.notifyError("WebSocket error");
      };

      this.ws.onmessage = (event: MessageEvent) => {
        this.handleIncoming(event);
      };
    });
  }

  // -- State ---------------------------------------------------------------

  private setState(next: ConnectionState): void {
    if (this.state === next) return;
    this.state = next;
    const connected = next === "CONNECTED";
    for (const cb of this.connectionListeners) {
      try {
        cb(connected);
      } catch {
        /* listener error — ignore */
      }
    }
  }

  // -- Message handling ----------------------------------------------------

  private handleIncoming(event: MessageEvent): void {
    let parsed: Ft8RemoteMessage;
    try {
      parsed = JSON.parse(event.data as string) as Ft8RemoteMessage;
    } catch {
      this.notifyError("Failed to parse incoming message");
      return;
    }

    // Intercept heartbeats for latency tracking
    if (parsed.type === "heartbeat") {
      this._latencyMs = Date.now() - parsed.timestamp;
      return; // heartbeats are internal; don't forward to consumers
    }

    for (const cb of this.messageListeners) {
      try {
        cb(parsed);
      } catch {
        /* listener error — ignore */
      }
    }
  }

  // -- Heartbeat -----------------------------------------------------------

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: "heartbeat", timestamp: Date.now() });
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // -- Reconnect -----------------------------------------------------------

  private scheduleReconnect(): void {
    if (this.intentionalClose) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket().catch(() => {
        // openSocket rejection is expected during reconnect; the onclose
        // handler will schedule the next attempt.
      });
    }, this.reconnectDelay);

    // Exponential backoff, capped at MAX_RECONNECT_MS
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_MS);
  }

  // -- Cleanup -------------------------------------------------------------

  private cleanup(): void {
    this.stopHeartbeat();

    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      // Prevent handlers from firing during teardown
      this.ws.onopen = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      try {
        this.ws.close();
      } catch {
        /* best-effort */
      }
      this.ws = null;
    }
  }

  // -- Notify helpers ------------------------------------------------------

  private notifyError(message: string): void {
    for (const cb of this.errorListeners) {
      try {
        cb(message);
      } catch {
        /* listener error — ignore */
      }
    }
  }
}
