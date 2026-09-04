# ProPulse Bridge Protocol Specification

**Version**: 1.0.0-draft
**Status**: Contract Only (No Implementation)
**Last Updated**: 2026-02-03

---

## 1. Overview

### 1.1 Purpose

The ProPulse Bridge Protocol defines a local WebSocket-based bridge for:

- **CAT Control**: Direct rig control via rigctld (Hamlib)
- **Multi-op Sync**: Real-time coordination between multiple operators on a LAN
- **N1MM Integration**: Receive and optionally send contest logging data to N1MM Logger+

### 1.2 Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ProPulse Frontend                           │
│                        (Browser Application)                        │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   │ WebSocket
                                   │ ws://127.0.0.1:7388
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        ProPulse Bridge                              │
│                    (Local Native Application)                       │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │
│  │   rigctld   │  │ N1MM UDP    │  │ LAN Relay   │  │ Session   │  │
│  │   Client    │  │ Listener    │  │ (Multi-op)  │  │ Manager   │  │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────┬─────┘  │
└─────────┼────────────────┼────────────────┼───────────────┼────────┘
          │                │                │               │
          ▼                ▼                ▼               │
    ┌───────────┐    ┌───────────┐    ┌───────────┐        │
    │  rigctld  │    │   N1MM    │    │   Other   │        │
    │  (Hamlib) │    │  Logger+  │    │  Stations │        │
    └───────────┘    └───────────┘    └───────────┘        │
          │                                                 │
          ▼                                                 │
    ┌───────────┐                                          │
    │    Rig    │◄─────────────────────────────────────────┘
    │  (Radio)  │         State synchronized
    └───────────┘
```

### 1.3 Design Principles

1. **Optional by Design**: The bridge is optional. ProPulse must function fully without it, with graceful degradation of CAT/multi-op features.
2. **Security First**: Localhost-only binding by default. No remote access without explicit configuration.
3. **Protocol Simplicity**: JSON-based messages over WebSocket for easy debugging and extension.
4. **Stateless Messages**: Each message is self-contained; no implicit state dependencies.

---

## 2. Transport Layer

### 2.1 WebSocket Connection

| Property        | Value                                                   |
| --------------- | ------------------------------------------------------- |
| Protocol        | WebSocket (RFC 6455)                                    |
| Default URI     | `ws://127.0.0.1:7388`                                   |
| Subprotocol     | `propulse-bridge-v1`                                    |
| Ping Interval   | 30 seconds                                              |
| Reconnect Delay | 1s, 2s, 4s, 8s, 16s, 30s (exponential backoff, max 30s) |

### 2.2 Connection Lifecycle

```
Client                                    Bridge
   │                                         │
   │──────── WebSocket UPGRADE ─────────────►│
   │         Sec-WebSocket-Protocol:         │
   │         propulse-bridge-v1              │
   │                                         │
   │◄─────── 101 Switching Protocols ────────│
   │         Sec-WebSocket-Protocol:         │
   │         propulse-bridge-v1              │
   │                                         │
   │──────── bridge.hello ──────────────────►│
   │                                         │
   │◄─────── bridge.welcome ─────────────────│
   │         (capabilities, version)         │
   │                                         │
   │◄────────────── ping ────────────────────│
   │──────────────── pong ──────────────────►│
   │                                         │
```

### 2.3 Security Configuration

| Mode         | Binding            | TLS      | Auth Token | Use Case              |
| ------------ | ------------------ | -------- | ---------- | --------------------- |
| Default      | `127.0.0.1` only   | No       | Optional   | Single-op local       |
| LAN Multi-op | `0.0.0.0` (opt-in) | Required | Required   | Multi-station contest |

**Security Constraints**:

- Bridge MUST bind to `127.0.0.1` by default
- Binding to `0.0.0.0` or any non-localhost address requires explicit user opt-in
- LAN mode MUST require TLS (wss://) and authentication token
- Authentication token MUST be at least 32 characters, cryptographically random

---

## 3. Message Envelope

### 3.1 Structure

All messages use a common envelope format:

```json
{
  "type": "message.type.here",
  "id": "optional-correlation-id",
  "ts": "2026-02-03T12:00:00.000Z",
  "payload": {}
}
```

### 3.2 Field Definitions

| Field     | Type   | Required | Description                                                                                      |
| --------- | ------ | -------- | ------------------------------------------------------------------------------------------------ |
| `type`    | string | Yes      | Dot-notation message type identifier                                                             |
| `id`      | string | No       | Correlation ID for request/response matching. If present in request, MUST be echoed in response. |
| `ts`      | string | Yes      | ISO 8601 timestamp with milliseconds (UTC)                                                       |
| `payload` | object | Yes      | Message-specific data (may be empty `{}`)                                                        |

### 3.3 Correlation IDs

For request/response patterns:

1. Client generates unique `id` (UUID recommended)
2. Bridge echoes same `id` in response
3. Client can match responses to pending requests
4. Timeout for unmatched responses: 10 seconds

---

## 4. Message Types

### 4.1 Bridge Handshake

#### `bridge.hello`

Sent by client immediately after WebSocket connection established.

```json
{
  "type": "bridge.hello",
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "ts": "2026-02-03T12:00:00.000Z",
  "payload": {
    "client": "propulse-web",
    "version": "1.0.0",
    "authToken": "optional-auth-token-for-lan-mode"
  }
}
```

#### `bridge.welcome`

Response from bridge with capabilities.

```json
{
  "type": "bridge.welcome",
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "ts": "2026-02-03T12:00:00.123Z",
  "payload": {
    "bridge": "propulse-bridge",
    "version": "1.0.0",
    "capabilities": ["rig", "contest", "n1mm"],
    "rigctld": {
      "connected": true,
      "host": "127.0.0.1",
      "port": 4532
    },
    "n1mm": {
      "listening": true,
      "port": 12060
    }
  }
}
```

**Capabilities** are what the client may use, not what it must assume. Optional
integrations only appear when they were configured — `rotor` is present only
when the bridge was started with `BRIDGE_ROTOR=1` (see §4.3). Clients MUST hide
controls for a capability the bridge did not advertise.

---

### 4.2 Rig Control (CAT)

#### `rig.status`

Request current rig status.

**Request**:

```json
{
  "type": "rig.status",
  "id": "req-001",
  "ts": "2026-02-03T12:00:00.000Z",
  "payload": {}
}
```

**Response**:

```json
{
  "type": "rig.status",
  "id": "req-001",
  "ts": "2026-02-03T12:00:00.050Z",
  "payload": {
    "connected": true,
    "vfoA": {
      "freq": 14074000,
      "mode": "USB"
    },
    "vfoB": {
      "freq": 14076000,
      "mode": "USB"
    },
    "activeVfo": "A",
    "split": false,
    "ptt": false,
    "power": 100,
    "rig": {
      "model": "Icom IC-7300",
      "rigctldId": 3073
    }
  }
}
```

#### `rig.update`

Pushed by bridge when rig state changes (unsolicited).

```json
{
  "type": "rig.update",
  "ts": "2026-02-03T12:00:05.000Z",
  "payload": {
    "vfoA": {
      "freq": 14075000,
      "mode": "USB"
    },
    "activeVfo": "A",
    "split": false,
    "ptt": false
  }
}
```

**Note**: Only changed fields are included. Clients should merge with cached state.

#### `rig.set`

Set rig parameters.

**Request**:

```json
{
  "type": "rig.set",
  "id": "req-002",
  "ts": "2026-02-03T12:00:10.000Z",
  "payload": {
    "vfoA": {
      "freq": 14025000,
      "mode": "CW"
    },
    "split": false
  }
}
```

**Response** (success):

```json
{
  "type": "rig.set",
  "id": "req-002",
  "ts": "2026-02-03T12:00:10.100Z",
  "payload": {
    "success": true,
    "applied": {
      "vfoA": {
        "freq": 14025000,
        "mode": "CW"
      },
      "split": false
    }
  }
}
```

**Settable Fields**:

| Field       | Type    | Description                                                  |
| ----------- | ------- | ------------------------------------------------------------ |
| `vfoA.freq` | integer | Frequency in Hz                                              |
| `vfoA.mode` | string  | Mode: USB, LSB, CW, CW-R, AM, FM, RTTY, RTTY-R, DATA, DATA-R |
| `vfoB.freq` | integer | VFO B frequency in Hz                                        |
| `vfoB.mode` | string  | VFO B mode                                                   |
| `activeVfo` | string  | "A" or "B"                                                   |
| `split`     | boolean | Split operation enabled                                      |
| `ptt`       | boolean | Push-to-talk state (use with caution)                        |

---

### 4.3 Rotator Control

Rotator support is **opt-in**. The bridge only speaks these messages, and only
advertises the `rotor` capability in `bridge.welcome`, when it was started with
`BRIDGE_ROTOR=1`.

| Variable       | Default     | Purpose                                        |
| -------------- | ----------- | ---------------------------------------------- |
| `BRIDGE_ROTOR` | _(unset)_   | Set to `1` to enable the rotctld client        |
| `ROTCTLD_HOST` | `127.0.0.1` | rotctld host (only used when enabled)          |
| `ROTCTLD_PORT` | `4533`      | rotctld port (only used when enabled)          |

Host/port variables configure an enabled client; they never enable one on their
own. When rotor control is disabled, `rotor.setHeading` and `rotor.stop` return
`ROTOR_UNAVAILABLE` and clients should not render turn-beam controls at all.

The bridge polls `p` (get_pos) once per second while at least one client is
connected. Polling never moves the rotator — motion happens only in response to
an explicit `rotor.setHeading` or `rotor.stop`.

#### `rotor.status`

Pushed by the bridge whenever the rotator state changes, and returned on request
when a client sends `rotor.status` with an empty payload.

```json
{
  "type": "rotor.status",
  "ts": "2026-09-04T12:00:00.000Z",
  "payload": {
    "connected": true,
    "azimuth": 247.0,
    "elevation": 0.0,
    "moving": false
  }
}
```

| Field       | Type            | Description                                    |
| ----------- | --------------- | ---------------------------------------------- |
| `connected` | boolean         | Whether the bridge is talking to rotctld       |
| `azimuth`   | number \| null  | Degrees 0–360, `null` when position is unknown |
| `elevation` | number \| null  | Degrees 0–90, `null` when position is unknown  |
| `moving`    | boolean         | Position changed since the previous poll       |
| `error`     | string          | Last transport error (present while offline)   |

#### `rotor.setHeading`

Turn the rotator to an absolute heading. One message = one explicit move.

**Request**:

```json
{
  "type": "rotor.setHeading",
  "id": "req-010",
  "ts": "2026-09-04T12:00:05.000Z",
  "payload": {
    "azimuth": 247.0,
    "elevation": 0.0
  }
}
```

**Response** (success): `rotor.setHeading.ack` with
`{ "success": true, "azimuth": 247, "elevation": 0 }`.

**Validation**: `azimuth` is a required finite number in 0–360. `elevation` is
optional, a finite number in 0–90, and defaults to `0` for azimuth-only
rotators. Anything else is rejected with `INVALID_PAYLOAD`.

**PTT safety**: the bridge rejects `rotor.setHeading` with
`ROTOR_BLOCKED_BY_PTT` whenever PTT is keyed (manual PTT owner or an active FT8
TX cycle). Release PTT before turning the beam.

#### `rotor.stop`

Stop all rotator motion immediately (rotctld `S`). Empty payload; replies with
`rotor.stop.ack` and `{ "success": true }`.

---

### 4.4 Contest Session

#### `contest.session.create`

Create a new shared contest session.

**Request**:

```json
{
  "type": "contest.session.create",
  "id": "req-010",
  "ts": "2026-02-03T12:00:00.000Z",
  "payload": {
    "contestId": "cq-ww-cw-2026",
    "callsign": "W1AW",
    "operators": ["W1AW", "N1MM"],
    "exchange": {
      "sent": "599 05",
      "template": "{rst} {zone}"
    },
    "bands": ["160m", "80m", "40m", "20m", "15m", "10m"],
    "modes": ["CW"]
  }
}
```

**Response**:

```json
{
  "type": "contest.session.create",
  "id": "req-010",
  "ts": "2026-02-03T12:00:00.100Z",
  "payload": {
    "success": true,
    "sessionId": "sess-abc123",
    "joinCode": "XYZZY-12345"
  }
}
```

#### `contest.session.join`

Join an existing session.

**Request**:

```json
{
  "type": "contest.session.join",
  "id": "req-011",
  "ts": "2026-02-03T12:05:00.000Z",
  "payload": {
    "joinCode": "XYZZY-12345",
    "operatorCall": "N1MM",
    "stationId": "station-2"
  }
}
```

**Response**:

```json
{
  "type": "contest.session.join",
  "id": "req-011",
  "ts": "2026-02-03T12:05:00.100Z",
  "payload": {
    "success": true,
    "sessionId": "sess-abc123",
    "contestId": "cq-ww-cw-2026",
    "callsign": "W1AW",
    "currentState": {
      "qsoCount": 150,
      "multipliers": 45,
      "score": 13500,
      "activeLocks": [
        {
          "band": "20m",
          "mode": "CW",
          "holder": "station-1",
          "since": "2026-02-03T11:30:00.000Z"
        }
      ]
    }
  }
}
```

#### `contest.session.event`

Broadcast when session state changes.

**QSO Logged**:

```json
{
  "type": "contest.session.event",
  "ts": "2026-02-03T12:10:00.000Z",
  "payload": {
    "event": "qso.logged",
    "sessionId": "sess-abc123",
    "stationId": "station-1",
    "qso": {
      "id": "qso-789",
      "call": "JA1ABC",
      "band": "20m",
      "mode": "CW",
      "freq": 14025000,
      "rstSent": "599",
      "rstRcvd": "599",
      "exchangeSent": "05",
      "exchangeRcvd": "25",
      "time": "2026-02-03T12:09:55.000Z",
      "points": 3,
      "newMult": true,
      "multiplier": "JA"
    },
    "score": {
      "qsoCount": 151,
      "multipliers": 46,
      "score": 13938
    }
  }
}
```

**QSO Edited**:

```json
{
  "type": "contest.session.event",
  "ts": "2026-02-03T12:15:00.000Z",
  "payload": {
    "event": "qso.edited",
    "sessionId": "sess-abc123",
    "stationId": "station-1",
    "qso": {
      "id": "qso-789",
      "call": "JA1ABD",
      "previousCall": "JA1ABC"
    }
  }
}
```

**QSO Deleted**:

```json
{
  "type": "contest.session.event",
  "ts": "2026-02-03T12:20:00.000Z",
  "payload": {
    "event": "qso.deleted",
    "sessionId": "sess-abc123",
    "stationId": "station-1",
    "qsoId": "qso-789",
    "score": {
      "qsoCount": 150,
      "multipliers": 45,
      "score": 13500
    }
  }
}
```

---

### 4.5 Multi-op Coordination

#### `contest.lock.set`

Request exclusive band/mode lock.

**Request**:

```json
{
  "type": "contest.lock.set",
  "id": "req-020",
  "ts": "2026-02-03T12:00:00.000Z",
  "payload": {
    "sessionId": "sess-abc123",
    "stationId": "station-2",
    "band": "15m",
    "mode": "CW",
    "action": "acquire"
  }
}
```

**Response** (success):

```json
{
  "type": "contest.lock.set",
  "id": "req-020",
  "ts": "2026-02-03T12:00:00.050Z",
  "payload": {
    "success": true,
    "lock": {
      "band": "15m",
      "mode": "CW",
      "holder": "station-2",
      "since": "2026-02-03T12:00:00.050Z"
    }
  }
}
```

**Response** (conflict):

```json
{
  "type": "contest.lock.set",
  "id": "req-020",
  "ts": "2026-02-03T12:00:00.050Z",
  "payload": {
    "success": false,
    "error": "LOCK_HELD",
    "message": "Band/mode locked by another station",
    "currentHolder": {
      "stationId": "station-1",
      "operatorCall": "W1AW",
      "since": "2026-02-03T11:30:00.000Z"
    }
  }
}
```

**Release**:

```json
{
  "type": "contest.lock.set",
  "id": "req-021",
  "ts": "2026-02-03T12:30:00.000Z",
  "payload": {
    "sessionId": "sess-abc123",
    "stationId": "station-2",
    "band": "15m",
    "mode": "CW",
    "action": "release"
  }
}
```

#### `contest.lock.state`

Broadcast of all current lock states.

```json
{
  "type": "contest.lock.state",
  "ts": "2026-02-03T12:00:00.100Z",
  "payload": {
    "sessionId": "sess-abc123",
    "locks": [
      {
        "band": "20m",
        "mode": "CW",
        "holder": "station-1",
        "operatorCall": "W1AW",
        "since": "2026-02-03T11:30:00.000Z"
      },
      {
        "band": "15m",
        "mode": "CW",
        "holder": "station-2",
        "operatorCall": "N1MM",
        "since": "2026-02-03T12:00:00.050Z"
      }
    ]
  }
}
```

#### `contest.note.add`

Add a shared note visible to all operators.

**Request**:

```json
{
  "type": "contest.note.add",
  "id": "req-030",
  "ts": "2026-02-03T13:00:00.000Z",
  "payload": {
    "sessionId": "sess-abc123",
    "stationId": "station-1",
    "note": {
      "text": "20m opening to JA - GO!",
      "priority": "high",
      "ttl": 300
    }
  }
}
```

**Broadcast**:

```json
{
  "type": "contest.note.add",
  "ts": "2026-02-03T13:00:00.050Z",
  "payload": {
    "sessionId": "sess-abc123",
    "note": {
      "id": "note-456",
      "text": "20m opening to JA - GO!",
      "priority": "high",
      "from": {
        "stationId": "station-1",
        "operatorCall": "W1AW"
      },
      "expires": "2026-02-03T13:05:00.050Z"
    }
  }
}
```

**Priority Levels**: `low`, `normal`, `high`, `urgent`

**TTL**: Time-to-live in seconds. Note auto-expires after this duration. Default: 600 (10 minutes).

---

### 4.6 N1MM Integration

#### `n1mm.rx`

Received N1MM UDP broadcast (RadioInfo, ContactInfo, etc.).

```json
{
  "type": "n1mm.rx",
  "ts": "2026-02-03T12:00:00.000Z",
  "payload": {
    "packetType": "RadioInfo",
    "raw": "<RadioInfo>...</RadioInfo>",
    "parsed": {
      "stationName": "Station1",
      "radioNr": 1,
      "freq": 14025000,
      "txFreq": 14025000,
      "mode": "CW",
      "opCall": "W1AW",
      "isRunning": true,
      "focusEntry": true,
      "entryWindowHwnd": 12345,
      "antenna": 1,
      "rotors": ""
    }
  }
}
```

**Supported N1MM Packet Types**:

| Packet Type      | Description                             |
| ---------------- | --------------------------------------- |
| `RadioInfo`      | Current radio frequency, mode, operator |
| `ContactInfo`    | QSO logged notification                 |
| `ContactReplace` | QSO edited notification                 |
| `ContactDelete`  | QSO deleted notification                |
| `LookupInfo`     | Callsign lookup result                  |
| `ScoreInfo`      | Current contest score summary           |
| `SpotInfo`       | DX spot from N1MM                       |

#### `n1mm.tx`

Send command to N1MM (if supported by N1MM configuration).

**Request**:

```json
{
  "type": "n1mm.tx",
  "id": "req-040",
  "ts": "2026-02-03T12:00:00.000Z",
  "payload": {
    "command": "setFreq",
    "radioNr": 1,
    "freq": 14030000
  }
}
```

**Response**:

```json
{
  "type": "n1mm.tx",
  "id": "req-040",
  "ts": "2026-02-03T12:00:00.050Z",
  "payload": {
    "success": true,
    "note": "N1MM TX support is limited and depends on N1MM configuration"
  }
}
```

**Note**: N1MM TX support is optional and may not be available in all configurations. The primary integration is receive-only via UDP broadcasts.

---

## 5. Error Handling

### 5.1 Error Response Format

All errors follow a consistent format:

```json
{
  "type": "error",
  "id": "original-request-id",
  "ts": "2026-02-03T12:00:00.000Z",
  "payload": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {
      "field": "optional additional context"
    }
  }
}
```

### 5.2 Error Codes

| Code               | HTTP Equiv | Description                                 |
| ------------------ | ---------- | ------------------------------------------- |
| `INVALID_MESSAGE`  | 400        | Malformed message or invalid JSON           |
| `UNKNOWN_TYPE`     | 400        | Unrecognized message type                   |
| `MISSING_FIELD`    | 400        | Required field missing from payload         |
| `INVALID_VALUE`    | 400        | Field value out of range or invalid format  |
| `AUTH_REQUIRED`    | 401        | Authentication required but not provided    |
| `AUTH_FAILED`      | 401        | Authentication token invalid                |
| `FORBIDDEN`        | 403        | Operation not permitted                     |
| `NOT_FOUND`        | 404        | Requested resource not found                |
| `CONFLICT`         | 409        | Resource conflict (e.g., lock already held) |
| `RIG_DISCONNECTED` | 503        | rigctld not connected                       |
| `RIG_ERROR`        | 500        | rigctld returned an error                   |
| `ROTOR_UNAVAILABLE`   | 503     | Rotor control disabled (`BRIDGE_ROTOR` unset)  |
| `ROTOR_BLOCKED_BY_PTT` | 409    | Rotator command refused while PTT is keyed     |
| `ROTOR_COMMAND_FAILED` | 500    | rotctld returned an error or the socket failed |
| `BRIDGE_ERROR`     | 500        | Internal bridge error                       |
| `N1MM_UNAVAILABLE` | 503        | N1MM integration not available              |

### 5.3 Reconnection Behavior

When WebSocket connection is lost:

1. **Client** immediately enters "disconnected" state
2. **Client** attempts reconnection with exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (max)
3. **Client** continues retrying indefinitely at 30s intervals
4. On reconnection, **Client** sends `bridge.hello` to re-establish session
5. **Client** re-requests current state (`rig.status`, etc.)

**UI Indication**: Frontend should clearly indicate bridge connection status.

---

## 6. Security Considerations

### 6.1 Localhost-Only Default

The bridge MUST bind exclusively to `127.0.0.1` by default. This prevents:

- Remote exploitation of CAT control
- Unauthorized contest session access
- Information disclosure

### 6.2 LAN Multi-op Mode

When LAN mode is explicitly enabled:

| Requirement      | Description                                         |
| ---------------- | --------------------------------------------------- |
| TLS Required     | Connection MUST use `wss://`                        |
| Auth Token       | 32+ character random token required                 |
| Token Generation | Bridge generates token on first LAN enable          |
| Token Storage    | User must securely share token with other operators |
| Token Rotation   | User can regenerate token at any time               |

### 6.3 Authentication Flow (LAN Mode)

```
Client                                    Bridge
   │                                         │
   │──────── WSS UPGRADE ───────────────────►│
   │                                         │
   │◄─────── 101 Switching Protocols ────────│
   │                                         │
   │──────── bridge.hello ──────────────────►│
   │         authToken: "token123..."        │
   │                                         │
   │         [Token Validation]              │
   │                                         │
   │◄─────── bridge.welcome ─────────────────│  (success)
   │         OR                              │
   │◄─────── error (AUTH_FAILED) ────────────│  (failure + disconnect)
   │                                         │
```

### 6.4 Rate Limiting

Bridge SHOULD implement rate limiting:

| Category             | Limit                        |
| -------------------- | ---------------------------- |
| `rig.set` commands   | 10/second per client         |
| `contest.lock.set`   | 5/second per client          |
| Failed auth attempts | 3 attempts, then 60s lockout |

---

## 7. Implementation Notes

### 7.1 Bridge is Optional

**Critical**: The ProPulse frontend MUST function fully without the bridge:

| Feature          | With Bridge | Without Bridge       |
| ---------------- | ----------- | -------------------- |
| DX Spots         | Full        | Full                 |
| Propagation      | Full        | Full                 |
| Manual Logging   | Full        | Full                 |
| CAT Control      | Automatic   | Manual entry         |
| Multi-op Sync    | Real-time   | Not available        |
| N1MM Integration | Automatic   | Manual export/import |

### 7.2 Graceful Degradation

Frontend behavior when bridge is unavailable:

1. **Connection Indicator**: Show "Bridge: Disconnected" in status bar
2. **Feature Badges**: Grey out CAT/multi-op features with "Requires Bridge" tooltip
3. **No Blocking**: Never block user workflow waiting for bridge
4. **Retry Background**: Continue reconnection attempts silently in background
5. **Seamless Resume**: When bridge reconnects, seamlessly enable features

### 7.3 State Synchronization

On reconnection, client MUST:

1. Send `bridge.hello`
2. Wait for `bridge.welcome`
3. Request `rig.status` to sync rig state
4. If in contest session, rejoin with `contest.session.join`
5. Request `contest.lock.state` for current locks

### 7.4 Frequency Handling

All frequencies are in **Hz** (not kHz or MHz):

| Display    | Wire Format |
| ---------- | ----------- |
| 14.074 MHz | `14074000`  |
| 7.030 MHz  | `7030000`   |
| 3.573 MHz  | `3573000`   |

### 7.5 Mode Mapping

Standard mode strings used across all messages:

| Mode     | Description                                 |
| -------- | ------------------------------------------- |
| `USB`    | Upper Sideband                              |
| `LSB`    | Lower Sideband                              |
| `CW`     | Continuous Wave                             |
| `CW-R`   | CW Reverse                                  |
| `AM`     | Amplitude Modulation                        |
| `FM`     | Frequency Modulation                        |
| `RTTY`   | Radio Teletype                              |
| `RTTY-R` | RTTY Reverse                                |
| `DATA`   | Data mode (USB-D on Icom, DATA-A on others) |
| `DATA-R` | Data mode reverse                           |
| `FT8`    | Alias for DATA at appropriate frequencies   |
| `FT4`    | Alias for DATA at appropriate frequencies   |

---

## 8. Future Considerations

The following are explicitly **out of scope** for v1.0 but may be added in future versions:

- **Amplifier Control**: Automatic band-switching amplifier support
- **CW Keying**: Direct CW keying through bridge
- **Voice Keyer**: DVK integration for SSB
- **Cluster Integration**: Direct DX cluster connection through bridge
- **WSJT-X Integration**: FT8/FT4 mode integration

---

## Appendix A: Example Session

Complete example of a typical contest session flow:

```
# 1. Client connects
→ bridge.hello { client: "propulse-web", version: "1.0.0" }
← bridge.welcome { capabilities: ["rig", "contest", "n1mm"], ... }

# 2. Get initial rig state
→ rig.status {}
← rig.status { connected: true, vfoA: { freq: 14025000, mode: "CW" }, ... }

# 3. Create contest session
→ contest.session.create { contestId: "cq-ww-cw-2026", callsign: "W1AW", ... }
← contest.session.create { success: true, sessionId: "sess-abc", joinCode: "XYZZY" }

# 4. Acquire band lock
→ contest.lock.set { band: "20m", mode: "CW", action: "acquire" }
← contest.lock.set { success: true, lock: { band: "20m", ... } }

# 5. Rig updates flow in (unsolicited)
← rig.update { vfoA: { freq: 14030000 } }
← rig.update { vfoA: { freq: 14032000 } }

# 6. N1MM QSO logged
← n1mm.rx { packetType: "ContactInfo", parsed: { call: "JA1ABC", ... } }

# 7. Another station joins
← contest.session.event { event: "operator.joined", operatorCall: "N1MM", ... }

# 8. Tune to different band
→ rig.set { vfoA: { freq: 21025000, mode: "CW" } }
← rig.set { success: true, applied: { ... } }

# 9. Release old lock, acquire new
→ contest.lock.set { band: "20m", mode: "CW", action: "release" }
← contest.lock.set { success: true }
→ contest.lock.set { band: "15m", mode: "CW", action: "acquire" }
← contest.lock.set { success: true, lock: { band: "15m", ... } }

# 10. Shared note from other op
← contest.note.add { note: { text: "15m dead, try 10m", from: { operatorCall: "N1MM" } } }
```

---

## Appendix B: TypeScript Type Definitions

For frontend implementation reference:

```typescript
// Message envelope
interface BridgeMessage<T = unknown> {
  type: string;
  id?: string;
  ts: string;
  payload: T;
}

// Rig types
interface RigStatus {
  connected: boolean;
  vfoA: VfoState;
  vfoB?: VfoState;
  activeVfo: "A" | "B";
  split: boolean;
  ptt: boolean;
  power?: number;
  rig?: RigInfo;
}

interface VfoState {
  freq: number;
  mode: RigMode;
}

type RigMode =
  | "USB"
  | "LSB"
  | "CW"
  | "CW-R"
  | "AM"
  | "FM"
  | "RTTY"
  | "RTTY-R"
  | "DATA"
  | "DATA-R"
  | "FT8"
  | "FT4";

interface RigInfo {
  model: string;
  rigctldId: number;
}

// Contest types
interface ContestSession {
  sessionId: string;
  contestId: string;
  callsign: string;
  operators: string[];
  bands: string[];
  modes: string[];
}

interface BandLock {
  band: string;
  mode: string;
  holder: string;
  operatorCall?: string;
  since: string;
}

interface ContestNote {
  id: string;
  text: string;
  priority: "low" | "normal" | "high" | "urgent";
  from: {
    stationId: string;
    operatorCall: string;
  };
  expires?: string;
}

// Error type
interface BridgeError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
```

---

**End of Specification**
