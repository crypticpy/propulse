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

/** Default bridge WebSocket URL */
const DEFAULT_BRIDGE_URL = "ws://127.0.0.1:9867";

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
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Connection state
  const [state, setState] = useState<BridgeConnectionState>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<BridgeMessage | null>(null);
  const [reconnectCount, setReconnectCount] = useState(0);
  const [reconnectIn, setReconnectIn] = useState<number | null>(null);

  // Refs for WebSocket and timers
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectCountdownRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pongTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);
  const manualDisconnectRef = useRef(false);
  const connectingRef = useRef(false); // Race guard

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
  const send = useCallback(<T>(type: string, payload: T): boolean => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return false;
    }

    const message: BridgeMessage<T> = {
      type,
      id: generateMessageId(),
      ts: new Date().toISOString(),
      timestamp: Date.now(),
      payload,
    };

    try {
      wsRef.current.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }, []);

  /**
   * Connect to the bridge WebSocket
   */
  const connect = useCallback(() => {
    const currentOpts = optsRef.current;

    // Race guard: if already connecting, skip
    if (connectingRef.current) {
      return;
    }

    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    clearTimers();

    if (!mountedRef.current) {
      return;
    }

    connectingRef.current = true;
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
      const ws = new WebSocket(currentOpts.url);
      wsRef.current = ws;

      // Set connection timeout
      connectionTimeoutRef.current = setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          ws.close();
          connectingRef.current = false;
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
        connectingRef.current = false;

        if (!mountedRef.current) {
          ws.close();
          return;
        }

        clearTimers();
        setState("connected");
        setError(null);
        setReconnectCount(0);
        setReconnectIn(null);
        lastCloseCodeRef.current = null;
        fatalRetryCountRef.current = 0;
        startPing();

        // Subscribe to rig updates
        send("bridge.subscribe", { topics: ["rig.update"] });
      };

      ws.onclose = (event) => {
        connectingRef.current = false;
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
        connectingRef.current = false;
        // Error will be followed by onclose, so just update error state
        if (mountedRef.current) {
          setError(
            "Unable to reach the bridge — make sure it's running on your computer",
          );
        }
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) {
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
    clearTimers();

    if (wsRef.current) {
      wsRef.current.close(1000, "Manual disconnect");
      wsRef.current = null;
    }

    setState("disconnected");
    setError(null);
    setReconnectCount(0);
    setReconnectIn(null);
  }, [clearTimers]);

  // Track component mount lifecycle
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      connectingRef.current = false;
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Detect tab wake-up — mobile Safari kills WebSocket timers when backgrounded
  useEffect(() => {
    if (!enabled) return;

    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      if (!wsRef.current || manualDisconnectRef.current) return;

      // Tab just woke up — probe the socket immediately
      const alive = send("bridge.ping", { timestamp: Date.now() });
      if (!alive && mountedRef.current) {
        // Socket is dead; force-close it then reconnect
        if (wsRef.current) {
          wsRef.current.close(4000, "Tab wake-up: socket dead");
          wsRef.current = null;
        }
        connect();
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
  }, [enabled]);

  return {
    state,
    connected: state === "connected",
    connecting: state === "connecting",
    error,
    lastMessage,
    send,
    connect,
    disconnect,
    reconnectCount,
    reconnectIn,
  };
}

export default useBridge;
