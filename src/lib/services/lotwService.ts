/**
 * LoTW (Logbook of The World) Service Client
 *
 * Provides functions for uploading QSOs to LoTW, downloading confirmations,
 * and syncing confirmation status with the local DXCC store.
 *
 * All network requests are proxied through /api/log/lotw to avoid CORS issues
 * and to keep credentials off the client wire only once.
 *
 * NO React dependencies - this is a pure utility module.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LoTWCredentials {
  /** Callsign used as the LoTW login username */
  username: string;
  /** LoTW web password */
  password: string;
}

export interface LoTWUploadResult {
  success: boolean;
  message: string;
  recordsAccepted: number;
  recordsRejected: number;
}

export interface LoTWRecord {
  /** Callsign of the station worked */
  callsign: string;
  /** Band (e.g. "20M", "40M") */
  band: string;
  /** Mode (e.g. "SSB", "CW", "FT8") */
  mode: string;
  /** QSO date in YYYYMMDD format */
  qsoDate: string;
  /** QSO start time in HHMM format */
  timeOn: string;
  /** Whether a QSL confirmation was received from LoTW */
  qslReceived: boolean;
  /** Date when QSL was received (YYYYMMDD), if available */
  qslDate?: string;
  /** Whether the QSL was sent via LoTW */
  qslSent: boolean;
}

export interface LoTWSyncResult {
  /** Number of newly discovered confirmations */
  newConfirmations: number;
  /** Total records returned from LoTW */
  totalRecords: number;
  /** Names of newly confirmed DXCC entities */
  entities: string[];
}

/** A minimal QSO record for formatting as ADIF for upload */
export interface QSOForUpload {
  callsign: string;
  band: string;
  mode: string;
  qsoDate: string;
  timeOn: string;
  rstSent?: string;
  rstRcvd?: string;
  freq?: string;
  gridsquare?: string;
  comment?: string;
}

// ─── ADIF Parsing ───────────────────────────────────────────────────────────

/**
 * Extract a single ADIF field value from a record string.
 * ADIF format: <FIELD_NAME:LENGTH>VALUE or <FIELD_NAME:LENGTH:TYPE>VALUE
 *
 * @param record - Raw ADIF text for a single record
 * @param fieldName - Field name to extract (case-insensitive)
 * @returns The field value, or undefined if not found
 */
function extractAdifField(
  record: string,
  fieldName: string,
): string | undefined {
  // Match <FIELD:LEN>VALUE or <FIELD:LEN:TYPE>VALUE
  const pattern = new RegExp(`<${fieldName}:(\\d+)(?::[^>]*)?>(.*)`, "is");
  const match = record.match(pattern);
  if (!match) return undefined;

  const length = parseInt(match[1], 10);
  const rest = match[2];
  return rest.substring(0, length);
}

/**
 * Parse an ADIF response body from LoTW into structured records.
 *
 * @param adifText - Raw ADIF text (may include header before first <EOH>)
 * @returns Array of parsed LoTW records
 */
export function parseLoTWResponse(adifText: string): LoTWRecord[] {
  if (!adifText || adifText.trim().length === 0) return [];

  // Strip the ADIF header (everything before <EOH>)
  const eohIndex = adifText.toUpperCase().indexOf("<EOH>");
  const body = eohIndex >= 0 ? adifText.substring(eohIndex + 5) : adifText;

  // Split on <EOR> (end of record)
  const rawRecords = body.split(/<EOR>/i).filter((r) => r.trim().length > 0);

  const records: LoTWRecord[] = [];

  for (const raw of rawRecords) {
    const callsign = extractAdifField(raw, "CALL");
    if (!callsign) continue; // skip records without a callsign

    const band = extractAdifField(raw, "BAND") || "";
    const mode = extractAdifField(raw, "MODE") || "";
    const qsoDate = extractAdifField(raw, "QSO_DATE") || "";
    const timeOn = extractAdifField(raw, "TIME_ON") || "";

    // QSL status fields
    const qslRcvd = extractAdifField(raw, "QSL_RCVD") || "";
    const appLotwQslRcvd = extractAdifField(raw, "APP_LOTW_QSL_RCVD") || "";
    const qslDate =
      extractAdifField(raw, "QSL_DATE") ||
      extractAdifField(raw, "QSLRDATE") ||
      undefined;
    const qslSent = extractAdifField(raw, "QSL_SENT") || "";
    const appLotwQslSent = extractAdifField(raw, "APP_LOTW_QSLSENT") || "";

    // LoTW uses "Y" for confirmed
    const qslReceived =
      qslRcvd.toUpperCase() === "Y" || appLotwQslRcvd.toUpperCase() === "Y";
    const qslSentFlag =
      qslSent.toUpperCase() === "Y" || appLotwQslSent.toUpperCase() === "Y";

    records.push({
      callsign: callsign.toUpperCase(),
      band: band.toUpperCase(),
      mode: mode.toUpperCase(),
      qsoDate,
      timeOn: timeOn.substring(0, 4), // Normalize to HHMM
      qslReceived,
      qslDate,
      qslSent: qslSentFlag,
    });
  }

  return records;
}

// ─── ADIF Formatting ────────────────────────────────────────────────────────

/**
 * Format a single ADIF field tag.
 * Produces `<FIELD:LENGTH>VALUE` format.
 */
function adifField(name: string, value: string): string {
  return `<${name}:${value.length}>${value}`;
}

/**
 * Format an array of QSO records into an ADIF string suitable for LoTW upload.
 *
 * @param qsos - Array of QSO records to format
 * @returns ADIF text with header and records
 */
export function formatADIFForUpload(qsos: QSOForUpload[]): string {
  const lines: string[] = [];

  // ADIF header
  lines.push("Generated by PropUlse");
  lines.push(`<ADIF_VER:5>3.1.4`);
  lines.push(`<PROGRAMID:8>PropUlse`);
  lines.push(`<PROGRAMVERSION:3>1.0`);
  lines.push("<EOH>");
  lines.push("");

  for (const qso of qsos) {
    const fields: string[] = [];

    fields.push(adifField("CALL", qso.callsign.toUpperCase()));
    fields.push(adifField("BAND", qso.band.toUpperCase()));
    fields.push(adifField("MODE", qso.mode.toUpperCase()));
    fields.push(adifField("QSO_DATE", qso.qsoDate));
    fields.push(adifField("TIME_ON", qso.timeOn));

    if (qso.rstSent) {
      fields.push(adifField("RST_SENT", qso.rstSent));
    }
    if (qso.rstRcvd) {
      fields.push(adifField("RST_RCVD", qso.rstRcvd));
    }
    if (qso.freq) {
      fields.push(adifField("FREQ", qso.freq));
    }
    if (qso.gridsquare) {
      fields.push(adifField("GRIDSQUARE", qso.gridsquare.toUpperCase()));
    }
    if (qso.comment) {
      fields.push(adifField("COMMENT", qso.comment));
    }

    fields.push("<EOR>");
    lines.push(fields.join(" "));
  }

  return lines.join("\n");
}

// ─── API Client Functions ───────────────────────────────────────────────────

const LOTW_API_BASE = "/api/log/lotw";

/**
 * Upload ADIF records to LoTW via the proxy edge function.
 *
 * @param adifRecords - Array of QSO records to upload
 * @param credentials - LoTW username (callsign) and password
 * @returns Upload result with accepted/rejected counts
 */
export async function uploadToLoTW(
  adifRecords: QSOForUpload[],
  credentials: LoTWCredentials,
): Promise<LoTWUploadResult> {
  if (adifRecords.length === 0) {
    return {
      success: false,
      message: "No records to upload",
      recordsAccepted: 0,
      recordsRejected: 0,
    };
  }

  const adif = formatADIFForUpload(adifRecords);

  const response = await fetch(LOTW_API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      adif,
      username: credentials.username,
      password: credentials.password,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    return {
      success: false,
      message:
        (errorData as { error?: string } | null)?.error ??
        `LoTW upload failed (HTTP ${response.status})`,
      recordsAccepted: 0,
      recordsRejected: adifRecords.length,
    };
  }

  const data = (await response.json()) as {
    success: boolean;
    message: string;
    recordsAccepted?: number;
    recordsRejected?: number;
  };

  return {
    success: data.success,
    message: data.message,
    recordsAccepted: data.recordsAccepted ?? 0,
    recordsRejected: data.recordsRejected ?? 0,
  };
}

/**
 * Download QSL confirmations from LoTW via the proxy edge function.
 *
 * @param credentials - LoTW username (callsign) and password
 * @param since - Optional date filter (YYYY-MM-DD). Only return QSLs received since this date.
 * @returns Array of parsed LoTW records
 */
export async function downloadFromLoTW(
  credentials: LoTWCredentials,
  since?: string,
): Promise<LoTWRecord[]> {
  const params = new URLSearchParams({
    username: credentials.username,
    password: credentials.password,
  });

  if (since) {
    params.set("since", since);
  }

  const response = await fetch(`${LOTW_API_BASE}?${params.toString()}`);

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(
      (errorData as { error?: string } | null)?.error ??
        `LoTW download failed (HTTP ${response.status})`,
    );
  }

  const data = (await response.json()) as { adif: string };
  return parseLoTWResponse(data.adif);
}

/**
 * Download LoTW confirmations and cross-reference with the DXCC store
 * to find newly confirmed entities.
 *
 * This function downloads all confirmed QSOs from LoTW and compares them
 * against the local DXCC worked entries to identify new confirmations.
 *
 * @param credentials - LoTW username (callsign) and password
 * @param getWorkedEntries - Function that returns the current worked entries from the DXCC store
 * @param markConfirmed - Function to mark an entity as confirmed in the DXCC store
 * @param lookupCallsign - Function to look up a callsign and return its DXCC entity info
 * @returns Sync result with new confirmation count and entity names
 */
export async function syncLoTWConfirmations(
  credentials: LoTWCredentials,
  getWorkedEntries: () => Array<{
    entityId: number;
    callsign: string;
    band: string;
    mode: string;
    confirmed: boolean;
  }>,
  markConfirmed: (
    entityId: number,
    band: string,
    mode: string,
    method: string,
  ) => void,
  lookupCallsign: (
    callsign: string,
  ) => { entityId: number; entityName: string } | null,
): Promise<LoTWSyncResult> {
  // Download all confirmed QSOs from LoTW
  const lotwRecords = await downloadFromLoTW(credentials);

  const confirmedRecords = lotwRecords.filter((r) => r.qslReceived);
  const workedEntries = getWorkedEntries();

  // Build a lookup map of worked entries by callsign+band+mode
  const workedMap = new Map<string, { entityId: number; confirmed: boolean }>();
  for (const entry of workedEntries) {
    const key = `${entry.callsign}|${entry.band.toUpperCase()}|${entry.mode.toUpperCase()}`;
    workedMap.set(key, {
      entityId: entry.entityId,
      confirmed: entry.confirmed,
    });
  }

  let newConfirmations = 0;
  const newEntityNames: string[] = [];
  const confirmedEntityIds = new Set<number>();

  for (const lotwRec of confirmedRecords) {
    // Normalize the LoTW mode to match store conventions
    const normalizedMode = normalizeMode(lotwRec.mode);
    const key = `${lotwRec.callsign}|${lotwRec.band}|${normalizedMode}`;

    const worked = workedMap.get(key);

    if (worked && !worked.confirmed) {
      // Found a matching unconfirmed entry - mark it confirmed
      markConfirmed(worked.entityId, lotwRec.band, normalizedMode, "LoTW");
      newConfirmations++;

      if (!confirmedEntityIds.has(worked.entityId)) {
        confirmedEntityIds.add(worked.entityId);
        // Look up the entity name for the result
        const entity = lookupCallsign(lotwRec.callsign);
        if (entity) {
          newEntityNames.push(entity.entityName);
        }
      }
    } else if (!worked) {
      // Record exists in LoTW but not in local log - try to look up entity
      const entity = lookupCallsign(lotwRec.callsign);
      if (entity && !confirmedEntityIds.has(entity.entityId)) {
        confirmedEntityIds.add(entity.entityId);
      }
    }
  }

  return {
    newConfirmations,
    totalRecords: lotwRecords.length,
    entities: newEntityNames,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Normalize an ADIF mode string to the simplified mode categories
 * used in the DXCC store ("CW", "SSB", "DIGITAL", "MIXED").
 */
function normalizeMode(mode: string): string {
  const upper = mode.toUpperCase();

  // CW modes
  if (upper === "CW") return "CW";

  // Phone/SSB modes
  if (["SSB", "USB", "LSB", "AM", "FM"].includes(upper)) return "SSB";

  // Digital modes
  if (
    [
      "FT8",
      "FT4",
      "RTTY",
      "PSK31",
      "PSK63",
      "JT65",
      "JT9",
      "JS8",
      "MFSK",
      "OLIVIA",
      "CONTESIA",
      "DOMINO",
      "HELL",
      "ROS",
      "THROB",
      "WSPR",
      "FSK441",
      "MSK144",
      "Q65",
      "DIGITALVOICE",
    ].includes(upper)
  ) {
    return "DIGITAL";
  }

  // Default to the original mode in uppercase
  return upper;
}
