/**
 * ADIF (Amateur Data Interchange Format) file generator
 * Implements ADIF 3.1.6 specification
 * https://adif.org/316/ADIF_316.htm
 */

import type { ADIFRecord, ADIFOptions, PathExportData } from "./types";

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
  if (value === undefined || value === null || value === "") return "";
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
    if (field) fields.push(field);
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
