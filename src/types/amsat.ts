/**
 * AMSAT Satellite Status API Types
 *
 * Types for the AMSAT satellite operational status API.
 * API: https://amsat.org/status/api/v1/sat_info.php
 */

/** Single status report from the AMSAT status API */
export interface AMSATStatusReport {
  /** Satellite name/designator (e.g., "SO-50") */
  name: string;
  /** UTC timestamp of when this report was submitted */
  reported_time: string;
  /** Callsign of the operator who submitted the report */
  callsign: string;
  /** Status report text (e.g., "Heard", "Active", "Not Heard") */
  report: string;
  /** Maidenhead grid square of the reporter */
  grid_square: string;
}

/** Aggregated operational status derived from recent AMSAT reports */
export type AMSATOperationalStatus =
  | "active"
  | "semi-active"
  | "inactive"
  | "unknown";

/** Parsed AMSAT status result for UI consumption */
export interface AMSATStatusResult {
  /** Overall operational status derived from recent reports */
  status: AMSATOperationalStatus;
  /** Number of recent reports in the lookback window */
  reportCount: number;
  /** Most recent report, if any */
  latestReport: AMSATStatusReport | null;
  /** All reports in the lookback window */
  reports: AMSATStatusReport[];
}
