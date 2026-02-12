/**
 * ADIF (Amateur Data Interchange Format) type definitions
 *
 * Covers ADIF 3.1.4 record structure, file format,
 * and Cabrillo 3.0 header types.
 */

// ── ADIF Record ─────────────────────────────────────────────────────────────

/** A single ADIF record as a map of field name to string value */
export type ADIFRecord = Map<string, string>;

/** Complete ADIF file with optional header and array of records */
export interface ADIFFile {
  /** Raw header text (content before <EOH>) */
  header?: string;
  /** Parsed QSO records */
  records: ADIFRecord[];
}

// ── ADIF Export Options ─────────────────────────────────────────────────────

export interface ADIFExportOptions {
  /** Include station callsign in each record */
  includeStationCallsign?: boolean;
  /** My station callsign */
  stationCallsign?: string;
  /** My grid square */
  myGrid?: string;
  /** Include extended fields (DXCC, zones, country) */
  includeExtended?: boolean;
  /** Include contest fields */
  includeContest?: boolean;
  /** Include activation fields (POTA/SOTA) */
  includeActivation?: boolean;
}

// ── Cabrillo Types ──────────────────────────────────────────────────────────

export interface CabrilloHeader {
  /** Contest name (e.g., "CQ-WW-SSB") */
  contest: string;
  /** Station callsign */
  callsign: string;
  /** Operator category */
  categoryOperator?: "SINGLE-OP" | "MULTI-OP" | "CHECKLOG";
  /** Assisted category */
  categoryAssisted?: "ASSISTED" | "NON-ASSISTED";
  /** Band category (blank = ALL) */
  categoryBand?:
    | "ALL"
    | "160M"
    | "80M"
    | "40M"
    | "20M"
    | "15M"
    | "10M"
    | "6M"
    | "2M";
  /** Power category */
  categoryPower?: "HIGH" | "LOW" | "QRP";
  /** Mode category */
  categoryMode?: "SSB" | "CW" | "RTTY" | "FM" | "MIXED";
  /** Transmitter category */
  categoryTransmitter?: "ONE" | "TWO" | "LIMITED" | "UNLIMITED" | "SWL";
  /** Station category */
  categoryStation?:
    | "FIXED"
    | "MOBILE"
    | "PORTABLE"
    | "ROVER"
    | "EXPEDITION"
    | "HQ"
    | "SCHOOL";
  /** Operator name(s) */
  operators?: string;
  /** Soapbox / comments */
  soapbox?: string;
  /** Claimed score (optional) */
  claimedScore?: number;
  /** Club name */
  club?: string;
  /** Location / grid */
  location?: string;
  /** Email address */
  email?: string;
}

// ── Common ADIF Field Constants ─────────────────────────────────────────────

/** Standard ADIF field names mapped to LogEntry field names */
export const ADIF_FIELD_MAP: Record<string, string> = {
  CALL: "callsign",
  QSO_DATE: "date",
  TIME_ON: "timeOn",
  TIME_OFF: "timeOff",
  BAND: "band",
  MODE: "mode",
  FREQ: "frequency",
  RST_SENT: "rstSent",
  RST_RCVD: "rstRcvd",
  GRIDSQUARE: "grid",
  NAME: "name",
  QTH: "qth",
  COMMENT: "notes",
  QSL_SENT: "qslSent",
  QSL_RCVD: "qslRcvd",
  LOTW_QSL_SENT: "lotwQslSent",
  LOTW_QSL_RCVD: "lotwQslRcvd",
  // EQSL_QSL_SENT is not mapped — LogEntry.eqsl represents confirmed (received) status
  EQSL_QSL_RCVD: "eqsl",
  DXCC: "dxcc",
  COUNTRY: "country",
  CQ_ZONE: "cqZone",
  ITU_ZONE: "ituZone",
  CONT: "continent",
  TX_PWR: "txPower",
  MY_GRIDSQUARE: "myGrid",
  MY_RIG: "myRig",
  MY_ANTENNA: "myAntenna",
  PROP_MODE: "propMode",
  SAT_NAME: "satName",
  SAT_MODE: "satMode",
  SIG: "sig",
  SIG_INFO: "sigInfo",
  MY_SIG: "mySig",
  MY_SIG_INFO: "mySigInfo",
  CONTEST_ID: "contestId",
  STX: "stx",
  SRX: "srx",
  STX_STRING: "stxString",
  SRX_STRING: "srxString",
  STATION_CALLSIGN: "stationCallsign",
  OPERATOR: "operatorCallsign",
  CLUBLOG_QSO_UPLOAD_STATUS: "clublogStatus",
  QRZCOM_QSO_UPLOAD_STATUS: "qrzcomStatus",
};

/** Band options for filter dropdowns */
export const BAND_OPTIONS = [
  "160m",
  "80m",
  "60m",
  "40m",
  "30m",
  "20m",
  "17m",
  "15m",
  "12m",
  "10m",
  "6m",
  "2m",
  "70cm",
  "23cm",
] as const;

/** Mode options for filter dropdowns */
export const MODE_OPTIONS = [
  "SSB",
  "CW",
  "FT8",
  "FT4",
  "RTTY",
  "PSK31",
  "JS8",
  "SSTV",
  "FM",
  "AM",
  "DSTAR",
  "C4FM",
  "DMR",
  "OLIVIA",
  "JT65",
  "JT9",
] as const;
