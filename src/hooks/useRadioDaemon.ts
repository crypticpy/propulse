/**
 * useRadioDaemon - WebSocket connection hook for the Propulse Radio Daemon
 *
 * Similar ergonomics to useBridge, but supports both JSON messages and
 * binary FFT/audio frames.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { BridgeConnectionState } from "@/types/bridge";
import type {
  DaemonIncomingMessage,
  RadioBinaryFrame,
} from "@/lib/radio/protocol";
import { generateCommandId, parseBinaryFrame } from "@/lib/radio/protocol";

const DEFAULT_DAEMON_URL = "ws://127.0.0.1:9867";
const BRIDGE_SOURCE_FROM_PAGE = "propulse-daemon-client";
const BRIDGE_SOURCE_TO_PAGE = "propulse-daemon-bridge";

export interface RadioDaemonConnectionOptions {
  url?: string;
  enabled?: boolean;
  autoReconnect?: boolean;
  reconnectDelay?: number;
  maxReconnectDelay?: number;
  connectionTimeout?: number;
  authToken?: string;
  onMessage?: (
    message: DaemonIncomingMessage,
    api: Pick<RadioDaemonConnection, "send" | "sendCommand">,
  ) => void;
  onFrame?: (frame: RadioBinaryFrame) => void;
}

export interface RadioDaemonConnection {
  state: BridgeConnectionState;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  lastMessage: DaemonIncomingMessage | null;
  lastFrame: RadioBinaryFrame | null;
  send: (message: Record<string, unknown>) => boolean;
  sendCommand: (
    type: string,
    payload?: Record<string, unknown>,
  ) => string | null;
  connect: () => void;
  disconnect: () => void;
}

const DEFAULT_OPTIONS: Required<
  Omit<RadioDaemonConnectionOptions, "authToken" | "onMessage" | "onFrame">
> = {
  url: DEFAULT_DAEMON_URL,
  enabled: true,
  autoReconnect: true,
  reconnectDelay: 1000,
  maxReconnectDelay: 30000,
  connectionTimeout: 5000,
};

function calculateBackoff(
  attempt: number,
  baseDelay: number,
  maxDelay: number,
) {
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
  const transportRef = useRef<"ws" | "bridge">("ws");
  const bridgeSessionIdRef = useRef<string | null>(null);
  const bridgeConnectedRef = useRef(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);
  const manualDisconnectRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const connectRef = useRef<() => void>(() => {});

  const optsRef = useRef(opts);
  optsRef.current = opts;
  const authTokenRef = useRef<string | undefined>(options.authToken);
  authTokenRef.current = options.authToken;
  const onMessageRef = useRef<RadioDaemonConnectionOptions["onMessage"]>(
    options.onMessage,
  );
  onMessageRef.current = options.onMessage;
  const onFrameRef = useRef<RadioDaemonConnectionOptions["onFrame"]>(
    options.onFrame,
  );
  onFrameRef.current = options.onFrame;

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

  const scheduleReconnect = useCallback(() => {
    const currentOpts = optsRef.current;

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
      if (mountedRef.current && !manualDisconnectRef.current) {
        connectRef.current();
      }
    }, delay);
  }, []);

  const send = useCallback((message: Record<string, unknown>): boolean => {
    if (transportRef.current === "bridge") {
      const sessionId = bridgeSessionIdRef.current;
      if (!sessionId || !bridgeConnectedRef.current) return false;
      try {
        window.postMessage(
          {
            source: BRIDGE_SOURCE_FROM_PAGE,
            type: "send",
            sessionId,
            text: JSON.stringify(message),
          },
          window.location.origin,
        );
        return true;
      } catch {
        return false;
      }
    }

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

    bridgeConnectedRef.current = false;
    if (bridgeSessionIdRef.current) {
      try {
        window.postMessage(
          {
            source: BRIDGE_SOURCE_FROM_PAGE,
            type: "disconnect",
            sessionId: bridgeSessionIdRef.current,
          },
          window.location.origin,
        );
      } catch {
        // ignore
      }
      bridgeSessionIdRef.current = null;
    }

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
    if (bridgeSessionIdRef.current) {
      try {
        window.postMessage(
          {
            source: BRIDGE_SOURCE_FROM_PAGE,
            type: "disconnect",
            sessionId: bridgeSessionIdRef.current,
          },
          window.location.origin,
        );
      } catch {
        // ignore
      }
      bridgeSessionIdRef.current = null;
      bridgeConnectedRef.current = false;
    }
    clearTimers();

    if (!mountedRef.current) return;

    setState("connecting");
    setError(null);
    manualDisconnectRef.current = false;

    const needsBridge =
      typeof window !== "undefined" &&
      window.location.protocol === "https:" &&
      currentOpts.url.startsWith("ws://");

    try {
      if (needsBridge) {
        transportRef.current = "bridge";
        const sessionId = `bridge-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        bridgeSessionIdRef.current = sessionId;
        bridgeConnectedRef.current = false;

        window.postMessage(
          {
            source: BRIDGE_SOURCE_FROM_PAGE,
            type: "connect",
            sessionId,
            url: currentOpts.url,
          },
          window.location.origin,
        );

        connectionTimeoutRef.current = setTimeout(() => {
          if (bridgeConnectedRef.current) return;
          if (mountedRef.current) {
            setState("error");
            setError("Connection timeout");
            scheduleReconnect();
          }
        }, currentOpts.connectionTimeout);

        return;
      }

      transportRef.current = "ws";
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

        // Ensure the active socket ref points at the socket that actually opened.
        // In React dev (StrictMode) it's possible to create/close sockets quickly; we want
        // initial commands to always go out on the socket that is currently open.
        wsRef.current = ws;

        clearTimers();
        setState("connected");
        setError(null);
        reconnectAttemptRef.current = 0;

        const sendJson = (message: Record<string, unknown>) => {
          try {
            ws.send(JSON.stringify(message));
            return true;
          } catch {
            return false;
          }
        };

        // Authenticate (optional) and request device list.
        // Use the `ws` instance directly to avoid races with wsRef readiness.
        if (authTokenRef.current) {
          sendJson({
            id: generateCommandId(),
            type: "hello",
            auth_token: authTokenRef.current,
          });
        }
        sendJson({ id: generateCommandId(), type: "devices:enumerate" });
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
            try {
              onMessageRef.current?.(msg, { send, sendCommand });
            } catch {
              // ignore handler errors
            }
          } catch {
            // Ignore malformed JSON
          }
          return;
        }

        if (event.data instanceof ArrayBuffer) {
          const frame = parseBinaryFrame(event.data);
          if (frame) {
            setLastFrame(frame);
            try {
              onFrameRef.current?.(frame);
            } catch {
              // ignore handler errors
            }
          }
        }
      };
    } catch {
      setState("error");
      setError("Failed to create WebSocket connection");
      scheduleReconnect();
    }
  }, [clearTimers, scheduleReconnect, send, sendCommand]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimers();
      if (wsRef.current) {
        // Only close if the WebSocket has finished connecting (avoids
        // "WebSocket is closed before the connection is established"
        // warnings from React StrictMode double-mount in dev).
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.close(1000, "Component unmount");
        }
        wsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (!mountedRef.current) return;
      if (event.source !== window) return;

      const data = event.data as unknown;
      if (!data || typeof data !== "object") return;

      const msg = data as {
        source?: string;
        type?: string;
        sessionId?: string;
        code?: number;
        reason?: string;
        message?: string;
        text?: string;
        data?: ArrayBuffer;
      };

      if (typeof msg.source !== "string" || typeof msg.type !== "string")
        return;
      if (msg.source !== BRIDGE_SOURCE_TO_PAGE) return;

      const sessionId = msg.sessionId;
      if (
        bridgeSessionIdRef.current &&
        sessionId &&
        sessionId !== bridgeSessionIdRef.current
      ) {
        return;
      }

      if (msg.type === "ready") {
        return;
      }

      if (msg.type === "open") {
        clearTimers();
        bridgeConnectedRef.current = true;
        setState("connected");
        setError(null);
        reconnectAttemptRef.current = 0;

        if (authTokenRef.current) {
          sendCommand("hello", { auth_token: authTokenRef.current });
        }
        sendCommand("devices:enumerate");
        return;
      }

      if (msg.type === "close") {
        clearTimers();
        bridgeConnectedRef.current = false;
        bridgeSessionIdRef.current = null;

        if (!mountedRef.current) return;
        if (manualDisconnectRef.current) {
          setState("disconnected");
          return;
        }

        setState("disconnected");
        if ((msg.code ?? 0) !== 1000) {
          scheduleReconnect();
        }
        return;
      }

      if (msg.type === "error") {
        setError(msg.message ?? "Connection error");
        return;
      }

      if (msg.type === "message" && typeof msg.text === "string") {
        try {
          const parsed = JSON.parse(msg.text) as DaemonIncomingMessage;
          setLastMessage(parsed);
          try {
            onMessageRef.current?.(parsed, { send, sendCommand });
          } catch {
            // ignore
          }
        } catch {
          // ignore
        }
        return;
      }

      if (msg.type === "binary" && msg.data instanceof ArrayBuffer) {
        const frame = parseBinaryFrame(msg.data);
        if (frame) {
          setLastFrame(frame);
          try {
            onFrameRef.current?.(frame);
          } catch {
            // ignore
          }
        }
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [clearTimers, scheduleReconnect, send, sendCommand]);

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
