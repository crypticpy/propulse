/**
 * FT8 One-Click QSO Logger
 *
 * Converts FT8/FT4 auto-sequencer QSO results into full log entries and
 * persists them to the IndexedDB logbook via addLogEntry.
 *
 * Handles frequency-to-band conversion, ISO timestamp parsing, and SNR
 * report formatting so callers can log a completed QSO in a single call.
 */

import { addLogEntry } from "@/lib/db/logStore";
import { currentStationLogStamp } from "@/lib/station/stationLogStamp";

// ─── Band Ranges (kHz) ─────────────────────────────────────────────────────

interface BandRange {
  band: string;
  lowKHz: number;
  highKHz: number;
}

const BAND_RANGES: BandRange[] = [
  { band: "160m", lowKHz: 1800, highKHz: 2000 },
  { band: "80m", lowKHz: 3500, highKHz: 4000 },
  { band: "60m", lowKHz: 5330, highKHz: 5410 },
  { band: "40m", lowKHz: 7000, highKHz: 7300 },
  { band: "30m", lowKHz: 10100, highKHz: 10150 },
  { band: "20m", lowKHz: 14000, highKHz: 14350 },
  { band: "17m", lowKHz: 18068, highKHz: 18168 },
  { band: "15m", lowKHz: 21000, highKHz: 21450 },
  { band: "12m", lowKHz: 24890, highKHz: 24990 },
  { band: "10m", lowKHz: 28000, highKHz: 29700 },
  { band: "6m", lowKHz: 50000, highKHz: 54000 },
  { band: "2m", lowKHz: 144000, highKHz: 148000 },
];

// ─── Public Types ───────────────────────────────────────────────────────────

export interface Ft8QsoLogOptions {
  /** The completed QSO from the auto-sequencer */
  qso: {
    callsign: string;
    grid?: string;
    reportSent: string;
    reportReceived: string;
    startTime: string; // ISO timestamp
    endTime: string; // ISO timestamp
    mode: "FT8" | "FT4";
    frequency: number; // dial frequency in Hz
  };
  /** Operator's callsign */
  myCallsign: string;
  /** Operator's grid */
  myGrid: string;
  /** Optional enrichment data from DXCC lookup */
  dxcc?: number;
  country?: string;
  cqZone?: number;
  ituZone?: number;
  continent?: string;
}

// ─── Public Functions ───────────────────────────────────────────────────────

/**
 * Convert a frequency in Hz to a band string (e.g. 14074000 -> "20m").
 *
 * Converts from Hz to kHz internally and matches against ITU amateur band
 * allocations. Returns "unknown" if no band matches.
 */
export function freqHzToBand(freqHz: number): string {
  const kHz = freqHz / 1000;
  for (const range of BAND_RANGES) {
    if (kHz >= range.lowKHz && kHz <= range.highKHz) {
      return range.band;
    }
  }
  return "unknown";
}

/**
 * Format an FT8 SNR report string as an RST value.
 *
 * FT8 signal reports are already in dB format (e.g. "-15", "+05"). This
 * function passes them through unchanged, since FT8 RST fields use the
 * raw SNR string rather than the traditional 59/599 system.
 *
 * @param report - SNR report string from the auto-sequencer (e.g. "-15", "+05")
 * @returns The same string, trimmed of whitespace
 */
export function formatFt8Rst(report: string): string {
  return report.trim();
}

/**
 * Log an FT8 QSO to the database.
 *
 * Converts the auto-sequencer's QSO result into a full LogEntry and persists
 * it via addLogEntry. Handles:
 *   - Frequency Hz -> kHz conversion for the LogEntry frequency field
 *   - Band determination from frequency
 *   - ISO timestamp -> date (YYYY-MM-DD) and time (HH:MM) extraction
 *   - SNR report -> RST field mapping
 *   - Optional DXCC enrichment fields
 *
 * @param options - QSO data, operator info, and optional DXCC enrichment
 * @returns The generated log entry ID
 */
export async function logFt8Qso(options: Ft8QsoLogOptions): Promise<string> {
  const { qso, myCallsign, myGrid, dxcc, country, cqZone, ituZone, continent } =
    options;

  // Convert frequency from Hz to kHz for the LogEntry
  const frequencyKHz = qso.frequency / 1000;

  // Determine band from frequency
  const band = freqHzToBand(qso.frequency);

  // Extract date and time from ISO startTime
  const startDate = new Date(qso.startTime);
  const date = formatDate(startDate);
  const timeOn = formatTime(startDate);

  // Extract end time for timeOff
  const endDate = new Date(qso.endTime);
  const timeOff = formatTime(endDate);

  const stamp = currentStationLogStamp();
  const id = await addLogEntry({
    callsign: qso.callsign,
    frequency: frequencyKHz,
    mode: qso.mode,
    band,
    date,
    timeOn,
    timeOff,
    rstSent: formatFt8Rst(qso.reportSent),
    rstRcvd: formatFt8Rst(qso.reportReceived),
    grid: qso.grid,
    stationCallsign: myCallsign || stamp.stationCallsign,
    myGrid: myGrid || stamp.myGrid,
    txPower: stamp.txPower,
    myRig: stamp.myRig,
    myAntenna: stamp.myAntenna,
    chainId: stamp.chainId,
    radioId: stamp.radioId,
    antennaId: stamp.antennaId,
    // DXCC enrichment (optional)
    dxcc,
    country,
    cqZone,
    ituZone,
    continent,
  });

  return id;
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

/**
 * Format a Date as YYYY-MM-DD in UTC.
 */
function formatDate(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Format a Date as HH:MM in UTC.
 */
function formatTime(d: Date): string {
  const hours = String(d.getUTCHours()).padStart(2, "0");
  const minutes = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}
