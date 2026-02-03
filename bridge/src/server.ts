/**
 * ProPulse Bridge Server
 *
 * WebSocket server for CAT control, multi-operator synchronization,
 * and external integrations. Binds to localhost only for security.
 */

import { WebSocketServer, WebSocket } from "ws";
import { createMessage, isMessageEnvelope, MessageEnvelope } from "./types.js";

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

// ============================================================================
// Message Handling
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

    const errorResponse = createMessage("error", {
      code: "INVALID_JSON",
      message: "Message must be valid JSON",
    });

    client.socket.send(JSON.stringify(errorResponse));
    return;
  }

  if (!isMessageEnvelope(parsed)) {
    logger.warn("Received message with invalid envelope", {
      clientId: client.id,
    });

    const errorResponse = createMessage("error", {
      code: "INVALID_ENVELOPE",
      message: "Message must have type, ts, and payload fields",
    });

    client.socket.send(JSON.stringify(errorResponse));
    return;
  }

  const message = parsed as MessageEnvelope;

  logger.info("Received message", {
    clientId: client.id,
    messageType: message.type,
    messageId: message.id,
  });

  // Echo the message back for testing purposes
  // In the future, this will route to appropriate handlers
  const echoResponse = createMessage(
    `${message.type}.ack`,
    {
      received: true,
      originalPayload: message.payload,
    },
    message.id,
  );

  client.socket.send(JSON.stringify(echoResponse));
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

    // Send welcome message
    const welcomeMessage = createMessage("bridge.welcome", {
      clientId,
      serverVersion: "0.1.0",
      capabilities: ["rig", "contest", "sync"],
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
