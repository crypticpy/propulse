// ---------------------------------------------------------------------------
// ft8CabrilloExport -- WP-3.6 Cabrillo FT8 Extension
//
// Generates Cabrillo 3.0 log files specifically tailored for FT8/FT4 contest
// submissions.  Uses the "DG" (digital) mode designator and formats QSO
// lines with fixed-width, space-padded fields per the WWROF spec.
//
// @see https://wwrof.org/cabrillo/
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface Ft8CabrilloQso {
  /** Frequency in kHz */
  frequency: number;
  /** Decode mode */
  mode: "FT8" | "FT4";
  /** Date in YYYY-MM-DD format */
  date: string;
  /** Time in HHMM UTC format */
  time: string;
  /** Operator callsign sent */
  callsignSent: string;
  /** Exchange sent (e.g. grid, serial, zone) */
  exchangeSent: string;
  /** Remote station callsign received */
  callsignReceived: string;
  /** Exchange received */
  exchangeReceived: string;
  /** TX frequency offset in Hz (optional, for Cabrillo) */
  txFreqHz?: number;
}

export interface Ft8CabrilloOptions {
  /** Contest template ID (internal reference) */
  contestId: string;
  /** Cabrillo CONTEST: header value (from template) */
  cabrilloContestName: string;
  /** Operator callsign */
  callsign: string;
  /** Operator Maidenhead grid square */
  grid: string;
  /** QSO records to export */
  qsos: Ft8CabrilloQso[];
  /** Category string (e.g. "SINGLE-OP ALL HIGH") */
  category?: string;
  /** Club name */
  club?: string;
  /** List of operator callsigns */
  operators?: string[];
}

// ---------------------------------------------------------------------------
// Category parsing
// ---------------------------------------------------------------------------

/**
 * Parse a combined category string like "SINGLE-OP ALL HIGH" into its
 * Cabrillo header components.  Falls back to sensible defaults for FT8
 * contest submissions.
 */
function parseCategory(category?: string): {
  operator: string;
  band: string;
  power: string;
} {
  if (!category) {
    return { operator: "SINGLE-OP", band: "ALL", power: "HIGH" };
  }

  const parts = category.toUpperCase().split(/\s+/);

  let operator = "SINGLE-OP";
  let band = "ALL";
  let power = "HIGH";

  for (const part of parts) {
    if (part === "SINGLE-OP" || part === "MULTI-OP" || part === "CHECKLOG") {
      operator = part;
    } else if (part === "ALL" || /^\d+M$/.test(part) || /^\d+CM$/.test(part)) {
      band = part;
    } else if (part === "HIGH" || part === "LOW" || part === "QRP") {
      power = part;
    }
  }

  return { operator, band, power };
}

// ---------------------------------------------------------------------------
// QSO line formatting
// ---------------------------------------------------------------------------

/**
 * Format a single QSO line per Cabrillo 3.0 spec.
 *
 * Layout:
 *   QSO: {freq 5r} {mode 2l} {date 10} {time 4} {callSent 13l} {exchSent 6l} {callRcvd 13l} {exchRcvd}
 *
 * Where:
 *   - freq: kHz, right-justified to 5 characters
 *   - mode: "DG" for digital (FT8/FT4), left-justified to 2 characters
 *   - date: YYYY-MM-DD (10 chars)
 *   - time: HHMM UTC (4 chars)
 *   - callSent/callRcvd: left-justified, padded to 13 characters
 *   - exchSent: left-justified, padded to 6 characters
 *   - exchRcvd: left-justified, no trailing pad
 */
function formatQsoLine(qso: Ft8CabrilloQso): string {
  const freq = Math.round(qso.frequency).toString().padStart(5, " ");
  const mode = "DG";
  const date = qso.date;
  const time = qso.time;
  const callSent = qso.callsignSent.toUpperCase().padEnd(13, " ");
  const exchSent = qso.exchangeSent.padEnd(6, " ");
  const callRcvd = qso.callsignReceived.toUpperCase().padEnd(13, " ");
  const exchRcvd = qso.exchangeReceived;

  return `QSO: ${freq} ${mode} ${date} ${time} ${callSent} ${exchSent} ${callRcvd} ${exchRcvd}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a complete Cabrillo 3.0 log file string for FT8/FT4 contest
 * submissions.
 *
 * @param options - Contest metadata and QSO records.
 * @returns The Cabrillo file content as a string.
 *
 * @example
 * ```ts
 * const log = generateFt8Cabrillo({
 *   contestId: "arrl-ft8-roundup-2026",
 *   cabrilloContestName: "ARRL-FT-ROUNDUP",
 *   callsign: "W1AW",
 *   grid: "FN31",
 *   qsos: [
 *     {
 *       frequency: 14074,
 *       mode: "FT8",
 *       date: "2026-02-14",
 *       time: "1523",
 *       callsignSent: "W1AW",
 *       exchangeSent: "FN31",
 *       callsignReceived: "K3LR",
 *       exchangeReceived: "EN91",
 *     },
 *   ],
 * });
 * ```
 */
export function generateFt8Cabrillo(options: Ft8CabrilloOptions): string {
  const {
    cabrilloContestName,
    callsign,
    grid,
    qsos,
    category,
    club,
    operators,
  } = options;

  const { operator, band, power } = parseCategory(category);

  const lines: string[] = [];

  // --- Header ---
  lines.push("START-OF-LOG: 3.0");
  lines.push(`CONTEST: ${cabrilloContestName}`);
  lines.push(`CALLSIGN: ${callsign.toUpperCase()}`);
  lines.push(`GRID-LOCATOR: ${grid.toUpperCase()}`);
  lines.push(`CATEGORY-OPERATOR: ${operator}`);
  lines.push(`CATEGORY-BAND: ${band}`);
  lines.push(`CATEGORY-MODE: DIGI`);
  lines.push(`CATEGORY-POWER: ${power}`);

  if (club) {
    lines.push(`CLUB: ${club}`);
  }

  if (operators && operators.length > 0) {
    lines.push(`OPERATORS: ${operators.map((o) => o.toUpperCase()).join(" ")}`);
  }

  lines.push("CREATED-BY: Propulse");

  // --- QSO records ---
  for (const qso of qsos) {
    lines.push(formatQsoLine(qso));
  }

  // --- Footer ---
  lines.push("END-OF-LOG:");

  return lines.join("\n") + "\n";
}
