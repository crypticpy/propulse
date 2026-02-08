/**
 * useRadioDaemon - WebSocket connection hook for the Propulse Radio Daemon
 *
 * Similar ergonomics to useBridge, but supports both JSON messages and
 * binary FFT/audio frames.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { BridgeConnectionState } from "@/types/bridge";
import type { DaemonIncomingMessage, RadioBinaryFrame } from "@/lib/radio/protocol";
import { generateCommandId, parseBinaryFrame } from "@/lib/radio/protocol";

const DEFAULT_DAEMON_URL = "ws://127.0.0.1:9867";

export interface RadioDaemonConnectionOptions {
  url?: string;
  enabled?: boolean;
  autoReconnect?: boolean;
  reconnectDelay?: number;
  maxReconnectDelay?: number;
  connectionTimeout?: number;
  authToken?: string;
}

export interface RadioDaemonConnection {
  state: BridgeConnectionState;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  lastMessage: DaemonIncomingMessage | null;
  lastFrame: RadioBinaryFrame | null;
  send: (message: Record<string, unknown>) => boolean;
  sendCommand: (type: string, payload?: Record<string, unknown>) => string | null;
  connect: () => void;
  disconnect: () => void;
}

const DEFAULT_OPTIONS: Required<Omit<RadioDaemonConnectionOptions, "authToken">> =
  {
    url: DEFAULT_DAEMON_URL,
    enabled: true,
    autoReconnect: true,
    reconnectDelay: 1000,
    maxReconnectDelay: 30000,
    connectionTimeout: 5000,
  };

function calculateBackoff(attempt: number, baseDelay: number, maxDelay: number) {
  const delay = baseDelay * Math.pow(2, attempt);
  const jitter = delay * Math.random() * 0.2;
  return Math.min(delay + jitter, maxDelay);
}

export function useRadioDaemon(
  options: RadioDaemonConnectionOptions = {},
): RadioDaemonConnection {
  const enabled = options.enabled ?? true;
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const [state, setState] = useState<BridgeConnectionState>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<DaemonIncomingMessage | null>(
    null,
  );
  const [lastFrame, setLastFrame] = useState<RadioBinaryFrame | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);
  const manualDisconnectRef = useRef(false);
  const reconnectAttemptRef = useRef(0);

  const optsRef = useRef(opts);
  optsRef.current = opts;
  const authTokenRef = useRef<string | undefined>(options.authToken);
  authTokenRef.current = options.authToken;

  const clearTimers = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
  }, []);

  const send = useCallback((message: Record<string, unknown>): boolean => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return false;
    }
    try {
      wsRef.current.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }, []);

  const sendCommand = useCallback(
    (type: string, payload: Record<string, unknown> = {}): string | null => {
      const id = generateCommandId();
      const ok = send({ id, type, ...payload });
      return ok ? id : null;
    },
    [send],
  );

  const disconnect = useCallback(() => {
    manualDisconnectRef.current = true;
    clearTimers();

    if (wsRef.current) {
      wsRef.current.close(1000, "Manual disconnect");
      wsRef.current = null;
    }

    setState("disconnected");
    setError(null);
    reconnectAttemptRef.current = 0;
  }, [clearTimers]);

  const connect = useCallback(() => {
    const currentOpts = optsRef.current;

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    clearTimers();

    if (!mountedRef.current) return;

    setState("connecting");
    setError(null);
    manualDisconnectRef.current = false;

    const scheduleReconnect = () => {
      if (!mountedRef.current || manualDisconnectRef.current) return;
      if (!currentOpts.autoReconnect) return;

      const attempt = reconnectAttemptRef.current;
      const delay = calculateBackoff(
        attempt,
        currentOpts.reconnectDelay,
        currentOpts.maxReconnectDelay,
      );
      reconnectAttemptRef.current = attempt + 1;

      reconnectTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current && !manualDisconnectRef.current) connect();
      }, delay);
    };

    try {
      const ws = new WebSocket(currentOpts.url);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      connectionTimeoutRef.current = setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          ws.close();
          if (mountedRef.current) {
            setState("error");
            setError("Connection timeout");
            scheduleReconnect();
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
        reconnectAttemptRef.current = 0;

        // Authenticate (optional) and request device list
        if (authTokenRef.current) {
          sendCommand("hello", { auth_token: authTokenRef.current });
        }
        sendCommand("devices:enumerate");
      };

      ws.onclose = (event) => {
        clearTimers();
        wsRef.current = null;

        if (!mountedRef.current) return;
        if (manualDisconnectRef.current) {
          setState("disconnected");
          return;
        }

        setState("disconnected");
        if (event.code !== 1000) {
          scheduleReconnect();
        }
      };

      ws.onerror = () => {
        if (mountedRef.current) setError("Connection error");
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;

        if (typeof event.data === "string") {
          try {
            const msg = JSON.parse(event.data) as DaemonIncomingMessage;
            setLastMessage(msg);
          } catch {
            // Ignore malformed JSON
          }
          return;
        }

        if (event.data instanceof ArrayBuffer) {
          const frame = parseBinaryFrame(event.data);
          if (frame) setLastFrame(frame);
        }
      };
    } catch {
      setState("error");
      setError("Failed to create WebSocket connection");
      scheduleReconnect();
    }
  }, [clearTimers, sendCommand]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimers();
      if (wsRef.current) {
        wsRef.current.close(1000, "Component unmount");
        wsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (enabled) connect();
    else disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, opts.url, options.authToken]);

  return {
    state,
    connected: state === "connected",
    connecting: state === "connecting",
    error,
    lastMessage,
    lastFrame,
    send,
    sendCommand,
    connect,
    disconnect,
  };
}

export default useRadioDaemon;
