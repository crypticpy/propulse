/**
 * Ham Radio Contest Multiplier Utilities
 *
 * Provides functions for extracting DXCC entities, CQ/ITU zones,
 * WPX prefixes, US states, and continents from callsigns.
 *
 * Used for contest scoring where multipliers are based on
 * geographic/administrative entities worked.
 */

import {
  PREFIX_LOCATIONS,
  type PrefixLocation,
} from "@/lib/data/prefixLocations";

// ============================================================================
// Types
// ============================================================================

/**
 * DXCC entity information extracted from a callsign
 */
export interface DXCCEntity {
  /** DXCC entity name (e.g., "United States", "Germany") */
  entity: string;
  /** Matched callsign prefix (e.g., "W", "K", "DL") */
  prefix: string;
  /** ADIF entity number if known */
  adif?: number;
  /** Continent code (NA, SA, EU, AF, AS, OC) */
  continent?: Continent;
}

/**
 * Continent codes used in amateur radio
 */
export type Continent = "NA" | "SA" | "EU" | "AF" | "AS" | "OC";

// ============================================================================
// DXCC Entity Data
// ============================================================================

/**
 * Extended DXCC data with zone information
 * Maps prefix patterns to DXCC entity details including zones and continent
 */
interface DXCCData {
  entity: string;
  adif: number;
  cqZone: number | number[]; // Some entities span multiple zones
  ituZone: number | number[];
  continent: Continent;
}

/**
 * DXCC prefix to entity mapping with zone data
 * Ordered by prefix length (longer prefixes first for matching)
 */
const DXCC_DATA: Record<string, DXCCData> = {
  // USA Territories (check these first - longer prefixes)
  KP4: {
    entity: "Puerto Rico",
    adif: 202,
    cqZone: 8,
    ituZone: 11,
    continent: "NA",
  },
  NP4: {
    entity: "Puerto Rico",
    adif: 202,
    cqZone: 8,
    ituZone: 11,
    continent: "NA",
  },
  WP4: {
    entity: "Puerto Rico",
    adif: 202,
    cqZone: 8,
    ituZone: 11,
    continent: "NA",
  },
  KP2: {
    entity: "US Virgin Islands",
    adif: 285,
    cqZone: 8,
    ituZone: 11,
    continent: "NA",
  },
  NP2: {
    entity: "US Virgin Islands",
    adif: 285,
    cqZone: 8,
    ituZone: 11,
    continent: "NA",
  },
  WP2: {
    entity: "US Virgin Islands",
    adif: 285,
    cqZone: 8,
    ituZone: 11,
    continent: "NA",
  },
  KH6: {
    entity: "Hawaii",
    adif: 110,
    cqZone: 31,
    ituZone: 61,
    continent: "OC",
  },
  NH6: {
    entity: "Hawaii",
    adif: 110,
    cqZone: 31,
    ituZone: 61,
    continent: "OC",
  },
  WH6: {
    entity: "Hawaii",
    adif: 110,
    cqZone: 31,
    ituZone: 61,
    continent: "OC",
  },
  KH2: { entity: "Guam", adif: 103, cqZone: 27, ituZone: 64, continent: "OC" },
  KL7: { entity: "Alaska", adif: 6, cqZone: 1, ituZone: 1, continent: "NA" },
  NL7: { entity: "Alaska", adif: 6, cqZone: 1, ituZone: 1, continent: "NA" },
  WL7: { entity: "Alaska", adif: 6, cqZone: 1, ituZone: 1, continent: "NA" },
  AL7: { entity: "Alaska", adif: 6, cqZone: 1, ituZone: 1, continent: "NA" },
  KH0: {
    entity: "Mariana Islands",
    adif: 166,
    cqZone: 27,
    ituZone: 64,
    continent: "OC",
  },
  KH1: {
    entity: "Baker & Howland Islands",
    adif: 20,
    cqZone: 31,
    ituZone: 61,
    continent: "OC",
  },
  KH3: {
    entity: "Johnston Island",
    adif: 123,
    cqZone: 31,
    ituZone: 61,
    continent: "OC",
  },
  KH4: {
    entity: "Midway Island",
    adif: 174,
    cqZone: 31,
    ituZone: 61,
    continent: "OC",
  },
  KH5: {
    entity: "Palmyra & Jarvis Islands",
    adif: 197,
    cqZone: 31,
    ituZone: 61,
    continent: "OC",
  },
  KH7K: {
    entity: "Kure Island",
    adif: 138,
    cqZone: 31,
    ituZone: 61,
    continent: "OC",
  },
  KH8: {
    entity: "American Samoa",
    adif: 9,
    cqZone: 32,
    ituZone: 62,
    continent: "OC",
  },
  KH9: {
    entity: "Wake Island",
    adif: 297,
    cqZone: 31,
    ituZone: 65,
    continent: "OC",
  },

  // USA (mainland)
  W: {
    entity: "United States",
    adif: 291,
    cqZone: [3, 4, 5],
    ituZone: [6, 7, 8],
    continent: "NA",
  },
  K: {
    entity: "United States",
    adif: 291,
    cqZone: [3, 4, 5],
    ituZone: [6, 7, 8],
    continent: "NA",
  },
  N: {
    entity: "United States",
    adif: 291,
    cqZone: [3, 4, 5],
    ituZone: [6, 7, 8],
    continent: "NA",
  },
  AA: {
    entity: "United States",
    adif: 291,
    cqZone: [3, 4, 5],
    ituZone: [6, 7, 8],
    continent: "NA",
  },
  AB: {
    entity: "United States",
    adif: 291,
    cqZone: [3, 4, 5],
    ituZone: [6, 7, 8],
    continent: "NA",
  },
  AC: {
    entity: "United States",
    adif: 291,
    cqZone: [3, 4, 5],
    ituZone: [6, 7, 8],
    continent: "NA",
  },
  AD: {
    entity: "United States",
    adif: 291,
    cqZone: [3, 4, 5],
    ituZone: [6, 7, 8],
    continent: "NA",
  },
  AE: {
    entity: "United States",
    adif: 291,
    cqZone: [3, 4, 5],
    ituZone: [6, 7, 8],
    continent: "NA",
  },
  AF: {
    entity: "United States",
    adif: 291,
    cqZone: [3, 4, 5],
    ituZone: [6, 7, 8],
    continent: "NA",
  },
  AG: {
    entity: "United States",
    adif: 291,
    cqZone: [3, 4, 5],
    ituZone: [6, 7, 8],
    continent: "NA",
  },
  AI: {
    entity: "United States",
    adif: 291,
    cqZone: [3, 4, 5],
    ituZone: [6, 7, 8],
    continent: "NA",
  },
  AJ: {
    entity: "United States",
    adif: 291,
    cqZone: [3, 4, 5],
    ituZone: [6, 7, 8],
    continent: "NA",
  },
  AK: {
    entity: "United States",
    adif: 291,
    cqZone: [3, 4, 5],
    ituZone: [6, 7, 8],
    continent: "NA",
  },
  AL: {
    entity: "United States",
    adif: 291,
    cqZone: [3, 4, 5],
    ituZone: [6, 7, 8],
    continent: "NA",
  },

  // Canada
  VE: {
    entity: "Canada",
    adif: 1,
    cqZone: [1, 2, 3, 4, 5],
    ituZone: [2, 3, 4, 9],
    continent: "NA",
  },
  VA: {
    entity: "Canada",
    adif: 1,
    cqZone: [1, 2, 3, 4, 5],
    ituZone: [2, 3, 4, 9],
    continent: "NA",
  },
  VO: { entity: "Canada", adif: 1, cqZone: 5, ituZone: 9, continent: "NA" },
  VY: {
    entity: "Canada",
    adif: 1,
    cqZone: [1, 2, 3, 4, 5],
    ituZone: [2, 3, 4, 9],
    continent: "NA",
  },
  CY0: {
    entity: "Sable Island",
    adif: 211,
    cqZone: 5,
    ituZone: 9,
    continent: "NA",
  },
  CY9: {
    entity: "St. Paul Island",
    adif: 252,
    cqZone: 5,
    ituZone: 9,
    continent: "NA",
  },

  // Europe
  G: { entity: "England", adif: 223, cqZone: 14, ituZone: 27, continent: "EU" },
  M: { entity: "England", adif: 223, cqZone: 14, ituZone: 27, continent: "EU" },
  "2E": {
    entity: "England",
    adif: 223,
    cqZone: 14,
    ituZone: 27,
    continent: "EU",
  },
  GM: {
    entity: "Scotland",
    adif: 279,
    cqZone: 14,
    ituZone: 27,
    continent: "EU",
  },
  GW: { entity: "Wales", adif: 294, cqZone: 14, ituZone: 27, continent: "EU" },
  GI: {
    entity: "Northern Ireland",
    adif: 265,
    cqZone: 14,
    ituZone: 27,
    continent: "EU",
  },
  GD: {
    entity: "Isle of Man",
    adif: 114,
    cqZone: 14,
    ituZone: 27,
    continent: "EU",
  },
  GJ: { entity: "Jersey", adif: 122, cqZone: 14, ituZone: 27, continent: "EU" },
  GU: {
    entity: "Guernsey",
    adif: 106,
    cqZone: 14,
    ituZone: 27,
    continent: "EU",
  },

  // Germany
  DL: {
    entity: "Germany",
    adif: 230,
    cqZone: 14,
    ituZone: 28,
    continent: "EU",
  },
  DA: {
    entity: "Germany",
    adif: 230,
    cqZone: 14,
    ituZone: 28,
    continent: "EU",
  },
  DB: {
    entity: "Germany",
    adif: 230,
    cqZone: 14,
    ituZone: 28,
    continent: "EU",
  },
  DC: {
    entity: "Germany",
    adif: 230,
    cqZone: 14,
    ituZone: 28,
    continent: "EU",
  },
  DD: {
    entity: "Germany",
    adif: 230,
    cqZone: 14,
    ituZone: 28,
    continent: "EU",
  },
  DE: {
    entity: "Germany",
    adif: 230,
    cqZone: 14,
    ituZone: 28,
    continent: "EU",
  },
  DF: {
    entity: "Germany",
    adif: 230,
    cqZone: 14,
    ituZone: 28,
    continent: "EU",
  },
  DG: {
    entity: "Germany",
    adif: 230,
    cqZone: 14,
    ituZone: 28,
    continent: "EU",
  },
  DH: {
    entity: "Germany",
    adif: 230,
    cqZone: 14,
    ituZone: 28,
    continent: "EU",
  },
  DJ: {
    entity: "Germany",
    adif: 230,
    cqZone: 14,
    ituZone: 28,
    continent: "EU",
  },
  DK: {
    entity: "Germany",
    adif: 230,
    cqZone: 14,
    ituZone: 28,
    continent: "EU",
  },
  DM: {
    entity: "Germany",
    adif: 230,
    cqZone: 14,
    ituZone: 28,
    continent: "EU",
  },
  DO: {
    entity: "Germany",
    adif: 230,
    cqZone: 14,
    ituZone: 28,
    continent: "EU",
  },
  DP: {
    entity: "Germany",
    adif: 230,
    cqZone: 14,
    ituZone: 28,
    continent: "EU",
  },
  DQ: {
    entity: "Germany",
    adif: 230,
    cqZone: 14,
    ituZone: 28,
    continent: "EU",
  },
  DR: {
    entity: "Germany",
    adif: 230,
    cqZone: 14,
    ituZone: 28,
    continent: "EU",
  },

  // France
  F: { entity: "France", adif: 227, cqZone: 14, ituZone: 27, continent: "EU" },

  // Italy
  I: { entity: "Italy", adif: 248, cqZone: 15, ituZone: 28, continent: "EU" },
  IK: { entity: "Italy", adif: 248, cqZone: 15, ituZone: 28, continent: "EU" },
  IZ: { entity: "Italy", adif: 248, cqZone: 15, ituZone: 28, continent: "EU" },
  IW: { entity: "Italy", adif: 248, cqZone: 15, ituZone: 28, continent: "EU" },
  IU: { entity: "Italy", adif: 248, cqZone: 15, ituZone: 28, continent: "EU" },

  // Spain
  EA: { entity: "Spain", adif: 281, cqZone: 14, ituZone: 37, continent: "EU" },
  EB: { entity: "Spain", adif: 281, cqZone: 14, ituZone: 37, continent: "EU" },
  EC: { entity: "Spain", adif: 281, cqZone: 14, ituZone: 37, continent: "EU" },
  ED: { entity: "Spain", adif: 281, cqZone: 14, ituZone: 37, continent: "EU" },
  EE: { entity: "Spain", adif: 281, cqZone: 14, ituZone: 37, continent: "EU" },
  EF: { entity: "Spain", adif: 281, cqZone: 14, ituZone: 37, continent: "EU" },
  EG: { entity: "Spain", adif: 281, cqZone: 14, ituZone: 37, continent: "EU" },
  EH: { entity: "Spain", adif: 281, cqZone: 14, ituZone: 37, continent: "EU" },
  EA6: {
    entity: "Balearic Islands",
    adif: 21,
    cqZone: 14,
    ituZone: 37,
    continent: "EU",
  },
  EA8: {
    entity: "Canary Islands",
    adif: 29,
    cqZone: 33,
    ituZone: 36,
    continent: "AF",
  },
  EA9: {
    entity: "Ceuta & Melilla",
    adif: 32,
    cqZone: 33,
    ituZone: 37,
    continent: "AF",
  },

  // Netherlands
  PA: {
    entity: "Netherlands",
    adif: 263,
    cqZone: 14,
    ituZone: 27,
    continent: "EU",
  },
  PB: {
    entity: "Netherlands",
    adif: 263,
    cqZone: 14,
    ituZone: 27,
    continent: "EU",
  },
  PC: {
    entity: "Netherlands",
    adif: 263,
    cqZone: 14,
    ituZone: 27,
    continent: "EU",
  },
  PD: {
    entity: "Netherlands",
    adif: 263,
    cqZone: 14,
    ituZone: 27,
    continent: "EU",
  },
  PE: {
    entity: "Netherlands",
    adif: 263,
    cqZone: 14,
    ituZone: 27,
    continent: "EU",
  },
  PF: {
    entity: "Netherlands",
    adif: 263,
    cqZone: 14,
    ituZone: 27,
    continent: "EU",
  },
  PG: {
    entity: "Netherlands",
    adif: 263,
    cqZone: 14,
    ituZone: 27,
    continent: "EU",
  },
  PH: {
    entity: "Netherlands",
    adif: 263,
    cqZone: 14,
    ituZone: 27,
    continent: "EU",
  },
  PI: {
    entity: "Netherlands",
    adif: 263,
    cqZone: 14,
    ituZone: 27,
    continent: "EU",
  },

  // Belgium
  ON: {
    entity: "Belgium",
    adif: 209,
    cqZone: 14,
    ituZone: 27,
    continent: "EU",
  },
  OO: {
    entity: "Belgium",
    adif: 209,
    cqZone: 14,
    ituZone: 27,
    continent: "EU",
  },
  OP: {
    entity: "Belgium",
    adif: 209,
    cqZone: 14,
    ituZone: 27,
    continent: "EU",
  },
  OQ: {
    entity: "Belgium",
    adif: 209,
    cqZone: 14,
    ituZone: 27,
    continent: "EU",
  },
  OR: {
    entity: "Belgium",
    adif: 209,
    cqZone: 14,
    ituZone: 27,
    continent: "EU",
  },
  OS: {
    entity: "Belgium",
    adif: 209,
    cqZone: 14,
    ituZone: 27,
    continent: "EU",
  },
  OT: {
    entity: "Belgium",
    adif: 209,
    cqZone: 14,
    ituZone: 27,
    continent: "EU",
  },

  // Switzerland & Liechtenstein
  HB9: {
    entity: "Switzerland",
    adif: 287,
    cqZone: 14,
    ituZone: 28,
    continent: "EU",
  },
  HB3: {
    entity: "Switzerland",
    adif: 287,
    cqZone: 14,
    ituZone: 28,
    continent: "EU",
  },
  HE: {
    entity: "Switzerland",
    adif: 287,
    cqZone: 14,
    ituZone: 28,
    continent: "EU",
  },
  HB0: {
    entity: "Liechtenstein",
    adif: 251,
    cqZone: 14,
    ituZone: 28,
    continent: "EU",
  },

  // Austria
  OE: {
    entity: "Austria",
    adif: 206,
    cqZone: 15,
    ituZone: 28,
    continent: "EU",
  },

  // Czech Republic & Slovakia
  OK: {
    entity: "Czech Republic",
    adif: 503,
    cqZone: 15,
    ituZone: 28,
    continent: "EU",
  },
  OL: {
    entity: "Czech Republic",
    adif: 503,
    cqZone: 15,
    ituZone: 28,
    continent: "EU",
  },
  OM: {
    entity: "Slovakia",
    adif: 504,
    cqZone: 15,
    ituZone: 28,
    continent: "EU",
  },

  // Poland
  SP: { entity: "Poland", adif: 269, cqZone: 15, ituZone: 28, continent: "EU" },
  SQ: { entity: "Poland", adif: 269, cqZone: 15, ituZone: 28, continent: "EU" },
  SO: { entity: "Poland", adif: 269, cqZone: 15, ituZone: 28, continent: "EU" },
  SN: { entity: "Poland", adif: 269, cqZone: 15, ituZone: 28, continent: "EU" },
  "3Z": {
    entity: "Poland",
    adif: 269,
    cqZone: 15,
    ituZone: 28,
    continent: "EU",
  },

  // Russia
  UA: {
    entity: "European Russia",
    adif: 54,
    cqZone: 16,
    ituZone: 29,
    continent: "EU",
  },
  R: {
    entity: "European Russia",
    adif: 54,
    cqZone: 16,
    ituZone: 29,
    continent: "EU",
  },
  RA: {
    entity: "European Russia",
    adif: 54,
    cqZone: 16,
    ituZone: 29,
    continent: "EU",
  },
  RK: {
    entity: "European Russia",
    adif: 54,
    cqZone: 16,
    ituZone: 29,
    continent: "EU",
  },
  RN: {
    entity: "European Russia",
    adif: 54,
    cqZone: 16,
    ituZone: 29,
    continent: "EU",
  },
  RU: {
    entity: "European Russia",
    adif: 54,
    cqZone: 16,
    ituZone: 29,
    continent: "EU",
  },
  RV: {
    entity: "European Russia",
    adif: 54,
    cqZone: 16,
    ituZone: 29,
    continent: "EU",
  },
  RW: {
    entity: "European Russia",
    adif: 54,
    cqZone: 16,
    ituZone: 29,
    continent: "EU",
  },
  RX: {
    entity: "European Russia",
    adif: 54,
    cqZone: 16,
    ituZone: 29,
    continent: "EU",
  },
  RZ: {
    entity: "European Russia",
    adif: 54,
    cqZone: 16,
    ituZone: 29,
    continent: "EU",
  },
  UA0: {
    entity: "Asiatic Russia",
    adif: 15,
    cqZone: [17, 18, 19],
    ituZone: [30, 31, 32, 33, 34],
    continent: "AS",
  },
  UA9: {
    entity: "Asiatic Russia",
    adif: 15,
    cqZone: [17, 18, 19],
    ituZone: [30, 31, 32, 33, 34],
    continent: "AS",
  },

  // Ukraine
  UR: {
    entity: "Ukraine",
    adif: 288,
    cqZone: 16,
    ituZone: 29,
    continent: "EU",
  },
  US: {
    entity: "Ukraine",
    adif: 288,
    cqZone: 16,
    ituZone: 29,
    continent: "EU",
  },
  UT: {
    entity: "Ukraine",
    adif: 288,
    cqZone: 16,
    ituZone: 29,
    continent: "EU",
  },
  UU: {
    entity: "Ukraine",
    adif: 288,
    cqZone: 16,
    ituZone: 29,
    continent: "EU",
  },
  UV: {
    entity: "Ukraine",
    adif: 288,
    cqZone: 16,
    ituZone: 29,
    continent: "EU",
  },
  UW: {
    entity: "Ukraine",
    adif: 288,
    cqZone: 16,
    ituZone: 29,
    continent: "EU",
  },
  UX: {
    entity: "Ukraine",
    adif: 288,
    cqZone: 16,
    ituZone: 29,
    continent: "EU",
  },
  UY: {
    entity: "Ukraine",
    adif: 288,
    cqZone: 16,
    ituZone: 29,
    continent: "EU",
  },
  UZ: {
    entity: "Ukraine",
    adif: 288,
    cqZone: 16,
    ituZone: 29,
    continent: "EU",
  },

  // Nordic Countries
  OH: {
    entity: "Finland",
    adif: 224,
    cqZone: 15,
    ituZone: 18,
    continent: "EU",
  },
  OG: {
    entity: "Finland",
    adif: 224,
    cqZone: 15,
    ituZone: 18,
    continent: "EU",
  },
  OF: {
    entity: "Finland",
    adif: 224,
    cqZone: 15,
    ituZone: 18,
    continent: "EU",
  },
  SM: { entity: "Sweden", adif: 284, cqZone: 14, ituZone: 18, continent: "EU" },
  SA: { entity: "Sweden", adif: 284, cqZone: 14, ituZone: 18, continent: "EU" },
  SB: { entity: "Sweden", adif: 284, cqZone: 14, ituZone: 18, continent: "EU" },
  SC: { entity: "Sweden", adif: 284, cqZone: 14, ituZone: 18, continent: "EU" },
  SD: { entity: "Sweden", adif: 284, cqZone: 14, ituZone: 18, continent: "EU" },
  SE: { entity: "Sweden", adif: 284, cqZone: 14, ituZone: 18, continent: "EU" },
  SF: { entity: "Sweden", adif: 284, cqZone: 14, ituZone: 18, continent: "EU" },
  SG: { entity: "Sweden", adif: 284, cqZone: 14, ituZone: 18, continent: "EU" },
  SH: { entity: "Sweden", adif: 284, cqZone: 14, ituZone: 18, continent: "EU" },
  SI: { entity: "Sweden", adif: 284, cqZone: 14, ituZone: 18, continent: "EU" },
  SJ: { entity: "Sweden", adif: 284, cqZone: 14, ituZone: 18, continent: "EU" },
  SK: { entity: "Sweden", adif: 284, cqZone: 14, ituZone: 18, continent: "EU" },
  SL: { entity: "Sweden", adif: 284, cqZone: 14, ituZone: 18, continent: "EU" },
  LA: { entity: "Norway", adif: 266, cqZone: 14, ituZone: 18, continent: "EU" },
  LB: { entity: "Norway", adif: 266, cqZone: 14, ituZone: 18, continent: "EU" },
  LC: { entity: "Norway", adif: 266, cqZone: 14, ituZone: 18, continent: "EU" },
  OZ: {
    entity: "Denmark",
    adif: 221,
    cqZone: 14,
    ituZone: 18,
    continent: "EU",
  },
  OU: {
    entity: "Denmark",
    adif: 221,
    cqZone: 14,
    ituZone: 18,
    continent: "EU",
  },
  OV: {
    entity: "Denmark",
    adif: 221,
    cqZone: 14,
    ituZone: 18,
    continent: "EU",
  },
  OW: {
    entity: "Denmark",
    adif: 221,
    cqZone: 14,
    ituZone: 18,
    continent: "EU",
  },
  OX: {
    entity: "Greenland",
    adif: 237,
    cqZone: 40,
    ituZone: 5,
    continent: "NA",
  },
  TF: {
    entity: "Iceland",
    adif: 242,
    cqZone: 40,
    ituZone: 17,
    continent: "EU",
  },

  // Baltic States
  ES: { entity: "Estonia", adif: 52, cqZone: 15, ituZone: 29, continent: "EU" },
  YL: { entity: "Latvia", adif: 145, cqZone: 15, ituZone: 29, continent: "EU" },
  LY: {
    entity: "Lithuania",
    adif: 146,
    cqZone: 15,
    ituZone: 29,
    continent: "EU",
  },

  // Other European Countries
  CT: {
    entity: "Portugal",
    adif: 272,
    cqZone: 14,
    ituZone: 37,
    continent: "EU",
  },
  CU: { entity: "Azores", adif: 149, cqZone: 14, ituZone: 36, continent: "EU" },
  HV: {
    entity: "Vatican City",
    adif: 295,
    cqZone: 15,
    ituZone: 28,
    continent: "EU",
  },
  "9H": {
    entity: "Malta",
    adif: 257,
    cqZone: 15,
    ituZone: 28,
    continent: "EU",
  },
  SV: { entity: "Greece", adif: 236, cqZone: 20, ituZone: 28, continent: "EU" },
  SX: { entity: "Greece", adif: 236, cqZone: 20, ituZone: 28, continent: "EU" },
  SZ: { entity: "Greece", adif: 236, cqZone: 20, ituZone: 28, continent: "EU" },
  YU: { entity: "Serbia", adif: 296, cqZone: 15, ituZone: 28, continent: "EU" },
  YO: {
    entity: "Romania",
    adif: 275,
    cqZone: 20,
    ituZone: 28,
    continent: "EU",
  },
  LZ: {
    entity: "Bulgaria",
    adif: 212,
    cqZone: 20,
    ituZone: 28,
    continent: "EU",
  },
  HA: {
    entity: "Hungary",
    adif: 239,
    cqZone: 15,
    ituZone: 28,
    continent: "EU",
  },
  HG: {
    entity: "Hungary",
    adif: 239,
    cqZone: 15,
    ituZone: 28,
    continent: "EU",
  },
  "9A": {
    entity: "Croatia",
    adif: 497,
    cqZone: 15,
    ituZone: 28,
    continent: "EU",
  },
  S5: {
    entity: "Slovenia",
    adif: 499,
    cqZone: 15,
    ituZone: 28,
    continent: "EU",
  },
  E7: {
    entity: "Bosnia-Herzegovina",
    adif: 501,
    cqZone: 15,
    ituZone: 28,
    continent: "EU",
  },
  Z3: {
    entity: "North Macedonia",
    adif: 502,
    cqZone: 15,
    ituZone: 28,
    continent: "EU",
  },
  ZA: { entity: "Albania", adif: 7, cqZone: 15, ituZone: 28, continent: "EU" },
  "4O": {
    entity: "Montenegro",
    adif: 514,
    cqZone: 15,
    ituZone: 28,
    continent: "EU",
  },
  TA: { entity: "Turkey", adif: 390, cqZone: 20, ituZone: 39, continent: "AS" },
  TB: { entity: "Turkey", adif: 390, cqZone: 20, ituZone: 39, continent: "AS" },
  TC: { entity: "Turkey", adif: 390, cqZone: 20, ituZone: 39, continent: "AS" },

  // Japan
  JA: { entity: "Japan", adif: 339, cqZone: 25, ituZone: 45, continent: "AS" },
  JH: { entity: "Japan", adif: 339, cqZone: 25, ituZone: 45, continent: "AS" },
  JR: { entity: "Japan", adif: 339, cqZone: 25, ituZone: 45, continent: "AS" },
  JE: { entity: "Japan", adif: 339, cqZone: 25, ituZone: 45, continent: "AS" },
  JF: { entity: "Japan", adif: 339, cqZone: 25, ituZone: 45, continent: "AS" },
  JG: { entity: "Japan", adif: 339, cqZone: 25, ituZone: 45, continent: "AS" },
  JI: { entity: "Japan", adif: 339, cqZone: 25, ituZone: 45, continent: "AS" },
  JJ: { entity: "Japan", adif: 339, cqZone: 25, ituZone: 45, continent: "AS" },
  JK: { entity: "Japan", adif: 339, cqZone: 25, ituZone: 45, continent: "AS" },
  JL: { entity: "Japan", adif: 339, cqZone: 25, ituZone: 45, continent: "AS" },
  JM: { entity: "Japan", adif: 339, cqZone: 25, ituZone: 45, continent: "AS" },
  JN: { entity: "Japan", adif: 339, cqZone: 25, ituZone: 45, continent: "AS" },
  JO: { entity: "Japan", adif: 339, cqZone: 25, ituZone: 45, continent: "AS" },
  JP: { entity: "Japan", adif: 339, cqZone: 25, ituZone: 45, continent: "AS" },
  JQ: { entity: "Japan", adif: 339, cqZone: 25, ituZone: 45, continent: "AS" },
  JS: { entity: "Japan", adif: 339, cqZone: 25, ituZone: 45, continent: "AS" },
  "7J": {
    entity: "Japan",
    adif: 339,
    cqZone: 25,
    ituZone: 45,
    continent: "AS",
  },
  "7K": {
    entity: "Japan",
    adif: 339,
    cqZone: 25,
    ituZone: 45,
    continent: "AS",
  },
  "7L": {
    entity: "Japan",
    adif: 339,
    cqZone: 25,
    ituZone: 45,
    continent: "AS",
  },
  "7M": {
    entity: "Japan",
    adif: 339,
    cqZone: 25,
    ituZone: 45,
    continent: "AS",
  },
  "7N": {
    entity: "Japan",
    adif: 339,
    cqZone: 25,
    ituZone: 45,
    continent: "AS",
  },
  "8J": {
    entity: "Japan",
    adif: 339,
    cqZone: 25,
    ituZone: 45,
    continent: "AS",
  },
  "8N": {
    entity: "Japan",
    adif: 339,
    cqZone: 25,
    ituZone: 45,
    continent: "AS",
  },

  // South Korea
  HL: {
    entity: "South Korea",
    adif: 137,
    cqZone: 25,
    ituZone: 44,
    continent: "AS",
  },
  DS: {
    entity: "South Korea",
    adif: 137,
    cqZone: 25,
    ituZone: 44,
    continent: "AS",
  },
  DT: {
    entity: "South Korea",
    adif: 137,
    cqZone: 25,
    ituZone: 44,
    continent: "AS",
  },
  "6K": {
    entity: "South Korea",
    adif: 137,
    cqZone: 25,
    ituZone: 44,
    continent: "AS",
  },
  "6L": {
    entity: "South Korea",
    adif: 137,
    cqZone: 25,
    ituZone: 44,
    continent: "AS",
  },
  "6M": {
    entity: "South Korea",
    adif: 137,
    cqZone: 25,
    ituZone: 44,
    continent: "AS",
  },
  "6N": {
    entity: "South Korea",
    adif: 137,
    cqZone: 25,
    ituZone: 44,
    continent: "AS",
  },

  // China & Taiwan
  BV: { entity: "Taiwan", adif: 386, cqZone: 24, ituZone: 44, continent: "AS" },
  BY: {
    entity: "China",
    adif: 318,
    cqZone: [23, 24],
    ituZone: [42, 43, 44],
    continent: "AS",
  },
  BA: {
    entity: "China",
    adif: 318,
    cqZone: [23, 24],
    ituZone: [42, 43, 44],
    continent: "AS",
  },
  VR2: {
    entity: "Hong Kong",
    adif: 321,
    cqZone: 24,
    ituZone: 44,
    continent: "AS",
  },
  XX9: { entity: "Macao", adif: 152, cqZone: 24, ituZone: 44, continent: "AS" },

  // Australia & New Zealand
  VK: {
    entity: "Australia",
    adif: 150,
    cqZone: [29, 30],
    ituZone: [55, 58, 59],
    continent: "OC",
  },
  AX: {
    entity: "Australia",
    adif: 150,
    cqZone: [29, 30],
    ituZone: [55, 58, 59],
    continent: "OC",
  },
  ZL: {
    entity: "New Zealand",
    adif: 170,
    cqZone: 32,
    ituZone: 60,
    continent: "OC",
  },

  // South America
  LU: {
    entity: "Argentina",
    adif: 100,
    cqZone: [13],
    ituZone: [14, 16],
    continent: "SA",
  },
  PY: {
    entity: "Brazil",
    adif: 108,
    cqZone: [11, 12],
    ituZone: [12, 13, 15],
    continent: "SA",
  },
  CE: {
    entity: "Chile",
    adif: 112,
    cqZone: [12, 13],
    ituZone: [14, 16],
    continent: "SA",
  },
  CX: {
    entity: "Uruguay",
    adif: 144,
    cqZone: 13,
    ituZone: 14,
    continent: "SA",
  },
  ZP: {
    entity: "Paraguay",
    adif: 132,
    cqZone: 11,
    ituZone: 14,
    continent: "SA",
  },
  CP: {
    entity: "Bolivia",
    adif: 104,
    cqZone: 10,
    ituZone: 12,
    continent: "SA",
  },
  OA: { entity: "Peru", adif: 136, cqZone: 10, ituZone: 12, continent: "SA" },
  HK: {
    entity: "Colombia",
    adif: 116,
    cqZone: 9,
    ituZone: 12,
    continent: "SA",
  },
  YV: {
    entity: "Venezuela",
    adif: 148,
    cqZone: 9,
    ituZone: 12,
    continent: "SA",
  },
  HC: {
    entity: "Ecuador",
    adif: 120,
    cqZone: 10,
    ituZone: 12,
    continent: "SA",
  },

  // Mexico & Central America
  XE: { entity: "Mexico", adif: 50, cqZone: 6, ituZone: 10, continent: "NA" },
  XF: { entity: "Mexico", adif: 50, cqZone: 6, ituZone: 10, continent: "NA" },
  "4A": { entity: "Mexico", adif: 50, cqZone: 6, ituZone: 10, continent: "NA" },
  "4B": { entity: "Mexico", adif: 50, cqZone: 6, ituZone: 10, continent: "NA" },
  "4C": { entity: "Mexico", adif: 50, cqZone: 6, ituZone: 10, continent: "NA" },
  TI: {
    entity: "Costa Rica",
    adif: 308,
    cqZone: 7,
    ituZone: 11,
    continent: "NA",
  },
  HP: { entity: "Panama", adif: 88, cqZone: 7, ituZone: 11, continent: "NA" },

  // Caribbean
  CM: { entity: "Cuba", adif: 70, cqZone: 8, ituZone: 11, continent: "NA" },
  CO: { entity: "Cuba", adif: 70, cqZone: 8, ituZone: 11, continent: "NA" },
  "6Y": {
    entity: "Jamaica",
    adif: 82,
    cqZone: 8,
    ituZone: 11,
    continent: "NA",
  },
  HI: {
    entity: "Dominican Republic",
    adif: 72,
    cqZone: 8,
    ituZone: 11,
    continent: "NA",
  },
  HH: { entity: "Haiti", adif: 78, cqZone: 8, ituZone: 11, continent: "NA" },

  // Africa
  ZS: {
    entity: "South Africa",
    adif: 462,
    cqZone: 38,
    ituZone: 57,
    continent: "AF",
  },
  CN: {
    entity: "Morocco",
    adif: 446,
    cqZone: 33,
    ituZone: 37,
    continent: "AF",
  },
  "7X": {
    entity: "Algeria",
    adif: 400,
    cqZone: 33,
    ituZone: 37,
    continent: "AF",
  },
  "3V": {
    entity: "Tunisia",
    adif: 474,
    cqZone: 33,
    ituZone: 37,
    continent: "AF",
  },
  SU: { entity: "Egypt", adif: 478, cqZone: 34, ituZone: 38, continent: "AF" },
  "5Z": {
    entity: "Kenya",
    adif: 430,
    cqZone: 37,
    ituZone: 48,
    continent: "AF",
  },
  "5N": {
    entity: "Nigeria",
    adif: 450,
    cqZone: 35,
    ituZone: 46,
    continent: "AF",
  },
  "3B8": {
    entity: "Mauritius",
    adif: 165,
    cqZone: 39,
    ituZone: 53,
    continent: "AF",
  },
  FR: {
    entity: "Reunion",
    adif: 453,
    cqZone: 39,
    ituZone: 53,
    continent: "AF",
  },
  "5R": {
    entity: "Madagascar",
    adif: 438,
    cqZone: 39,
    ituZone: 53,
    continent: "AF",
  },

  // Middle East
  A6: {
    entity: "United Arab Emirates",
    adif: 391,
    cqZone: 21,
    ituZone: 39,
    continent: "AS",
  },
  A7: { entity: "Qatar", adif: 376, cqZone: 21, ituZone: 39, continent: "AS" },
  A9: {
    entity: "Bahrain",
    adif: 304,
    cqZone: 21,
    ituZone: 39,
    continent: "AS",
  },
  "9K": {
    entity: "Kuwait",
    adif: 348,
    cqZone: 21,
    ituZone: 39,
    continent: "AS",
  },
  HZ: {
    entity: "Saudi Arabia",
    adif: 378,
    cqZone: 21,
    ituZone: 39,
    continent: "AS",
  },
  "7Z": {
    entity: "Saudi Arabia",
    adif: 378,
    cqZone: 21,
    ituZone: 39,
    continent: "AS",
  },
  A4: { entity: "Oman", adif: 370, cqZone: 21, ituZone: 39, continent: "AS" },
  JY: { entity: "Jordan", adif: 342, cqZone: 20, ituZone: 39, continent: "AS" },
  OD: {
    entity: "Lebanon",
    adif: 354,
    cqZone: 20,
    ituZone: 39,
    continent: "AS",
  },
  "4X": {
    entity: "Israel",
    adif: 336,
    cqZone: 20,
    ituZone: 39,
    continent: "AS",
  },
  "4Z": {
    entity: "Israel",
    adif: 336,
    cqZone: 20,
    ituZone: 39,
    continent: "AS",
  },
  "5B": {
    entity: "Cyprus",
    adif: 215,
    cqZone: 20,
    ituZone: 39,
    continent: "AS",
  },

  // Asia
  VU: { entity: "India", adif: 324, cqZone: 22, ituZone: 41, continent: "AS" },
  HS: {
    entity: "Thailand",
    adif: 387,
    cqZone: 26,
    ituZone: 49,
    continent: "AS",
  },
  DU: {
    entity: "Philippines",
    adif: 375,
    cqZone: 27,
    ituZone: 50,
    continent: "OC",
  },
  YB: {
    entity: "Indonesia",
    adif: 327,
    cqZone: [28],
    ituZone: [51, 54],
    continent: "OC",
  },
  "9M": {
    entity: "Malaysia",
    adif: 299,
    cqZone: 28,
    ituZone: 54,
    continent: "AS",
  },
  "9V": {
    entity: "Singapore",
    adif: 381,
    cqZone: 28,
    ituZone: 54,
    continent: "AS",
  },
};

// ============================================================================
// US State Data
// ============================================================================

/**
 * US state abbreviations for ARRL contests
 */
const US_STATES: Set<string> = new Set([
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
  "DC", // Washington DC
]);

/**
 * Canadian provinces for VE multipliers
 */
const CANADIAN_PROVINCES: Set<string> = new Set([
  "AB",
  "BC",
  "MB",
  "NB",
  "NL",
  "NS",
  "NT",
  "NU",
  "ON",
  "PE",
  "QC",
  "SK",
  "YT",
]);

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a prefix is valid by looking it up in DXCC_DATA
 */
function isValidPrefix(prefix: string): boolean {
  if (!prefix) return false;
  // Try progressively shorter prefixes
  for (let len = Math.min(prefix.length, 4); len >= 1; len--) {
    if (DXCC_DATA[prefix.slice(0, len)]) return true;
  }
  return false;
}

/**
 * Extract the operating prefix from a callsign (for determining current location)
 * Handles portable operations like DL/W1ABC (operating from Germany)
 * and suffix-based calls like W1ABC/DL (also operating from Germany)
 */
function getOperatingPrefix(callsign: string): string {
  if (!callsign) return "";

  const upper = callsign.toUpperCase().trim();
  const parts = upper.split("/");

  if (parts.length === 1) {
    // No slash - extract prefix from callsign
    return extractPrefixPattern(parts[0]);
  }

  // For callsigns with slash, check both segments
  const [first, second] = parts;

  // Extract prefix candidates from both parts
  const firstPrefix = extractPrefixPattern(first);
  const secondPrefix = second ? extractPrefixPattern(second) : "";

  // Check if either is a short modifier (1-3 chars) that's a valid prefix
  // This handles both DL/W1ABC (first is prefix) and W1ABC/DL (second is prefix)
  if (second && second.length <= 3 && /^[A-Z0-9]+$/.test(second)) {
    if (isValidPrefix(second)) {
      return second;
    }
  }

  if (first.length <= 3 && /^[A-Z0-9]+$/.test(first)) {
    if (isValidPrefix(first)) {
      return first;
    }
  }

  // If second part validates as a known prefix, prefer it (suffix portable)
  if (secondPrefix && isValidPrefix(secondPrefix)) {
    return secondPrefix;
  }

  // Otherwise use the first part's prefix
  return firstPrefix;
}

/**
 * Extract prefix pattern from a callsign
 * Returns the letters (+ optional digit) before the main number
 */
function extractPrefixPattern(callsign: string): string {
  if (!callsign) return "";

  // Handle numeric prefixes (e.g., 3DA, 5B, 9M)
  const numericMatch = callsign.match(/^(\d[A-Z]{1,2})/);
  if (numericMatch) {
    return numericMatch[1];
  }

  // Handle special 2+digit prefixes (e.g., HB9, EA6, KP4)
  const specialMatch = callsign.match(/^([A-Z]{1,2}\d)[A-Z0-9]/);
  if (specialMatch) {
    return specialMatch[1];
  }

  // Standard format: letters before first digit
  const standardMatch = callsign.match(/^([A-Z]{1,2})/);
  if (standardMatch) {
    return standardMatch[1];
  }

  return callsign.slice(0, 2);
}

// ============================================================================
// Public API Functions
// ============================================================================

/**
 * Extract DXCC entity from callsign
 * Uses prefix matching against known DXCC prefixes
 *
 * @param callsign - Amateur radio callsign (e.g., "W1ABC", "DL/W1ABC")
 * @returns DXCC entity info or null if not found
 *
 * @example
 * ```ts
 * getDXCCEntity("W1ABC")     // { entity: "United States", prefix: "W", adif: 291 }
 * getDXCCEntity("DL2XYZ")    // { entity: "Germany", prefix: "DL", adif: 230 }
 * getDXCCEntity("JA1ABC")    // { entity: "Japan", prefix: "JA", adif: 339 }
 * getDXCCEntity("DL/W1ABC")  // { entity: "Germany", prefix: "DL", adif: 230 }
 * ```
 */
export function getDXCCEntity(callsign: string): DXCCEntity | null {
  if (!callsign) return null;

  const prefix = getOperatingPrefix(callsign);
  if (!prefix) return null;

  // Try progressively shorter prefixes (longest match first)
  // This handles cases like KP4 vs K, EA6 vs EA, etc.
  for (let len = Math.min(prefix.length, 4); len >= 1; len--) {
    const tryPrefix = prefix.slice(0, len);
    const dxcc = DXCC_DATA[tryPrefix];
    if (dxcc) {
      return {
        entity: dxcc.entity,
        prefix: tryPrefix,
        adif: dxcc.adif,
        continent: dxcc.continent,
      };
    }
  }

  // Fallback: try using PREFIX_LOCATIONS for entity name only
  const location = findPrefixLocation(prefix);
  if (location) {
    return {
      entity: location.name,
      prefix: prefix.slice(0, 2),
    };
  }

  return null;
}

/**
 * Find prefix location from PREFIX_LOCATIONS data
 */
function findPrefixLocation(prefix: string): PrefixLocation | null {
  if (!prefix) return null;

  const upper = prefix.toUpperCase();

  // Try exact match first
  if (PREFIX_LOCATIONS[upper]) {
    return PREFIX_LOCATIONS[upper];
  }

  // Try progressively shorter prefixes
  for (let len = upper.length - 1; len >= 1; len--) {
    const shortPrefix = upper.slice(0, len);
    if (PREFIX_LOCATIONS[shortPrefix]) {
      return PREFIX_LOCATIONS[shortPrefix];
    }
  }

  return null;
}

/**
 * Extract CQ zone from callsign (1-40)
 * Uses prefix -> zone mapping
 *
 * @param callsign - Amateur radio callsign
 * @returns CQ zone number (1-40) or null if not found
 *
 * @example
 * ```ts
 * getCQZone("W1ABC")   // 5 (New England)
 * getCQZone("DL2XYZ")  // 14 (Germany)
 * getCQZone("JA1ABC")  // 25 (Japan)
 * ```
 */
export function getCQZone(callsign: string): number | null {
  if (!callsign) return null;

  const prefix = getOperatingPrefix(callsign);
  if (!prefix) return null;

  // Try progressively shorter prefixes
  for (let len = Math.min(prefix.length, 4); len >= 1; len--) {
    const tryPrefix = prefix.slice(0, len);
    const dxcc = DXCC_DATA[tryPrefix];
    if (dxcc) {
      const zone = dxcc.cqZone;
      // Return first zone if multiple (simplified)
      return Array.isArray(zone) ? zone[0] : zone;
    }
  }

  return null;
}

/**
 * Extract ITU zone from callsign (1-90)
 *
 * @param callsign - Amateur radio callsign
 * @returns ITU zone number (1-90) or null if not found
 *
 * @example
 * ```ts
 * getITUZone("W1ABC")   // 8 (Eastern USA)
 * getITUZone("DL2XYZ")  // 28 (Germany)
 * getITUZone("JA1ABC")  // 45 (Japan)
 * ```
 */
export function getITUZone(callsign: string): number | null {
  if (!callsign) return null;

  const prefix = getOperatingPrefix(callsign);
  if (!prefix) return null;

  // Try progressively shorter prefixes
  for (let len = Math.min(prefix.length, 4); len >= 1; len--) {
    const tryPrefix = prefix.slice(0, len);
    const dxcc = DXCC_DATA[tryPrefix];
    if (dxcc) {
      const zone = dxcc.ituZone;
      // Return first zone if multiple (simplified)
      return Array.isArray(zone) ? zone[0] : zone;
    }
  }

  return null;
}

/**
 * Extract WPX-style prefix from callsign
 *
 * WPX Rules:
 * - The prefix is the letter/number combination before the last digit
 * - For standard calls: W1ABC -> W1, VK2XYZ -> VK2
 * - For portable calls with prefix: DL/W1ABC -> DL0
 * - For single-letter prefix countries: F1ABC -> F1, G3XYZ -> G3
 *
 * @param callsign - Amateur radio callsign
 * @returns WPX prefix string
 *
 * @example
 * ```ts
 * getWPXPrefix("W1ABC")      // "W1"
 * getWPXPrefix("VK2XYZ")     // "VK2"
 * getWPXPrefix("DL/W1ABC")   // "DL0"
 * getWPXPrefix("W1ABC/P")    // "W1"
 * getWPXPrefix("F5ABC")      // "F5"
 * getWPXPrefix("3DA0RS")     // "3DA0"
 * ```
 */
export function getWPXPrefix(callsign: string): string {
  if (!callsign) return "";

  const upper = callsign.toUpperCase().trim();
  const parts = upper.split("/");

  // Handle portable prefix (DL/W1ABC style)
  if (parts.length >= 2) {
    const [first, second] = parts;

    // Check if first part is a short prefix (1-3 chars, no suffix like P, M, QRP)
    if (
      first.length <= 3 &&
      /^[A-Z0-9]+$/.test(first) &&
      !/^[A-Z]$/.test(second)
    ) {
      // Portable prefix - add 0 if no number
      if (/\d/.test(first)) {
        return first;
      }
      return first + "0";
    }

    // Check if second part is a modifier (P, M, QRP, etc.)
    if (second.length <= 3 && /^[A-Z]+$/.test(second)) {
      // Suffix modifier - use base call
      return extractWPXFromCall(first);
    }

    // Otherwise use first part as base
    return extractWPXFromCall(first);
  }

  return extractWPXFromCall(parts[0]);
}

/**
 * Extract WPX prefix from a base callsign (no slashes)
 */
function extractWPXFromCall(call: string): string {
  if (!call) return "";

  // Find the last digit in the call
  let lastDigitIndex = -1;
  for (let i = call.length - 1; i >= 0; i--) {
    if (/\d/.test(call[i])) {
      lastDigitIndex = i;
      break;
    }
  }

  if (lastDigitIndex === -1) {
    // No digit found - unusual but return first 2 chars
    return call.slice(0, 2);
  }

  // The WPX prefix is everything up to and including the last digit
  // before the suffix letters
  return call.slice(0, lastDigitIndex + 1);
}

/**
 * Extract US state from callsign or exchange
 * For ARRL contests where state is the exchange
 *
 * @param callsignOrExchange - Callsign or exchange containing state abbreviation
 * @returns Two-letter state abbreviation or null
 *
 * @example
 * ```ts
 * getUSState("CA")      // "CA"
 * getUSState("W6ABC")   // null (can't determine state from callsign alone)
 * getUSState("NY")      // "NY"
 * ```
 */
export function getUSState(callsignOrExchange: string): string | null {
  if (!callsignOrExchange) return null;

  const upper = callsignOrExchange.toUpperCase().trim();

  // Direct match for state abbreviation
  if (US_STATES.has(upper)) {
    return upper;
  }

  // Check if it's embedded in exchange (e.g., "123 CA" or "CA 123")
  const parts = upper.split(/\s+/);
  for (const part of parts) {
    if (US_STATES.has(part)) {
      return part;
    }
  }

  return null;
}

/**
 * Get Canadian province from exchange
 *
 * @param exchange - Exchange containing province abbreviation
 * @returns Two-letter province abbreviation or null
 */
export function getCanadianProvince(exchange: string): string | null {
  if (!exchange) return null;

  const upper = exchange.toUpperCase().trim();

  if (CANADIAN_PROVINCES.has(upper)) {
    return upper;
  }

  // Check embedded in exchange
  const parts = upper.split(/\s+/);
  for (const part of parts) {
    if (CANADIAN_PROVINCES.has(part)) {
      return part;
    }
  }

  return null;
}

/**
 * Get continent from DXCC entity
 *
 * @param callsign - Amateur radio callsign
 * @returns Continent code or null
 *
 * @example
 * ```ts
 * getContinent("W1ABC")   // "NA"
 * getContinent("DL2XYZ")  // "EU"
 * getContinent("JA1ABC")  // "AS"
 * getContinent("VK2ABC")  // "OC"
 * getContinent("LU1ABC")  // "SA"
 * getContinent("ZS1ABC")  // "AF"
 * ```
 */
export function getContinent(callsign: string): Continent | null {
  if (!callsign) return null;

  const prefix = getOperatingPrefix(callsign);
  if (!prefix) return null;

  // Try progressively shorter prefixes
  for (let len = Math.min(prefix.length, 4); len >= 1; len--) {
    const tryPrefix = prefix.slice(0, len);
    const dxcc = DXCC_DATA[tryPrefix];
    if (dxcc) {
      return dxcc.continent;
    }
  }

  return null;
}

/**
 * Check if two callsigns are from the same DXCC entity
 *
 * @param call1 - First callsign
 * @param call2 - Second callsign
 * @returns True if same DXCC entity
 */
export function isSameDXCC(call1: string, call2: string): boolean {
  const entity1 = getDXCCEntity(call1);
  const entity2 = getDXCCEntity(call2);

  if (!entity1 || !entity2) return false;

  // Compare by ADIF number if available, otherwise by entity name
  if (entity1.adif && entity2.adif) {
    return entity1.adif === entity2.adif;
  }

  return entity1.entity === entity2.entity;
}

/**
 * Check if two callsigns are from the same continent
 *
 * @param call1 - First callsign
 * @param call2 - Second callsign
 * @returns True if same continent
 */
export function isSameContinent(call1: string, call2: string): boolean {
  const cont1 = getContinent(call1);
  const cont2 = getContinent(call2);

  if (!cont1 || !cont2) return false;

  return cont1 === cont2;
}
