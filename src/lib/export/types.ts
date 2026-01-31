/**
 * Export format type definitions
 * Supports ADIF 3.1.6 and Cabrillo 3.0 standards
 */

/**
 * ADIF record - represents a single QSO
 * Based on ADIF 3.1.6 specification
 */
export interface ADIFRecord {
  // Required fields
  CALL: string; // Contacted station callsign
  QSO_DATE: string; // YYYYMMDD format
  TIME_ON: string; // HHMM or HHMMSS format
  BAND: string; // e.g., '20m', '40m'
  MODE: string; // e.g., 'SSB', 'CW', 'FT8'

  // Optional common fields
  FREQ?: string; // Frequency in MHz
  RST_SENT?: string; // RST report sent
  RST_RCVD?: string; // RST report received
  GRIDSQUARE?: string; // Contacted station grid
  MY_GRIDSQUARE?: string; // My grid locator
  NAME?: string; // Operator name
  QTH?: string; // Location
  COMMENT?: string; // Notes

  // Propagation fields
  PROP_MODE?: string; // F2, ES, TR, etc.
  A_INDEX?: string; // A index
  K_INDEX?: string; // K index
  SFI?: string; // Solar flux index

  // Station info
  TX_PWR?: string; // TX power in watts
  MY_RIG?: string; // Rig description
  MY_ANTENNA?: string; // Antenna description

  // Contest fields
  CONTEST_ID?: string; // Contest identifier
  SRX?: string; // Serial received
  STX?: string; // Serial sent
}

/**
 * ADIF file options
 */
export interface ADIFOptions {
  programId?: string; // Program name (default: 'PropSphere')
  programVersion?: string; // Version string
  includeHeader?: boolean; // Include ADIF header
}

/**
 * Cabrillo QSO line
 * Based on Cabrillo 3.0 specification
 */
export interface CabrilloQSO {
  frequency: number; // kHz
  mode: "CW" | "PH" | "RY"; // Cabrillo modes
  date: string; // YYYY-MM-DD
  time: string; // HHMM
  callSent: string; // My callsign
  rstSent: string; // RST sent
  exchangeSent: string; // Exchange sent
  callReceived: string; // Their callsign
  rstReceived: string; // RST received
  exchangeReceived: string; // Exchange received
}

/**
 * Cabrillo header fields
 */
export interface CabrilloHeader {
  CONTEST: string; // Contest name
  CALLSIGN: string; // Station callsign
  CATEGORY_OPERATOR: "SINGLE-OP" | "MULTI-OP" | "CHECKLOG";
  CATEGORY_ASSISTED: "ASSISTED" | "NON-ASSISTED";
  CATEGORY_BAND: "ALL" | "160M" | "80M" | "40M" | "20M" | "15M" | "10M";
  CATEGORY_POWER: "HIGH" | "LOW" | "QRP";
  CATEGORY_MODE: "CW" | "SSB" | "RTTY" | "MIXED";
  CATEGORY_TRANSMITTER: "ONE" | "TWO" | "LIMITED" | "UNLIMITED" | "SWL";
  CLAIMED_SCORE?: number;
  CLUB?: string;
  LOCATION?: string; // ARRL section or DXCC entity
  NAME?: string;
  ADDRESS?: string;
  ADDRESS_CITY?: string;
  ADDRESS_STATE_PROVINCE?: string;
  ADDRESS_POSTALCODE?: string;
  ADDRESS_COUNTRY?: string;
  OPERATORS?: string; // Space-separated list
  SOAPBOX?: string[]; // Comments (multiple lines allowed)
}

/**
 * Path analysis export data (for PropSphere-specific exports)
 */
export interface PathExportData {
  homeCall?: string;
  homeGrid: string;
  homeLat: number;
  homeLon: number;
  targetCall?: string;
  targetGrid?: string;
  targetLat: number;
  targetLon: number;
  distance: number; // km
  bearing: number; // degrees
  muf?: number; // MHz
  fot?: number; // MHz
  luf?: number; // MHz
  bestBand?: string;
  timestamp: string; // ISO format
  sfi?: number;
  kIndex?: number;
}
