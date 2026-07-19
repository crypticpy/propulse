/**
 * Type definitions for IndexedDB entities
 * Defines schemas for log entries, alert rules, and alert history
 */

/**
 * QSL card status values
 * Y = Yes (sent/received)
 * N = No
 * R = Requested
 * I = Ignore/Invalid
 */
export type QSLStatus = "Y" | "N" | "R" | "I";

/**
 * Log entry for QSO records
 * Represents a single contact in the logbook
 */
export interface LogEntry {
  /** Unique identifier (UUID) */
  id: string;
  /** Contacted station callsign (required) */
  callsign: string;
  /** Frequency in kHz */
  frequency: number;
  /** Operating mode (SSB, CW, FT8, etc.) */
  mode: string;
  /** Amateur band (20m, 40m, etc.) */
  band: string;
  /** Contact date in ISO format (YYYY-MM-DD) */
  date: string;
  /** Contact start time in UTC (HH:MM) */
  timeOn: string;
  /** Contact end time in UTC (HH:MM) */
  timeOff?: string;
  /** RST report sent (e.g., "599") */
  rstSent?: string;
  /** RST report received */
  rstRcvd?: string;
  /** Maidenhead grid locator */
  grid?: string;
  /** Operator name */
  name?: string;
  /** Location/QTH */
  qth?: string;
  /** Free-form notes */
  notes?: string;
  /** QSL card sent status */
  qslSent?: QSLStatus;
  /** QSL card received status */
  qslRcvd?: QSLStatus;
  /** Confirmed via Logbook of The World */
  lotw?: boolean;
  /** Confirmed via eQSL */
  eqsl?: boolean;
  /** Record creation timestamp (ISO) */
  createdAt: string;
  /** Record last update timestamp (ISO) */
  updatedAt: string;
  /** Station callsign (owner of the log) */
  stationCallsign?: string;
  /** Operator callsign (who made the contact) - for guest logging */
  operatorCallsign?: string;
  /** Whether this entry was made by a guest operator */
  isGuestEntry?: boolean;
  /** Guest session ID for grouping entries */
  guestSessionId?: string;
  /** Row version for conflict detection */
  version?: number;
  /** Device that last modified this entry */
  lastDeviceId?: string;
  /** DXCC entity number */
  dxcc?: number;
  /** Country name */
  country?: string;
  /** CQ zone */
  cqZone?: number;
  /** ITU zone */
  ituZone?: number;
  /** Continent code */
  continent?: string;
  /** US state abbreviation (for WAS tracking) */
  state?: string;
  /** Transmit power in watts */
  txPower?: number;
  /** My grid square at time of QSO */
  myGrid?: string;
  /** My rig description */
  myRig?: string;
  /** My antenna description */
  myAntenna?: string;
  /** Propagation mode */
  propMode?: string;
  /** Satellite name */
  satName?: string;
  /** Satellite mode */
  satMode?: string;
  /** Activation program (POTA, SOTA, etc.) */
  mySig?: string;
  /** My activation reference */
  mySigInfo?: string;
  /** Their activation program */
  sig?: string;
  /** Their activation reference */
  sigInfo?: string;
  /** Contest ID */
  contestId?: string;
  /** Serial received */
  srx?: string;
  /** Serial sent */
  stx?: string;
  /** Exchange string received */
  srxString?: string;
  /** Exchange string sent */
  stxString?: string;
  /** LoTW QSL sent status */
  lotwQslSent?: string;
  /** LoTW QSL received status */
  lotwQslRcvd?: string;
  /** ClubLog status */
  clublogStatus?: string;
  /** QRZ.com status */
  qrzcomStatus?: string;
}

/**
 * Alert notification settings
 */
export interface AlertNotification {
  /** Play audio alert */
  sound: boolean;
  /** Show browser notification */
  browser: boolean;
  /** Highlight in spot list */
  highlight: boolean;
}

/**
 * Alert rule conditions for matching spots
 */
export interface AlertConditions {
  /** Regex pattern for callsign matching (e.g., "^3Y.*" for Bouvet) */
  callsignPattern?: string;
  /** DXCC entity prefix pattern */
  entityPattern?: string;
  /** Filter by specific bands */
  bands?: string[];
  /** Filter by specific modes */
  modes?: string[];
  /** Minimum SNR threshold for FT8/digital modes */
  minSnr?: number;
  /** Filter by continent codes (AF, AN, AS, EU, NA, OC, SA) */
  continents?: string[];
}

/**
 * Alert rule for DX notifications
 * Defines conditions that trigger alerts when matching spots appear
 */
export interface AlertRule {
  /** Unique identifier (UUID) */
  id: string;
  /** Human-readable rule name */
  name: string;
  /** Whether the rule is active */
  enabled: boolean;
  /** Conditions that must match to trigger alert */
  conditions: AlertConditions;
  /** Notification settings when rule triggers */
  notification: AlertNotification;
  /** Rule creation timestamp (ISO) */
  createdAt: string;
  /** Last time this rule triggered (ISO) */
  lastTriggered?: string;
}

/**
 * Alert history entry
 * Records when an alert rule was triggered
 */
export interface AlertHistoryEntry {
  /** Unique identifier (UUID) */
  id: string;
  /** ID of the rule that triggered */
  ruleId: string;
  /** Name of the rule at trigger time */
  ruleName: string;
  /** ID of the spot that matched */
  spotId: string;
  /** Callsign that triggered the alert */
  callsign: string;
  /** Frequency in kHz */
  frequency: number;
  /** Amateur band */
  band: string;
  /** Operating mode (if available) */
  mode?: string;
  /** When the alert was triggered (ISO) */
  triggeredAt: string;
  /** Whether the user dismissed this alert */
  dismissed: boolean;
}

/**
 * FT8/FT4 decode record
 * Represents a single decoded digital mode message
 */
export interface Ft8Decode {
  /** Unique identifier (UUID) */
  id: string;
  /** ISO 8601 wall-clock timestamp when decoded */
  timestamp: string;
  /** ms since midnight UTC (WSJT-X protocol field) */
  time: number;
  /** Absolute ms since Unix epoch of the decode's cycle start (absent on rows written before this field existed) */
  epochMs?: number;
  /** Signal-to-noise ratio (dB) */
  snr: number;
  /** Time offset (seconds) */
  deltaTime: number;
  /** Audio frequency offset (Hz) */
  deltaFrequency: number;
  /** Decode mode: "FT8" or "FT4" */
  mode: string;
  /** Raw decoded message text */
  message: string;
  /** Extracted callsign */
  callsign?: string;
  /** Extracted Maidenhead grid */
  grid?: string;
  /** Whether this is a CQ call */
  isCQ?: boolean;
  /** True if LDPC errors > 0 */
  lowConfidence: boolean;
  /** RF frequency in Hz (VFO + audio offset) */
  frequencyHz?: number;
  /** Derived amateur band */
  band?: string;
  /** Station callsign at time of decode */
  myCallsign?: string;
  /** Source instance ID */
  instanceId?: string;
  /** Record creation timestamp (ISO) */
  createdAt: string;
  /** Record update timestamp (ISO) */
  updatedAt: string;
}

/**
 * Database schema for IndexedDB
 * Defines the structure of object stores and their indexes
 */
export interface DBSchema {
  logEntries: {
    key: string;
    value: LogEntry;
    indexes: {
      "by-callsign": string;
      "by-date": string;
      "by-band": string;
      "by-operatorCallsign": string;
      "by-guestSessionId": string;
      "by-dxcc": number;
      "by-mySig": string;
      "by-version": number;
    };
  };
  alertRules: {
    key: string;
    value: AlertRule;
    indexes: {
      "by-enabled": number;
    };
  };
  alertHistory: {
    key: string;
    value: AlertHistoryEntry;
    indexes: {
      "by-triggeredAt": string;
      "by-ruleId": string;
    };
  };
  ft8Decodes: {
    key: string;
    value: Ft8Decode;
    indexes: {
      "by-timestamp": string;
      "by-callsign": string;
      "by-band": string;
      "by-mode": string;
    };
  };
}
