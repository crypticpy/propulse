/**
 * Net Control Manager Types for Propulse
 *
 * Defines net listings, sessions, check-ins, subscriptions, and filtering
 * for the Net Control Manager feature — covering scheduled and ad-hoc nets,
 * live session management, and operator check-in queues.
 */

// ── Union Types ─────────────────────────────────────────────────────────────

/** Classification of net purpose / operating style */
export type NetType =
  | "ragchew"
  | "traffic"
  | "swap"
  | "ares"
  | "dx"
  | "training"
  | "skywarn"
  | "club"
  | "specialty";

/** Visibility level controlling who can discover a net listing */
export type NetVisibility = "public" | "unlisted" | "private";

/** Role a user holds within a net's management team */
export type NetManagerRole = "owner" | "manager" | "ncs";

/** Lifecycle status of a net session */
export type SessionStatus = "scheduled" | "live" | "completed" | "cancelled";

/** Progress status of an individual check-in within a session */
export type CheckinStatus = "checked_in" | "had_turn" | "completed" | "skipped";

// ── Display Constants ───────────────────────────────────────────────────────

/** Human-readable labels for each net type */
export const NET_TYPE_LABELS: Record<NetType, string> = {
  ragchew: "Ragchew / Roundtable",
  traffic: "Traffic Net",
  swap: "Swap & Shop",
  ares: "ARES / RACES",
  dx: "DX Net",
  training: "Training / Elmer",
  skywarn: "SKYWARN / Weather",
  club: "Club Net",
  specialty: "Specialty",
};

/** Tailwind-compatible color classes for net-type badges */
export const NET_TYPE_COLORS: Record<NetType, string> = {
  ragchew: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  traffic:
    "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
  swap: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
  ares: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  dx: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300",
  training: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300",
  skywarn:
    "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  club: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300",
  specialty: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300",
};

/** Display labels for formality levels 1-5 */
export const FORMALITY_LABELS: Record<number, string> = {
  1: "Casual",
  2: "Relaxed",
  3: "Moderate",
  4: "Structured",
  5: "Formal",
};

/** Tailwind color classes for formality levels 1-5 */
export const FORMALITY_COLORS: Record<number, string> = {
  1: "bg-green-500/20 text-green-400 border-green-500/30",
  2: "bg-teal-500/20 text-teal-400 border-teal-500/30",
  3: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  4: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  5: "bg-red-500/20 text-red-400 border-red-500/30",
};

// ── Schedule & Repeater ─────────────────────────────────────────────────────

/** Recurrence pattern for a net's meeting schedule */
export interface NetSchedule {
  /** How often the net meets */
  pattern: "weekly" | "biweekly" | "monthly" | "daily" | "adhoc";
  /** Day of week (0 = Sunday, 6 = Saturday) — used with weekly/biweekly */
  dayOfWeek?: number;
  /** Day of month (1-31) — used with monthly */
  dayOfMonth?: number;
  /** Start time in UTC (HH:MM format) */
  timeUtc: string;
  /** IANA timezone for display purposes (e.g., "America/New_York") */
  timezone?: string;
}

/** Repeater information associated with a net's operating frequency */
export interface RepeaterInfo {
  /** Repeater callsign (e.g., "W1AW") */
  callsign: string;
  /** Repeater offset (e.g., "+0.6 MHz", "-5 MHz") */
  offset: string;
  /** CTCSS tone or DCS code (e.g., "100.0 Hz", "D023") */
  tone: string;
}

// ── Core Entities ───────────────────────────────────────────────────────────

/** Full net listing with all metadata needed for discovery and management */
export interface Net {
  /** Unique identifier */
  id: string;
  /** Display name of the net */
  name: string;
  /** Classification of net purpose */
  type: NetType;
  /** Longer description of the net's purpose, rules, or history */
  description: string;
  /** Primary operating frequency (e.g., "146.520 MHz") */
  frequency: string;
  /** Alternate / secondary frequency */
  altFrequency?: string;
  /** Operating mode (e.g., "FM", "SSB", "CW") */
  mode: string;
  /** Band designation (e.g., "2m", "70cm", "40m") */
  band: string;
  /** Meeting schedule configuration */
  schedule?: NetSchedule;
  /** Typical duration of a session in minutes */
  durationMinutes?: number;
  /** Geographic region or coverage area */
  region?: string;
  /** Repeater details if the net operates on a repeater */
  repeaterInfo?: RepeaterInfo;
  /** Template text for the net preamble read by NCS */
  preambleTemplate?: string;
  /** Free-form tags for search and categorisation */
  tags: string[];
  /** Who can discover this net */
  visibility: NetVisibility;
  /** External website or info page URL */
  websiteUrl?: string;
  /** Formality level from 1 (casual ragchew) to 5 (formal NTS traffic) */
  formalityLevel?: number;
  /** Protocol guide — what to expect when checking into this net */
  protocolNotes?: string;
  /** Whether the net welcomes newcomers / first-time check-ins */
  newcomerFriendly: boolean;
  /** EchoLink node number for VoIP access */
  echolinkNode?: string;
  /** AllStar node number for VoIP access */
  allstarNode?: string;
  /** IRLP node number for VoIP access */
  irlpNode?: string;
  /** Cached count of subscribers for display */
  subscriberCount: number;
  /** User ID of the net creator */
  createdBy: string;
  /** ISO timestamp of creation */
  createdAt: string;
  /** ISO timestamp of last update */
  updatedAt: string;
}

/** A user's management role within a specific net */
export interface NetManager {
  /** Net this role belongs to */
  netId: string;
  /** User holding the role */
  userId: string;
  /** Management role level */
  role: NetManagerRole;
  /** Optional display callsign for the manager */
  callsign?: string;
  /** ISO timestamp of when this role was granted */
  createdAt: string;
}

/** A user's subscription / notification preferences for a net */
export interface NetSubscription {
  /** Subscribed user ID */
  userId: string;
  /** Net being subscribed to */
  netId: string;
  /** Send alert 10 minutes before session start */
  alert10min: boolean;
  /** Send alert 5 minutes before session start */
  alert5min: boolean;
  /** Send alert 3 minutes before session start */
  alert3min: boolean;
  /** Whether to display this net on the user's public profile */
  showOnProfile: boolean;
  /** ISO timestamp of subscription creation */
  createdAt: string;
}

/** An RSVP indicating a user plans to attend a specific session date */
export interface NetRsvp {
  id: string;
  netId: string;
  userId: string;
  sessionDate: string;
  createdAt: string;
}

// ── Sessions & Check-ins ────────────────────────────────────────────────────

/** A single live or completed instance of a net session */
export interface NetSession {
  /** Unique session identifier */
  id: string;
  /** Parent net this session belongs to */
  netId: string;
  /** User ID of the Net Control Station operator */
  ncsUserId: string;
  /** Callsign of the NCS operator */
  ncsCallsign: string;
  /** ISO timestamp when the session started */
  startedAt: string;
  /** ISO timestamp when the session ended (null if still live) */
  endedAt?: string;
  /** Current lifecycle status */
  status: SessionStatus;
  /** Running count of check-ins */
  checkinCount: number;
  /** NCS operator notes during the session */
  notes?: string;
  /** Post-session summary text */
  summary?: string;
  /** ISO timestamp of record creation */
  createdAt: string;
  /** ISO timestamp of last update */
  updatedAt: string;
}

/** Aggregated statistics for a completed session */
export interface SessionSummary {
  /** Total number of unique check-ins */
  totalCheckins: number;
  /** Session duration in minutes */
  duration: number;
  /** Callsign of the NCS operator */
  ncsCallsign: string;
  /** Notable highlights or remarks from the session */
  highlights: string[];
}

/** An individual operator's check-in record within a session */
export interface NetCheckin {
  /** Unique check-in identifier */
  id: string;
  /** Session this check-in belongs to */
  sessionId: string;
  /** Callsign of the checked-in operator */
  callsign: string;
  /** User ID if the operator has a Propulse account */
  userId?: string;
  /** ISO timestamp of when the operator checked in */
  checkedInAt: string;
  /** Current progress status in the session queue */
  status: CheckinStatus;
  /** Whether this check-in was relayed through another station */
  isRelay: boolean;
  /** Callsign of the relaying station (if isRelay is true) */
  relayVia?: string;
  /** Traffic or message notes passed during check-in */
  trafficNotes?: string;
  /** Position in the NCS queue (1-based) */
  queuePosition: number;
  /** ISO timestamp of record creation */
  createdAt: string;
  /** ISO timestamp of last update */
  updatedAt: string;
}

// ── Filtering & Forms ───────────────────────────────────────────────────────

/** Filter state for the net directory / search view */
export interface NetFilters {
  /** Free-text search query */
  search: string;
  /** Filter by net type */
  type: NetType | null;
  /** Filter by band designation */
  band: string | null;
  /** Filter by operating mode */
  mode: string | null;
  /** Filter by meeting day (0 = Sunday, 6 = Saturday) */
  dayOfWeek: number | null;
  /** Filter by geographic region */
  region: string | null;
  /** Sort order for results */
  sortBy: "popularity" | "upcoming" | "recent";
  /** Filter by formality level (1-5) */
  formalityLevel: number | null;
  /** Filter to show only newcomer-friendly nets */
  newcomerFriendly: boolean | null;
}

/** Default filter values — no active filters, sorted by popularity */
export const DEFAULT_NET_FILTERS: NetFilters = {
  search: "",
  type: null,
  band: null,
  mode: null,
  dayOfWeek: null,
  region: null,
  sortBy: "popularity",
  formalityLevel: null,
  newcomerFriendly: null,
};

/** Input shape for creating a new net listing */
export interface CreateNetInput {
  /** Display name of the net */
  name: string;
  /** Classification of net purpose */
  type: NetType;
  /** Optional longer description */
  description?: string;
  /** Primary operating frequency */
  frequency: string;
  /** Alternate / secondary frequency */
  altFrequency?: string;
  /** Operating mode */
  mode: string;
  /** Band designation */
  band: string;
  /** Meeting schedule configuration */
  schedule?: NetSchedule;
  /** Typical duration in minutes */
  durationMinutes?: number;
  /** Geographic region or coverage area */
  region?: string;
  /** Repeater details */
  repeaterInfo?: RepeaterInfo;
  /** Preamble template text */
  preambleTemplate?: string;
  /** Free-form tags */
  tags?: string[];
  /** Visibility level */
  visibility?: NetVisibility;
  /** External website URL */
  websiteUrl?: string;
  /** Formality level (1-5) */
  formalityLevel?: number;
  /** Protocol notes */
  protocolNotes?: string;
  /** Whether the net welcomes newcomers */
  newcomerFriendly?: boolean;
  /** EchoLink node number */
  echolinkNode?: string;
  /** AllStar node number */
  allstarNode?: string;
  /** IRLP node number */
  irlpNode?: string;
}

/** Options passed when an operator checks in to a live session */
export interface CheckinOpts {
  /** Whether this check-in is being relayed */
  isRelay?: boolean;
  /** Callsign of the relaying station */
  relayVia?: string;
  /** Traffic or message notes */
  trafficNotes?: string;
}
