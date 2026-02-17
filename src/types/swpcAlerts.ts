/**
 * Types for SWPC (Space Weather Prediction Center) alert data
 *
 * These map to the raw JSON returned by:
 *   https://services.swpc.noaa.gov/products/alerts.json
 *
 * Parsed variants add derived fields for rendering and filtering.
 */

// =============================================================================
// RAW API TYPES
// =============================================================================

/** A single item from the SWPC alerts.json feed */
export interface SwpcAlertItem {
  product_id: string;
  /** UTC datetime in "YYYY-MM-DD HH:MM:SS.sss" format */
  issue_datetime: string;
  /** Full alert/watch/warning message text */
  message: string;
}

// =============================================================================
// DERIVED / ENRICHED TYPES
// =============================================================================

/** Severity classification derived from NOAA scale number */
export type SwpcAlertSeverity = "minor" | "moderate" | "major" | "extreme";

/** Category of SWPC alert based on message content */
export type SwpcAlertCategory =
  | "storm"
  | "flare"
  | "blackout"
  | "radiation"
  | "other";

/** Parsed and enriched SWPC alert ready for display */
export interface SwpcAlertParsed extends SwpcAlertItem {
  /** Parsed UTC Date object from issue_datetime */
  parsedDate: Date;
  /** Extracted NOAA scale code, e.g. "G2", "R1", "S3", or null */
  noaaScaleCode: string | null;
  /** Severity level derived from the scale number */
  severity: SwpcAlertSeverity;
  /** First meaningful line from the message body */
  summaryLine: string;
  /** Whether this alert is relevant to amateur radio operators */
  isHamRelevant: boolean;
  /** Category of the alert based on scale letter or message keywords */
  category: SwpcAlertCategory;
}
