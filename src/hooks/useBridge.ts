/**
 * useBridge - WebSocket connection hook for ProPulse Bridge
 *
 * Provides WebSocket connectivity to the local ProPulse Bridge with:
 * - Automatic connection management
 * - Exponential backoff reconnection with jitter
 * - Pong timeout detection (dead connection recovery)
 * - Close code awareness (protocol errors stop retrying)
 * - Reconnect countdown visibility for UI feedback
 * - Message envelope format
 * - Graceful degradation when bridge is unavailable
 */

import { useState, useCallback, useRef, useEffect } from "react";
import type {
  BridgeConnectionState,
  BridgeMessage,
  BridgeConnectionOptions,
  BridgeConnection,
} from "@/types/bridge";
import { useSettingsStore } from "@/stores/settingsStore";

/** Default bridge WebSocket URL */
const DEFAULT_BRIDGE_URL = "ws://127.0.0.1:9867";
const EXTENSION_SOURCE_FROM_PAGE = "propulse-daemon-client";
const EXTENSION_SOURCE_TO_PAGE = "propulse-daemon-bridge";

/** Close codes that indicate a permanent protocol error — don't retry forever */
const FATAL_CLOSE_CODES = new Set([
  1002, // Protocol error
  1003, // Unsupported data
  1008, // Policy violation
  1009, // Message too big
  1010, // Missing extension
]);

/** Max retries for fatal close codes before giving up */
const FATAL_MAX_RETRIES = 3;

/** Default connection options */
const DEFAULT_OPTIONS: Required<BridgeConnectionOptions> = {
  url: DEFAULT_BRIDGE_URL,
  enabled: true,
  autoReconnect: true,
  maxReconnectAttempts: 0, // Unlimited
  reconnectDelay: 1000,
  maxReconnectDelay: 30000,
  pingInterval: 30000,
  connectionTimeout: 5000,
  pongTimeout: 5000,
  authToken: "",
};

/**
 * Generate a unique message ID
 */
function generateMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Calculate exponential backoff delay
 */
function calculateBackoff(
  attempt: number,
  baseDelay: number,
  maxDelay: number,
): number {
  const delay = baseDelay * Math.pow(2, attempt);
  // Add jitter (0-20% of delay)
  const jitter = delay * Math.random() * 0.2;
  return Math.min(delay + jitter, maxDelay);
}

/**
 * Human-readable error for close codes
 */
function closeCodeMessage(code: number): string {
  switch (code) {
    case 1002:
      return "Protocol mismatch — your bridge version may be outdated";
    case 1003:
      return "Bridge received unsupported data";
    case 1006:
      return "Bridge connection lost unexpectedly";
    case 1008:
      return "Connection rejected — check bridge configuration";
    case 1009:
      return "Message too large for bridge to handle";
    case 1010:
      return "Bridge requires an unsupported extension";
    case 1011:
      return "Bridge encountered an internal error";
    case 1015:
      return "TLS handshake failed — check security settings";
    case 4000:
      return "Bridge stopped responding — reconnecting";
    default:
      return `Connection closed (code ${code})`;
  }
}

/**
 * Hook for managing WebSocket connection to ProPulse Bridge
 *
 * @param options - Connection options
 * @returns BridgeConnection state and methods
 *
 * @example
 * ```tsx
 * const { connected, send, lastMessage } = useBridge();
 *
 * // Send a message
 * send('rig.setFrequency', { frequency: 14035000 });
 *
 * // React to messages
 * useEffect(() => {
 *   if (lastMessage?.type === 'rig.update') {
 *     console.log('Rig update:', lastMessage.payload);
 *   }
 * }, [lastMessage]);
 * ```
 */
export function useBridge(
  options: BridgeConnectionOptions = {},
): BridgeConnection {
  const enabled = options.enabled ?? true;
  const savedAuthToken = useSettingsStore((store) => store.radioDaemonAuthToken);
  const opts = {
    ...DEFAULT_OPTIONS,
    ...options,
    authToken: options.authToken ?? savedAuthToken,
  };

  // Connection state
  const [state, setState] = useState<BridgeConnectionState>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<BridgeMessage | null>(null);
  const [reconnectCount, setReconnectCount] = useState(0);
  const [reconnectIn, setReconnectIn] = useState<number | null>(null);

  // Refs for WebSocket and timers
  const wsRef = useRef<WebSocket | null>(null);
  const transportRef = useRef<"ws" | "extension">("ws");
  const extensionSessionIdRef = useRef<string | null>(null);
  const extensionConnectedRef = useRef(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectCountdownRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pongTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);
  const manualDisconnectRef = useRef(false);
  const connectingRef = useRef(false); // Race guard
  const connectingUrlRef = useRef<string | null>(null);
  const connectRef = useRef<() => void>(() => {});
  const scheduleReconnectRef = useRef<
    (attempt: number, closeCode?: number) => void
  >(() => {});

  // Track last close code to limit retries on fatal errors
  const lastCloseCodeRef = useRef<number | null>(null);
  const fatalRetryCountRef = useRef(0);

  // Store options in refs to avoid dependency issues
  const optsRef = useRef(opts);
  optsRef.current = opts;

  // Store reconnect count in ref for use in callbacks
  const reconnectCountRef = useRef(reconnectCount);
  reconnectCountRef.current = reconnectCount;

  /**
   * Clear all timers
   */
  const clearTimers = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (reconnectCountdownRef.current) {
      clearInterval(reconnectCountdownRef.current);
      reconnectCountdownRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
    if (pongTimeoutRef.current) {
      clearTimeout(pongTimeoutRef.current);
      pongTimeoutRef.current = null;
    }
    setReconnectIn(null);
  }, []);

  /**
   * Send a message through the WebSocket
   */
  const sendRequest = useCallback(<T>(
    type: string,
    payload: T,
  ): string | null => {
    const id = generateMessageId();
    const message: BridgeMessage<T> = {
      type,
      id,
      ts: new Date().toISOString(),
      timestamp: Date.now(),
      payload,
    };

    try {
      if (transportRef.current === "extension") {
        const sessionId = extensionSessionIdRef.current;
        if (!sessionId || !extensionConnectedRef.current) return null;
        window.postMessage(
          {
            source: EXTENSION_SOURCE_FROM_PAGE,
            type: "send",
            sessionId,
            text: JSON.stringify(message),
          },
          window.location.origin,
        );
        return id;
      }

      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        return null;
      }
      wsRef.current.send(JSON.stringify(message));
      return id;
    } catch {
      return null;
    }
  }, []);

  const send = useCallback(
    <T>(type: string, payload: T): boolean =>
      sendRequest(type, payload) !== null,
    [sendRequest],
  );

  /**
   * Connect to the bridge WebSocket
   */
  const connect = useCallback(() => {
    const currentOpts = optsRef.current;

    // Race guard: if already connecting, skip
    if (
      connectingRef.current &&
      connectingUrlRef.current === currentOpts.url
    ) {
      return;
    }

    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (extensionSessionIdRef.current) {
      window.postMessage(
        {
          source: EXTENSION_SOURCE_FROM_PAGE,
          type: "disconnect",
          sessionId: extensionSessionIdRef.current,
        },
        window.location.origin,
      );
      extensionSessionIdRef.current = null;
      extensionConnectedRef.current = false;
    }
    clearTimers();

    if (!mountedRef.current) {
      return;
    }

    connectingRef.current = true;
    connectingUrlRef.current = currentOpts.url;
    setState("connecting");
    setError(null);
    manualDisconnectRef.current = false;

    /**
     * Schedule reconnection with exponential backoff
     */
    const scheduleReconnect = (attempt: number, closeCode?: number) => {
      if (!mountedRef.current || manualDisconnectRef.current) {
        return;
      }

      // Check fatal close code retry budget
      if (closeCode != null && FATAL_CLOSE_CODES.has(closeCode)) {
        if (lastCloseCodeRef.current === closeCode) {
          fatalRetryCountRef.current += 1;
        } else {
          lastCloseCodeRef.current = closeCode;
          fatalRetryCountRef.current = 1;
        }

        if (fatalRetryCountRef.current >= FATAL_MAX_RETRIES) {
          setState("error");
          setError(
            `${closeCodeMessage(closeCode)}. Gave up after ${FATAL_MAX_RETRIES} attempts.`,
          );
          return;
        }
      } else {
        // Non-fatal: reset the fatal counter
        lastCloseCodeRef.current = null;
        fatalRetryCountRef.current = 0;
      }

      if (
        currentOpts.maxReconnectAttempts > 0 &&
        attempt >= currentOpts.maxReconnectAttempts
      ) {
        setState("error");
        setError("Maximum reconnection attempts reached");
        return;
      }

      const delay = calculateBackoff(
        attempt,
        currentOpts.reconnectDelay,
        currentOpts.maxReconnectDelay,
      );

      // Start countdown display (update every second)
      const targetTime = Date.now() + delay;
      setReconnectIn(Math.ceil(delay / 1000));
      reconnectCountdownRef.current = setInterval(() => {
        const remaining = Math.max(
          0,
          Math.ceil((targetTime - Date.now()) / 1000),
        );
        setReconnectIn(remaining);
        if (remaining <= 0 && reconnectCountdownRef.current) {
          clearInterval(reconnectCountdownRef.current);
          reconnectCountdownRef.current = null;
        }
      }, 1000);

      reconnectTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current && !manualDisconnectRef.current) {
          setReconnectCount(attempt + 1);
          setReconnectIn(null);
          connect();
        }
      }, delay);
    };
    scheduleReconnectRef.current = scheduleReconnect;

    /**
     * Start ping interval with pong timeout detection
     */
    const startPing = () => {
      if (currentOpts.pingInterval <= 0) {
        return;
      }

      pingIntervalRef.current = setInterval(() => {
        const sent = send("bridge.ping", { timestamp: Date.now() });
        if (!sent) return;

        // Start pong timeout — if no pong arrives, connection is dead
        if (pongTimeoutRef.current) clearTimeout(pongTimeoutRef.current);
        pongTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current && wsRef.current) {
            // Force close — connection appears dead
            wsRef.current.close(4000, "Pong timeout");
          }
        }, currentOpts.pongTimeout);
      }, currentOpts.pingInterval);
    };

    try {
      const needsExtension =
        typeof window !== "undefined" &&
        window.location.protocol === "https:" &&
        currentOpts.url.startsWith("ws://");

      if (needsExtension) {
        transportRef.current = "extension";
        const sessionId = `bridge-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        extensionSessionIdRef.current = sessionId;
        extensionConnectedRef.current = false;

        window.postMessage(
          {
            source: EXTENSION_SOURCE_FROM_PAGE,
            type: "connect",
            sessionId,
            url: currentOpts.url,
          },
          window.location.origin,
        );

        connectionTimeoutRef.current = setTimeout(() => {
          if (extensionConnectedRef.current) return;
          connectingRef.current = false;
          connectingUrlRef.current = null;
          if (mountedRef.current) {
            setState("error");
            setError(
              "Connection timed out — install the ProPulse Chrome bridge extension or run the app locally",
            );
            scheduleReconnect(reconnectCountRef.current);
          }
        }, currentOpts.connectionTimeout);
        return;
      }

      transportRef.current = "ws";
      const ws = new WebSocket(currentOpts.url);
      wsRef.current = ws;

      // Set connection timeout
      connectionTimeoutRef.current = setTimeout(() => {
        if (
          wsRef.current === ws &&
          ws.readyState === WebSocket.CONNECTING
        ) {
          ws.close();
          connectingRef.current = false;
          connectingUrlRef.current = null;
          if (mountedRef.current) {
            setState("error");
            setError(
              "Connection timed out — is the bridge running? Start it with: cd bridge && npm run dev",
            );
            if (currentOpts.autoReconnect) {
              scheduleReconnect(reconnectCountRef.current);
            }
          }
        }
      }, currentOpts.connectionTimeout);

      ws.onopen = () => {
        if (!mountedRef.current || wsRef.current !== ws) {
          ws.close();
          return;
        }

        connectingRef.current = false;
        connectingUrlRef.current = null;

        clearTimers();
        setState("connected");
        setError(null);
        setReconnectCount(0);
        setReconnectIn(null);
        lastCloseCodeRef.current = null;
        fatalRetryCountRef.current = 0;
        startPing();

        // Subscribe to rig updates
        if (currentOpts.authToken) {
          send("hello", { auth_token: currentOpts.authToken });
        }
        send("bridge.subscribe", { topics: ["rig.update"] });
      };

      ws.onclose = (event) => {
        if (wsRef.current !== ws) return;
        connectingRef.current = false;
        connectingUrlRef.current = null;
        clearTimers();
        wsRef.current = null;

        if (!mountedRef.current) {
          return;
        }

        if (manualDisconnectRef.current) {
          setState("disconnected");
          return;
        }

        // Abnormal close - attempt reconnect
        if (event.code !== 1000) {
          setState("disconnected");
          setError(closeCodeMessage(event.code));
          if (currentOpts.autoReconnect) {
            scheduleReconnect(reconnectCountRef.current, event.code);
          }
        } else {
          setState("disconnected");
        }
      };

      ws.onerror = () => {
        if (wsRef.current !== ws) return;
        connectingRef.current = false;
        // Error will be followed by onclose, so just update error state
        if (mountedRef.current) {
          setError(
            "Unable to reach the bridge — make sure it's running on your computer",
          );
        }
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current || wsRef.current !== ws) {
          return;
        }

        try {
          const message = JSON.parse(event.data) as BridgeMessage;
          setLastMessage(message);

          // Handle bridge.pong — clear the pong timeout
          if (message.type === "bridge.pong") {
            if (pongTimeoutRef.current) {
              clearTimeout(pongTimeoutRef.current);
              pongTimeoutRef.current = null;
            }
            return;
          }

          // Handle incoming ping — respond with pong
          if (message.type === "bridge.ping") {
            send("bridge.pong", { timestamp: Date.now() });
          }
        } catch {
          // Ignore malformed messages
        }
      };
    } catch {
      connectingRef.current = false;
      connectingUrlRef.current = null;
      setState("error");
      setError(
        "Could not connect to the bridge. If you're on a corporate network, your firewall may be blocking local connections.",
      );
      if (currentOpts.autoReconnect) {
        scheduleReconnect(reconnectCountRef.current);
      }
    }
  }, [clearTimers, send]);

  /**
   * Disconnect from the bridge
   */
  const disconnect = useCallback(() => {
    manualDisconnectRef.current = true;
    connectingRef.current = false;
    connectingUrlRef.current = null;
    clearTimers();

    if (wsRef.current) {
      wsRef.current.close(1000, "Manual disconnect");
      wsRef.current = null;
    }
    extensionConnectedRef.current = false;
    if (extensionSessionIdRef.current) {
      window.postMessage(
        {
          source: EXTENSION_SOURCE_FROM_PAGE,
          type: "disconnect",
          sessionId: extensionSessionIdRef.current,
        },
        window.location.origin,
      );
      extensionSessionIdRef.current = null;
    }

    setState("disconnected");
    setError(null);
    setReconnectCount(0);
    setReconnectIn(null);
  }, [clearTimers]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (!mountedRef.current || event.source !== window) return;
      if (!event.data || typeof event.data !== "object") return;

      const message = event.data as {
        source?: string;
        type?: string;
        sessionId?: string;
        code?: number;
        message?: string;
        text?: string;
      };
      if (message.source !== EXTENSION_SOURCE_TO_PAGE) return;
      if (
        !message.sessionId ||
        message.sessionId !== extensionSessionIdRef.current
      ) {
        return;
      }

      if (message.type === "open") {
        connectingRef.current = false;
        connectingUrlRef.current = null;
        extensionConnectedRef.current = true;
        clearTimers();
        setState("connected");
        setError(null);
        setReconnectCount(0);
        setReconnectIn(null);
        lastCloseCodeRef.current = null;
        fatalRetryCountRef.current = 0;
        if (optsRef.current.authToken) {
          send("hello", { auth_token: optsRef.current.authToken });
        }
        send("bridge.subscribe", { topics: ["rig.update"] });
        return;
      }

      if (message.type === "close") {
        connectingRef.current = false;
        connectingUrlRef.current = null;
        extensionConnectedRef.current = false;
        extensionSessionIdRef.current = null;
        clearTimers();
        if (manualDisconnectRef.current) {
          setState("disconnected");
          return;
        }
        setState("disconnected");
        const code = message.code ?? 1006;
        setError(closeCodeMessage(code));
        if (optsRef.current.autoReconnect) {
          scheduleReconnectRef.current(reconnectCountRef.current, code);
        }
        return;
      }

      if (message.type === "error") {
        setError(message.message ?? "Chrome bridge extension connection error");
        return;
      }

      if (message.type === "message" && typeof message.text === "string") {
        try {
          const parsed = JSON.parse(message.text) as BridgeMessage;
          setLastMessage(parsed);
          if (parsed.type === "bridge.pong") {
            if (pongTimeoutRef.current) {
              clearTimeout(pongTimeoutRef.current);
              pongTimeoutRef.current = null;
            }
            return;
          }
          if (parsed.type === "bridge.ping") {
            send("bridge.pong", { timestamp: Date.now() });
          }
        } catch {
          // Ignore malformed messages from the local service.
        }
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [clearTimers, send]);

  // Track component mount lifecycle
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      connectingRef.current = false;
      connectingUrlRef.current = null;
      clearTimers();
      if (wsRef.current) {
        // Close if OPEN or still CONNECTING to prevent orphaned sockets
        // (especially under React StrictMode double-mounts)
        if (
          wsRef.current.readyState === WebSocket.OPEN ||
          wsRef.current.readyState === WebSocket.CONNECTING
        ) {
          wsRef.current.close(1000, "Component unmount");
        }
        wsRef.current = null;
      }
      extensionConnectedRef.current = false;
      if (extensionSessionIdRef.current) {
        window.postMessage(
          {
            source: EXTENSION_SOURCE_FROM_PAGE,
            type: "disconnect",
            sessionId: extensionSessionIdRef.current,
          },
          window.location.origin,
        );
        extensionSessionIdRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Detect tab wake-up — mobile Safari kills WebSocket timers when backgrounded
  useEffect(() => {
    if (!enabled) return;

    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      const hasTransport =
        (transportRef.current === "extension" &&
          extensionConnectedRef.current) ||
        (transportRef.current === "ws" && wsRef.current !== null);
      if (!hasTransport || manualDisconnectRef.current) return;

      // Tab just woke up — probe the socket immediately
      const alive = send("bridge.ping", { timestamp: Date.now() });
      if (!alive && mountedRef.current) {
        // Socket is dead; force-close it then reconnect
        if (wsRef.current) {
          wsRef.current.close(4000, "Tab wake-up: socket dead");
          wsRef.current = null;
        }
        if (extensionSessionIdRef.current) {
          window.postMessage(
            {
              source: EXTENSION_SOURCE_FROM_PAGE,
              type: "disconnect",
              sessionId: extensionSessionIdRef.current,
            },
            window.location.origin,
          );
          extensionSessionIdRef.current = null;
          extensionConnectedRef.current = false;
        }
        connectRef.current();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // Connect when enabled, disconnect when disabled
  useEffect(() => {
    if (enabled) {
      connect();
    } else {
      disconnect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, opts.url]);

  useEffect(() => {
    if (state === "connected" && opts.authToken) {
      send("hello", { auth_token: opts.authToken });
    }
  }, [opts.authToken, send, state]);

  return {
    state,
    connected: state === "connected",
    connecting: state === "connecting",
    error,
    lastMessage,
    send,
    sendRequest,
    connect,
    disconnect,
    reconnectCount,
    reconnectIn,
  };
}

export default useBridge;
