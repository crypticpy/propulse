/**
 * useBridge - WebSocket connection hook for ProPulse Bridge
 *
 * Provides WebSocket connectivity to the local ProPulse Bridge with:
 * - Automatic connection management
 * - Exponential backoff reconnection
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

/** Default connection options */
const DEFAULT_OPTIONS: Required<BridgeConnectionOptions> = {
  url: DEFAULT_BRIDGE_URL,
  autoReconnect: true,
  maxReconnectAttempts: 0, // Unlimited
  reconnectDelay: 1000,
  maxReconnectDelay: 30000,
  pingInterval: 30000,
  connectionTimeout: 5000,
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
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Connection state
  const [state, setState] = useState<BridgeConnectionState>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<BridgeMessage | null>(null);
  const [reconnectCount, setReconnectCount] = useState(0);

  // Refs for WebSocket and timers
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);
  const manualDisconnectRef = useRef(false);

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
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
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

    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    clearTimers();

    if (!mountedRef.current) {
      return;
    }

    setState("connecting");
    setError(null);
    manualDisconnectRef.current = false;

    /**
     * Schedule reconnection with exponential backoff
     */
    const scheduleReconnect = (attempt: number) => {
      if (!mountedRef.current || manualDisconnectRef.current) {
        return;
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

      reconnectTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current && !manualDisconnectRef.current) {
          setReconnectCount(attempt + 1);
          connect();
        }
      }, delay);
    };

    /**
     * Start ping interval
     */
    const startPing = () => {
      if (currentOpts.pingInterval <= 0) {
        return;
      }

      pingIntervalRef.current = setInterval(() => {
        send("bridge.ping", { timestamp: Date.now() });
      }, currentOpts.pingInterval);
    };

    try {
      const ws = new WebSocket(currentOpts.url);
      wsRef.current = ws;

      // Set connection timeout
      connectionTimeoutRef.current = setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          ws.close();
          if (mountedRef.current) {
            setState("error");
            setError("Connection timeout");
            if (currentOpts.autoReconnect) {
              scheduleReconnect(reconnectCountRef.current);
            }
          }
        }
      }, currentOpts.connectionTimeout);

      ws.onopen = () => {
        if (!mountedRef.current) {
          ws.close();
          return;
        }

        clearTimers();
        setState("connected");
        setError(null);
        setReconnectCount(0);
        startPing();

        // Subscribe to rig updates
        send("bridge.subscribe", { topics: ["rig.update"] });
      };

      ws.onclose = (event) => {
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
          if (currentOpts.autoReconnect) {
            scheduleReconnect(reconnectCountRef.current);
          }
        } else {
          setState("disconnected");
        }
      };

      ws.onerror = () => {
        // Error will be followed by onclose, so just update error state
        if (mountedRef.current) {
          setError("Connection error");
        }
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) {
          return;
        }

        try {
          const message = JSON.parse(event.data) as BridgeMessage;
          setLastMessage(message);

          // Handle ping/pong internally
          if (message.type === "bridge.ping") {
            send("bridge.pong", { timestamp: Date.now() });
          }
        } catch {
          // Ignore malformed messages
        }
      };
    } catch {
      setState("error");
      setError("Failed to create WebSocket connection");
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
    clearTimers();

    if (wsRef.current) {
      wsRef.current.close(1000, "Manual disconnect");
      wsRef.current = null;
    }

    setState("disconnected");
    setError(null);
    setReconnectCount(0);
  }, [clearTimers]);

  // Auto-connect on mount
  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      clearTimers();
      if (wsRef.current) {
        wsRef.current.close(1000, "Component unmount");
        wsRef.current = null;
      }
    };
    // Only run on mount/unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  };
}

export default useBridge;
