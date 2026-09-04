# ProPulse Bridge

WebSocket server for CAT control, multi-operator synchronization, and external integrations.

## Overview

The ProPulse Bridge is a local WebSocket server that acts as a communication layer between the ProPulse web application and external systems:

- **CAT Control**: Interface with radio transceivers via Hamlib or direct serial connections
- **Multi-Operator Sync**: Coordinate multiple operators during contest operations
- **External Integrations**: Connect to external logging software, cluster clients, and other ham radio tools

## Installation

```bash
cd bridge
npm install
```

## Running

### Development Mode

Development mode uses `ts-node-dev` for automatic reloading:

```bash
npm run dev
```

### Production Mode

Build and run the compiled JavaScript:

```bash
npm run build
npm start
```

### From Root Project

The bridge can also be started from the root ProPulse project:

```bash
npm run bridge        # Development mode
npm run bridge:build  # Build for production
```

## Configuration

Configuration is done via environment variables:

| Variable       | Default     | Description                                      |
| -------------- | ----------- | ------------------------------------------------ |
| `BRIDGE_PORT`  | `9867`      | WebSocket server port                            |
| `BRIDGE_HOST`  | `127.0.0.1` | Bind address (localhost only)                    |
| `BRIDGE_ROTOR` | _(unset)_   | Set to `1` to enable the Hamlib rotctld client   |
| `ROTCTLD_HOST` | `127.0.0.1` | rotctld host (only used when the rotor is on)    |
| `ROTCTLD_PORT` | `4533`      | rotctld port (only used when the rotor is on)    |

Rotator control is opt-in: only `BRIDGE_ROTOR=1` enables it, and only then does
the welcome message advertise the `rotor` capability. `ROTCTLD_HOST`/
`ROTCTLD_PORT` configure an enabled client; they never enable one. Rotator
commands are refused while PTT is keyed.

Example:

```bash
BRIDGE_PORT=9868 npm run dev
BRIDGE_ROTOR=1 npm run dev      # with a rotctld on 127.0.0.1:4533
```

## Security

**The bridge server ONLY binds to localhost (127.0.0.1).**

This is a deliberate security constraint:

- No remote connections are accepted
- The server cannot be configured to bind to external interfaces
- All communication stays on the local machine

This design ensures that:

1. CAT control commands cannot be issued remotely
2. Contest data cannot be intercepted over the network
3. The bridge cannot be used as an attack vector

If you need remote access (e.g., for multi-computer setups), use a secure tunnel:

```bash
# Example using SSH tunnel from remote machine
ssh -L 9867:127.0.0.1:9867 user@contest-pc
```

## Message Protocol

All messages use a JSON envelope format:

```typescript
interface MessageEnvelope {
  type: string; // Message type identifier
  id?: string; // Optional correlation ID
  ts: string; // ISO 8601 timestamp
  payload: unknown; // Message-specific data
}
```

### Example Messages

**Connecting:**

After connection, the server sends a welcome message:

```json
{
  "type": "bridge.welcome",
  "ts": "2024-01-15T12:00:00.000Z",
  "payload": {
    "clientId": "client_1705320000000_abc123",
    "serverVersion": "0.1.0",
    "capabilities": ["rig", "contest", "sync"]
  }
}
```

**Sending a message:**

```json
{
  "type": "rig.status",
  "id": "msg_001",
  "ts": "2024-01-15T12:00:01.000Z",
  "payload": {
    "connected": true,
    "frequency": 14074000,
    "mode": "USB"
  }
}
```

**Response (echo/ack):**

```json
{
  "type": "rig.status.ack",
  "id": "msg_001",
  "ts": "2024-01-15T12:00:01.100Z",
  "payload": {
    "received": true,
    "originalPayload": { ... }
  }
}
```

### Message Types

| Type                     | Direction        | Description                |
| ------------------------ | ---------------- | -------------------------- |
| `bridge.welcome`         | Server -> Client | Sent on connection         |
| `bridge.shutdown`        | Server -> Client | Server shutting down       |
| `rig.status`             | Bidirectional    | Current rig status         |
| `rig.update`             | Client -> Server | Request rig update         |
| `rig.set`                | Client -> Server | Set rig parameters         |
| `contest.session.create` | Client -> Server | Create contest session     |
| `contest.session.join`   | Client -> Server | Join existing session      |
| `contest.session.event`  | Server -> Client | Contest event notification |
| `contest.lock.set`       | Client -> Server | Request callsign/freq lock |
| `contest.lock.state`     | Server -> Client | Current lock state         |
| `contest.note.add`       | Client -> Server | Add note to log            |

## Testing the Connection

Using websocat:

```bash
websocat ws://127.0.0.1:9867
```

Using Node.js:

```javascript
const WebSocket = require("ws");
const ws = new WebSocket("ws://127.0.0.1:9867");

ws.on("open", () => {
  const msg = {
    type: "rig.status",
    ts: new Date().toISOString(),
    payload: { connected: false },
  };
  ws.send(JSON.stringify(msg));
});

ws.on("message", (data) => {
  console.log("Received:", JSON.parse(data.toString()));
});
```

## Logging

The server outputs structured JSON logs to stdout/stderr:

```json
{
  "timestamp": "2024-01-15T12:00:00.000Z",
  "level": "info",
  "message": "Client connected",
  "data": { "clientId": "client_...", "remoteAddress": "127.0.0.1" }
}
```

Log levels:

- `info`: Normal operational messages
- `warn`: Non-critical issues
- `error`: Errors requiring attention
- `debug`: Detailed debugging information

## Architecture

```
┌─────────────────┐     WebSocket      ┌─────────────────┐
│  ProPulse Web   │◄──────────────────►│  ProPulse       │
│  Application    │   localhost:9867   │  Bridge         │
└─────────────────┘                    └────────┬────────┘
                                                │
                                    ┌───────────┼───────────┐
                                    │           │           │
                                    ▼           ▼           ▼
                              ┌─────────┐ ┌─────────┐ ┌─────────┐
                              │ Hamlib  │ │ External│ │ Multi-Op│
                              │   CAT   │ │ Loggers │ │  Sync   │
                              └─────────┘ └─────────┘ └─────────┘
```

## License

Part of the ProPulse project.
