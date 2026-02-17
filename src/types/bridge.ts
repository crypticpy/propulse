/**
 * ProPulse Bridge Types
 * Types for the bridge WebSocket protocol and rig control
 */

/**
 * Bridge connection state
 */
export type BridgeConnectionState =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

/**
 * Message envelope for bridge protocol
 * All messages are wrapped in this envelope format
 */
export interface BridgeMessage<T = unknown> {
  /** Message type identifier (e.g., "rig.update", "rig.setFrequency") */
  type: string;
  /** Unique message ID for request/response correlation */
  id?: string;
  /** ISO 8601 timestamp (bridge-native field) */
  ts?: string;
  /** Legacy unix timestamp in milliseconds */
  timestamp?: number;
  /** Message payload */
  payload: T;
  /** Optional error information for response messages */
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Rig operating mode
 */
export type RigMode =
  | "CW"
  | "CW-R"
  | "LSB"
  | "USB"
  | "AM"
  | "FM"
  | "RTTY"
  | "RTTY-R"
  | "DATA"
  | "DATA-R"
  | "PSK"
  | "FT8"
  | "FT4";

/**
 * Rig status from CAT control
 */
export interface RigStatus {
  /** Frequency in Hz */
  frequency: number;
  /** Operating mode */
  mode: RigMode | string;
  /** Band designation (e.g., "20m", "40m") */
  band: string;
  /** VFO designation (A, B, or Main/Sub) */
  vfo?: "A" | "B" | "MAIN" | "SUB";
  /** Split operation enabled */
  split?: boolean;
  /** TX frequency in Hz when split is active */
  txFrequency?: number;
  /** PTT state */
  ptt?: boolean;
  /** S-meter reading in dB over S9 (negative for below S9) */
  sMeter?: number;
  /** RF power setting in watts */
  power?: number;
  /** Whether rig is controlled via CAT (vs manual tuning) */
  catControlled?: boolean;
  /** Rig model identifier */
  rigModel?: string;
  /** Last update timestamp */
  lastUpdate?: number;
}

/**
 * Request to set rig frequency
 */
export interface SetFrequencyRequest {
  /** Frequency in Hz */
  frequency: number;
  /** Optional VFO to set (defaults to current) */
  vfo?: "A" | "B";
}

/**
 * Request to set rig mode
 */
export interface SetModeRequest {
  /** Operating mode */
  mode: RigMode | string;
  /** Optional filter width in Hz */
  filterWidth?: number;
}

/**
 * Request to set PTT state
 */
export interface SetPTTRequest {
  /** PTT state */
  ptt: boolean;
}

/**
 * Rig update message payload
 */
export type RigUpdatePayload = RigStatus;

/**
 * Bridge message types for type-safe message handling
 */
export type BridgeMessageType =
  | "rig.update"
  | "rig.setFrequency"
  | "rig.setMode"
  | "rig.setPTT"
  | "rig.status"
  | "rig.connect"
  | "rig.disconnect"
  | "rig:test"
  | "bridge.ping"
  | "bridge.pong"
  | "bridge.subscribe"
  | "bridge.unsubscribe"
  | "bridge.error"
  | "cluster.spot"
  | "cluster.status"
  | "cluster.connect"
  | "cluster.disconnect"
  | "wsjtx.status"
  | "wsjtx.decode"
  | "wsjtx.qso_logged"
  | "wsjtx.clear";

/**
 * Options for bridge connection
 */
export interface BridgeConnectionOptions {
  /** WebSocket URL (defaults to ws://127.0.0.1:9867) */
  url?: string;
  /** Whether the bridge connection is enabled (default: true) */
  enabled?: boolean;
  /** Auto-reconnect on disconnect */
  autoReconnect?: boolean;
  /** Maximum reconnection attempts (0 = unlimited) */
  maxReconnectAttempts?: number;
  /** Initial reconnection delay in ms */
  reconnectDelay?: number;
  /** Maximum reconnection delay in ms */
  maxReconnectDelay?: number;
  /** Ping interval in ms (0 = disabled) */
  pingInterval?: number;
  /** Connection timeout in ms */
  connectionTimeout?: number;
  /** Pong response timeout in ms (default 5000). If no pong after ping, connection is dead. */
  pongTimeout?: number;
}

/**
 * Bridge connection state and methods
 */
export interface BridgeConnection {
  /** Current connection state */
  state: BridgeConnectionState;
  /** Whether connected */
  connected: boolean;
  /** Whether currently connecting */
  connecting: boolean;
  /** Last error message if any */
  error: string | null;
  /** Last received message */
  lastMessage: BridgeMessage | null;
  /** Send a message to the bridge */
  send: <T>(type: string, payload: T) => boolean;
  /** Manually connect */
  connect: () => void;
  /** Manually disconnect */
  disconnect: () => void;
  /** Number of reconnection attempts */
  reconnectCount: number;
  /** Seconds until next reconnect attempt (null if not waiting to reconnect) */
  reconnectIn: number | null;
}

/**
 * Rig control state and methods from useRigBridge
 */
export interface RigBridgeState {
  /** Current frequency in Hz */
  frequency: number;
  /** Current operating mode */
  mode: RigMode | string;
  /** Current band designation */
  band: string;
  /** Full rig status */
  status: RigStatus | null;
  /** Whether bridge is connected */
  connected: boolean;
  /** Whether currently connecting */
  connecting: boolean;
  /** Connection error message */
  error: string | null;
  /** Set the rig frequency */
  setFrequency: (frequencyHz: number) => void;
  /** Set the rig mode */
  setMode: (mode: RigMode | string) => void;
  /** Set PTT state */
  setPTT: (ptt: boolean) => void;
  /** Whether rig is CAT controlled (vs manual tuning) */
  isCATControlled: boolean;
}

/**
 * Convert frequency in Hz to band designation
 */
export function frequencyToBand(frequencyHz: number): string {
  const freqMHz = frequencyHz / 1_000_000;

  if (freqMHz >= 1.8 && freqMHz <= 2.0) {
    return "160m";
  }
  if (freqMHz >= 3.5 && freqMHz <= 4.0) {
    return "80m";
  }
  if (freqMHz >= 5.3 && freqMHz <= 5.4) {
    return "60m";
  }
  if (freqMHz >= 7.0 && freqMHz <= 7.3) {
    return "40m";
  }
  if (freqMHz >= 10.1 && freqMHz <= 10.15) {
    return "30m";
  }
  if (freqMHz >= 14.0 && freqMHz <= 14.35) {
    return "20m";
  }
  if (freqMHz >= 18.068 && freqMHz <= 18.168) {
    return "17m";
  }
  if (freqMHz >= 21.0 && freqMHz <= 21.45) {
    return "15m";
  }
  if (freqMHz >= 24.89 && freqMHz <= 24.99) {
    return "12m";
  }
  if (freqMHz >= 28.0 && freqMHz <= 29.7) {
    return "10m";
  }
  if (freqMHz >= 50.0 && freqMHz <= 54.0) {
    return "6m";
  }
  if (freqMHz >= 144.0 && freqMHz <= 148.0) {
    return "2m";
  }
  if (freqMHz >= 420.0 && freqMHz <= 450.0) {
    return "70cm";
  }

  return "?";
}

/**
 * Format frequency for display (e.g., "14.035.00 MHz")
 */
export function formatFrequency(frequencyHz: number): string {
  const freqMHz = frequencyHz / 1_000_000;

  if (freqMHz >= 1000) {
    // GHz range
    return `${(freqMHz / 1000).toFixed(3)} GHz`;
  }

  if (freqMHz >= 100) {
    // VHF/UHF - show 3 decimal places
    return `${freqMHz.toFixed(3)} MHz`;
  }

  // HF - show kHz precision with formatted decimals
  const wholeMHz = Math.floor(freqMHz);
  const kHz = ((freqMHz - wholeMHz) * 1000).toFixed(2);
  return `${wholeMHz}.${kHz.padStart(6, "0")} MHz`;
}

/**
 * Format frequency compactly (e.g., "14.035")
 */
export function formatFrequencyCompact(frequencyHz: number): string {
  const freqMHz = frequencyHz / 1_000_000;
  return freqMHz.toFixed(3);
}

// === Cluster types ===

/**
 * Configuration for DX cluster connection via bridge
 */
export interface ClusterConfig {
  nodes: Array<{ host: string; port: number; name: string }>;
  callsign: string;
  password?: string;
  filters?: {
    bands?: number[];
    modes?: string[];
    minSNR?: number;
  };
}

/**
 * Cluster spot payload delivered over bridge WebSocket
 */
export interface ClusterSpotPayload {
  id: string;
  spotter: string;
  spotterGrid?: string;
  dx: string;
  dxGrid?: string;
  frequency: number; // kHz
  mode?: string;
  comment: string;
  time: string; // ISO timestamp
  band?: string;
}

/**
 * Cluster connection status payload
 */
export interface ClusterStatusPayload {
  connected: boolean;
  node?: string;
  spotsReceived: number;
  lastSpotTime?: string;
}

// === WSJT-X types ===

/**
 * WSJT-X application status payload
 */
export interface WSJTXStatusPayload {
  frequency: number; // Hz
  mode: string;
  dxCall?: string;
  dxGrid?: string;
  txEnabled: boolean;
  decoding: boolean;
  rxDF: number;
  txDF: number;
}

/**
 * WSJT-X decoded message payload
 */
export interface WSJTXDecodePayload {
  isNew: boolean;
  time: number; // ms since midnight
  snr: number;
  deltaTime: number;
  deltaFrequency: number;
  mode: string;
  message: string;
  lowConfidence: boolean;
  callsign?: string; // extracted from message
  grid?: string; // extracted from message
}

/**
 * WSJT-X QSO logged payload
 */
export interface WSJTXQSOLoggedPayload {
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
