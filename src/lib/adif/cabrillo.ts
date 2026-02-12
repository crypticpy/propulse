/**
 * Cabrillo 3.0 Export
 *
 * Generates Cabrillo-format contest logs from LogEntry arrays.
 * Reference: https://wwrof.org/cabrillo/
 */

import type { LogEntry } from "@/lib/db/types";
import type { CabrilloHeader } from "./types";

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Convert ISO date (YYYY-MM-DD) to Cabrillo date (YYYY-MM-DD as-is) */
function formatDate(iso: string): string {
  return iso;
}

/** Convert HH:MM to Cabrillo time (HHMM) */
function formatTime(time: string): string {
  return time.replace(":", "");
}

/** Convert frequency in kHz to integer kHz for Cabrillo */
function formatFreq(kHz: number): string {
  return String(Math.round(kHz));
}

/** Map mode to Cabrillo mode abbreviation */
function cabrilloMode(mode: string): string {
  const upper = mode.toUpperCase();
  if (
    upper === "SSB" ||
    upper === "USB" ||
    upper === "LSB" ||
    upper === "FM" ||
    upper === "AM"
  ) {
    return "PH";
  }
  if (upper === "CW") return "CW";
  if (upper === "RTTY" || upper === "PSK31" || upper === "PSK63") return "RY";
  if (
    upper === "FT8" ||
    upper === "FT4" ||
    upper === "JT65" ||
    upper === "JT9" ||
    upper === "JS8"
  ) {
    return "DG";
  }
  return "PH";
}

/** Pad a string to a specific length, right-padded with spaces */
function pad(str: string, len: number): string {
  return str.padEnd(len).slice(0, len);
}

// ── Main Export ─────────────────────────────────────────────────────────────

/**
 * Generate a Cabrillo 3.0 formatted string from log entries.
 *
 * @param entries - Array of LogEntry objects to export
 * @param header - Cabrillo header information
 * @returns Complete Cabrillo file content
 */
export function exportCabrillo(
  entries: LogEntry[],
  header: CabrilloHeader,
): string {
  const lines: string[] = [];

  // ── Header ──
  lines.push("START-OF-LOG: 3.0");
  lines.push(`CALLSIGN: ${header.callsign.toUpperCase()}`);
  lines.push(`CONTEST: ${header.contest}`);

  if (header.categoryOperator) {
    lines.push(`CATEGORY-OPERATOR: ${header.categoryOperator}`);
  }
  if (header.categoryAssisted) {
    lines.push(`CATEGORY-ASSISTED: ${header.categoryAssisted}`);
  }
  if (header.categoryBand) {
    lines.push(`CATEGORY-BAND: ${header.categoryBand}`);
  }
  if (header.categoryPower) {
    lines.push(`CATEGORY-POWER: ${header.categoryPower}`);
  }
  if (header.categoryMode) {
    lines.push(`CATEGORY-MODE: ${header.categoryMode}`);
  }
  if (header.categoryTransmitter) {
    lines.push(`CATEGORY-TRANSMITTER: ${header.categoryTransmitter}`);
  }
  if (header.categoryStation) {
    lines.push(`CATEGORY-STATION: ${header.categoryStation}`);
  }
  if (header.operators) {
    lines.push(`OPERATORS: ${header.operators}`);
  }
  if (header.club) {
    lines.push(`CLUB: ${header.club}`);
  }
  if (header.location) {
    lines.push(`LOCATION: ${header.location}`);
  }
  if (header.email) {
    lines.push(`EMAIL: ${header.email}`);
  }
  if (header.claimedScore != null) {
    lines.push(`CLAIMED-SCORE: ${header.claimedScore}`);
  }
  if (header.soapbox) {
    for (const soapLine of header.soapbox.split("\n")) {
      lines.push(`SOAPBOX: ${soapLine.trim()}`);
    }
  }

  lines.push("CREATED-BY: Propulse v0.14.0");

  // ── QSO Records ──
  // Format: QSO: freq mode date time call rst exch call rst exch
  for (const entry of entries) {
    const freq = formatFreq(entry.frequency);
    const mode = cabrilloMode(entry.mode);
    const date = formatDate(entry.date);
    const time = formatTime(entry.timeOn);

    // Sent exchange: serial or exchange string
    const sentExch = entry.stxString || entry.stx || "0";
    // Received exchange: serial or exchange string
    const rcvdExch = entry.srxString || entry.srx || "0";

    // Station callsign (sender)
    const myCall = pad(
      entry.stationCallsign || header.callsign.toUpperCase(),
      13,
    );
    // Sent RST
    const rstSent = pad(entry.rstSent || "59", 3);
    // Sent exchange
    const sentPad = pad(sentExch, 6);

    // Contacted callsign
    const theirCall = pad(entry.callsign, 13);
    // Received RST
    const rstRcvd = pad(entry.rstRcvd || "59", 3);
    // Received exchange
    const rcvdPad = pad(rcvdExch, 6);

    lines.push(
      `QSO: ${pad(freq, 6)} ${pad(mode, 2)} ${date} ${time} ${myCall} ${rstSent} ${sentPad} ${theirCall} ${rstRcvd} ${rcvdPad}`,
    );
  }

  lines.push("END-OF-LOG:");

  return lines.join("\n");
}
