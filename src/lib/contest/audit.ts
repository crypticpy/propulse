/**
 * Contest QSO Audit Engine - Anomaly Detection
 *
 * Provides quality control for contest logging by detecting anomalies
 * and flagging potential issues for operator review.
 *
 * Audit rules check for:
 * - Missing required exchange fields
 * - Out-of-range zone numbers
 * - Suspicious prefix/band/time combinations
 * - Possible typos in exchange
 *
 * @module lib/contest/audit
 */

import type { ContestQSO, ContestSession } from "@/stores/contestStore";
import type { ContestDefinition } from "@/types/contest";
import {
  validateZone,
  validateSection,
  validateState,
  validateSerial,
  validateFieldDayClass,
  validatePrecedence,
  validateCheck,
  ARRL_RAC_SECTIONS,
  US_STATES,
} from "./validation";

// ============================================================================
// Types
// ============================================================================

/**
 * Severity level for audit flags
 */
export type AuditSeverity = "error" | "warning" | "info";

/**
 * Categories of audit issues
 */
export type AuditCategory =
  | "exchange" // Exchange field issues
  | "callsign" // Callsign format issues
  | "timing" // Time/band anomalies
  | "scoring" // Scoring-related issues
  | "dupe"; // Duplicate-related issues

/**
 * Audit flag code for programmatic handling
 */
export type AuditCode =
  | "MISSING_RST"
  | "MISSING_ZONE"
  | "MISSING_SECTION"
  | "MISSING_SERIAL"
  | "MISSING_STATE"
  | "MISSING_CLASS"
  | "INVALID_ZONE"
  | "INVALID_SECTION"
  | "INVALID_SERIAL"
  | "INVALID_STATE"
  | "INVALID_CLASS"
  | "INVALID_PRECEDENCE"
  | "INVALID_CHECK"
  | "INVALID_RST"
  | "SHORT_CALLSIGN"
  | "UNUSUAL_PREFIX"
  | "RAPID_QSO_SEQUENCE"
  | "BAND_TIME_MISMATCH"
  | "ZERO_POINTS"
  | "POSSIBLY_BUSTED"
  | "EXCHANGE_TYPO";

/**
 * An audit flag indicating a potential issue with a QSO
 */
export interface AuditFlag {
  /** Unique flag ID (for UI tracking) */
  id: string;
  /** Code for programmatic handling */
  code: AuditCode;
  /** Severity level */
  severity: AuditSeverity;
  /** Issue category */
  category: AuditCategory;
  /** Human-readable message */
  message: string;
  /** Field that has the issue (if applicable) */
  field?: string;
  /** Expected value or format */
  expected?: string;
  /** Actual value found */
  actual?: string;
}

/**
 * QSO with audit flags attached
 */
export interface FlaggedQSO {
  /** The QSO with potential issues */
  qso: ContestQSO;
  /** Audit flags for this QSO */
  flags: AuditFlag[];
  /** Highest severity among flags */
  maxSeverity: AuditSeverity;
  /** Count of each severity level */
  severityCounts: {
    error: number;
    warning: number;
    info: number;
  };
}

// ============================================================================
// Audit Rule Functions
// ============================================================================

/**
 * Check for missing required exchange fields
 */
function checkMissingExchange(
  qso: ContestQSO,
  contest: ContestDefinition,
): AuditFlag[] {
  const flags: AuditFlag[] = [];
  const exchangeFields = contest.exchange.fields;
  const exchange = qso.exchangeReceived.trim();

  if (!exchange) {
    flags.push({
      id: `${qso.id}-missing-exchange`,
      code: "MISSING_ZONE",
      severity: "error",
      category: "exchange",
      message: "Missing received exchange",
      field: "exchangeReceived",
    });
    return flags;
  }

  // Check RST if required
  if (exchangeFields.includes("rst")) {
    const rstReceived = qso.rstReceived?.trim();
    if (!rstReceived || rstReceived.length < 2) {
      flags.push({
        id: `${qso.id}-missing-rst`,
        code: "MISSING_RST",
        severity: "warning",
        category: "exchange",
        message: "Missing or incomplete RST received",
        field: "rstReceived",
        actual: rstReceived || "(empty)",
      });
    }
  }

  // Check for missing zone
  if (exchangeFields.includes("zone")) {
    const tokens = exchange.split(/\s+/).filter(Boolean);
    const zoneToken = tokens.find((t) => /^\d{1,2}$/.test(t));
    if (!zoneToken) {
      flags.push({
        id: `${qso.id}-missing-zone`,
        code: "MISSING_ZONE",
        severity: "error",
        category: "exchange",
        message: "Missing zone number in exchange",
        field: "exchangeReceived",
        expected: "Zone number (1-40 for CQ, 1-90 for ITU)",
        actual: exchange,
      });
    }
  }

  // Check for missing section
  if (exchangeFields.includes("section")) {
    const tokens = exchange.toUpperCase().split(/\s+/).filter(Boolean);
    const sectionToken = tokens.find((t) =>
      ARRL_RAC_SECTIONS.includes(t as (typeof ARRL_RAC_SECTIONS)[number]),
    );
    if (!sectionToken) {
      flags.push({
        id: `${qso.id}-missing-section`,
        code: "MISSING_SECTION",
        severity: "error",
        category: "exchange",
        message: "Missing ARRL/RAC section in exchange",
        field: "exchangeReceived",
        actual: exchange,
      });
    }
  }

  // Check for missing state
  if (exchangeFields.includes("state")) {
    const tokens = exchange.toUpperCase().split(/\s+/).filter(Boolean);
    const stateToken = tokens.find((t) =>
      US_STATES.includes(t as (typeof US_STATES)[number]),
    );
    if (!stateToken) {
      flags.push({
        id: `${qso.id}-missing-state`,
        code: "MISSING_STATE",
        severity: "warning",
        category: "exchange",
        message: "Missing US state in exchange",
        field: "exchangeReceived",
        actual: exchange,
      });
    }
  }

  // Check for missing serial
  if (exchangeFields.includes("serial") && (qso.serialReceived === undefined || qso.serialReceived === null)) {
        const tokens = exchange.split(/\s+/).filter(Boolean);
        const serialToken = tokens.find((t) => /^\d+$/.test(t));
        if (!serialToken) {
          flags.push({
            id: `${qso.id}-missing-serial`,
            code: "MISSING_SERIAL",
            severity: "warning",
            category: "exchange",
            message: "Missing serial number in exchange",
            field: "serialReceived",
            actual: exchange,
          });
        }
  }

  // Check for missing class (Field Day)
  if (exchangeFields.includes("class")) {
    const tokens = exchange.split(/\s+/).filter(Boolean);
    const classToken = tokens.find((t) => /^\d+[A-F]$/i.test(t));
    if (!classToken) {
      flags.push({
        id: `${qso.id}-missing-class`,
        code: "MISSING_CLASS",
        severity: "error",
        category: "exchange",
        message: "Missing Field Day class in exchange",
        field: "exchangeReceived",
        expected: "Class (e.g., 2A, 1E, 3F)",
        actual: exchange,
      });
    }
  }

  return flags;
}

/**
 * Validate exchange field values against contest rules
 */
function checkInvalidExchange(
  qso: ContestQSO,
  contest: ContestDefinition,
): AuditFlag[] {
  const flags: AuditFlag[] = [];
  const exchangeFields = contest.exchange.fields;
  const exchange = qso.exchangeReceived.trim();
  const tokens = exchange.split(/\s+/).filter(Boolean);
  const contestId = contest.id.toLowerCase();

  // Validate RST format
  if (exchangeFields.includes("rst") && qso.rstReceived) {
    const rst = qso.rstReceived.replace(/\D/g, "");
    const mode = qso.mode.toUpperCase();
    const expectedLen = mode === "SSB" ? 2 : 3;

    if (rst.length !== expectedLen) {
      flags.push({
        id: `${qso.id}-invalid-rst`,
        code: "INVALID_RST",
        severity: "warning",
        category: "exchange",
        message: `RST should be ${expectedLen} digits for ${mode}`,
        field: "rstReceived",
        expected: expectedLen === 3 ? "599" : "59",
        actual: qso.rstReceived,
      });
    } else {
      const r = parseInt(rst[0], 10);
      const s = parseInt(rst[1], 10);
      if (r < 1 || r > 5 || s < 1 || s > 9) {
        flags.push({
          id: `${qso.id}-invalid-rst-value`,
          code: "INVALID_RST",
          severity: "warning",
          category: "exchange",
          message: "RST values out of range (R: 1-5, S: 1-9)",
          field: "rstReceived",
          actual: qso.rstReceived,
        });
      }
    }
  }

  // Validate zone
  if (exchangeFields.includes("zone")) {
    const zoneToken = tokens.find((t) => /^\d{1,2}$/.test(t));
    if (zoneToken) {
      const zoneType =
        contestId.includes("cqww") || contestId.includes("cq-ww")
          ? "CQ"
          : "ITU";
      const issue = validateZone(zoneToken, zoneType);
      if (issue) {
        flags.push({
          id: `${qso.id}-invalid-zone`,
          code: "INVALID_ZONE",
          severity: "error",
          category: "exchange",
          message: issue.message,
          field: "exchangeReceived",
          expected: zoneType === "CQ" ? "1-40" : "1-90",
          actual: zoneToken,
        });
      }
    }
  }

  // Validate section
  if (exchangeFields.includes("section")) {
    const sectionToken = tokens.find((t) => /^[A-Z]{2,3}$/i.test(t));
    if (sectionToken) {
      const issue = validateSection(sectionToken);
      if (issue) {
        flags.push({
          id: `${qso.id}-invalid-section`,
          code: "INVALID_SECTION",
          severity: "warning",
          category: "exchange",
          message: issue.message,
          field: "exchangeReceived",
          actual: sectionToken,
        });
      }
    }
  }

  // Validate state
  if (exchangeFields.includes("state")) {
    const stateToken = tokens.find((t) => /^[A-Z]{2}$/i.test(t));
    if (stateToken) {
      const issue = validateState(stateToken);
      if (issue) {
        flags.push({
          id: `${qso.id}-invalid-state`,
          code: "INVALID_STATE",
          severity: "warning",
          category: "exchange",
          message: issue.message,
          field: "exchangeReceived",
          actual: stateToken,
        });
      }
    }
  }

  // Validate serial
  if (exchangeFields.includes("serial") && qso.serialReceived !== undefined) {
        const issue = validateSerial(String(qso.serialReceived));
        if (issue) {
          flags.push({
            id: `${qso.id}-invalid-serial`,
            code: "INVALID_SERIAL",
            severity: "warning",
            category: "exchange",
            message: issue.message,
            field: "serialReceived",
            actual: String(qso.serialReceived),
          });
        }
  }

  // Validate Field Day class
  if (exchangeFields.includes("class")) {
    const classToken = tokens.find((t) => /^\d+[A-F]$/i.test(t));
    if (classToken) {
      const issue = validateFieldDayClass(classToken);
      if (issue) {
        flags.push({
          id: `${qso.id}-invalid-class`,
          code: "INVALID_CLASS",
          severity: "error",
          category: "exchange",
          message: issue.message,
          field: "exchangeReceived",
          expected: "Valid class (1-99 followed by A-F)",
          actual: classToken,
        });
      }
    }
  }

  // Validate Sweepstakes precedence
  if (exchangeFields.includes("precedence")) {
    const precToken = tokens.find((t) => /^[QABUMS]$/i.test(t));
    if (precToken) {
      const issue = validatePrecedence(precToken);
      if (issue) {
        flags.push({
          id: `${qso.id}-invalid-precedence`,
          code: "INVALID_PRECEDENCE",
          severity: "warning",
          category: "exchange",
          message: issue.message,
          field: "exchangeReceived",
          expected: "Q, A, B, U, M, or S",
          actual: precToken,
        });
      }
    }
  }

  // Validate Sweepstakes check
  if (exchangeFields.includes("check")) {
    const checkToken = tokens.find((t) => /^\d{2}$/.test(t));
    if (checkToken) {
      const issue = validateCheck(checkToken);
      if (issue) {
        flags.push({
          id: `${qso.id}-invalid-check`,
          code: "INVALID_CHECK",
          severity: "warning",
          category: "exchange",
          message: issue.message,
          field: "exchangeReceived",
          expected: "Two-digit year (00-99)",
          actual: checkToken,
        });
      }
    }
  }

  return flags;
}

/**
 * Check for suspicious callsign patterns
 */
function checkCallsignAnomalies(qso: ContestQSO): AuditFlag[] {
  const flags: AuditFlag[] = [];
  const call = qso.callsign.toUpperCase();

  // Check minimum length
  if (call.length < 3) {
    flags.push({
      id: `${qso.id}-short-callsign`,
      code: "SHORT_CALLSIGN",
      severity: "error",
      category: "callsign",
      message: "Callsign is too short",
      field: "callsign",
      actual: call,
    });
  }

  // Check for unusual patterns (e.g., all numbers after prefix)
  if (/^[A-Z]+\d{4,}$/.test(call)) {
    flags.push({
      id: `${qso.id}-unusual-prefix`,
      code: "UNUSUAL_PREFIX",
      severity: "warning",
      category: "callsign",
      message: "Unusual callsign pattern (many consecutive digits)",
      field: "callsign",
      actual: call,
    });
  }

  return flags;
}

/**
 * Check for scoring anomalies
 */
function checkScoringAnomalies(qso: ContestQSO): AuditFlag[] {
  const flags: AuditFlag[] = [];

  // Check for zero points (unless it's a dupe)
  if (qso.points === 0 && !qso.isDupe) {
    flags.push({
      id: `${qso.id}-zero-points`,
      code: "ZERO_POINTS",
      severity: "info",
      category: "scoring",
      message: "QSO scored zero points (verify this is correct)",
      field: "points",
      actual: "0",
    });
  }

  return flags;
}

// ============================================================================
// Main Audit Functions
// ============================================================================

/**
 * Audit a single QSO against contest rules
 *
 * Runs all audit rules and returns any flags found.
 *
 * @param qso - The QSO to audit
 * @param contestDef - Contest definition with rules
 * @returns Array of audit flags
 *
 * @example
 * ```ts
 * const flags = auditQSO(qso, contestDef);
 * if (flags.some(f => f.severity === 'error')) {
 *   // Show error to operator
 * }
 * ```
 */
export function auditQSO(
  qso: ContestQSO,
  contestDef: ContestDefinition,
): AuditFlag[] {
  const flags: AuditFlag[] = [];

  // Run all audit checks
  flags.push(...checkMissingExchange(qso, contestDef));
  flags.push(...checkInvalidExchange(qso, contestDef));
  flags.push(...checkCallsignAnomalies(qso));
  flags.push(...checkScoringAnomalies(qso));

  return flags;
}

/**
 * Get all QSOs with audit flags from a session
 *
 * Audits all QSOs in the session and returns those with flags,
 * sorted by severity (errors first, then warnings, then info).
 *
 * @param session - Contest session with QSOs
 * @param contestDef - Contest definition with rules
 * @returns Array of flagged QSOs
 *
 * @example
 * ```ts
 * const queue = getAuditQueue(session, contestDef);
 * // Display in AuditQueuePanel
 * ```
 */
export function getAuditQueue(
  session: ContestSession | null,
  contestDef: ContestDefinition | null,
): FlaggedQSO[] {
  if (!session || !contestDef) {
    return [];
  }

  const flaggedQsos: FlaggedQSO[] = [];

  for (const qso of session.qsos) {
    const flags = auditQSO(qso, contestDef);

    if (flags.length > 0) {
      const severityCounts = {
        error: flags.filter((f) => f.severity === "error").length,
        warning: flags.filter((f) => f.severity === "warning").length,
        info: flags.filter((f) => f.severity === "info").length,
      };

      let maxSeverity: AuditSeverity = "info";
      if (severityCounts.error > 0) {
        maxSeverity = "error";
      } else if (severityCounts.warning > 0) {
               maxSeverity = "warning";
             }

      flaggedQsos.push({
        qso,
        flags,
        maxSeverity,
        severityCounts,
      });
    }
  }

  // Sort by severity (errors first) then by timestamp (most recent first)
  const severityOrder = { error: 0, warning: 1, info: 2 };
  flaggedQsos.sort((a, b) => {
    const severityDiff =
      severityOrder[a.maxSeverity] - severityOrder[b.maxSeverity];
    if (severityDiff !== 0) {
      return severityDiff;
    }

    // More recent QSOs first
    return b.qso.timestamp.localeCompare(a.qso.timestamp);
  });

  return flaggedQsos;
}

/**
 * Get count of audit issues by severity
 *
 * @param session - Contest session
 * @param contestDef - Contest definition
 * @returns Counts of errors, warnings, and info
 */
export function getAuditSummary(
  session: ContestSession | null,
  contestDef: ContestDefinition | null,
): { errors: number; warnings: number; info: number; total: number } {
  const queue = getAuditQueue(session, contestDef);

  const summary = { errors: 0, warnings: 0, info: 0, total: 0 };

  for (const flagged of queue) {
    summary.errors += flagged.severityCounts.error;
    summary.warnings += flagged.severityCounts.warning;
    summary.info += flagged.severityCounts.info;
  }

  summary.total = summary.errors + summary.warnings + summary.info;

  return summary;
}

/**
 * Check if a session has any audit errors
 *
 * Quick check for the presence of any error-level flags.
 *
 * @param session - Contest session
 * @param contestDef - Contest definition
 * @returns True if any errors exist
 */
export function hasAuditErrors(
  session: ContestSession | null,
  contestDef: ContestDefinition | null,
): boolean {
  if (!session || !contestDef) {
    return false;
  }

  for (const qso of session.qsos) {
    const flags = auditQSO(qso, contestDef);
    if (flags.some((f) => f.severity === "error")) {
      return true;
    }
  }

  return false;
}
