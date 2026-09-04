/**
 * ADIF Import
 *
 * Parses ADIF content and produces LogEntry-compatible objects.
 * Builds on patterns from the existing adifParser.ts but outputs
 * complete LogEntry objects ready for IndexedDB insertion.
 */

import type { LogEntry, QSLStatus } from "@/lib/db/types";

// ── Internal Parsers ────────────────────────────────────────────────────────

/** Parse a single ADIF field from content starting with '<' */
function parseField(
  content: string,
): { name: string; value: string; consumed: number } | null {
  const headerMatch = content.match(/^<([A-Za-z0-9_]+):(\d+)(?::([A-Z]))?>/i);
  if (!headerMatch) return null;

  const [fullMatch, name, lengthStr] = headerMatch;
  const length = parseInt(lengthStr, 10);
  const valueStart = fullMatch.length;
  const value = content.slice(valueStart, valueStart + length);

  return {
    name: name.toUpperCase(),
    value,
    consumed: valueStart + length,
  };
}

/** Parse all records from an ADIF content string */
function parseRecords(adifContent: string): Map<string, string>[] {
  const records: Map<string, string>[] = [];
  let content = adifContent;

  // Skip header if present
  const eohIndex = content.toUpperCase().indexOf("<EOH>");
  if (eohIndex !== -1) {
    content = content.slice(eohIndex + 5).trimStart();
  }

  let currentRecord = new Map<string, string>();

  while (content.length > 0) {
    content = content.trimStart();
    if (content.length === 0) break;

    // End of record
    if (content.toUpperCase().startsWith("<EOR>")) {
      if (currentRecord.size > 0) {
        records.push(currentRecord);
        currentRecord = new Map<string, string>();
      }
      content = content.slice(5);
      continue;
    }

    // Field tag
    if (content.startsWith("<")) {
      const result = parseField(content);
      if (result) {
        currentRecord.set(result.name, result.value);
        content = content.slice(result.consumed);
      } else {
        const nextTag = content.indexOf("<", 1);
        content = nextTag === -1 ? "" : content.slice(nextTag);
      }
    } else {
      const nextTag = content.indexOf("<");
      content = nextTag === -1 ? "" : content.slice(nextTag);
    }
  }

  // Last record without <EOR>
  if (currentRecord.size > 0) {
    records.push(currentRecord);
  }

  return records;
}

// ── Conversion Helpers ──────────────────────────────────────────────────────

function adifDateToISO(adifDate: string): string {
  if (adifDate.length !== 8) return adifDate;
  return `${adifDate.slice(0, 4)}-${adifDate.slice(4, 6)}-${adifDate.slice(6, 8)}`;
}

function adifTimeToHHMM(adifTime: string): string {
  if (adifTime.length >= 4) {
    return `${adifTime.slice(0, 2)}:${adifTime.slice(2, 4)}`;
  }
  return adifTime;
}

function freqMHzToKHz(freqStr: string): number {
  const mhz = parseFloat(freqStr);
  return isNaN(mhz) ? 0 : Math.round(mhz * 1000);
}

function parseQSLStatus(value: string | undefined): QSLStatus | undefined {
  if (!value) return undefined;
  const upper = value.toUpperCase();
  if (upper === "Y" || upper === "N" || upper === "R" || upper === "I") {
    return upper as QSLStatus;
  }
  return undefined;
}

function parseADIFBoolean(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  return value.toUpperCase() === "Y";
}

function normalizeBand(band: string): string {
  return band.toLowerCase().trim();
}

function normalizeMode(mode: string): string {
  return mode.toUpperCase().trim();
}

// ── Record to LogEntry ──────────────────────────────────────────────────────

/**
 * Convert a parsed ADIF record Map into a partial LogEntry.
 * Returns null if required fields are missing.
 */
function recordToLogEntry(
  record: Map<string, string>,
): Omit<LogEntry, "id" | "createdAt" | "updatedAt"> | null {
  const callsign = record.get("CALL");
  if (!callsign) return null;

  const qsoDate = record.get("QSO_DATE");
  const timeOn = record.get("TIME_ON");

  // Guest logging
  const operatorCallsign = record.get("OPERATOR");
  const stationCallsign = record.get("STATION_CALLSIGN");
  const isGuestEntry = !!(
    operatorCallsign &&
    stationCallsign &&
    operatorCallsign.toUpperCase() !== stationCallsign.toUpperCase()
  );

  // Frequency
  const freqStr = record.get("FREQ");
  const frequency = freqStr ? freqMHzToKHz(freqStr) : 0;

  return {
    callsign: callsign.toUpperCase().trim(),
    frequency,
    mode: normalizeMode(record.get("MODE") || record.get("SUBMODE") || ""),
    band: normalizeBand(record.get("BAND") || ""),
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
    // lotw boolean: true if either sent to or received from LoTW (any interaction = confirmed)
    lotw:
      parseADIFBoolean(record.get("LOTW_QSL_SENT")) ||
      parseADIFBoolean(record.get("LOTW_QSL_RCVD")),
    // eqsl boolean: true if either sent to or received from eQSL
    eqsl:
      parseADIFBoolean(record.get("EQSL_QSL_SENT")) ||
      parseADIFBoolean(record.get("EQSL_QSL_RCVD")),
    lotwQslSent: record.get("LOTW_QSL_SENT"),
    lotwQslRcvd: record.get("LOTW_QSL_RCVD"),
    dxcc: record.get("DXCC") ? parseInt(record.get("DXCC")!, 10) : undefined,
    country: record.get("COUNTRY"),
    cqZone: record.get("CQ_ZONE")
      ? parseInt(record.get("CQ_ZONE")!, 10)
      : undefined,
    ituZone: record.get("ITU_ZONE")
      ? parseInt(record.get("ITU_ZONE")!, 10)
      : undefined,
    continent: record.get("CONT"),
    txPower: record.get("TX_PWR")
      ? parseFloat(record.get("TX_PWR")!)
      : undefined,
    myGrid: record.get("MY_GRIDSQUARE"),
    myRig: record.get("MY_RIG"),
    myAntenna: record.get("MY_ANTENNA"),
    chainId: record.get("APP_PROPULSE_CHAIN_ID"),
    radioId: record.get("APP_PROPULSE_RADIO_ID"),
    antennaId: record.get("APP_PROPULSE_ANTENNA_ID"),
    propMode: record.get("PROP_MODE"),
    satName: record.get("SAT_NAME"),
    satMode: record.get("SAT_MODE"),
    mySig: record.get("MY_SIG"),
    mySigInfo: record.get("MY_SIG_INFO"),
    sig: record.get("SIG"),
    sigInfo: record.get("SIG_INFO"),
    contestId: record.get("CONTEST_ID"),
    stx: record.get("STX"),
    srx: record.get("SRX"),
    stxString: record.get("STX_STRING"),
    srxString: record.get("SRX_STRING"),
    stationCallsign: stationCallsign?.toUpperCase().trim(),
    operatorCallsign: operatorCallsign?.toUpperCase().trim(),
    isGuestEntry,
    clublogStatus: record.get("CLUBLOG_QSO_UPLOAD_STATUS"),
    qrzcomStatus: record.get("QRZCOM_QSO_UPLOAD_STATUS"),
    version: 1,
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface ADIFImportResult {
  /** Successfully parsed entries */
  entries: Omit<LogEntry, "id" | "createdAt" | "updatedAt">[];
  /** Number of records that were skipped (invalid) */
  skippedCount: number;
  /** Total records found in file */
  totalRecords: number;
  /** Errors encountered during parsing */
  errors: Array<{ index: number; reason: string }>;
}

/**
 * Import an ADIF file and return LogEntry-compatible objects.
 *
 * @param content - Raw ADIF file content string
 * @returns Import result with entries, skip count, and errors
 */
export function importADIF(content: string): ADIFImportResult {
  const records = parseRecords(content);
  const entries: Omit<LogEntry, "id" | "createdAt" | "updatedAt">[] = [];
  const errors: Array<{ index: number; reason: string }> = [];
  let skippedCount = 0;

  for (let i = 0; i < records.length; i++) {
    const entry = recordToLogEntry(records[i]);
    if (entry) {
      entries.push(entry);
    } else {
      skippedCount++;
      errors.push({ index: i, reason: "Missing required CALL field" });
    }
  }

  return {
    entries,
    skippedCount,
    totalRecords: records.length,
    errors,
  };
}
