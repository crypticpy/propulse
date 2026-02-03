/**
 * Grid Research Utilities
 *
 * Provides DXCC entity lookup, distance/bearing calculations, activity statistics,
 * and best contact time predictions for Maidenhead grid squares.
 */

import type { DXSpot } from "@/types/dxcluster";
import { gridToLatLon, gridDistance, gridBearing, isValidGrid } from "./grid";

/**
 * DXCC Entity information
 */
export interface EntityInfo {
  /** Entity name (e.g., "United States") */
  name: string;
  /** Common prefixes (e.g., "W/K/N") */
  prefix: string;
  /** CQ zone number */
  cqZone: number;
  /** ITU zone number */
  ituZone: number;
  /** Continent code (NA, SA, EU, AF, AS, OC) */
  continent: string;
}

/**
 * Distance and bearing information between two points
 */
export interface DistanceBearing {
  /** Distance in kilometers */
  distanceKm: number;
  /** Distance in miles */
  distanceMi: number;
  /** Forward bearing in degrees (0-360) */
  bearing: number;
  /** Reverse bearing in degrees (0-360) */
  reverseBearing: number;
}

/**
 * Activity statistics for a grid area
 */
export interface ActivityStats {
  /** Total number of spots */
  total: number;
  /** Spot counts by band */
  byBand: Record<string, number>;
  /** Spot counts by mode */
  byMode: Record<string, number>;
  /** Recent unique callsigns (up to 10) */
  recentCallsigns: string[];
}

/**
 * Best contact time prediction window
 */
export interface TimeWindow {
  /** Start time in UTC (HH:MM format) */
  startUtc: string;
  /** End time in UTC (HH:MM format) */
  endUtc: string;
  /** Confidence level */
  confidence: "high" | "medium" | "low";
  /** Suggested optimal band */
  optimalBand: string;
}

/**
 * DXCC entity database - prefix to entity mapping
 * Includes major entities with their CQ/ITU zones and continents
 */
const DXCC_ENTITIES: Record<
  string,
  { name: string; cqZone: number; ituZone: number; continent: string }
> = {
  // North America
  W: { name: "United States", cqZone: 4, ituZone: 7, continent: "NA" },
  K: { name: "United States", cqZone: 4, ituZone: 7, continent: "NA" },
  N: { name: "United States", cqZone: 4, ituZone: 7, continent: "NA" },
  AA: { name: "United States", cqZone: 4, ituZone: 7, continent: "NA" },
  AB: { name: "United States", cqZone: 4, ituZone: 7, continent: "NA" },
  AC: { name: "United States", cqZone: 4, ituZone: 7, continent: "NA" },
  AD: { name: "United States", cqZone: 4, ituZone: 7, continent: "NA" },
  AE: { name: "United States", cqZone: 4, ituZone: 7, continent: "NA" },
  AF: { name: "United States", cqZone: 4, ituZone: 7, continent: "NA" },
  AG: { name: "United States", cqZone: 4, ituZone: 7, continent: "NA" },
  AH: { name: "United States", cqZone: 31, ituZone: 61, continent: "OC" }, // Hawaii/Pacific
  AI: { name: "United States", cqZone: 4, ituZone: 7, continent: "NA" },
  AJ: { name: "United States", cqZone: 4, ituZone: 7, continent: "NA" },
  AK: { name: "United States", cqZone: 1, ituZone: 1, continent: "NA" }, // Alaska
  AL: { name: "United States", cqZone: 1, ituZone: 1, continent: "NA" }, // Alaska
  VE: { name: "Canada", cqZone: 4, ituZone: 4, continent: "NA" },
  VA: { name: "Canada", cqZone: 4, ituZone: 4, continent: "NA" },
  VY: { name: "Canada", cqZone: 2, ituZone: 4, continent: "NA" },
  VO: { name: "Canada", cqZone: 5, ituZone: 9, continent: "NA" },
  XE: { name: "Mexico", cqZone: 6, ituZone: 10, continent: "NA" },
  XF: { name: "Mexico", cqZone: 6, ituZone: 10, continent: "NA" },

  // Europe
  G: { name: "England", cqZone: 14, ituZone: 27, continent: "EU" },
  M: { name: "England", cqZone: 14, ituZone: 27, continent: "EU" },
  "2E": { name: "England", cqZone: 14, ituZone: 27, continent: "EU" },
  GW: { name: "Wales", cqZone: 14, ituZone: 27, continent: "EU" },
  GM: { name: "Scotland", cqZone: 14, ituZone: 27, continent: "EU" },
  GI: { name: "Northern Ireland", cqZone: 14, ituZone: 27, continent: "EU" },
  GD: { name: "Isle of Man", cqZone: 14, ituZone: 27, continent: "EU" },
  GJ: { name: "Jersey", cqZone: 14, ituZone: 27, continent: "EU" },
  GU: { name: "Guernsey", cqZone: 14, ituZone: 27, continent: "EU" },
  DL: { name: "Germany", cqZone: 14, ituZone: 28, continent: "EU" },
  DA: { name: "Germany", cqZone: 14, ituZone: 28, continent: "EU" },
  DB: { name: "Germany", cqZone: 14, ituZone: 28, continent: "EU" },
  DC: { name: "Germany", cqZone: 14, ituZone: 28, continent: "EU" },
  DD: { name: "Germany", cqZone: 14, ituZone: 28, continent: "EU" },
  DE: { name: "Germany", cqZone: 14, ituZone: 28, continent: "EU" },
  DF: { name: "Germany", cqZone: 14, ituZone: 28, continent: "EU" },
  DG: { name: "Germany", cqZone: 14, ituZone: 28, continent: "EU" },
  DH: { name: "Germany", cqZone: 14, ituZone: 28, continent: "EU" },
  DJ: { name: "Germany", cqZone: 14, ituZone: 28, continent: "EU" },
  DK: { name: "Germany", cqZone: 14, ituZone: 28, continent: "EU" },
  DM: { name: "Germany", cqZone: 14, ituZone: 28, continent: "EU" },
  DN: { name: "Germany", cqZone: 14, ituZone: 28, continent: "EU" },
  DO: { name: "Germany", cqZone: 14, ituZone: 28, continent: "EU" },
  DP: { name: "Germany", cqZone: 14, ituZone: 28, continent: "EU" },
  DQ: { name: "Germany", cqZone: 14, ituZone: 28, continent: "EU" },
  DR: { name: "Germany", cqZone: 14, ituZone: 28, continent: "EU" },
  F: { name: "France", cqZone: 14, ituZone: 27, continent: "EU" },
  I: { name: "Italy", cqZone: 15, ituZone: 28, continent: "EU" },
  IK: { name: "Italy", cqZone: 15, ituZone: 28, continent: "EU" },
  IZ: { name: "Italy", cqZone: 15, ituZone: 28, continent: "EU" },
  EA: { name: "Spain", cqZone: 14, ituZone: 37, continent: "EU" },
  EB: { name: "Spain", cqZone: 14, ituZone: 37, continent: "EU" },
  EC: { name: "Spain", cqZone: 14, ituZone: 37, continent: "EU" },
  ED: { name: "Spain", cqZone: 14, ituZone: 37, continent: "EU" },
  EE: { name: "Spain", cqZone: 14, ituZone: 37, continent: "EU" },
  CT: { name: "Portugal", cqZone: 14, ituZone: 37, continent: "EU" },
  PA: { name: "Netherlands", cqZone: 14, ituZone: 27, continent: "EU" },
  PB: { name: "Netherlands", cqZone: 14, ituZone: 27, continent: "EU" },
  PC: { name: "Netherlands", cqZone: 14, ituZone: 27, continent: "EU" },
  PD: { name: "Netherlands", cqZone: 14, ituZone: 27, continent: "EU" },
  PE: { name: "Netherlands", cqZone: 14, ituZone: 27, continent: "EU" },
  PF: { name: "Netherlands", cqZone: 14, ituZone: 27, continent: "EU" },
  PG: { name: "Netherlands", cqZone: 14, ituZone: 27, continent: "EU" },
  PH: { name: "Netherlands", cqZone: 14, ituZone: 27, continent: "EU" },
  PI: { name: "Netherlands", cqZone: 14, ituZone: 27, continent: "EU" },
  ON: { name: "Belgium", cqZone: 14, ituZone: 27, continent: "EU" },
  OO: { name: "Belgium", cqZone: 14, ituZone: 27, continent: "EU" },
  OQ: { name: "Belgium", cqZone: 14, ituZone: 27, continent: "EU" },
  OR: { name: "Belgium", cqZone: 14, ituZone: 27, continent: "EU" },
  OS: { name: "Belgium", cqZone: 14, ituZone: 27, continent: "EU" },
  OT: { name: "Belgium", cqZone: 14, ituZone: 27, continent: "EU" },
  HB: { name: "Switzerland", cqZone: 14, ituZone: 28, continent: "EU" },
  OE: { name: "Austria", cqZone: 15, ituZone: 28, continent: "EU" },
  OZ: { name: "Denmark", cqZone: 14, ituZone: 18, continent: "EU" },
  SM: { name: "Sweden", cqZone: 14, ituZone: 18, continent: "EU" },
  SA: { name: "Sweden", cqZone: 14, ituZone: 18, continent: "EU" },
  SB: { name: "Sweden", cqZone: 14, ituZone: 18, continent: "EU" },
  SC: { name: "Sweden", cqZone: 14, ituZone: 18, continent: "EU" },
  SD: { name: "Sweden", cqZone: 14, ituZone: 18, continent: "EU" },
  SE: { name: "Sweden", cqZone: 14, ituZone: 18, continent: "EU" },
  SF: { name: "Sweden", cqZone: 14, ituZone: 18, continent: "EU" },
  SG: { name: "Sweden", cqZone: 14, ituZone: 18, continent: "EU" },
  SH: { name: "Sweden", cqZone: 14, ituZone: 18, continent: "EU" },
  SI: { name: "Sweden", cqZone: 14, ituZone: 18, continent: "EU" },
  SJ: { name: "Sweden", cqZone: 14, ituZone: 18, continent: "EU" },
  SK: { name: "Sweden", cqZone: 14, ituZone: 18, continent: "EU" },
  SL: { name: "Sweden", cqZone: 14, ituZone: 18, continent: "EU" },
  LA: { name: "Norway", cqZone: 14, ituZone: 18, continent: "EU" },
  LB: { name: "Norway", cqZone: 14, ituZone: 18, continent: "EU" },
  LC: { name: "Norway", cqZone: 14, ituZone: 18, continent: "EU" },
  LD: { name: "Norway", cqZone: 14, ituZone: 18, continent: "EU" },
  LE: { name: "Norway", cqZone: 14, ituZone: 18, continent: "EU" },
  LF: { name: "Norway", cqZone: 14, ituZone: 18, continent: "EU" },
  LG: { name: "Norway", cqZone: 14, ituZone: 18, continent: "EU" },
  LH: { name: "Norway", cqZone: 14, ituZone: 18, continent: "EU" },
  LI: { name: "Norway", cqZone: 14, ituZone: 18, continent: "EU" },
  LJ: { name: "Norway", cqZone: 14, ituZone: 18, continent: "EU" },
  LK: { name: "Norway", cqZone: 14, ituZone: 18, continent: "EU" },
  LL: { name: "Norway", cqZone: 14, ituZone: 18, continent: "EU" },
  LM: { name: "Norway", cqZone: 14, ituZone: 18, continent: "EU" },
  LN: { name: "Norway", cqZone: 14, ituZone: 18, continent: "EU" },
  OH: { name: "Finland", cqZone: 15, ituZone: 18, continent: "EU" },
  OF: { name: "Finland", cqZone: 15, ituZone: 18, continent: "EU" },
  OG: { name: "Finland", cqZone: 15, ituZone: 18, continent: "EU" },
  SP: { name: "Poland", cqZone: 15, ituZone: 28, continent: "EU" },
  SQ: { name: "Poland", cqZone: 15, ituZone: 28, continent: "EU" },
  SO: { name: "Poland", cqZone: 15, ituZone: 28, continent: "EU" },
  SN: { name: "Poland", cqZone: 15, ituZone: 28, continent: "EU" },
  OK: { name: "Czech Republic", cqZone: 15, ituZone: 28, continent: "EU" },
  OL: { name: "Czech Republic", cqZone: 15, ituZone: 28, continent: "EU" },
  OM: { name: "Slovak Republic", cqZone: 15, ituZone: 28, continent: "EU" },
  HA: { name: "Hungary", cqZone: 15, ituZone: 28, continent: "EU" },
  HG: { name: "Hungary", cqZone: 15, ituZone: 28, continent: "EU" },
  YO: { name: "Romania", cqZone: 20, ituZone: 28, continent: "EU" },
  YP: { name: "Romania", cqZone: 20, ituZone: 28, continent: "EU" },
  YQ: { name: "Romania", cqZone: 20, ituZone: 28, continent: "EU" },
  YR: { name: "Romania", cqZone: 20, ituZone: 28, continent: "EU" },
  LZ: { name: "Bulgaria", cqZone: 20, ituZone: 28, continent: "EU" },
  SV: { name: "Greece", cqZone: 20, ituZone: 28, continent: "EU" },
  SW: { name: "Greece", cqZone: 20, ituZone: 28, continent: "EU" },
  SX: { name: "Greece", cqZone: 20, ituZone: 28, continent: "EU" },
  SY: { name: "Greece", cqZone: 20, ituZone: 28, continent: "EU" },
  SZ: { name: "Greece", cqZone: 20, ituZone: 28, continent: "EU" },
  YU: { name: "Serbia", cqZone: 15, ituZone: 28, continent: "EU" },
  YT: { name: "Serbia", cqZone: 15, ituZone: 28, continent: "EU" },
  "9A": { name: "Croatia", cqZone: 15, ituZone: 28, continent: "EU" },
  S5: { name: "Slovenia", cqZone: 15, ituZone: 28, continent: "EU" },
  E7: { name: "Bosnia-Herzegovina", cqZone: 15, ituZone: 28, continent: "EU" },
  Z3: { name: "North Macedonia", cqZone: 15, ituZone: 28, continent: "EU" },
  EI: { name: "Ireland", cqZone: 14, ituZone: 27, continent: "EU" },
  EJ: { name: "Ireland", cqZone: 14, ituZone: 27, continent: "EU" },

  // Russia & CIS
  UA: { name: "Russia", cqZone: 16, ituZone: 29, continent: "EU" },
  UB: { name: "Russia", cqZone: 16, ituZone: 29, continent: "EU" },
  UC: { name: "Russia", cqZone: 16, ituZone: 29, continent: "EU" },
  UD: { name: "Russia", cqZone: 16, ituZone: 29, continent: "EU" },
  UE: { name: "Russia", cqZone: 16, ituZone: 29, continent: "EU" },
  UF: { name: "Russia", cqZone: 16, ituZone: 29, continent: "EU" },
  UG: { name: "Russia", cqZone: 16, ituZone: 29, continent: "EU" },
  UH: { name: "Russia", cqZone: 16, ituZone: 29, continent: "EU" },
  UI: { name: "Russia", cqZone: 16, ituZone: 29, continent: "EU" },
  RA: { name: "Russia", cqZone: 16, ituZone: 29, continent: "EU" },
  RK: { name: "Russia", cqZone: 16, ituZone: 29, continent: "EU" },
  RN: { name: "Russia", cqZone: 16, ituZone: 29, continent: "EU" },
  RU: { name: "Russia", cqZone: 16, ituZone: 29, continent: "EU" },
  RV: { name: "Russia", cqZone: 16, ituZone: 29, continent: "EU" },
  RW: { name: "Russia", cqZone: 16, ituZone: 29, continent: "EU" },
  RX: { name: "Russia", cqZone: 16, ituZone: 29, continent: "EU" },
  RZ: { name: "Russia", cqZone: 16, ituZone: 29, continent: "EU" },
  R0: { name: "Russia (Asiatic)", cqZone: 19, ituZone: 32, continent: "AS" },
  UA0: { name: "Russia (Asiatic)", cqZone: 19, ituZone: 32, continent: "AS" },
  UT: { name: "Ukraine", cqZone: 16, ituZone: 29, continent: "EU" },
  UR: { name: "Ukraine", cqZone: 16, ituZone: 29, continent: "EU" },
  US: { name: "Ukraine", cqZone: 16, ituZone: 29, continent: "EU" },
  UU: { name: "Ukraine", cqZone: 16, ituZone: 29, continent: "EU" },
  UV: { name: "Ukraine", cqZone: 16, ituZone: 29, continent: "EU" },
  UW: { name: "Ukraine", cqZone: 16, ituZone: 29, continent: "EU" },
  UX: { name: "Ukraine", cqZone: 16, ituZone: 29, continent: "EU" },
  UY: { name: "Ukraine", cqZone: 16, ituZone: 29, continent: "EU" },
  UZ: { name: "Ukraine", cqZone: 16, ituZone: 29, continent: "EU" },
  EU: { name: "Belarus", cqZone: 16, ituZone: 29, continent: "EU" },
  EV: { name: "Belarus", cqZone: 16, ituZone: 29, continent: "EU" },
  EW: { name: "Belarus", cqZone: 16, ituZone: 29, continent: "EU" },
  LY: { name: "Lithuania", cqZone: 15, ituZone: 29, continent: "EU" },
  YL: { name: "Latvia", cqZone: 15, ituZone: 29, continent: "EU" },
  ES: { name: "Estonia", cqZone: 15, ituZone: 29, continent: "EU" },

  // Asia
  JA: { name: "Japan", cqZone: 25, ituZone: 45, continent: "AS" },
  JH: { name: "Japan", cqZone: 25, ituZone: 45, continent: "AS" },
  JR: { name: "Japan", cqZone: 25, ituZone: 45, continent: "AS" },
  JE: { name: "Japan", cqZone: 25, ituZone: 45, continent: "AS" },
  JF: { name: "Japan", cqZone: 25, ituZone: 45, continent: "AS" },
  JG: { name: "Japan", cqZone: 25, ituZone: 45, continent: "AS" },
  JI: { name: "Japan", cqZone: 25, ituZone: 45, continent: "AS" },
  JJ: { name: "Japan", cqZone: 25, ituZone: 45, continent: "AS" },
  JK: { name: "Japan", cqZone: 25, ituZone: 45, continent: "AS" },
  JL: { name: "Japan", cqZone: 25, ituZone: 45, continent: "AS" },
  JM: { name: "Japan", cqZone: 25, ituZone: 45, continent: "AS" },
  JN: { name: "Japan", cqZone: 25, ituZone: 45, continent: "AS" },
  JO: { name: "Japan", cqZone: 25, ituZone: 45, continent: "AS" },
  JP: { name: "Japan", cqZone: 25, ituZone: 45, continent: "AS" },
  JQ: { name: "Japan", cqZone: 25, ituZone: 45, continent: "AS" },
  JS: { name: "Japan", cqZone: 25, ituZone: 45, continent: "AS" },
  HL: { name: "South Korea", cqZone: 25, ituZone: 44, continent: "AS" },
  DS: { name: "South Korea", cqZone: 25, ituZone: 44, continent: "AS" },
  BV: { name: "Taiwan", cqZone: 24, ituZone: 44, continent: "AS" },
  BY: { name: "China", cqZone: 24, ituZone: 44, continent: "AS" },
  BA: { name: "China", cqZone: 24, ituZone: 44, continent: "AS" },
  BD: { name: "China", cqZone: 24, ituZone: 44, continent: "AS" },
  BG: { name: "China", cqZone: 24, ituZone: 44, continent: "AS" },
  BH: { name: "China", cqZone: 24, ituZone: 44, continent: "AS" },
  BI: { name: "China", cqZone: 24, ituZone: 44, continent: "AS" },
  BJ: { name: "China", cqZone: 24, ituZone: 44, continent: "AS" },
  BL: { name: "China", cqZone: 24, ituZone: 44, continent: "AS" },
  BM: { name: "China", cqZone: 24, ituZone: 44, continent: "AS" },
  BN: { name: "China", cqZone: 24, ituZone: 44, continent: "AS" },
  BO: { name: "China", cqZone: 24, ituZone: 44, continent: "AS" },
  BP: { name: "China", cqZone: 24, ituZone: 44, continent: "AS" },
  BQ: { name: "China", cqZone: 24, ituZone: 44, continent: "AS" },
  BR: { name: "China", cqZone: 24, ituZone: 44, continent: "AS" },
  BS: { name: "China", cqZone: 24, ituZone: 44, continent: "AS" },
  BT: { name: "China", cqZone: 24, ituZone: 44, continent: "AS" },
  BU: { name: "China", cqZone: 24, ituZone: 44, continent: "AS" },
  BW: { name: "China", cqZone: 24, ituZone: 44, continent: "AS" },
  BX: { name: "China", cqZone: 24, ituZone: 44, continent: "AS" },
  BZ: { name: "China", cqZone: 24, ituZone: 44, continent: "AS" },
  VU: { name: "India", cqZone: 22, ituZone: 41, continent: "AS" },
  VT: { name: "India", cqZone: 22, ituZone: 41, continent: "AS" },
  HS: { name: "Thailand", cqZone: 26, ituZone: 49, continent: "AS" },
  DU: { name: "Philippines", cqZone: 27, ituZone: 50, continent: "AS" },
  DV: { name: "Philippines", cqZone: 27, ituZone: 50, continent: "AS" },
  DW: { name: "Philippines", cqZone: 27, ituZone: 50, continent: "AS" },
  DX: { name: "Philippines", cqZone: 27, ituZone: 50, continent: "AS" },
  DY: { name: "Philippines", cqZone: 27, ituZone: 50, continent: "AS" },
  DZ: { name: "Philippines", cqZone: 27, ituZone: 50, continent: "AS" },
  "9M": { name: "Malaysia", cqZone: 28, ituZone: 54, continent: "AS" },
  "9V": { name: "Singapore", cqZone: 28, ituZone: 54, continent: "AS" },
  YB: { name: "Indonesia", cqZone: 28, ituZone: 51, continent: "AS" },
  YC: { name: "Indonesia", cqZone: 28, ituZone: 51, continent: "AS" },
  YD: { name: "Indonesia", cqZone: 28, ituZone: 51, continent: "AS" },
  YE: { name: "Indonesia", cqZone: 28, ituZone: 51, continent: "AS" },
  YF: { name: "Indonesia", cqZone: 28, ituZone: 51, continent: "AS" },
  YG: { name: "Indonesia", cqZone: 28, ituZone: 51, continent: "AS" },
  YH: { name: "Indonesia", cqZone: 28, ituZone: 51, continent: "AS" },

  // Oceania
  VK: { name: "Australia", cqZone: 30, ituZone: 59, continent: "OC" },
  ZL: { name: "New Zealand", cqZone: 32, ituZone: 60, continent: "OC" },
  ZM: { name: "New Zealand", cqZone: 32, ituZone: 60, continent: "OC" },
  KH6: { name: "Hawaii", cqZone: 31, ituZone: 61, continent: "OC" },

  // South America
  PY: { name: "Brazil", cqZone: 11, ituZone: 15, continent: "SA" },
  PP: { name: "Brazil", cqZone: 11, ituZone: 15, continent: "SA" },
  PQ: { name: "Brazil", cqZone: 11, ituZone: 15, continent: "SA" },
  PR: { name: "Brazil", cqZone: 11, ituZone: 15, continent: "SA" },
  PS: { name: "Brazil", cqZone: 11, ituZone: 15, continent: "SA" },
  PT: { name: "Brazil", cqZone: 11, ituZone: 15, continent: "SA" },
  PU: { name: "Brazil", cqZone: 11, ituZone: 15, continent: "SA" },
  PV: { name: "Brazil", cqZone: 11, ituZone: 15, continent: "SA" },
  PW: { name: "Brazil", cqZone: 11, ituZone: 15, continent: "SA" },
  PX: { name: "Brazil", cqZone: 11, ituZone: 15, continent: "SA" },
  ZP: { name: "Brazil", cqZone: 11, ituZone: 15, continent: "SA" },
  LU: { name: "Argentina", cqZone: 13, ituZone: 14, continent: "SA" },
  LO: { name: "Argentina", cqZone: 13, ituZone: 14, continent: "SA" },
  LP: { name: "Argentina", cqZone: 13, ituZone: 14, continent: "SA" },
  LQ: { name: "Argentina", cqZone: 13, ituZone: 14, continent: "SA" },
  LR: { name: "Argentina", cqZone: 13, ituZone: 14, continent: "SA" },
  LS: { name: "Argentina", cqZone: 13, ituZone: 14, continent: "SA" },
  LT: { name: "Argentina", cqZone: 13, ituZone: 14, continent: "SA" },
  LV: { name: "Argentina", cqZone: 13, ituZone: 14, continent: "SA" },
  LW: { name: "Argentina", cqZone: 13, ituZone: 14, continent: "SA" },
  AY: { name: "Argentina", cqZone: 13, ituZone: 14, continent: "SA" },
  AZ: { name: "Argentina", cqZone: 13, ituZone: 14, continent: "SA" },
  CE: { name: "Chile", cqZone: 12, ituZone: 14, continent: "SA" },
  CA: { name: "Chile", cqZone: 12, ituZone: 14, continent: "SA" },
  CB: { name: "Chile", cqZone: 12, ituZone: 14, continent: "SA" },
  CC: { name: "Chile", cqZone: 12, ituZone: 14, continent: "SA" },
  CD: { name: "Chile", cqZone: 12, ituZone: 14, continent: "SA" },
  XQ: { name: "Chile", cqZone: 12, ituZone: 14, continent: "SA" },
  XR: { name: "Chile", cqZone: 12, ituZone: 14, continent: "SA" },
  CX: { name: "Uruguay", cqZone: 13, ituZone: 14, continent: "SA" },
  CV: { name: "Uruguay", cqZone: 13, ituZone: 14, continent: "SA" },
  CW: { name: "Uruguay", cqZone: 13, ituZone: 14, continent: "SA" },
  OA: { name: "Peru", cqZone: 10, ituZone: 12, continent: "SA" },
  OB: { name: "Peru", cqZone: 10, ituZone: 12, continent: "SA" },
  OC: { name: "Peru", cqZone: 10, ituZone: 12, continent: "SA" },
  HK: { name: "Colombia", cqZone: 9, ituZone: 12, continent: "SA" },
  HJ: { name: "Colombia", cqZone: 9, ituZone: 12, continent: "SA" },
  HC: { name: "Ecuador", cqZone: 10, ituZone: 12, continent: "SA" },
  HD: { name: "Ecuador", cqZone: 10, ituZone: 12, continent: "SA" },
  YV: { name: "Venezuela", cqZone: 9, ituZone: 12, continent: "SA" },
  YW: { name: "Venezuela", cqZone: 9, ituZone: 12, continent: "SA" },
  YX: { name: "Venezuela", cqZone: 9, ituZone: 12, continent: "SA" },
  YY: { name: "Venezuela", cqZone: 9, ituZone: 12, continent: "SA" },
  CP: { name: "Bolivia", cqZone: 10, ituZone: 12, continent: "SA" },

  // Africa
  ZS: { name: "South Africa", cqZone: 38, ituZone: 57, continent: "AF" },
  ZR: { name: "South Africa", cqZone: 38, ituZone: 57, continent: "AF" },
  ZT: { name: "South Africa", cqZone: 38, ituZone: 57, continent: "AF" },
  ZU: { name: "South Africa", cqZone: 38, ituZone: 57, continent: "AF" },
  "5Z": { name: "Kenya", cqZone: 37, ituZone: 48, continent: "AF" },
  "5H": { name: "Tanzania", cqZone: 37, ituZone: 53, continent: "AF" },
  "5X": { name: "Uganda", cqZone: 37, ituZone: 48, continent: "AF" },
  CN: { name: "Morocco", cqZone: 33, ituZone: 37, continent: "AF" },
  "7X": { name: "Algeria", cqZone: 33, ituZone: 37, continent: "AF" },
  TS: { name: "Tunisia", cqZone: 33, ituZone: 37, continent: "AF" },
  "3V": { name: "Tunisia", cqZone: 33, ituZone: 37, continent: "AF" },
  "5A": { name: "Libya", cqZone: 34, ituZone: 38, continent: "AF" },
  SU: { name: "Egypt", cqZone: 34, ituZone: 38, continent: "AF" },
  "5N": { name: "Nigeria", cqZone: 35, ituZone: 46, continent: "AF" },
  "6W": { name: "Senegal", cqZone: 35, ituZone: 46, continent: "AF" },
  "9G": { name: "Ghana", cqZone: 35, ituZone: 46, continent: "AF" },
  TU: { name: "Ivory Coast", cqZone: 35, ituZone: 46, continent: "AF" },
  TR: { name: "Gabon", cqZone: 36, ituZone: 52, continent: "AF" },
  TN: { name: "Congo", cqZone: 36, ituZone: 52, continent: "AF" },
  D2: { name: "Angola", cqZone: 36, ituZone: 52, continent: "AF" },
  "9J": { name: "Zambia", cqZone: 36, ituZone: 53, continent: "AF" },
  Z2: { name: "Zimbabwe", cqZone: 38, ituZone: 53, continent: "AF" },
  A2: { name: "Botswana", cqZone: 38, ituZone: 57, continent: "AF" },
  V5: { name: "Namibia", cqZone: 38, ituZone: 57, continent: "AF" },
  "3DA": { name: "Eswatini", cqZone: 38, ituZone: 57, continent: "AF" },
  "7P": { name: "Lesotho", cqZone: 38, ituZone: 57, continent: "AF" },
  "3B8": { name: "Mauritius", cqZone: 39, ituZone: 53, continent: "AF" },

  // Caribbean
  KP4: { name: "Puerto Rico", cqZone: 8, ituZone: 11, continent: "NA" },
  WP4: { name: "Puerto Rico", cqZone: 8, ituZone: 11, continent: "NA" },
  NP4: { name: "Puerto Rico", cqZone: 8, ituZone: 11, continent: "NA" },
  KP2: { name: "US Virgin Islands", cqZone: 8, ituZone: 11, continent: "NA" },
  NP2: { name: "US Virgin Islands", cqZone: 8, ituZone: 11, continent: "NA" },
  VP2: {
    name: "British Virgin Islands",
    cqZone: 8,
    ituZone: 11,
    continent: "NA",
  },
  FM: { name: "Martinique", cqZone: 8, ituZone: 11, continent: "NA" },
  FG: { name: "Guadeloupe", cqZone: 8, ituZone: 11, continent: "NA" },
  J3: { name: "Grenada", cqZone: 8, ituZone: 11, continent: "NA" },
  J6: { name: "St. Lucia", cqZone: 8, ituZone: 11, continent: "NA" },
  J7: { name: "Dominica", cqZone: 8, ituZone: 11, continent: "NA" },
  J8: { name: "St. Vincent", cqZone: 8, ituZone: 11, continent: "NA" },
  V2: { name: "Antigua & Barbuda", cqZone: 8, ituZone: 11, continent: "NA" },
  V4: { name: "St. Kitts & Nevis", cqZone: 8, ituZone: 11, continent: "NA" },
  "8P": { name: "Barbados", cqZone: 8, ituZone: 11, continent: "NA" },
  "9Y": { name: "Trinidad & Tobago", cqZone: 9, ituZone: 11, continent: "SA" },
  CO: { name: "Cuba", cqZone: 8, ituZone: 11, continent: "NA" },
  CM: { name: "Cuba", cqZone: 8, ituZone: 11, continent: "NA" },
  CL: { name: "Cuba", cqZone: 8, ituZone: 11, continent: "NA" },
  T4: { name: "Cuba", cqZone: 8, ituZone: 11, continent: "NA" },
  HI: { name: "Dominican Republic", cqZone: 8, ituZone: 11, continent: "NA" },
  HH: { name: "Haiti", cqZone: 8, ituZone: 11, continent: "NA" },
  "6Y": { name: "Jamaica", cqZone: 8, ituZone: 11, continent: "NA" },
  VP5: { name: "Turks & Caicos", cqZone: 8, ituZone: 11, continent: "NA" },
  C6: { name: "Bahamas", cqZone: 8, ituZone: 11, continent: "NA" },

  // Central America
  TI: { name: "Costa Rica", cqZone: 7, ituZone: 11, continent: "NA" },
  TE: { name: "Costa Rica", cqZone: 7, ituZone: 11, continent: "NA" },
  HP: { name: "Panama", cqZone: 7, ituZone: 11, continent: "NA" },
  H3: { name: "Panama", cqZone: 7, ituZone: 11, continent: "NA" },
  YS: { name: "El Salvador", cqZone: 7, ituZone: 11, continent: "NA" },
  TG: { name: "Guatemala", cqZone: 7, ituZone: 11, continent: "NA" },
  TD: { name: "Guatemala", cqZone: 7, ituZone: 11, continent: "NA" },
  HR: { name: "Honduras", cqZone: 7, ituZone: 11, continent: "NA" },
  HQ: { name: "Honduras", cqZone: 7, ituZone: 11, continent: "NA" },
  YN: { name: "Nicaragua", cqZone: 7, ituZone: 11, continent: "NA" },
  H7: { name: "Nicaragua", cqZone: 7, ituZone: 11, continent: "NA" },
  V3: { name: "Belize", cqZone: 7, ituZone: 11, continent: "NA" },

  // Middle East
  "4X": { name: "Israel", cqZone: 20, ituZone: 39, continent: "AS" },
  "4Z": { name: "Israel", cqZone: 20, ituZone: 39, continent: "AS" },
  OD: { name: "Lebanon", cqZone: 20, ituZone: 39, continent: "AS" },
  TA: { name: "Turkey", cqZone: 20, ituZone: 39, continent: "AS" },
  TB: { name: "Turkey", cqZone: 20, ituZone: 39, continent: "AS" },
  TC: { name: "Turkey", cqZone: 20, ituZone: 39, continent: "AS" },
  A4: { name: "Oman", cqZone: 21, ituZone: 39, continent: "AS" },
  A6: {
    name: "United Arab Emirates",
    cqZone: 21,
    ituZone: 39,
    continent: "AS",
  },
  A7: { name: "Qatar", cqZone: 21, ituZone: 39, continent: "AS" },
  A9: { name: "Bahrain", cqZone: 21, ituZone: 39, continent: "AS" },
  HZ: { name: "Saudi Arabia", cqZone: 21, ituZone: 39, continent: "AS" },
  "7Z": { name: "Saudi Arabia", cqZone: 21, ituZone: 39, continent: "AS" },
  "9K": { name: "Kuwait", cqZone: 21, ituZone: 39, continent: "AS" },
  YI: { name: "Iraq", cqZone: 21, ituZone: 39, continent: "AS" },
  YK: { name: "Syria", cqZone: 20, ituZone: 39, continent: "AS" },
  EP: { name: "Iran", cqZone: 21, ituZone: 40, continent: "AS" },
  EQ: { name: "Iran", cqZone: 21, ituZone: 40, continent: "AS" },
  AP: { name: "Pakistan", cqZone: 21, ituZone: 41, continent: "AS" },
  "4S": { name: "Sri Lanka", cqZone: 22, ituZone: 41, continent: "AS" },
  S2: { name: "Bangladesh", cqZone: 22, ituZone: 41, continent: "AS" },
  A5: { name: "Bhutan", cqZone: 22, ituZone: 41, continent: "AS" },
  "9N": { name: "Nepal", cqZone: 22, ituZone: 42, continent: "AS" },
  EK: { name: "Armenia", cqZone: 21, ituZone: 29, continent: "AS" },
  "4J": { name: "Azerbaijan", cqZone: 21, ituZone: 29, continent: "AS" },
  "4K": { name: "Azerbaijan", cqZone: 21, ituZone: 29, continent: "AS" },
  "4L": { name: "Georgia", cqZone: 21, ituZone: 29, continent: "AS" },

  // Pacific Islands
  KH0: { name: "Mariana Islands", cqZone: 27, ituZone: 64, continent: "OC" },
  KH2: { name: "Guam", cqZone: 27, ituZone: 64, continent: "OC" },
  KH8: { name: "American Samoa", cqZone: 32, ituZone: 62, continent: "OC" },
  KH9: { name: "Wake Island", cqZone: 31, ituZone: 65, continent: "OC" },
  T8: { name: "Palau", cqZone: 27, ituZone: 64, continent: "OC" },
  V6: { name: "Micronesia", cqZone: 27, ituZone: 65, continent: "OC" },
  V7: { name: "Marshall Islands", cqZone: 31, ituZone: 65, continent: "OC" },
  FK: { name: "New Caledonia", cqZone: 32, ituZone: 56, continent: "OC" },
  FO: { name: "French Polynesia", cqZone: 32, ituZone: 63, continent: "OC" },
  "5W": { name: "Samoa", cqZone: 32, ituZone: 62, continent: "OC" },
  E5: { name: "Cook Islands", cqZone: 32, ituZone: 62, continent: "OC" },
  ZK: { name: "Tokelau", cqZone: 31, ituZone: 62, continent: "OC" },
  A3: { name: "Tonga", cqZone: 32, ituZone: 62, continent: "OC" },
  "3D2": { name: "Fiji", cqZone: 32, ituZone: 56, continent: "OC" },
  YJ: { name: "Vanuatu", cqZone: 32, ituZone: 56, continent: "OC" },
  H4: { name: "Solomon Islands", cqZone: 28, ituZone: 51, continent: "OC" },
  P2: { name: "Papua New Guinea", cqZone: 28, ituZone: 51, continent: "OC" },
};

/**
 * Grid field to approximate entity region mapping
 * Maps the first 2 characters of a grid square to likely entities
 */
const GRID_TO_REGION: Record<string, string[]> = {
  // North America
  CN: ["W", "VE"],
  CM: ["W"],
  CL: ["W"],
  CK: ["W"],
  DN: ["W"],
  DM: ["W"],
  DL: ["W"],
  DK: ["W"],
  EN: ["W", "VE"],
  EM: ["W"],
  EL: ["W"],
  EK: ["W"],
  FN: ["W", "VE"],
  FM: ["W"],
  FL: ["W"],
  FK: ["W"],
  DO: ["VE"],
  EO: ["VE"],
  FO: ["VE"],
  GO: ["VE"],
  DP: ["VE"],
  EP: ["VE"],
  FP: ["VE"],
  GP: ["VE"],
  DQ: ["VE"],
  EQ: ["VE"],
  FQ: ["VE"],
  GQ: ["VE"],
  BP: ["AK"], // Alaska
  BO: ["AK"],
  AP: ["AK"],
  AO: ["AK"],
  BL: ["KH6"], // Hawaii area
  BK: ["KH6"],
  // Europe
  IO: ["G"],
  IN: ["G", "F"],
  JO: ["DL", "PA", "ON"],
  JN: ["F", "I", "HB"],
  KO: ["SP", "OK", "DL"],
  KN: ["I", "HA", "YU"],
  LO: ["SP", "UA"],
  LN: ["HA", "YO", "UA"],
  JP: ["SM", "LA"],
  KP: ["OH", "SM"],
  LP: ["UA"],
  IM: ["CT", "EA"],
  JM: ["EA", "CT"],
  KM: ["I", "SV"],
  LM: ["SV", "TA"],
  // Asia
  PM: ["JA"],
  PN: ["JA"],
  PL: ["HL", "BY"],
  PK: ["BY"],
  OL: ["BY"],
  OM: ["BY"],
  ON: ["BY", "UA0"],
  OO: ["UA0"],
  OP: ["UA0"],
  OQ: ["UA0"],
  OR: ["UA0"],
  NL: ["VU"],
  NK: ["VU"],
  MK: ["VU"],
  ML: ["VU"],
  OK: ["HS", "9M"],
  OJ: ["9M", "YB"],
  NJ: ["YB"],
  // Oceania
  QF: ["VK"],
  QG: ["VK"],
  PF: ["VK"],
  PG: ["VK"],
  OF: ["VK"],
  OG: ["VK"],
  RF: ["ZL"],
  RE: ["ZL"],
  // South America
  GG: ["PY"],
  GH: ["PY"],
  GI: ["PY"],
  FG: ["LU"],
  FH: ["LU"],
  FF: ["CE"],
  FE: ["CE"],
  FI: ["CX"],
  HK: ["HK"],
  HJ: ["HK"],
  HI: ["HC"],
  FJ: ["YV"],
  // Note: FK is USA (Florida), not Venezuela
  // Africa
  KF: ["ZS"],
  KG: ["ZS"],
  JF: ["ZS"],
  JG: ["ZS"],
  JI: ["5Z"],
  KI: ["5H"],
  // Note: IM, JM, KM grids overlap Europe and North Africa
  // The Europe entries above take precedence as they're more common
  IL: ["CN"], // Morocco area
  JL: ["7X", "TS"], // Algeria/Tunisia area
  KL: ["5A", "SU"], // Libya/Egypt area
};

/**
 * Get DXCC entity information from a Maidenhead grid locator
 *
 * Uses a grid-to-region mapping to approximate the entity based on geographic location.
 * Returns null for unknown or unmapped grids.
 *
 * @param grid - Maidenhead grid locator (4 or 6 characters)
 * @returns Entity information or null if not found
 */
export function getEntityFromGrid(grid: string): EntityInfo | null {
  if (!grid || grid.length < 2) {
    return null;
  }

  // Get the field (first 2 characters)
  const field = grid.substring(0, 2).toUpperCase();

  // Look up potential prefixes for this grid field
  const possiblePrefixes = GRID_TO_REGION[field];

  if (!possiblePrefixes || possiblePrefixes.length === 0) {
    return null;
  }

  // Use the first (most likely) prefix
  const prefix = possiblePrefixes[0];
  const entity = DXCC_ENTITIES[prefix];

  if (!entity) {
    return null;
  }

  // Build the prefix string from all matching prefixes
  const allPrefixes = Object.keys(DXCC_ENTITIES)
    .filter((p) => DXCC_ENTITIES[p].name === entity.name)
    .slice(0, 5) // Limit to first 5
    .join("/");

  return {
    name: entity.name,
    prefix: allPrefixes || prefix,
    cqZone: entity.cqZone,
    ituZone: entity.ituZone,
    continent: entity.continent,
  };
}

/**
 * Get DXCC entity information from a callsign prefix
 *
 * Extracts the prefix from a callsign and looks it up in the DXCC database.
 *
 * @param callsign - Amateur radio callsign
 * @returns Entity information or null if not found
 */
export function getEntityFromCallsign(callsign: string): EntityInfo | null {
  if (!callsign || callsign.length < 1) {
    return null;
  }

  const upper = callsign.toUpperCase();

  // Try progressively shorter prefixes (longest match wins)
  // Start with 3 characters, then 2, then 1
  for (let len = Math.min(3, upper.length); len >= 1; len--) {
    const prefix = upper.substring(0, len);
    const entity = DXCC_ENTITIES[prefix];

    if (entity) {
      const allPrefixes = Object.keys(DXCC_ENTITIES)
        .filter((p) => DXCC_ENTITIES[p].name === entity.name)
        .slice(0, 5)
        .join("/");

      return {
        name: entity.name,
        prefix: allPrefixes || prefix,
        cqZone: entity.cqZone,
        ituZone: entity.ituZone,
        continent: entity.continent,
      };
    }
  }

  return null;
}

/**
 * Get distance and bearing between two Maidenhead grid locators
 *
 * Calculates the great circle distance and bearing using the Haversine formula.
 *
 * @param fromGrid - Starting grid locator
 * @param toGrid - Destination grid locator
 * @returns Distance and bearing information, or null if invalid grids
 */
export function getDistanceBearing(
  fromGrid: string,
  toGrid: string,
): DistanceBearing | null {
  if (!isValidGrid(fromGrid) || !isValidGrid(toGrid)) {
    return null;
  }

  try {
    const distanceKm = gridDistance(fromGrid, toGrid);
    const bearing = gridBearing(fromGrid, toGrid);
    const reverseBearing = gridBearing(toGrid, fromGrid);

    return {
      distanceKm,
      distanceMi: Math.round(distanceKm * 0.621371),
      bearing,
      reverseBearing,
    };
  } catch {
    return null;
  }
}

/**
 * Get activity statistics from DX spots for a grid prefix
 *
 * Analyzes spots to count activity by band and mode, and extract recent callsigns.
 *
 * @param spots - Array of DX spots to analyze
 * @param gridPrefix - Grid prefix to filter by (e.g., "CN87" matches "CN87ML")
 * @returns Activity statistics
 */
export function getActivityStats(
  spots: DXSpot[],
  gridPrefix: string,
): ActivityStats {
  const normalizedPrefix = gridPrefix.toUpperCase();

  // Filter spots matching the grid prefix (either spotter or DX grid)
  const matchingSpots = spots.filter((spot) => {
    const spotterMatch =
      spot.spotterGrid?.toUpperCase().startsWith(normalizedPrefix) ?? false;
    const dxMatch =
      spot.dxGrid?.toUpperCase().startsWith(normalizedPrefix) ?? false;
    return spotterMatch || dxMatch;
  });

  // Count by band
  const byBand: Record<string, number> = {};
  for (const spot of matchingSpots) {
    if (spot.band) {
      byBand[spot.band] = (byBand[spot.band] || 0) + 1;
    }
  }

  // Count by mode
  const byMode: Record<string, number> = {};
  for (const spot of matchingSpots) {
    if (spot.mode) {
      byMode[spot.mode] = (byMode[spot.mode] || 0) + 1;
    }
  }

  // Get unique recent callsigns (up to 10, prefer DX callsigns from matching grids)
  const callsignSet = new Set<string>();
  for (const spot of matchingSpots) {
    if (spot.dxGrid?.toUpperCase().startsWith(normalizedPrefix)) {
      callsignSet.add(spot.dx);
    } else if (spot.spotterGrid?.toUpperCase().startsWith(normalizedPrefix)) {
      callsignSet.add(spot.spotter);
    }
    if (callsignSet.size >= 10) break;
  }

  return {
    total: matchingSpots.length,
    byBand,
    byMode,
    recentCallsigns: Array.from(callsignSet),
  };
}

/**
 * Get best contact time prediction between two grid locators
 *
 * Provides a simple heuristic-based prediction considering:
 * - Distance (affects best band)
 * - Solar flux index (affects MUF)
 * - Time of day at both ends
 *
 * @param fromGrid - Starting grid locator
 * @param toGrid - Destination grid locator
 * @param sfi - Solar Flux Index (typically 70-300)
 * @returns Time window prediction
 */
export function getBestContactTime(
  fromGrid: string,
  toGrid: string,
  sfi: number,
): TimeWindow {
  if (!isValidGrid(fromGrid) || !isValidGrid(toGrid)) {
    return {
      startUtc: "12:00",
      endUtc: "16:00",
      confidence: "low",
      optimalBand: "20m",
    };
  }

  try {
    const fromPos = gridToLatLon(fromGrid);
    const toPos = gridToLatLon(toGrid);
    const distanceKm = gridDistance(fromGrid, toGrid);

    // Estimate optimal band based on distance and SFI
    let optimalBand: string;
    if (distanceKm < 500) {
      // Very short skip - NVIS or groundwave
      optimalBand = sfi > 100 ? "40m" : "80m";
    } else if (distanceKm < 2000) {
      // Regional DX - single hop
      optimalBand = sfi > 120 ? "20m" : "40m";
    } else if (distanceKm < 5000) {
      // Medium DX - 1-2 hops
      optimalBand = sfi > 150 ? "15m" : "20m";
    } else if (distanceKm < 10000) {
      // Long path DX - multi-hop
      optimalBand = sfi > 120 ? "20m" : "17m";
    } else {
      // Extreme DX - best during high activity
      optimalBand = sfi > 100 ? "20m" : "17m";
    }

    // Calculate rough longitude difference for time estimates
    const lonDiff = Math.abs(fromPos.lon - toPos.lon);

    // Estimate best time window based on path geometry
    // Paths work best when both ends are in daylight or twilight
    let startHour: number;
    let endHour: number;
    let confidence: "high" | "medium" | "low";

    if (lonDiff < 30) {
      // Same general time zone - midday works well
      startHour = 10;
      endHour = 16;
      confidence = "high";
    } else if (lonDiff < 90) {
      // Moderate time difference - gray line or mutual daylight
      startHour = 12;
      endHour = 18;
      confidence = "medium";
    } else if (lonDiff < 150) {
      // Large time difference - gray line openings
      startHour = 14;
      endHour = 20;
      confidence = "medium";
    } else {
      // Antipodal or near-antipodal - challenging
      startHour = 6;
      endHour = 10;
      confidence = "low";
    }

    // Adjust for low SFI (less predictable)
    if (sfi < 80) {
      confidence = "low";
    }

    return {
      startUtc: `${startHour.toString().padStart(2, "0")}:00`,
      endUtc: `${endHour.toString().padStart(2, "0")}:00`,
      confidence,
      optimalBand,
    };
  } catch {
    return {
      startUtc: "12:00",
      endUtc: "16:00",
      confidence: "low",
      optimalBand: "20m",
    };
  }
}

/**
 * Format bearing as compass direction with degrees
 *
 * @param bearing - Bearing in degrees (0-360)
 * @returns Formatted string like "45 (NE)"
 */
export function formatBearingWithDirection(bearing: number): string {
  const directions = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ];
  const index = Math.round(bearing / 22.5) % 16;
  return `${Math.round(bearing)} (${directions[index]})`;
}
