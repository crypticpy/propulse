/**
 * Enriched FT8/FT4 decode with DXCC, country, distance, and operational flags.
 *
 * Extends the raw WsjtxDecode with callsign lookup data for display in
 * the decode panel, waterfall markers, and map layers.
 */

import type { WsjtxDecode } from "@/lib/radio/protocol";

export interface Ft8EnrichedDecode extends WsjtxDecode {
  /** Country name (from DXCC database) */
  country?: string;
  /** ISO 3166-1 alpha-2 country code for flag display */
  countryCode?: string;
  /** DXCC entity ID */
  dxcc?: number;
  /** CQ zone number */
  cqZone?: number;
  /** ITU zone number */
  ituZone?: number;
  /** Continent code: NA, SA, EU, AF, AS, OC, AN */
  continent?: string;
  /** US state abbreviation (if applicable) */
  state?: string;
  /** Distance in km from operator to decoded station */
  distanceKm?: number;
  /** Bearing in degrees from operator to decoded station */
  bearingDeg?: number;
  /** Latitude of decoded station */
  lat?: number;
  /** Longitude of decoded station */
  lon?: number;

  // ── Operational flags ─────────────────────────────────────────────────────

  /** True if this is a CQ call */
  isCQ: boolean;
  /** True if this is a new DXCC/grid/state not previously worked */
  isNew: boolean;
  /** True if this callsign has been worked before on this band */
  isDupe: boolean;
  /** True if this entity/grid/state is needed for an award */
  isNeeded: boolean;
  /** True if the message is directed at the operator's callsign */
  isCallingMe: boolean;
  /** Decode source: native WASM decoder or bridge/WSJT-X relay */
  source: "native" | "bridge";
}

/** DXCC entity to ISO 3166-1 alpha-2 country code mapping (common entities) */
export const DXCC_TO_COUNTRY_CODE: Record<number, string> = {
  1: "CA", // Canada
  6: "MX", // Mexico
  13: "AU", // Australia
  14: "AT", // Austria
  15: "BE", // Belgium
  20: "BR", // Brazil
  21: "GB", // United Kingdom (excluding overseas territories)
  27: "CN", // China
  29: "CO", // Colombia
  32: "HR", // Croatia
  33: "CU", // Cuba
  50: "DE", // Germany (Fed. Rep.)
  52: "DK", // Denmark
  54: "EC", // Ecuador
  61: "FI", // Finland
  62: "FR", // France (incl. Corsica, overseas)
  63: "FR", // French Guiana
  74: "GR", // Greece
  78: "HU", // Hungary
  100: "AR", // Argentina
  104: "IS", // Iceland
  106: "IN", // India
  108: "ID", // Indonesia
  109: "IR", // Iran
  110: "US", // Hawaii
  112: "IE", // Ireland
  113: "IL", // Israel
  114: "IT", // Italy
  116: "JM", // Jamaica
  117: "JP", // Japan
  120: "KE", // Kenya
  126: "KR", // South Korea
  132: "LU", // Luxembourg
  135: "MY", // West Malaysia
  136: "MV", // Maldives
  137: "MT", // Malta
  144: "MN", // Mongolia
  148: "NL", // Netherlands
  150: "NZ", // New Zealand
  163: "NO", // Norway
  167: "PK", // Pakistan
  170: "PH", // Philippines
  172: "PL", // Poland
  179: "PT", // Portugal
  185: "RO", // Romania
  187: "RU", // Russian Federation (European)
  209: "SE", // Sweden
  211: "CH", // Switzerland
  224: "TH", // Thailand
  227: "TR", // Turkey
  230: "UA", // Ukraine
  239: "VE", // Venezuela
  246: "ZA", // South Africa
  248: "ES", // Spain
  269: "US", // Guam (US territory)
  284: "CN", // China (mainland)
  291: "US", // United States
  318: "CL", // Chile
  327: "PE", // Peru
  339: "JP", // Japan
  375: "TW", // Taiwan
  386: "HK", // Hong Kong
  497: "HR", // Croatia
};
