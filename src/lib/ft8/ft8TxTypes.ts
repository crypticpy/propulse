/**
 * ft8TxTypes — Type definitions for future FT8/FT4 transmit capability.
 *
 * These interfaces define the shape of TX messages, configuration, and state
 * so that UI components can be designed and wired before the actual FT8
 * encoder is implemented. All are display/design types — no runtime behavior.
 */

/** A queued FT8/FT4 transmit message. */
export interface FT8TxMessage {
  type: "CQ" | "GRID" | "REPORT" | "RR73" | "73" | "FREE";
  targetCall?: string;
  grid?: string;
  report?: string;
  freeText?: string;
}

/** TX configuration for an FT8/FT4 session. */
export interface FT8TxConfig {
  mode: "FT8" | "FT4";
  txFreqHz: number;
  audioFreqHz: number;
  autoSequence: boolean;
  /** Tx even/odd slot (true = even, false = odd) */
  txEven: boolean;
}

/** Runtime TX state. */
export interface FT8TxState {
  queuedMessage: FT8TxMessage | null;
  txActive: boolean;
  /** UTC ms since midnight when next TX slot starts */
  nextTxSlot: number;
  /** Auto-sequence stage if running */
  autoStage: FT8TxMessage["type"] | null;
}

/** TX capability check result. */
export interface FT8TxCapability {
  isReady: boolean;
  reason: string | null;
}
