/**
 * Cabrillo Export Engine
 *
 * Generates Cabrillo-formatted log files for contest submission.
 * Supports Cabrillo v3.0 format per WWROF specification.
 *
 * @see https://wwrof.org/cabrillo/
 * @module lib/contest/cabrillo
 */

import type { ContestDefinition } from "@/types/contest";
import type { ContestSession, ContestQSO } from "@/stores/contestStore";
import type { UserStation } from "@/types/user";

/**
 * Validation warning for Cabrillo header fields
 */
export interface CabrilloValidationWarning {
  /** Field that has the issue */
  field: string;
  /** Human-readable warning message */
  message: string;
  /** Severity level */
  severity: "warning" | "error";
}

/**
 * Result of Cabrillo generation
 */
export interface CabrilloResult {
  /** Generated Cabrillo content */
  content: string;
  /** Validation warnings found during generation */
  warnings: CabrilloValidationWarning[];
  /** Whether the Cabrillo file is valid for submission */
  isValid: boolean;
  /** Statistics about the log */
  stats: {
    qsoCount: number;
    dupeCount: number;
    claimedScore: number;
  };
}

/**
 * Map store category values to Cabrillo-compatible values
 */
function mapCategoryOperator(
  operator: string,
): "SINGLE-OP" | "MULTI-OP" | "CHECKLOG" {
  switch (operator.toLowerCase()) {
    case "single-op":
      return "SINGLE-OP";
    case "multi-op":
    case "multi-single":
    case "multi-two":
    case "multi-multi":
      return "MULTI-OP";
    case "checklog":
      return "CHECKLOG";
    default:
      return "SINGLE-OP";
  }
}

function mapCategoryAssisted(assisted?: string): "ASSISTED" | "NON-ASSISTED" {
  if (assisted?.toLowerCase() === "assisted") {
    return "ASSISTED";
  }
  return "NON-ASSISTED";
}

function mapCategoryBand(band: string): string {
  const bandLower = band.toLowerCase();
  if (bandLower === "all") return "ALL";
  if (bandLower === "single") return "ALL"; // Single band but not specified which
  // Specific bands
  const bandMap: Record<string, string> = {
    "160m": "160M",
    "80m": "80M",
    "40m": "40M",
    "20m": "20M",
    "15m": "15M",
    "10m": "10M",
    "6m": "6M",
    "2m": "2M",
    "70cm": "70CM",
  };
  return bandMap[bandLower] || band.toUpperCase();
}

function mapCategoryMode(mode: string): "CW" | "SSB" | "RTTY" | "MIXED" {
  switch (mode.toLowerCase()) {
    case "cw":
      return "CW";
    case "ssb":
      return "SSB";
    case "rtty":
    case "digital":
      return "RTTY";
    case "mixed":
      return "MIXED";
    default:
      return "MIXED";
  }
}

function mapCategoryPower(power: string): "HIGH" | "LOW" | "QRP" {
  switch (power.toLowerCase()) {
    case "high":
      return "HIGH";
    case "low":
      return "LOW";
    case "qrp":
      return "QRP";
    default:
      return "HIGH";
  }
}

/**
 * Convert frequency in kHz to Cabrillo format (integer kHz)
 */
function formatFrequency(
  frequencyKHz: number | undefined,
  band: string,
): string {
  if (frequencyKHz && frequencyKHz > 0) {
    return Math.round(frequencyKHz).toString();
  }
  // Fallback to band center frequency if no frequency provided
  const bandCenters: Record<string, number> = {
    "160m": 1825,
    "80m": 3550,
    "40m": 7050,
    "20m": 14050,
    "15m": 21050,
    "10m": 28050,
    "6m": 50125,
    "2m": 144200,
  };
  return (bandCenters[band.toLowerCase()] || 14000).toString();
}

/**
 * Format date for Cabrillo (YYYY-MM-DD)
 */
function formatCabrilloDate(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toISOString().slice(0, 10);
}

/**
 * Format time for Cabrillo (HHMM UTC)
 */
function formatCabrilloTime(timestamp: string): string {
  const date = new Date(timestamp);
  const hours = date.getUTCHours().toString().padStart(2, "0");
  const minutes = date.getUTCMinutes().toString().padStart(2, "0");
  return `${hours}${minutes}`;
}

/**
 * Format mode for Cabrillo QSO line
 */
function formatQsoMode(mode: string): "CW" | "PH" | "RY" | "DG" {
  switch (mode.toUpperCase()) {
    case "CW":
      return "CW";
    case "SSB":
    case "USB":
    case "LSB":
    case "AM":
    case "FM":
    case "PHONE":
      return "PH";
    case "RTTY":
      return "RY";
    case "FT8":
    case "FT4":
    case "PSK31":
    case "PSK":
    case "JT65":
    case "JT9":
    case "DIGITAL":
    case "DATA":
      return "DG";
    default:
      return "CW";
  }
}

/**
 * Format RST for Cabrillo (pad to 3 chars for CW/digital, 2 for phone)
 */
function formatRst(rst: string, mode: string): string {
  const normalizedRst = rst.replace(/\D/g, "");
  const cabrilloMode = formatQsoMode(mode);

  if (cabrilloMode === "PH") {
    // Phone uses 2-digit RST
    return normalizedRst.slice(0, 2).padStart(2, "5");
  }
  // CW/Digital uses 3-digit RST
  return normalizedRst.slice(0, 3).padStart(3, "5");
}

/**
 * Generate a QSO line in Cabrillo format
 *
 * Format: QSO: freq mode date time my_call rst_s exch_s their_call rst_r exch_r
 */
function generateQsoLine(
  qso: ContestQSO,
  myCallsign: string,
  myExchange: string,
): string {
  const freq = formatFrequency(qso.frequencyKHz, qso.band);
  const mode = formatQsoMode(qso.mode);
  const date = formatCabrilloDate(qso.timestamp);
  const time = formatCabrilloTime(qso.timestamp);
  const rstSent = formatRst(qso.rstSent, qso.mode);
  const rstReceived = formatRst(qso.rstReceived, qso.mode);

  // Build exchange sent - combine RST + exchange or serial
  let exchSent = myExchange;
  if (qso.serialSent !== undefined) {
    // If serial is part of exchange, format it appropriately
    const serialStr = qso.serialSent.toString().padStart(3, "0");
    // Check if exchange already contains serial placeholder or number
    if (!exchSent.match(/\d{3,}/)) {
      exchSent = `${serialStr}`;
    }
  }

  // Build exchange received
  let exchReceived = qso.exchangeReceived;
  if (qso.serialReceived !== undefined && !exchReceived.match(/\d{3,}/)) {
    const serialStr = qso.serialReceived.toString().padStart(3, "0");
    exchReceived = serialStr;
  }

  // Pad fields for alignment
  const freqPad = freq.padStart(5, " ");

  return `QSO: ${freqPad} ${mode} ${date} ${time} ${myCallsign.padEnd(13)} ${rstSent} ${exchSent.padEnd(6)} ${qso.callsign.padEnd(13)} ${rstReceived} ${exchReceived}`;
}

/**
 * Validate Cabrillo header fields and return warnings
 */
export function validateCabrilloHeader(
  session: ContestSession,
  contest: ContestDefinition,
  userStation: UserStation | null,
): CabrilloValidationWarning[] {
  const warnings: CabrilloValidationWarning[] = [];
  const meta = session.cabrilloMeta;

  // Required: Callsign
  if (!userStation?.callsign) {
    warnings.push({
      field: "CALLSIGN",
      message:
        "Station callsign is required. Configure your station in Settings.",
      severity: "error",
    });
  }

  // Required: Contest ID
  if (!contest.cabrilloId) {
    warnings.push({
      field: "CONTEST",
      message: "Contest does not have a Cabrillo identifier defined.",
      severity: "error",
    });
  }

  // Recommended: Email
  if (!meta?.email) {
    warnings.push({
      field: "EMAIL",
      message: "Email address is recommended for contest committee contact.",
      severity: "warning",
    });
  }

  // Recommended: Operator name
  if (!meta?.operatorName) {
    warnings.push({
      field: "NAME",
      message: "Operator name is recommended for proper credit.",
      severity: "warning",
    });
  }

  // Recommended: Location
  if (!meta?.location) {
    warnings.push({
      field: "LOCATION",
      message: "Station location (state/section/DX) is recommended.",
      severity: "warning",
    });
  }

  // Check for QSOs
  const validQsos = session.qsos.filter((q) => !q.isDupe);
  if (validQsos.length === 0) {
    warnings.push({
      field: "QSO",
      message:
        "No valid QSOs in log. At least one QSO is required for submission.",
      severity: "error",
    });
  }

  return warnings;
}

/**
 * Generate a complete Cabrillo file from contest session data
 *
 * @param session - Active contest session with QSO data
 * @param contest - Contest definition with rules and cabrilloId
 * @param userStation - User station configuration (callsign, location)
 * @returns CabrilloResult with content, warnings, and validity status
 *
 * @example
 * ```ts
 * const result = generateCabrillo(session, contest, userStation);
 * if (result.isValid) {
 *   downloadFile(result.content, `${callsign}-${contest.cabrilloId}.cbr`);
 * }
 * ```
 */
export function generateCabrillo(
  session: ContestSession,
  contest: ContestDefinition,
  userStation: UserStation | null,
): CabrilloResult {
  const warnings = validateCabrilloHeader(session, contest, userStation);
  const meta = session.cabrilloMeta;
  const callsign = userStation?.callsign || "N0CALL";

  // Count valid QSOs (excluding dupes)
  const validQsos = session.qsos.filter((q) => !q.isDupe);
  const dupeCount = session.qsos.length - validQsos.length;

  const lines: string[] = [];

  // === Header Section ===
  lines.push("START-OF-LOG: 3.0");
  lines.push(`CONTEST: ${contest.cabrilloId}`);
  lines.push(`CALLSIGN: ${callsign}`);

  // Category headers
  lines.push(
    `CATEGORY-OPERATOR: ${mapCategoryOperator(session.categories.operator)}`,
  );
  lines.push(
    `CATEGORY-ASSISTED: ${mapCategoryAssisted(session.categories.overlay)}`,
  );
  lines.push(`CATEGORY-BAND: ${mapCategoryBand(session.categories.band)}`);
  lines.push(`CATEGORY-MODE: ${mapCategoryMode(session.categories.mode)}`);
  lines.push(`CATEGORY-POWER: ${mapCategoryPower(session.categories.power)}`);
  lines.push("CATEGORY-STATION: FIXED");
  lines.push("CATEGORY-TRANSMITTER: ONE");

  // Claimed score
  lines.push(`CLAIMED-SCORE: ${session.totalScore}`);

  // Optional metadata
  if (meta?.operatorName) {
    lines.push(`NAME: ${meta.operatorName}`);
  }

  if (meta?.email) {
    lines.push(`EMAIL: ${meta.email}`);
  }

  if (meta?.club) {
    lines.push(`CLUB: ${meta.club}`);
  }

  if (meta?.location) {
    lines.push(`LOCATION: ${meta.location}`);
  }

  // Add created-by line for identification
  lines.push("CREATED-BY: ProPulse Contest Logger v1.0");

  // Soapbox/notes
  lines.push(
    `SOAPBOX: ${validQsos.length} QSOs, ${session.totalMultipliers} multipliers`,
  );

  // Empty line before QSOs
  lines.push("");

  // === QSO Section ===
  // Sort QSOs by timestamp for proper log order
  const sortedQsos = [...session.qsos].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  for (const qso of sortedQsos) {
    // Skip dupes in Cabrillo output (some contests allow marking them with X-QSO)
    if (qso.isDupe) {
      lines.push(
        generateQsoLine(qso, callsign, session.myExchange).replace(
          "QSO:",
          "X-QSO:",
        ),
      );
    } else {
      lines.push(generateQsoLine(qso, callsign, session.myExchange));
    }
  }

  // === Footer ===
  lines.push("END-OF-LOG:");

  // Determine validity
  const hasErrors = warnings.some((w) => w.severity === "error");

  return {
    content: lines.join("\n"),
    warnings,
    isValid: !hasErrors,
    stats: {
      qsoCount: validQsos.length,
      dupeCount,
      claimedScore: session.totalScore,
    },
  };
}

/**
 * Generate a suggested filename for the Cabrillo file
 */
export function generateCabrilloFilename(
  callsign: string,
  cabrilloId: string,
  extension: "cbr" | "log" = "cbr",
): string {
  const safeCallsign = callsign.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  const safeContestId = cabrilloId.replace(/[^A-Z0-9-]/gi, "").toUpperCase();
  return `${safeCallsign}-${safeContestId}.${extension}`;
}
