/**
 * ADIF (Amateur Data Interchange Format) parser and generator
 * Reference: https://adif.org/
 *
 * ADIF uses a simple tagged format:
 * - Fields: <FIELD_NAME:length>data or <FIELD_NAME:length:type>data
 * - End of record: <EOR>
 * - End of header: <EOH>
 */

import type { LogEntry, QSLStatus } from "../db/types";

/**
 * Parsed ADIF field
 */
interface ADIFField {
  name: string;
  length: number;
  type?: string;
  value: string;
}

/**
 * Parse a single ADIF field from content
 * @param content - The ADIF content starting with '<'
 * @returns Parsed field and remaining content, or null if invalid
 */
function parseField(
  content: string,
): { field: ADIFField; remaining: string } | null {
  // Match <FIELDNAME:LENGTH> or <FIELDNAME:LENGTH:TYPE>
  const headerMatch = content.match(/^<([A-Za-z0-9_]+):(\d+)(?::([A-Z]))?>/i);

  if (!headerMatch) {
    return null;
  }

  const [fullMatch, name, lengthStr, type] = headerMatch;
  const length = parseInt(lengthStr, 10);

  // Extract the value after the header
  const valueStart = fullMatch.length;
  const value = content.slice(valueStart, valueStart + length);
  const remaining = content.slice(valueStart + length);

  return {
    field: {
      name: name.toUpperCase(),
      length,
      type,
      value,
    },
    remaining,
  };
}

/**
 * Parse ADIF content into an array of field maps (one per record)
 * @param adifContent - Raw ADIF content string
 * @returns Array of field maps, each representing a QSO record
 */
function parseADIFToRecords(adifContent: string): Map<string, string>[] {
  const records: Map<string, string>[] = [];
  let content = adifContent;

  // Skip the header section if present (everything before <EOH>)
  const eohIndex = content.toUpperCase().indexOf("<EOH>");
  if (eohIndex !== -1) {
    // Skip past <EOH> and any following whitespace
    content = content.slice(eohIndex + 5).trimStart();
  }

  let currentRecord = new Map<string, string>();

  while (content.length > 0) {
    // Skip whitespace
    content = content.trimStart();

    if (content.length === 0) {
      break;
    }

    // Check for end of record
    if (content.toUpperCase().startsWith("<EOR>")) {
      if (currentRecord.size > 0) {
        records.push(currentRecord);
        currentRecord = new Map<string, string>();
      }
      content = content.slice(5);
      continue;
    }

    // Check for field start
    if (content.startsWith("<")) {
      const result = parseField(content);
      if (result) {
        currentRecord.set(result.field.name, result.field.value);
        content = result.remaining;
      } else {
        // Skip malformed tag - find next '<' or end
        const nextTag = content.indexOf("<", 1);
        content = nextTag === -1 ? "" : content.slice(nextTag);
      }
    } else {
      // Skip non-tag content
      const nextTag = content.indexOf("<");
      content = nextTag === -1 ? "" : content.slice(nextTag);
    }
  }

  // Don't forget last record if it didn't end with <EOR>
  if (currentRecord.size > 0) {
    records.push(currentRecord);
  }

  return records;
}

/**
 * Convert ADIF date (YYYYMMDD) to ISO date (YYYY-MM-DD)
 */
function adifDateToISO(adifDate: string): string {
  if (adifDate.length !== 8) {
    return adifDate;
  }
  const year = adifDate.slice(0, 4);
  const month = adifDate.slice(4, 6);
  const day = adifDate.slice(6, 8);
  return `${year}-${month}-${day}`;
}

/**
 * Convert ISO date (YYYY-MM-DD) to ADIF date (YYYYMMDD)
 */
function isoDateToADIF(isoDate: string): string {
  return isoDate.replace(/-/g, "");
}

/**
 * Convert ADIF time (HHMM or HHMMSS) to HH:MM format
 */
function adifTimeToHHMM(adifTime: string): string {
  if (adifTime.length >= 4) {
    return `${adifTime.slice(0, 2)}:${adifTime.slice(2, 4)}`;
  }
  return adifTime;
}

/**
 * Convert HH:MM to ADIF time (HHMM)
 */
function hhmmToADIF(time: string): string {
  return time.replace(":", "");
}

/**
 * Convert frequency in MHz string to kHz number
 */
function freqMHzToKHz(freqMHz: string): number {
  const mhz = parseFloat(freqMHz);
  return isNaN(mhz) ? 0 : Math.round(mhz * 1000);
}

/**
 * Convert frequency in kHz to MHz string
 */
function freqKHzToMHz(freqKHz: number): string {
  return (freqKHz / 1000).toFixed(6);
}

/**
 * Parse QSL status from ADIF value
 */
function parseQSLStatus(value: string | undefined): QSLStatus | undefined {
  if (!value) return undefined;
  const upper = value.toUpperCase();
  if (upper === "Y" || upper === "N" || upper === "R" || upper === "I") {
    return upper as QSLStatus;
  }
  return undefined;
}

/**
 * Parse boolean from ADIF value (Y/N or empty)
 */
function parseADIFBoolean(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  return value.toUpperCase() === "Y";
}

/**
 * Normalize band format to lowercase with 'm' suffix
 * Examples: "20M" -> "20m", "2m" -> "2m", "70cm" -> "70cm"
 */
function normalizeBand(band: string): string {
  return band.toLowerCase().trim();
}

/**
 * Normalize mode to uppercase
 */
function normalizeMode(mode: string): string {
  return mode.toUpperCase().trim();
}

/**
 * Convert an ADIF record to a LogEntry
 * @param record - Map of ADIF field names to values
 * @returns Partial LogEntry (without id, createdAt, updatedAt)
 */
function recordToLogEntry(
  record: Map<string, string>,
): Omit<LogEntry, "id" | "createdAt" | "updatedAt"> | null {
  // Required fields
  const callsign = record.get("CALL");
  const qsoDate = record.get("QSO_DATE");
  const timeOn = record.get("TIME_ON");

  // Must have at least callsign to be valid
  if (!callsign) {
    return null;
  }

  // Get band and mode (one should be present)
  const band = record.get("BAND") || "";
  const mode = record.get("MODE") || record.get("SUBMODE") || "";

  // Get frequency - FREQ is in MHz
  const freqStr = record.get("FREQ");
  const frequency = freqStr ? freqMHzToKHz(freqStr) : 0;

  // Parse guest logging fields
  const operatorCallsign = record.get("OPERATOR");
  const stationCallsign = record.get("STATION_CALLSIGN");
  const isGuestEntry = !!(
    operatorCallsign &&
    stationCallsign &&
    operatorCallsign.toUpperCase() !== stationCallsign.toUpperCase()
  );

  return {
    callsign: callsign.toUpperCase().trim(),
    frequency,
    mode: normalizeMode(mode),
    band: normalizeBand(band),
    date: qsoDate
      ? adifDateToISO(qsoDate)
      : new Date().toISOString().slice(0, 10),
    timeOn: timeOn ? adifTimeToHHMM(timeOn) : "00:00",
    timeOff: record.get("TIME_OFF")
      ? adifTimeToHHMM(record.get("TIME_OFF")!)
      : undefined,
    rstSent: record.get("RST_SENT"),
    rstRcvd: record.get("RST_RCVD"),
    grid: record.get("GRIDSQUARE"),
    name: record.get("NAME"),
    qth: record.get("QTH"),
    notes: record.get("COMMENT") || record.get("NOTES"),
    qslSent: parseQSLStatus(record.get("QSL_SENT")),
    qslRcvd: parseQSLStatus(record.get("QSL_RCVD")),
    lotw:
      parseADIFBoolean(record.get("LOTW_QSL_SENT")) ||
      parseADIFBoolean(record.get("LOTW_QSL_RCVD")),
    eqsl:
      parseADIFBoolean(record.get("EQSL_QSL_SENT")) ||
      parseADIFBoolean(record.get("EQSL_QSL_RCVD")),
    // Guest logging fields
    stationCallsign: stationCallsign?.toUpperCase().trim(),
    operatorCallsign: operatorCallsign?.toUpperCase().trim(),
    isGuestEntry,
  };
}

/**
 * Parse ADIF content into an array of LogEntry objects
 * @param adifContent - Raw ADIF file content
 * @returns Array of log entries ready to be saved (without id, createdAt, updatedAt)
 */
export function parseADIF(
  adifContent: string,
): Omit<LogEntry, "id" | "createdAt" | "updatedAt">[] {
  const records = parseADIFToRecords(adifContent);
  const entries: Omit<LogEntry, "id" | "createdAt" | "updatedAt">[] = [];

  for (const record of records) {
    const entry = recordToLogEntry(record);
    if (entry) {
      entries.push(entry);
    }
  }

  return entries;
}

/**
 * Format an ADIF field
 * @param name - Field name
 * @param value - Field value
 * @returns Formatted ADIF field string
 */
function formatField(name: string, value: string): string {
  return `<${name}:${value.length}>${value}`;
}

/**
 * Generate ADIF content from log entries
 * @param entries - Array of log entries to export
 * @returns ADIF formatted string
 */
export function generateADIF(entries: LogEntry[]): string {
  const lines: string[] = [];

  // ADIF header
  lines.push("ADIF Export from PropUlse");
  lines.push(`<ADIF_VER:5>3.1.4`);
  lines.push(`<CREATED_TIMESTAMP:15>${formatADIFTimestamp(new Date())}`);
  lines.push(`<PROGRAMID:8>PropUlse`);
  lines.push(`<PROGRAMVERSION:5>1.0.0`);
  lines.push("<EOH>");
  lines.push("");

  // Generate records
  for (const entry of entries) {
    const fields: string[] = [];

    // Required fields
    fields.push(formatField("CALL", entry.callsign));
    fields.push(formatField("QSO_DATE", isoDateToADIF(entry.date)));
    fields.push(formatField("TIME_ON", hhmmToADIF(entry.timeOn)));

    // Optional time off
    if (entry.timeOff) {
      fields.push(formatField("TIME_OFF", hhmmToADIF(entry.timeOff)));
    }

    // Band and mode
    if (entry.band) {
      fields.push(formatField("BAND", entry.band.toUpperCase()));
    }
    if (entry.mode) {
      fields.push(formatField("MODE", entry.mode.toUpperCase()));
    }

    // Frequency in MHz
    if (entry.frequency > 0) {
      fields.push(formatField("FREQ", freqKHzToMHz(entry.frequency)));
    }

    // RST reports
    if (entry.rstSent) {
      fields.push(formatField("RST_SENT", entry.rstSent));
    }
    if (entry.rstRcvd) {
      fields.push(formatField("RST_RCVD", entry.rstRcvd));
    }

    // Location info
    if (entry.grid) {
      fields.push(formatField("GRIDSQUARE", entry.grid.toUpperCase()));
    }
    if (entry.name) {
      fields.push(formatField("NAME", entry.name));
    }
    if (entry.qth) {
      fields.push(formatField("QTH", entry.qth));
    }

    // Notes/comments
    if (entry.notes) {
      fields.push(formatField("COMMENT", entry.notes));
    }

    // QSL status
    if (entry.qslSent) {
      fields.push(formatField("QSL_SENT", entry.qslSent));
    }
    if (entry.qslRcvd) {
      fields.push(formatField("QSL_RCVD", entry.qslRcvd));
    }

    // LoTW and eQSL
    if (entry.lotw !== undefined) {
      const lotwVal = entry.lotw ? "Y" : "N";
      fields.push(formatField("LOTW_QSL_SENT", lotwVal));
    }
    if (entry.eqsl !== undefined) {
      const eqslVal = entry.eqsl ? "Y" : "N";
      fields.push(formatField("EQSL_QSL_SENT", eqslVal));
    }

    // Guest logging fields (ADIF standard fields)
    if (entry.stationCallsign) {
      fields.push(
        formatField("STATION_CALLSIGN", entry.stationCallsign.toUpperCase()),
      );
    }
    if (entry.operatorCallsign) {
      fields.push(
        formatField("OPERATOR", entry.operatorCallsign.toUpperCase()),
      );
    }

    // Join fields and add end of record
    lines.push(fields.join(" ") + " <EOR>");
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Format a Date as ADIF timestamp (YYYYMMDDHHMMSS)
 */
function formatADIFTimestamp(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const h = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");
  const s = String(date.getUTCSeconds()).padStart(2, "0");
  return `${y}${m}${d}${h}${min}${s}`;
}

/**
 * Validate ADIF content (basic check)
 * @param content - Content to validate
 * @returns True if content appears to be valid ADIF
 */
export function isValidADIF(content: string): boolean {
  if (!content || content.trim().length === 0) {
    return false;
  }

  // Must contain at least one field tag
  const hasTag = /<[A-Za-z0-9_]+:\d+>/i.test(content);

  // Must contain either <EOR> or <EOH>
  const hasMarker =
    content.toUpperCase().includes("<EOR>") ||
    content.toUpperCase().includes("<EOH>");

  return hasTag || hasMarker;
}

/**
 * Get statistics about ADIF content without fully parsing
 * @param content - ADIF content to analyze
 * @returns Object with record count and field summary
 */
export function getADIFStats(content: string): {
  recordCount: number;
  hasHeader: boolean;
  fields: string[];
} {
  const upperContent = content.toUpperCase();

  // Count <EOR> markers for record count
  const eorMatches = upperContent.match(/<EOR>/g);
  const recordCount = eorMatches ? eorMatches.length : 0;

  // Check for header
  const hasHeader = upperContent.includes("<EOH>");

  // Extract unique field names
  const fieldMatches = content.matchAll(/<([A-Za-z0-9_]+):\d+/gi);
  const fields = new Set<string>();
  for (const match of fieldMatches) {
    fields.add(match[1].toUpperCase());
  }

  return {
    recordCount,
    hasHeader,
    fields: Array.from(fields).sort(),
  };
}
