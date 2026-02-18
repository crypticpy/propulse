/**
 * ProPulse Bridge Message Types
 *
 * Defines the message envelope and all supported message types for
 * communication between the ProPulse frontend and the bridge server.
 */

/**
 * Base message envelope for all bridge communications.
 * All messages must conform to this structure.
 */
export interface MessageEnvelope<T = unknown> {
  /** Message type identifier */
  type: string;
  /** Optional unique message ID for request/response correlation */
  id?: string;
  /** ISO 8601 timestamp of when the message was created */
  ts: string;
  /** Legacy unix timestamp in milliseconds (kept for client compatibility) */
  timestamp?: number;
  /** Message-specific payload */
  payload: T;
}

// ============================================================================
// Rig Control Messages
// ============================================================================

/** Current rig status information */
export interface RigStatus {
  connected: boolean;
  frequency?: number;
  mode?: string;
  /** Transmit power in watts (if available from the backend) */
  power?: number;
  /** Push-to-talk state */
  ptt?: boolean;
  vfo?: "A" | "B";
  split?: boolean;
  /** S-meter reading in dBm (relative to S9 in Hamlib convention) */
  smeter?: number;
  /** RIT (Receiver Incremental Tuning) state and offset in Hz */
  rit?: { enabled: boolean; offsetHz: number };
  /** XIT (Transmitter Incremental Tuning) state and offset in Hz */
  xit?: { enabled: boolean; offsetHz: number };
  /** Auto Notch Filter enabled */
  anf?: boolean;
  /** QSK (full break-in CW) enabled */
  qsk?: boolean;
  /** VOX (voice-operated transmit) enabled */
  vox?: boolean;
  /** TX antenna port name */
  txAntenna?: string;
  /** TX metering: power (watts), SWR, and ALC */
  txMeter?: { powerW?: number; swr?: number; alc?: number };
  /** CW keyer speed in WPM */
  cwSpeed?: number;
  /** IF shift in Hz */
  ifShift?: number;
  /** AGC mode: 0=OFF, 1=FAST, 2=MED, 3=SLOW */
  agcMode?: number;
}

/** Request to update rig settings */
export interface RigUpdateRequest {
  frequency?: number;
  mode?: string;
  power?: number;
  vfo?: "A" | "B";
  split?: boolean;
}

export type RigStatusMessage = MessageEnvelope<RigStatus>;
export type RigUpdateMessage = MessageEnvelope<RigUpdateRequest>;
export type RigSetMessage = MessageEnvelope<RigUpdateRequest>;

// ============================================================================
// Contest Session Messages
// ============================================================================

/** Request to create a new contest session */
export interface ContestSessionCreateRequest {
  contestId: string;
  contestName: string;
  callsign: string;
  operators: string[];
  category: string;
  startTime?: string;
}

/** Request to join an existing contest session */
export interface ContestSessionJoinRequest {
  sessionId: string;
  operatorCallsign: string;
}

/** Contest session event notification */
export interface ContestSessionEvent {
  sessionId: string;
  eventType:
    | "qso_logged"
    | "operator_joined"
    | "operator_left"
    | "session_ended";
  data: unknown;
}

export type ContestSessionCreateMessage =
  MessageEnvelope<ContestSessionCreateRequest>;
export type ContestSessionJoinMessage =
  MessageEnvelope<ContestSessionJoinRequest>;
export type ContestSessionEventMessage = MessageEnvelope<ContestSessionEvent>;

// ============================================================================
// Contest Lock Messages (Multi-Operator Coordination)
// ============================================================================

/** Request to set a lock on a callsign or frequency */
export interface ContestLockSetRequest {
  sessionId: string;
  lockType: "callsign" | "frequency";
  value: string | number;
  operatorId: string;
  ttlMs?: number;
}

/** Current lock state */
export interface ContestLockState {
  sessionId: string;
  locks: Array<{
    lockType: "callsign" | "frequency";
    value: string | number;
    operatorId: string;
    expiresAt: string;
  }>;
}

export type ContestLockSetMessage = MessageEnvelope<ContestLockSetRequest>;
export type ContestLockStateMessage = MessageEnvelope<ContestLockState>;

// ============================================================================
// Contest Notes Messages
// ============================================================================

/** Request to add a note to the contest log */
export interface ContestNoteAddRequest {
  sessionId: string;
  note: string;
  operatorId: string;
  callsign?: string;
  frequency?: number;
}

export type ContestNoteAddMessage = MessageEnvelope<ContestNoteAddRequest>;

// ============================================================================
// DX Cluster Messages
// ============================================================================

/** Configuration for a DX cluster node */
export interface ClusterNodeConfig {
  host: string;
  port: number;
  name: string;
}

/** Full cluster connection configuration */
export interface ClusterConfig {
  nodes: ClusterNodeConfig[];
  callsign: string;
  password?: string;
  filters?: {
    bands?: number[];
    modes?: string[];
    minSNR?: number;
  };
}

/** A single DX cluster spot */
export interface ClusterSpot {
  id: string;
  spotter: string;
  spotterGrid?: string;
  dx: string;
  dxGrid?: string;
  frequency: number;
  mode?: string;
  comment: string;
  time: string;
  band?: string;
}

/** DX cluster connection status */
export interface ClusterStatus {
  connected: boolean;
  node?: string;
  spotsReceived: number;
  lastSpotTime?: string;
}

export type ClusterSpotMessage = MessageEnvelope<ClusterSpot>;
export type ClusterStatusMessage = MessageEnvelope<ClusterStatus>;
export type ClusterConnectMessage = MessageEnvelope<ClusterConfig>;
export type ClusterDisconnectMessage = MessageEnvelope<Record<string, never>>;

// ============================================================================
// WSJT-X Messages
// ============================================================================

/** WSJT-X application status */
export interface WSJTXStatus {
  frequency: number;
  mode: string;
  dxCall?: string;
  dxGrid?: string;
  txEnabled: boolean;
  decoding: boolean;
  rxDF: number;
  txDF: number;
}

/** A single WSJT-X decode */
export interface WSJTXDecode {
  isNew: boolean;
  time: number;
  snr: number;
  deltaTime: number;
  deltaFrequency: number;
  mode: string;
  message: string;
  lowConfidence: boolean;
  callsign?: string;
  grid?: string;
  dxcc?: number;
}

/** WSJT-X logged QSO */
export interface WSJTXQSOLogged {
  callsign: string;
  grid?: string;
  frequency: number;
  mode: string;
  reportSent: string;
  reportReceived: string;
  txPower: string;
  comments: string;
  timestamp: string;
  adifRecord?: string;
}

/** WSJT-X listener configuration */
export interface WSJTXConfig {
  port: number;
  enabled: boolean;
}

/** WSJT-X UDP emitter configuration */
export interface WSJTXEmitConfig {
  enabled: boolean;
  port: number;
}

export type WSJTXStatusMessage = MessageEnvelope<WSJTXStatus>;
export type WSJTXDecodeMessage = MessageEnvelope<WSJTXDecode>;
export type WSJTXQSOLoggedMessage = MessageEnvelope<WSJTXQSOLogged>;
export type WSJTXClearMessage = MessageEnvelope<{ window?: string }>;

// ============================================================================
// FT8 TX Control Messages
// ============================================================================

/** Request to begin an FT8 TX cycle (assert PTT for a timed duration) */
export interface Ft8TxStartPayload {
  /** Duration of the TX period in milliseconds */
  durationMs: number;
  /** Optional: delay before asserting PTT (for timing alignment) */
  preDelayMs?: number;
}

/** FT8 TX status update broadcast to clients */
export interface Ft8TxStatusPayload {
  active: boolean;
  timeRemainingMs: number;
}

export type Ft8TxStartMessage = MessageEnvelope<Ft8TxStartPayload>;
export type Ft8TxStatusMessage = MessageEnvelope<Ft8TxStatusPayload>;

// ============================================================================
// Message Type Constants
// ============================================================================

export const MessageTypes = {
  // Bridge lifecycle/keepalive
  BRIDGE_PING: "bridge.ping",
  BRIDGE_PONG: "bridge.pong",
  BRIDGE_SUBSCRIBE: "bridge.subscribe",
  BRIDGE_UNSUBSCRIBE: "bridge.unsubscribe",

  // Rig control
  RIG_STATUS: "rig.status",
  RIG_UPDATE: "rig.update",
  RIG_SET: "rig.set",
  RIG_SET_FREQUENCY: "rig.setFrequency",
  RIG_SET_MODE: "rig.setMode",
  RIG_SET_PTT: "rig.setPTT",
  RIG_SET_RIT: "rig.setRIT",
  RIG_SET_XIT: "rig.setXIT",
  RIG_SET_SPLIT: "rig.setSplit",
  RIG_SET_ANF: "rig.setANF",
  RIG_SET_QSK: "rig.setQSK",
  RIG_SET_VOX: "rig.setVOX",
  RIG_SET_FUNC: "rig.setFunc",
  RIG_SET_IF_SHIFT: "rig.setIFShift",
  RIG_SET_CW_SPEED: "rig.setCWSpeed",
  RIG_CONNECT: "rig.connect",
  RIG_DISCONNECT: "rig.disconnect",
  RIG_TEST: "rig:test",

  // Contest session management
  CONTEST_SESSION_CREATE: "contest.session.create",
  CONTEST_SESSION_JOIN: "contest.session.join",
  CONTEST_SESSION_EVENT: "contest.session.event",

  // Contest multi-op coordination
  CONTEST_LOCK_SET: "contest.lock.set",
  CONTEST_LOCK_STATE: "contest.lock.state",

  // Contest notes
  CONTEST_NOTE_ADD: "contest.note.add",

  // DX Cluster
  CLUSTER_SPOT: "cluster.spot",
  CLUSTER_STATUS: "cluster.status",
  CLUSTER_CONNECT: "cluster.connect",
  CLUSTER_DISCONNECT: "cluster.disconnect",

  // WSJT-X
  WSJTX_STATUS: "wsjtx.status",
  WSJTX_DECODE: "wsjtx.decode",
  WSJTX_QSO_LOGGED: "wsjtx.qso_logged",
  WSJTX_CLEAR: "wsjtx.clear",
  WSJTX_CONFIGURE: "wsjtx.configure",

  // WSJT-X UDP emitter (outbound to external apps)
  WSJTX_EMIT_CONFIGURE: "wsjtx.emit.configure",
  WSJTX_EMIT_DECODE: "wsjtx.emit.decode",

  // FT8 TX control
  FT8_TX_START: "ft8.tx.start",
  FT8_TX_STOP: "ft8.tx.stop",
  FT8_TX_STATUS: "ft8.tx.status",
} as const;

export type MessageType = (typeof MessageTypes)[keyof typeof MessageTypes];

// ============================================================================
// Utility Types
// ============================================================================

/** Type guard to check if an object is a valid message envelope */
export function isMessageEnvelope(obj: unknown): obj is MessageEnvelope {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }
  const envelope = obj as Record<string, unknown>;
  const hasIsoTs = typeof envelope.ts === "string";
  const hasLegacyTs = typeof envelope.timestamp === "number";
  return (
    typeof envelope.type === "string" &&
    envelope.type.length > 0 &&
    (hasIsoTs || hasLegacyTs) &&
    envelope.payload !== undefined
  );
}

/** Create a new message envelope with the current timestamp */
export function createMessage<T>(
  type: string,
  payload: T,
  id?: string,
): MessageEnvelope<T> {
  const now = new Date();
  return {
    type,
    id,
    ts: now.toISOString(),
    timestamp: now.getTime(),
    payload,
  };
}
