/**
 * Cabrillo log file generator
 * Implements Cabrillo 3.0 specification
 * https://wwrof.org/cabrillo/
 */

import type { CabrilloHeader, CabrilloQSO } from "./types";

/**
 * Generate Cabrillo header section
 */
function generateHeader(header: CabrilloHeader): string {
  const lines: string[] = [];

  lines.push("START-OF-LOG: 3.0");
  lines.push(`CONTEST: ${header.CONTEST}`);
  lines.push(`CALLSIGN: ${header.CALLSIGN}`);
  lines.push(`CATEGORY-OPERATOR: ${header.CATEGORY_OPERATOR}`);
  lines.push(`CATEGORY-ASSISTED: ${header.CATEGORY_ASSISTED}`);
  lines.push(`CATEGORY-BAND: ${header.CATEGORY_BAND}`);
  lines.push(`CATEGORY-POWER: ${header.CATEGORY_POWER}`);
  lines.push(`CATEGORY-MODE: ${header.CATEGORY_MODE}`);
  lines.push(`CATEGORY-TRANSMITTER: ${header.CATEGORY_TRANSMITTER}`);

  // Optional fields
  if (header.CLAIMED_SCORE)
    lines.push(`CLAIMED-SCORE: ${header.CLAIMED_SCORE}`);
  if (header.CLUB) lines.push(`CLUB: ${header.CLUB}`);
  if (header.LOCATION) lines.push(`LOCATION: ${header.LOCATION}`);
  if (header.NAME) lines.push(`NAME: ${header.NAME}`);
  if (header.ADDRESS) lines.push(`ADDRESS: ${header.ADDRESS}`);
  if (header.ADDRESS_CITY) lines.push(`ADDRESS-CITY: ${header.ADDRESS_CITY}`);
  if (header.ADDRESS_STATE_PROVINCE)
    lines.push(`ADDRESS-STATE-PROVINCE: ${header.ADDRESS_STATE_PROVINCE}`);
  if (header.ADDRESS_POSTALCODE)
    lines.push(`ADDRESS-POSTALCODE: ${header.ADDRESS_POSTALCODE}`);
  if (header.ADDRESS_COUNTRY)
    lines.push(`ADDRESS-COUNTRY: ${header.ADDRESS_COUNTRY}`);
  if (header.OPERATORS) lines.push(`OPERATORS: ${header.OPERATORS}`);

  // Soapbox (multiple lines)
  if (header.SOAPBOX) {
    for (const line of header.SOAPBOX) {
      lines.push(`SOAPBOX: ${line}`);
    }
  }

  return lines.join("\n") + "\n";
}

/**
 * Format a single QSO line
 * Format: QSO: freq mode date time call rst exch call rst exch
 */
export function formatCabrilloQSO(qso: CabrilloQSO): string {
  const freq = qso.frequency.toString().padStart(5, " ");
  const mode = qso.mode.padEnd(2, " ");
  const date = qso.date;
  const time = qso.time;
  const callSent = qso.callSent.padEnd(13, " ");
  const rstSent = qso.rstSent.padEnd(3, " ");
  const exchSent = qso.exchangeSent.padEnd(6, " ");
  const callRecv = qso.callReceived.padEnd(13, " ");
  const rstRecv = qso.rstReceived.padEnd(3, " ");
  const exchRecv = qso.exchangeReceived;

  return `QSO: ${freq} ${mode} ${date} ${time} ${callSent} ${rstSent} ${exchSent} ${callRecv} ${rstRecv} ${exchRecv}`;
}

/**
 * Generate complete Cabrillo file
 */
export function generateCabrillo(
  header: CabrilloHeader,
  qsos: CabrilloQSO[],
): string {
  let output = generateHeader(header);

  for (const qso of qsos) {
    output += formatCabrilloQSO(qso) + "\n";
  }

  output += "END-OF-LOG:\n";

  return output;
}

/**
 * Download Cabrillo file
 */
export function downloadCabrillo(
  header: CabrilloHeader,
  qsos: CabrilloQSO[],
  filename: string = "contest.log",
): void {
  const content = generateCabrillo(header, qsos);
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Convert frequency in MHz to Cabrillo band (kHz)
 */
export function mhzToKhz(mhz: number): number {
  return Math.round(mhz * 1000);
}

/**
 * Convert mode to Cabrillo format
 */
export function modeToCabrillo(mode: string): "CW" | "PH" | "RY" {
  const upper = mode.toUpperCase();
  if (upper === "CW") return "CW";
  if (["SSB", "USB", "LSB", "AM", "FM", "PHONE"].includes(upper)) return "PH";
  return "RY"; // RTTY, FT8, digital modes
}
