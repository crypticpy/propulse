/**
 * ProPulse Bridge Server
 *
 * WebSocket server for CAT control, multi-operator synchronization,
 * DX cluster spots, WSJT-X decodes, and external integrations.
 * Binds to localhost only for security.
 */

import { WebSocketServer, WebSocket } from "ws";
import {
  createMessage,
  isMessageEnvelope,
  MessageEnvelope,
  MessageTypes,
} from "./types.js";
import type { ClusterConfig, RigUpdateRequest, WSJTXConfig } from "./types.js";
import { DXClusterClient } from "./cluster.js";
import { WSJTXListener } from "./wsjtx.js";
import { RigController } from "./rig.js";

// ============================================================================
// Configuration
// ============================================================================

interface ServerConfig {
  port: number;
  host: string;
}

function loadConfig(): ServerConfig {
  const port = parseInt(process.env.BRIDGE_PORT ?? "9867", 10);
  const host = process.env.BRIDGE_HOST ?? "127.0.0.1";

  // Security: Only allow localhost bindings
  const allowedHosts = ["127.0.0.1", "localhost", "::1"];
  if (!allowedHosts.includes(host)) {
    throw new Error(
      `Security Error: Bridge server can only bind to localhost. ` +
        `Attempted to bind to '${host}'. ` +
        `Allowed values: ${allowedHosts.join(", ")}`,
    );
  }

  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port number: ${process.env.BRIDGE_PORT}`);
  }

  return { port, host };
}

// ============================================================================
// Logging
// ============================================================================

type LogLevel = "info" | "warn" | "error" | "debug";

interface Logger {
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, data?: Record<string, unknown>) => void;
  debug: (message: string, data?: Record<string, unknown>) => void;
}

function createLogger(): Logger {
  const log = (
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
  ) => {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...(data && { data }),
    };

    const output = JSON.stringify(logEntry);

    if (level === "error") {
      process.stderr.write(output + "\n");
    } else {
      process.stdout.write(output + "\n");
    }
  };

  return {
    info: (message, data) => log("info", message, data),
    warn: (message, data) => log("warn", message, data),
    error: (message, data) => log("error", message, data),
    debug: (message, data) => log("debug", message, data),
  };
}

const logger = createLogger();

// ============================================================================
// Client Management
// ============================================================================

interface ConnectedClient {
  id: string;
  socket: WebSocket;
  connectedAt: Date;
  remoteAddress: string;
}

const clients = new Map<string, ConnectedClient>();

function generateClientId(): string {
  return `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/** Broadcast a message envelope to all connected clients */
function broadcast(envelope: MessageEnvelope): void {
  const json = JSON.stringify(envelope);
  for (const client of clients.values()) {
    if (client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(json);
    }
  }
}

/** Send a message envelope to a single client */
function sendToClient(
  client: ConnectedClient,
  envelope: MessageEnvelope,
): void {
  if (client.socket.readyState === WebSocket.OPEN) {
    client.socket.send(JSON.stringify(envelope));
  }
}

// ============================================================================
// Integration Modules
// ============================================================================

let clusterClient: DXClusterClient | null = null;
let wsjtxListener: WSJTXListener | null = null;
let rigController: RigController | null = null;

// --------------------------------------------------------------------------
// DX Cluster Integration
// --------------------------------------------------------------------------

function startCluster(config: ClusterConfig): void {
  // Disconnect existing client if any
  stopCluster();

  const node = config.nodes[0];
  if (!node) {
    logger.warn("Cluster connect requested but no nodes provided");
    return;
  }

  clusterClient = new DXClusterClient({
    host: node.host,
    port: node.port,
    callsign: config.callsign,
    password: config.password,
    filters: config.filters,
  });

  clusterClient.onSpot((spot) => {
    broadcast(createMessage(MessageTypes.CLUSTER_SPOT, spot));
  });

  clusterClient.onStatus((status) => {
    broadcast(createMessage(MessageTypes.CLUSTER_STATUS, status));
  });

  clusterClient.onError((error) => {
    logger.error("DX Cluster error", { error: error.message });
  });

  clusterClient.connect();

  logger.info("DX Cluster client started", {
    host: node.host,
    port: node.port,
    callsign: config.callsign,
  });
}

function stopCluster(): void {
  if (clusterClient) {
    clusterClient.disconnect();
    clusterClient = null;
    logger.info("DX Cluster client stopped");
  }
}

// --------------------------------------------------------------------------
// WSJT-X Integration
// --------------------------------------------------------------------------

function startWSJTX(config: WSJTXConfig): void {
  stopWSJTX();

  if (!config.enabled) return;

  wsjtxListener = new WSJTXListener(config.port);

  wsjtxListener.onStatus((status, instanceId) => {
    broadcast(
      createMessage(MessageTypes.WSJTX_STATUS, { ...status, instanceId }),
    );
  });

  wsjtxListener.onDecode((decode, instanceId) => {
    broadcast(
      createMessage(MessageTypes.WSJTX_DECODE, { ...decode, instanceId }),
    );
  });

  wsjtxListener.onQSOLogged((qso, instanceId) => {
    broadcast(
      createMessage(MessageTypes.WSJTX_QSO_LOGGED, { ...qso, instanceId }),
    );
  });

  wsjtxListener.onClear((window, instanceId) => {
    broadcast(createMessage(MessageTypes.WSJTX_CLEAR, { window, instanceId }));
  });

  wsjtxListener.onError((error) => {
    logger.error("WSJT-X listener error", { error: error.message });
  });

  wsjtxListener.start();

  logger.info("WSJT-X listener started", { port: config.port });
}

function stopWSJTX(): void {
  if (wsjtxListener) {
    wsjtxListener.stop();
    wsjtxListener = null;
    logger.info("WSJT-X listener stopped");
  }
}

// --------------------------------------------------------------------------
// Rig Control Integration
// --------------------------------------------------------------------------

async function startRig(): Promise<void> {
  stopRig();

  rigController = new RigController();

  rigController.onStatus((status) => {
    broadcast(createMessage(MessageTypes.RIG_STATUS, status));
  });

  rigController.onError((error) => {
    logger.error("Rig controller error", { error: error.message });
  });

  const backend = await rigController.start();
  logger.info("Rig controller started", { backend });
}

function stopRig(): void {
  if (rigController) {
    rigController.stop();
    rigController = null;
    logger.info("Rig controller stopped");
  }
}

// ============================================================================
// Message Routing
// ============================================================================

function handleMessage(client: ConnectedClient, rawMessage: string): void {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawMessage);
  } catch {
    logger.warn("Received invalid JSON from client", {
      clientId: client.id,
      preview: rawMessage.substring(0, 100),
    });

    sendToClient(
      client,
      createMessage("error", {
        code: "INVALID_JSON",
        message: "Message must be valid JSON",
      }),
    );
    return;
  }

  if (!isMessageEnvelope(parsed)) {
    logger.warn("Received message with invalid envelope", {
      clientId: client.id,
    });

    sendToClient(
      client,
      createMessage("error", {
        code: "INVALID_ENVELOPE",
        message: "Message must have type, ts, and payload fields",
      }),
    );
    return;
  }

  const message = parsed as MessageEnvelope;

  logger.debug("Received message", {
    clientId: client.id,
    messageType: message.type,
    messageId: message.id,
  });

  routeMessage(client, message);
}

function routeMessage(client: ConnectedClient, message: MessageEnvelope): void {
  switch (message.type) {
    // ------------------------------------------------------------------
    // DX Cluster
    // ------------------------------------------------------------------
    case MessageTypes.CLUSTER_CONNECT: {
      const config = message.payload as ClusterConfig;
      startCluster(config);
      sendToClient(
        client,
        createMessage(`${message.type}.ack`, { started: true }, message.id),
      );
      break;
    }

    case MessageTypes.CLUSTER_DISCONNECT: {
      stopCluster();
      sendToClient(
        client,
        createMessage(`${message.type}.ack`, { stopped: true }, message.id),
      );
      break;
    }

    // ------------------------------------------------------------------
    // WSJT-X
    // ------------------------------------------------------------------
    case MessageTypes.WSJTX_CONFIGURE: {
      const config = message.payload as WSJTXConfig;
      startWSJTX(config);
      sendToClient(
        client,
        createMessage(`${message.type}.ack`, { configured: true }, message.id),
      );
      break;
    }

    // ------------------------------------------------------------------
    // Rig Control
    // ------------------------------------------------------------------
    case MessageTypes.RIG_SET: {
      const update = message.payload as RigUpdateRequest;
      handleRigSet(client, message, update);
      break;
    }

    case MessageTypes.RIG_SET_FREQUENCY: {
      const payload = message.payload as { frequency: number };
      handleRigSetFrequency(client, message, payload.frequency);
      break;
    }

    case MessageTypes.RIG_SET_MODE: {
      const payload = message.payload as { mode: string };
      handleRigSetMode(client, message, payload.mode);
      break;
    }

    case MessageTypes.RIG_SET_PTT: {
      const payload = message.payload as { enabled: boolean };
      handleRigSetPTT(client, message, payload.enabled);
      break;
    }

    // ------------------------------------------------------------------
    // Default: acknowledge unknown message types
    // ------------------------------------------------------------------
    default: {
      logger.debug("Unhandled message type, sending ack", {
        messageType: message.type,
      });
      sendToClient(
        client,
        createMessage(
          `${message.type}.ack`,
          { received: true, originalPayload: message.payload },
          message.id,
        ),
      );
      break;
    }
  }
}

// --------------------------------------------------------------------------
// Rig Command Handlers
// --------------------------------------------------------------------------

function handleRigSet(
  client: ConnectedClient,
  message: MessageEnvelope,
  update: RigUpdateRequest,
): void {
  if (!rigController) {
    sendToClient(
      client,
      createMessage(
        "error",
        { code: "RIG_NOT_CONNECTED", message: "No rig backend available" },
        message.id,
      ),
    );
    return;
  }

  const promises: Promise<void>[] = [];
  if (update.frequency !== undefined) {
    promises.push(rigController.setFrequency(update.frequency));
  }
  if (update.mode !== undefined) {
    promises.push(rigController.setMode(update.mode));
  }

  Promise.all(promises)
    .then(() => {
      sendToClient(
        client,
        createMessage(`${message.type}.ack`, { success: true }, message.id),
      );
    })
    .catch((err: unknown) => {
      const errMsg = err instanceof Error ? err.message : String(err);
      sendToClient(
        client,
        createMessage(
          "error",
          { code: "RIG_COMMAND_FAILED", message: errMsg },
          message.id,
        ),
      );
    });
}

function handleRigSetFrequency(
  client: ConnectedClient,
  message: MessageEnvelope,
  frequency: number,
): void {
  if (!rigController) {
    sendToClient(
      client,
      createMessage(
        "error",
        { code: "RIG_NOT_CONNECTED", message: "No rig backend available" },
        message.id,
      ),
    );
    return;
  }

  rigController
    .setFrequency(frequency)
    .then(() => {
      sendToClient(
        client,
        createMessage(
          `${message.type}.ack`,
          { success: true, frequency },
          message.id,
        ),
      );
    })
    .catch((err: unknown) => {
      const errMsg = err instanceof Error ? err.message : String(err);
      sendToClient(
        client,
        createMessage(
          "error",
          { code: "RIG_COMMAND_FAILED", message: errMsg },
          message.id,
        ),
      );
    });
}

function handleRigSetMode(
  client: ConnectedClient,
  message: MessageEnvelope,
  mode: string,
): void {
  if (!rigController) {
    sendToClient(
      client,
      createMessage(
        "error",
        { code: "RIG_NOT_CONNECTED", message: "No rig backend available" },
        message.id,
      ),
    );
    return;
  }

  rigController
    .setMode(mode)
    .then(() => {
      sendToClient(
        client,
        createMessage(
          `${message.type}.ack`,
          { success: true, mode },
          message.id,
        ),
      );
    })
    .catch((err: unknown) => {
      const errMsg = err instanceof Error ? err.message : String(err);
      sendToClient(
        client,
        createMessage(
          "error",
          { code: "RIG_COMMAND_FAILED", message: errMsg },
          message.id,
        ),
      );
    });
}

function handleRigSetPTT(
  client: ConnectedClient,
  message: MessageEnvelope,
  enabled: boolean,
): void {
  if (!rigController) {
    sendToClient(
      client,
      createMessage(
        "error",
        { code: "RIG_NOT_CONNECTED", message: "No rig backend available" },
        message.id,
      ),
    );
    return;
  }

  rigController
    .setPTT(enabled)
    .then(() => {
      sendToClient(
        client,
        createMessage(
          `${message.type}.ack`,
          { success: true, ptt: enabled },
          message.id,
        ),
      );
    })
    .catch((err: unknown) => {
      const errMsg = err instanceof Error ? err.message : String(err);
      sendToClient(
        client,
        createMessage(
          "error",
          { code: "RIG_COMMAND_FAILED", message: errMsg },
          message.id,
        ),
      );
    });
}

// ============================================================================
// Server Setup
// ============================================================================

function startServer(): void {
  const config = loadConfig();

  const wss = new WebSocketServer({
    port: config.port,
    host: config.host,
  });

  logger.info("ProPulse Bridge server starting", {
    host: config.host,
    port: config.port,
  });

  wss.on("listening", () => {
    logger.info("ProPulse Bridge server listening", {
      host: config.host,
      port: config.port,
      securityNote: "Bound to localhost only - remote connections blocked",
    });

    // Auto-start rig controller (non-blocking — if no rig is found, that is fine)
    startRig().catch((err: unknown) => {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn("Rig controller auto-start failed (will retry on demand)", {
        error: errMsg,
      });
    });
  });

  wss.on("connection", (socket, request) => {
    const clientId = generateClientId();
    const remoteAddress = request.socket.remoteAddress ?? "unknown";

    const client: ConnectedClient = {
      id: clientId,
      socket,
      connectedAt: new Date(),
      remoteAddress,
    };

    clients.set(clientId, client);

    logger.info("Client connected", {
      clientId,
      remoteAddress,
      totalClients: clients.size,
    });

    // Send welcome message with expanded capabilities
    const welcomeMessage = createMessage("bridge.welcome", {
      clientId,
      serverVersion: "0.2.0",
      capabilities: ["rig", "contest", "sync", "cluster", "wsjtx"],
      rigBackend: rigController?.getBackend() ?? "none",
      clusterConnected: clusterClient?.getStatus().connected ?? false,
      wsjtxListening: wsjtxListener !== null,
    });

    socket.send(JSON.stringify(welcomeMessage));

    socket.on("message", (data) => {
      const messageString = data.toString();
      handleMessage(client, messageString);
    });

    socket.on("close", (code, reason) => {
      clients.delete(clientId);

      logger.info("Client disconnected", {
        clientId,
        code,
        reason: reason.toString() || "No reason provided",
        totalClients: clients.size,
      });
    });

    socket.on("error", (error) => {
      logger.error("Client socket error", {
        clientId,
        error: error.message,
      });
    });
  });

  wss.on("error", (error) => {
    logger.error("WebSocket server error", {
      error: error.message,
    });
  });

  // Graceful shutdown
  const shutdown = (signal: string) => {
    logger.info("Shutdown signal received", { signal });

    // Clean up integration modules
    stopCluster();
    stopWSJTX();
    stopRig();

    // Close all client connections
    for (const client of clients.values()) {
      const shutdownMessage = createMessage("bridge.shutdown", {
        reason: "Server shutting down",
      });

      client.socket.send(JSON.stringify(shutdownMessage));
      client.socket.close(1001, "Server shutting down");
    }

    wss.close(() => {
      logger.info("Server closed gracefully");
      process.exit(0);
    });

    // Force exit after timeout
    setTimeout(() => {
      logger.warn("Forcing shutdown after timeout");
      process.exit(1);
    }, 5000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

// ============================================================================
// Entry Point
// ============================================================================

startServer();
