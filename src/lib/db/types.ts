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
}
