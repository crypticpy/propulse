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
  power?: number;
  vfo?: "A" | "B";
  split?: boolean;
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
// Message Type Constants
// ============================================================================

export const MessageTypes = {
  // Rig control
  RIG_STATUS: "rig.status",
  RIG_UPDATE: "rig.update",
  RIG_SET: "rig.set",

  // Contest session management
  CONTEST_SESSION_CREATE: "contest.session.create",
  CONTEST_SESSION_JOIN: "contest.session.join",
  CONTEST_SESSION_EVENT: "contest.session.event",

  // Contest multi-op coordination
  CONTEST_LOCK_SET: "contest.lock.set",
  CONTEST_LOCK_STATE: "contest.lock.state",

  // Contest notes
  CONTEST_NOTE_ADD: "contest.note.add",
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
  return (
    typeof envelope.type === "string" &&
    typeof envelope.ts === "string" &&
    "payload" in envelope
  );
}

/** Create a new message envelope with the current timestamp */
export function createMessage<T>(
  type: string,
  payload: T,
  id?: string,
): MessageEnvelope<T> {
  return {
    type,
    id,
    ts: new Date().toISOString(),
    payload,
  };
}
