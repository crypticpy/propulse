/**
 * ADIF Import Profiles (QoL12)
 *
 * Logger-specific profiles for normalizing ADIF imports from
 * N1MM+, Log4OM, and generic ADIF-compliant sources.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdifProfile {
  name: string;
  detectPattern: RegExp;
  normalizeMode: (mode: string) => string;
  normalizeRst: (rst: string) => string;
  mapFields: Record<string, string>;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  duplicates: number;
  errors: Array<{ line: number; reason: string; raw: string }>;
  sourceName: string;
}

export interface NormalizedQso {
  call: string;
  band: string;
  mode: string;
  freq: string;
  qsoDate: string;
  timeOn: string;
  rstSent: string;
  rstRcvd: string;
  gridsquare?: string;
  comment?: string;
  name?: string;
  qth?: string;
  [key: string]: string | undefined;
}

// ---------------------------------------------------------------------------
// Mode normalization helpers
// ---------------------------------------------------------------------------

const STANDARD_MODES: Record<string, string> = {
  SSB: "SSB",
  USB: "SSB",
  LSB: "SSB",
  CW: "CW",
  FT8: "FT8",
  FT4: "FT4",
  RTTY: "RTTY",
  PSK31: "PSK31",
  PSK63: "PSK63",
  JT65: "JT65",
  JT9: "JT9",
  FM: "FM",
  AM: "AM",
  DSTAR: "DSTAR",
  C4FM: "C4FM",
  OLIVIA: "OLIVIA",
};

function normalizeStandardMode(mode: string): string {
  const upper = mode.toUpperCase().trim();
  return STANDARD_MODES[upper] ?? upper;
}

function normalizeN1mmMode(mode: string): string {
  const upper = mode.toUpperCase().trim();
  // N1MM uses "USB" / "LSB" instead of "SSB"
  if (upper === "USB" || upper === "LSB") return "SSB";
  // N1MM sometimes uses "RTTY" as "FSK"
  if (upper === "FSK") return "RTTY";
  return STANDARD_MODES[upper] ?? upper;
}

function normalizeLog4omMode(mode: string): string {
  const upper = mode.toUpperCase().trim();
  // Log4OM uses full words sometimes
  if (upper === "SIDEBAND") return "SSB";
  if (upper === "MORSE") return "CW";
  return STANDARD_MODES[upper] ?? upper;
}

// ---------------------------------------------------------------------------
// RST normalization
// ---------------------------------------------------------------------------

function normalizeStandardRst(rst: string): string {
  return rst.trim() || "59";
}

function normalizeN1mmRst(rst: string): string {
  // N1MM sometimes omits leading zeros for CW RST
  const trimmed = rst.trim();
  if (!trimmed) return "599";
  // Pad 2-digit RST to 3 digits (e.g., "59" → "599" for CW)
  if (/^\d{2}$/.test(trimmed)) return trimmed + "9";
  return trimmed;
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

const N1MM_PROFILE: AdifProfile = {
  name: "N1MM+",
  detectPattern: /N1MM/i,
  normalizeMode: normalizeN1mmMode,
  normalizeRst: normalizeN1mmRst,
  mapFields: {
    CONTEST_ID: "contestId",
    STX: "serialSent",
    SRX: "serialRcvd",
    STX_STRING: "exchangeSent",
    SRX_STRING: "exchangeRcvd",
    APP_N1MM_POINTS: "points",
    APP_N1MM_MULT1: "mult1",
  },
};

const LOG4OM_PROFILE: AdifProfile = {
  name: "Log4OM",
  detectPattern: /LOG4OM|Log4OM/i,
  normalizeMode: normalizeLog4omMode,
  normalizeRst: normalizeStandardRst,
  mapFields: {
    STATION_CALLSIGN: "stationCallsign",
    MY_GRIDSQUARE: "myGrid",
    MY_CQ_ZONE: "myCqZone",
    MY_ITU_ZONE: "myItuZone",
    HAMQTH_QSL_STATUS: "hamqthStatus",
  },
};

const GENERIC_PROFILE: AdifProfile = {
  name: "Generic ADIF",
  detectPattern: /./,
  normalizeMode: normalizeStandardMode,
  normalizeRst: normalizeStandardRst,
  mapFields: {},
};

const PROFILES: AdifProfile[] = [N1MM_PROFILE, LOG4OM_PROFILE, GENERIC_PROFILE];

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Detect the logger profile from ADIF header content.
 * Looks for PROGRAMID field in the header (text before <EOH>).
 */
export function detectProfile(adifContent: string): AdifProfile {
  // Extract header (before first <EOH>)
  const eohIndex = adifContent.toUpperCase().indexOf("<EOH>");
  const header = eohIndex >= 0 ? adifContent.slice(0, eohIndex) : "";

  // Look for PROGRAMID
  const pidMatch = header.match(/<PROGRAMID:\d+>([^<]+)/i);
  const programId = pidMatch?.[1]?.trim() ?? "";

  for (const profile of PROFILES) {
    if (profile.detectPattern.test(programId)) {
      return profile;
    }
  }
  return GENERIC_PROFILE;
}

// ---------------------------------------------------------------------------
// Field parsing
// ---------------------------------------------------------------------------

/**
 * Parse a single ADIF record string into a field map.
 * ADIF format: <FIELD_NAME:LENGTH[:TYPE]>VALUE
 */
export function parseAdifRecord(record: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const regex = /<(\w+):(\d+)(?::\w+)?>/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(record)) !== null) {
    const fieldName = match[1].toUpperCase();
    const length = parseInt(match[2], 10);
    const valueStart = match.index + match[0].length;
    const value = record.slice(valueStart, valueStart + length);
    fields[fieldName] = value;
  }

  return fields;
}

/**
 * Split ADIF content into individual record strings.
 */
export function splitAdifRecords(adifContent: string): string[] {
  // Skip header
  const eohIndex = adifContent.toUpperCase().indexOf("<EOH>");
  const body = eohIndex >= 0 ? adifContent.slice(eohIndex + 5) : adifContent;

  // Split on <EOR> (end of record)
  return body
    .split(/<EOR>/i)
    .map((r) => r.trim())
    .filter((r) => r.length > 0 && r.includes("<"));
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a raw ADIF field map into a standardized QSO object.
 */
export function normalizeQso(
  raw: Record<string, string>,
  profile: AdifProfile,
): NormalizedQso | null {
  const call = raw.CALL?.trim();
  if (!call) return null;

  const mode = profile.normalizeMode(raw.MODE ?? "SSB");
  const rstSent = profile.normalizeRst(raw.RST_SENT ?? "");
  const rstRcvd = profile.normalizeRst(raw.RST_RCVD ?? "");

  const qso: NormalizedQso = {
    call,
    band: (raw.BAND ?? "").toUpperCase().trim(),
    mode,
    freq: raw.FREQ ?? "",
    qsoDate: raw.QSO_DATE ?? "",
    timeOn: raw.TIME_ON ?? "",
    rstSent,
    rstRcvd,
    gridsquare: raw.GRIDSQUARE,
    comment: raw.COMMENT,
    name: raw.NAME,
    qth: raw.QTH,
  };

  // Apply profile-specific field mappings
  for (const [adifField, normalizedField] of Object.entries(
    profile.mapFields,
  )) {
    if (raw[adifField]) {
      qso[normalizedField] = raw[adifField];
    }
  }

  return qso;
}

// ---------------------------------------------------------------------------
// Full import
// ---------------------------------------------------------------------------

/**
 * Import ADIF content with automatic logger detection and normalization.
 */
export function importAdif(
  adifContent: string,
  existingCalls?: Set<string>,
  skipDuplicates = true,
): { qsos: NormalizedQso[]; result: ImportResult } {
  const profile = detectProfile(adifContent);
  const records = splitAdifRecords(adifContent);
  const qsos: NormalizedQso[] = [];
  const result: ImportResult = {
    imported: 0,
    skipped: 0,
    duplicates: 0,
    errors: [],
    sourceName: profile.name,
  };

  for (let i = 0; i < records.length; i++) {
    const raw = parseAdifRecord(records[i]);

    // Duplicate check
    if (skipDuplicates && existingCalls) {
      const key = `${raw.CALL}-${raw.QSO_DATE}-${raw.TIME_ON}-${raw.BAND}`;
      if (existingCalls.has(key)) {
        result.duplicates++;
        continue;
      }
    }

    const qso = normalizeQso(raw, profile);
    if (!qso) {
      result.errors.push({
        line: i + 1,
        reason: "Missing CALL field",
        raw: records[i].slice(0, 100),
      });
      result.skipped++;
      continue;
    }

    if (!qso.qsoDate || !qso.timeOn) {
      result.errors.push({
        line: i + 1,
        reason: "Missing date/time",
        raw: records[i].slice(0, 100),
      });
      result.skipped++;
      continue;
    }

    qsos.push(qso);
    result.imported++;
  }

  return { qsos, result };
}

/**
 * Format import result as a human-readable summary string.
 */
export function formatImportSummary(result: ImportResult): string {
  const parts = [`Imported ${result.imported} QSOs from ${result.sourceName}`];
  if (result.skipped > 0) {
    parts.push(`(${result.skipped} skipped due to errors)`);
  }
  if (result.duplicates > 0) {
    parts.push(`(${result.duplicates} duplicates skipped)`);
  }
  return parts.join(" ");
}
