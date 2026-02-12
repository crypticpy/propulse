/**
 * QSO Logging Types for Propulse
 *
 * Defines form state, lookup results, dupe checking, filtering,
 * sync conflict metadata, and statistics for the offline-first
 * QSO logging system.
 */

// ── Form State ──────────────────────────────────────────────────────────────

/** Source of rig/frequency data */
export type RigSource = "manual" | "bridge" | "wsjtx";

/** Form field state for QSO entry */
export interface QSOFormState {
  /** Contacted station callsign */
  callsign: string;
  /** Frequency in kHz */
  frequency: number;
  /** Operating mode (SSB, CW, FT8, etc.) */
  mode: string;
  /** Amateur band (20m, 40m, etc.) */
  band: string;
  /** RST report sent */
  rstSent: string;
  /** RST report received */
  rstRcvd: string;
  /** Maidenhead grid locator */
  grid: string;
  /** Operator name */
  name: string;
  /** Location / QTH */
  qth: string;
  /** Free-form notes */
  notes: string;
  /** Transmit power in watts */
  txPower: number | null;
  /** Activation program (POTA, SOTA, etc.) */
  mySig: string;
  /** My activation reference */
  mySigInfo: string;
  /** Their activation program */
  sig: string;
  /** Their activation reference */
  sigInfo: string;
  /** Contest ID */
  contestId: string;
  /** Serial sent */
  stx: string;
  /** Serial received */
  srx: string;
  /** Source of rig/frequency data */
  rigSource: RigSource;
}

// ── Callsign Lookup ─────────────────────────────────────────────────────────

/** Source of callsign lookup data */
export type LookupSource = "callook" | "hamqth" | "qrz" | "cache";

/** Result from a callsign lookup service */
export interface QSOLookupResult {
  /** Callsign that was looked up */
  callsign: string;
  /** Operator name */
  name?: string;
  /** Maidenhead grid locator */
  grid?: string;
  /** Location / QTH */
  qth?: string;
  /** Country name */
  country?: string;
  /** DXCC entity number */
  dxcc?: number;
  /** CQ zone */
  cqZone?: number;
  /** ITU zone */
  ituZone?: number;
  /** Latitude */
  lat?: number;
  /** Longitude */
  lon?: number;
  /** Profile image URL */
  imageUrl?: string;
  /** Which lookup service provided the data */
  source: LookupSource;
}

// ── Dupe Checking ───────────────────────────────────────────────────────────

/** Result of a duplicate QSO check */
export interface QSODupeInfo {
  /** Whether a duplicate was found */
  isDupe: boolean;
  /** Previous contacts with this callsign */
  previousContacts: Array<{
    date: string;
    band: string;
    mode: string;
    rstSent?: string;
  }>;
  /** Bands on which this callsign was previously worked */
  workedBands: string[];
  /** Modes on which this callsign was previously worked */
  workedModes: string[];
}

// ── Log Filtering ───────────────────────────────────────────────────────────

/** Filter state for the log viewer */
export interface QSOFilters {
  /** Free-text search across callsign, name, QTH, notes */
  search: string;
  /** Filter by band (null = all) */
  band: string | null;
  /** Filter by mode (null = all) */
  mode: string | null;
  /** Start date filter (YYYY-MM-DD, null = no limit) */
  dateFrom: string | null;
  /** End date filter (YYYY-MM-DD, null = no limit) */
  dateTo: string | null;
  /** Filter by activation program (null = all) */
  mySig: string | null;
  /** Filter by contest ID (null = all) */
  contestId: string | null;
  /** Filter by confirmed status (null = all) */
  confirmed: boolean | null;
  /** Filter by dupe status (null = all) */
  dupe: boolean | null;
}

// ── Sync Conflicts ──────────────────────────────────────────────────────────

/** Resolution status for a sync conflict */
export type SyncConflictStatus =
  | "pending"
  | "resolved_local"
  | "resolved_remote"
  | "resolved_merged";

/** Conflict metadata for UI resolution */
export interface SyncConflict {
  /** Unique conflict identifier */
  id: string;
  /** Log entry ID that has a conflict */
  entryId: string;
  /** Version number of the local entry */
  localVersion: number;
  /** Local entry data at time of conflict */
  localData: Record<string, unknown>;
  /** Version number of the remote entry */
  remoteVersion: number;
  /** Remote entry data at time of conflict */
  remoteData: Record<string, unknown>;
  /** Fields that differ between local and remote */
  conflictingFields: string[];
  /** Current resolution status */
  status: SyncConflictStatus;
  /** When the conflict was detected (ISO) */
  createdAt: string;
}

// ── Statistics ──────────────────────────────────────────────────────────────

/** Aggregated QSO statistics for the stats dashboard */
export interface QSOStats {
  /** Total number of QSOs in the log */
  totalQsos: number;
  /** Number of unique callsigns worked */
  uniqueCallsigns: number;
  /** Number of unique DXCC entities worked */
  uniqueDxcc: number;
  /** Number of unique 4-char grid squares worked */
  uniqueGrids: number;
  /** QSO count broken down by band */
  bandBreakdown: Record<string, number>;
  /** QSO count broken down by mode */
  modeBreakdown: Record<string, number>;
  /** Average QSOs per day */
  dailyRate: number;
  /** Timestamp of the most recent QSO (ISO, or null) */
  lastQso: string | null;
}

// ── Defaults ────────────────────────────────────────────────────────────────

/** Default / empty QSO form state */
export const DEFAULT_QSO_FORM: QSOFormState = {
  callsign: "",
  frequency: 0,
  mode: "",
  band: "",
  rstSent: "",
  rstRcvd: "",
  grid: "",
  name: "",
  qth: "",
  notes: "",
  txPower: null,
  mySig: "",
  mySigInfo: "",
  sig: "",
  sigInfo: "",
  contestId: "",
  stx: "",
  srx: "",
  rigSource: "manual",
};

/** Default / empty QSO filter state */
export const DEFAULT_QSO_FILTERS: QSOFilters = {
  search: "",
  band: null,
  mode: null,
  dateFrom: null,
  dateTo: null,
  mySig: null,
  contestId: null,
  confirmed: null,
  dupe: null,
};
