/**
 * ADIF (Amateur Data Interchange Format) file generator
 * Implements ADIF 3.1.6 specification
 * https://adif.org/316/ADIF_316.htm
 */

import type { ADIFRecord, ADIFOptions, PathExportData } from "./types";
import type { NetCheckin, Net, NetSession } from "@/types/net";

/**
 * Generate ADIF header
 */
function generateHeader(options: ADIFOptions): string {
  const lines: string[] = [];
  lines.push(`<ADIF_VER:5>3.1.6`);
  lines.push(
    `<PROGRAMID:${options.programId?.length || 10}>${options.programId || "PropSphere"}`,
  );
  lines.push(
    `<PROGRAMVERSION:${options.programVersion?.length || 5}>${options.programVersion || "1.0.0"}`,
  );
  lines.push(`<EOH>`);
  return lines.join("\n") + "\n\n";
}

/**
 * Format a single ADIF field
 */
function formatField(name: string, value: string | number | undefined): string {
  if (value === undefined || value === null || value === "") {
    return "";
  }
  const strValue = String(value);
  return `<${name}:${strValue.length}>${strValue}`;
}

/**
 * Generate ADIF string for a single record
 */
export function formatADIFRecord(record: ADIFRecord): string {
  const fields: string[] = [];

  // Add all fields that have values
  for (const [key, value] of Object.entries(record)) {
    const field = formatField(key, value);
    if (field) {
      fields.push(field);
    }
  }

  return fields.join("") + "<EOR>\n";
}

/**
 * Generate complete ADIF file from records
 */
export function generateADIF(
  records: ADIFRecord[],
  options: ADIFOptions = {},
): string {
  let output = "";

  if (options.includeHeader !== false) {
    output += generateHeader(options);
  }

  for (const record of records) {
    output += formatADIFRecord(record);
  }

  return output;
}

/**
 * Convert path analysis data to ADIF record
 * Creates a "planned QSO" record for logging
 */
export function pathToADIF(data: PathExportData): ADIFRecord {
  const now = new Date(data.timestamp);

  return {
    CALL: data.targetCall || "DX",
    QSO_DATE: now.toISOString().slice(0, 10).replace(/-/g, ""),
    TIME_ON: now.toISOString().slice(11, 16).replace(":", ""),
    BAND: data.bestBand || "20m",
    MODE: "SSB",
    GRIDSQUARE: data.targetGrid,
    MY_GRIDSQUARE: data.homeGrid,
    COMMENT: `Path analysis: ${Math.round(data.distance)}km, ${Math.round(data.bearing)}° - MUF: ${data.muf?.toFixed(1) || "N/A"} MHz`,
    SFI: data.sfi?.toString(),
    K_INDEX: data.kIndex?.toString(),
    PROP_MODE: "F2",
  };
}

/**
 * Convert a net check-in to an ADIF record.
 * Creates a QSO record representing the net check-in contact.
 */
export function checkinToADIF(
  checkin: NetCheckin,
  net: Net,
  session: NetSession,
): ADIFRecord {
  const checkinDate = new Date(checkin.checkedInAt);

  // Parse frequency: "146.520 MHz" -> "146.520"
  const freqMatch = net.frequency.match(/[\d.]+/);
  const freqMHz = freqMatch ? freqMatch[0] : undefined;

  // Build comment
  const parts: string[] = [`Net: ${net.name}`];
  if (checkin.trafficNotes) parts.push(`Traffic: ${checkin.trafficNotes}`);
  if (checkin.isRelay && checkin.relayVia)
    parts.push(`Relay via ${checkin.relayVia}`);
  parts.push(`NCS: ${session.ncsCallsign}`);

  return {
    CALL: checkin.callsign,
    QSO_DATE: checkinDate.toISOString().slice(0, 10).replace(/-/g, ""),
    TIME_ON: checkinDate.toISOString().slice(11, 16).replace(":", ""),
    BAND: net.band,
    MODE: net.mode,
    FREQ: freqMHz,
    COMMENT: parts.join(" | "),
  };
}

/**
 * Export all check-ins from a session as ADIF records.
 * Only includes check-ins with "completed" or "had_turn" status.
 */
export function sessionToADIF(
  checkins: NetCheckin[],
  net: Net,
  session: NetSession,
): ADIFRecord[] {
  return checkins
    .filter((c) => c.status === "completed" || c.status === "had_turn")
    .map((c) => checkinToADIF(c, net, session));
}

/**
 * Download ADIF file
 */
export function downloadADIF(
  records: ADIFRecord[],
  filename: string = "export.adi",
): void {
  const content = generateADIF(records);
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
