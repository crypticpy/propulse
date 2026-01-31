/**
 * Callsign Prefix to Location Database
 *
 * Maps amateur radio callsign prefixes to approximate geographic coordinates.
 * Used for RBN (Reverse Beacon Network) spot geolocation when grid locators
 * are not available.
 *
 * Coordinates represent approximate geographic centers for each country/region.
 */

export interface PrefixLocation {
  lat: number;
  lon: number;
  name: string;
}

/**
 * Map callsign prefixes to approximate center coordinates
 * Longer prefixes are checked first for more specific matches
 */
export const PREFIX_LOCATIONS: Record<string, PrefixLocation> = {
  // ==========================================================================
  // USA Prefixes (ITU Region 2)
  // ==========================================================================
  W: { lat: 39.8, lon: -98.6, name: "USA" },
  K: { lat: 39.8, lon: -98.6, name: "USA" },
  N: { lat: 39.8, lon: -98.6, name: "USA" },
  AA: { lat: 39.8, lon: -98.6, name: "USA" },
  AB: { lat: 39.8, lon: -98.6, name: "USA" },
  AC: { lat: 39.8, lon: -98.6, name: "USA" },
  AD: { lat: 39.8, lon: -98.6, name: "USA" },
  AE: { lat: 39.8, lon: -98.6, name: "USA" },
  AF: { lat: 39.8, lon: -98.6, name: "USA" },
  AG: { lat: 39.8, lon: -98.6, name: "USA" },
  AI: { lat: 39.8, lon: -98.6, name: "USA" },
  AJ: { lat: 39.8, lon: -98.6, name: "USA" },
  AK: { lat: 39.8, lon: -98.6, name: "USA" },
  AL: { lat: 39.8, lon: -98.6, name: "USA" },

  // USA Territories
  KP4: { lat: 18.2, lon: -66.5, name: "Puerto Rico" },
  NP4: { lat: 18.2, lon: -66.5, name: "Puerto Rico" },
  WP4: { lat: 18.2, lon: -66.5, name: "Puerto Rico" },
  KP2: { lat: 18.3, lon: -64.9, name: "US Virgin Islands" },
  NP2: { lat: 18.3, lon: -64.9, name: "US Virgin Islands" },
  WP2: { lat: 18.3, lon: -64.9, name: "US Virgin Islands" },
  KH6: { lat: 21.3, lon: -157.8, name: "Hawaii" },
  NH6: { lat: 21.3, lon: -157.8, name: "Hawaii" },
  WH6: { lat: 21.3, lon: -157.8, name: "Hawaii" },
  KH2: { lat: 13.4, lon: 144.8, name: "Guam" },
  KL7: { lat: 64.0, lon: -153.0, name: "Alaska" },
  NL7: { lat: 64.0, lon: -153.0, name: "Alaska" },
  WL7: { lat: 64.0, lon: -153.0, name: "Alaska" },
  AL7: { lat: 64.0, lon: -153.0, name: "Alaska" },

  // ==========================================================================
  // Canada Prefixes
  // ==========================================================================
  VE: { lat: 56.0, lon: -106.0, name: "Canada" },
  VA: { lat: 56.0, lon: -106.0, name: "Canada" },
  VO: { lat: 47.5, lon: -52.7, name: "Canada (Newfoundland)" },
  VY: { lat: 56.0, lon: -106.0, name: "Canada" },
  CY: { lat: 44.0, lon: -64.0, name: "Canada (Sable Island)" },

  // ==========================================================================
  // Europe (ITU Region 1)
  // ==========================================================================
  // UK and Crown Dependencies
  G: { lat: 52.0, lon: -1.0, name: "England" },
  M: { lat: 52.0, lon: -1.0, name: "England" },
  "2E": { lat: 52.0, lon: -1.0, name: "England" },
  GM: { lat: 56.5, lon: -4.0, name: "Scotland" },
  GW: { lat: 52.0, lon: -3.5, name: "Wales" },
  GI: { lat: 54.6, lon: -6.0, name: "Northern Ireland" },
  GD: { lat: 54.2, lon: -4.5, name: "Isle of Man" },
  GJ: { lat: 49.2, lon: -2.1, name: "Jersey" },
  GU: { lat: 49.5, lon: -2.5, name: "Guernsey" },

  // Germany
  DL: { lat: 51.0, lon: 10.0, name: "Germany" },
  DA: { lat: 51.0, lon: 10.0, name: "Germany" },
  DB: { lat: 51.0, lon: 10.0, name: "Germany" },
  DC: { lat: 51.0, lon: 10.0, name: "Germany" },
  DD: { lat: 51.0, lon: 10.0, name: "Germany" },
  DE: { lat: 51.0, lon: 10.0, name: "Germany" },
  DF: { lat: 51.0, lon: 10.0, name: "Germany" },
  DG: { lat: 51.0, lon: 10.0, name: "Germany" },
  DH: { lat: 51.0, lon: 10.0, name: "Germany" },
  DI: { lat: 51.0, lon: 10.0, name: "Germany" },
  DJ: { lat: 51.0, lon: 10.0, name: "Germany" },
  DK: { lat: 51.0, lon: 10.0, name: "Germany" },
  DM: { lat: 51.0, lon: 10.0, name: "Germany" },
  DN: { lat: 51.0, lon: 10.0, name: "Germany" },
  DO: { lat: 51.0, lon: 10.0, name: "Germany" },
  DP: { lat: 51.0, lon: 10.0, name: "Germany" },
  DQ: { lat: 51.0, lon: 10.0, name: "Germany" },
  DR: { lat: 51.0, lon: 10.0, name: "Germany" },

  // France
  F: { lat: 46.5, lon: 2.5, name: "France" },

  // Italy
  I: { lat: 42.5, lon: 12.5, name: "Italy" },
  IK: { lat: 42.5, lon: 12.5, name: "Italy" },
  IZ: { lat: 42.5, lon: 12.5, name: "Italy" },
  IW: { lat: 42.5, lon: 12.5, name: "Italy" },
  IU: { lat: 42.5, lon: 12.5, name: "Italy" },

  // Spain
  EA: { lat: 40.0, lon: -4.0, name: "Spain" },
  EB: { lat: 40.0, lon: -4.0, name: "Spain" },
  EC: { lat: 40.0, lon: -4.0, name: "Spain" },
  ED: { lat: 40.0, lon: -4.0, name: "Spain" },
  EE: { lat: 40.0, lon: -4.0, name: "Spain" },
  EF: { lat: 40.0, lon: -4.0, name: "Spain" },
  EG: { lat: 40.0, lon: -4.0, name: "Spain" },
  EH: { lat: 40.0, lon: -4.0, name: "Spain" },
  EA6: { lat: 39.6, lon: 2.9, name: "Balearic Islands" },
  EA8: { lat: 28.1, lon: -15.4, name: "Canary Islands" },
  EA9: { lat: 35.9, lon: -5.3, name: "Ceuta & Melilla" },

  // Netherlands
  PA: { lat: 52.0, lon: 5.5, name: "Netherlands" },
  PB: { lat: 52.0, lon: 5.5, name: "Netherlands" },
  PC: { lat: 52.0, lon: 5.5, name: "Netherlands" },
  PD: { lat: 52.0, lon: 5.5, name: "Netherlands" },
  PE: { lat: 52.0, lon: 5.5, name: "Netherlands" },
  PF: { lat: 52.0, lon: 5.5, name: "Netherlands" },
  PG: { lat: 52.0, lon: 5.5, name: "Netherlands" },
  PH: { lat: 52.0, lon: 5.5, name: "Netherlands" },
  PI: { lat: 52.0, lon: 5.5, name: "Netherlands" },

  // Belgium
  ON: { lat: 50.5, lon: 4.5, name: "Belgium" },
  OO: { lat: 50.5, lon: 4.5, name: "Belgium" },
  OP: { lat: 50.5, lon: 4.5, name: "Belgium" },
  OQ: { lat: 50.5, lon: 4.5, name: "Belgium" },
  OR: { lat: 50.5, lon: 4.5, name: "Belgium" },
  OS: { lat: 50.5, lon: 4.5, name: "Belgium" },
  OT: { lat: 50.5, lon: 4.5, name: "Belgium" },

  // Switzerland
  HB9: { lat: 47.0, lon: 8.0, name: "Switzerland" },
  HB3: { lat: 47.0, lon: 8.0, name: "Switzerland" },
  HE: { lat: 47.0, lon: 8.0, name: "Switzerland" },
  HB0: { lat: 47.1, lon: 9.5, name: "Liechtenstein" },

  // Austria
  OE: { lat: 47.5, lon: 14.0, name: "Austria" },

  // Czech Republic
  OK: { lat: 50.0, lon: 15.0, name: "Czech Republic" },
  OL: { lat: 50.0, lon: 15.0, name: "Czech Republic" },

  // Slovakia
  OM: { lat: 48.7, lon: 19.5, name: "Slovakia" },

  // Poland
  SP: { lat: 52.0, lon: 19.0, name: "Poland" },
  SQ: { lat: 52.0, lon: 19.0, name: "Poland" },
  SO: { lat: 52.0, lon: 19.0, name: "Poland" },
  SN: { lat: 52.0, lon: 19.0, name: "Poland" },
  "3Z": { lat: 52.0, lon: 19.0, name: "Poland" },

  // Russia
  UA: { lat: 55.75, lon: 37.6, name: "Russia" },
  UB: { lat: 55.75, lon: 37.6, name: "Russia" },
  UC: { lat: 55.75, lon: 37.6, name: "Russia" },
  UD: { lat: 55.75, lon: 37.6, name: "Russia" },
  UE: { lat: 55.75, lon: 37.6, name: "Russia" },
  UF: { lat: 55.75, lon: 37.6, name: "Russia" },
  UG: { lat: 55.75, lon: 37.6, name: "Russia" },
  UH: { lat: 55.75, lon: 37.6, name: "Russia" },
  UI: { lat: 55.75, lon: 37.6, name: "Russia" },
  R: { lat: 55.75, lon: 37.6, name: "Russia" },
  RA: { lat: 55.75, lon: 37.6, name: "Russia" },
  RK: { lat: 55.75, lon: 37.6, name: "Russia" },
  RN: { lat: 55.75, lon: 37.6, name: "Russia" },
  RU: { lat: 55.75, lon: 37.6, name: "Russia" },
  RV: { lat: 55.75, lon: 37.6, name: "Russia" },
  RW: { lat: 55.75, lon: 37.6, name: "Russia" },
  RX: { lat: 55.75, lon: 37.6, name: "Russia" },
  RZ: { lat: 55.75, lon: 37.6, name: "Russia" },
  UA0: { lat: 62.0, lon: 130.0, name: "Russia (Asiatic)" },
  UA9: { lat: 60.0, lon: 75.0, name: "Russia (Asiatic)" },

  // Ukraine
  UR: { lat: 49.0, lon: 32.0, name: "Ukraine" },
  US: { lat: 49.0, lon: 32.0, name: "Ukraine" },
  UT: { lat: 49.0, lon: 32.0, name: "Ukraine" },
  UU: { lat: 49.0, lon: 32.0, name: "Ukraine" },
  UV: { lat: 49.0, lon: 32.0, name: "Ukraine" },
  UW: { lat: 49.0, lon: 32.0, name: "Ukraine" },
  UX: { lat: 49.0, lon: 32.0, name: "Ukraine" },
  UY: { lat: 49.0, lon: 32.0, name: "Ukraine" },
  UZ: { lat: 49.0, lon: 32.0, name: "Ukraine" },

  // Nordic Countries
  OH: { lat: 64.0, lon: 26.0, name: "Finland" },
  OG: { lat: 64.0, lon: 26.0, name: "Finland" },
  OF: { lat: 64.0, lon: 26.0, name: "Finland" },
  SM: { lat: 62.0, lon: 15.0, name: "Sweden" },
  SA: { lat: 62.0, lon: 15.0, name: "Sweden" },
  SB: { lat: 62.0, lon: 15.0, name: "Sweden" },
  SC: { lat: 62.0, lon: 15.0, name: "Sweden" },
  SD: { lat: 62.0, lon: 15.0, name: "Sweden" },
  SE: { lat: 62.0, lon: 15.0, name: "Sweden" },
  SF: { lat: 62.0, lon: 15.0, name: "Sweden" },
  SG: { lat: 62.0, lon: 15.0, name: "Sweden" },
  SH: { lat: 62.0, lon: 15.0, name: "Sweden" },
  SI: { lat: 62.0, lon: 15.0, name: "Sweden" },
  SJ: { lat: 62.0, lon: 15.0, name: "Sweden" },
  SK: { lat: 62.0, lon: 15.0, name: "Sweden" },
  SL: { lat: 62.0, lon: 15.0, name: "Sweden" },
  LA: { lat: 62.0, lon: 10.0, name: "Norway" },
  LB: { lat: 62.0, lon: 10.0, name: "Norway" },
  LC: { lat: 62.0, lon: 10.0, name: "Norway" },
  OZ: { lat: 56.0, lon: 10.0, name: "Denmark" },
  OU: { lat: 56.0, lon: 10.0, name: "Denmark" },
  OV: { lat: 56.0, lon: 10.0, name: "Denmark" },
  OW: { lat: 56.0, lon: 10.0, name: "Denmark" },
  OX: { lat: 56.0, lon: 10.0, name: "Denmark" },
  TF: { lat: 65.0, lon: -18.0, name: "Iceland" },

  // Baltic States
  ES: { lat: 59.0, lon: 25.0, name: "Estonia" },
  YL: { lat: 57.0, lon: 25.0, name: "Latvia" },
  LY: { lat: 55.0, lon: 24.0, name: "Lithuania" },

  // Other European Countries
  CT: { lat: 39.5, lon: -8.0, name: "Portugal" },
  CU: { lat: 37.7, lon: -25.5, name: "Azores" },
  HV: { lat: 41.9, lon: 12.5, name: "Vatican City" },
  "9H": { lat: 35.9, lon: 14.4, name: "Malta" },
  SV: { lat: 39.0, lon: 22.0, name: "Greece" },
  SX: { lat: 39.0, lon: 22.0, name: "Greece" },
  SZ: { lat: 39.0, lon: 22.0, name: "Greece" },
  YU: { lat: 44.0, lon: 21.0, name: "Serbia" },
  YO: { lat: 46.0, lon: 25.0, name: "Romania" },
  LZ: { lat: 43.0, lon: 25.0, name: "Bulgaria" },
  HA: { lat: 47.0, lon: 19.5, name: "Hungary" },
  HG: { lat: 47.0, lon: 19.5, name: "Hungary" },
  "9A": { lat: 45.0, lon: 16.0, name: "Croatia" },
  S5: { lat: 46.0, lon: 15.0, name: "Slovenia" },
  E7: { lat: 44.0, lon: 18.0, name: "Bosnia-Herzegovina" },
  Z3: { lat: 41.5, lon: 21.5, name: "North Macedonia" },
  Z6: { lat: 42.6, lon: 21.0, name: "Kosovo" },
  ZA: { lat: 41.0, lon: 20.0, name: "Albania" },
  "4O": { lat: 42.5, lon: 19.3, name: "Montenegro" },
  TA: { lat: 39.0, lon: 35.0, name: "Turkey" },
  TB: { lat: 39.0, lon: 35.0, name: "Turkey" },
  TC: { lat: 39.0, lon: 35.0, name: "Turkey" },

  // ==========================================================================
  // Asia (ITU Region 3)
  // ==========================================================================
  // Japan
  JA: { lat: 36.0, lon: 138.0, name: "Japan" },
  JH: { lat: 36.0, lon: 138.0, name: "Japan" },
  JR: { lat: 36.0, lon: 138.0, name: "Japan" },
  JE: { lat: 36.0, lon: 138.0, name: "Japan" },
  JF: { lat: 36.0, lon: 138.0, name: "Japan" },
  JG: { lat: 36.0, lon: 138.0, name: "Japan" },
  JI: { lat: 36.0, lon: 138.0, name: "Japan" },
  JJ: { lat: 36.0, lon: 138.0, name: "Japan" },
  JK: { lat: 36.0, lon: 138.0, name: "Japan" },
  JL: { lat: 36.0, lon: 138.0, name: "Japan" },
  JM: { lat: 36.0, lon: 138.0, name: "Japan" },
  JN: { lat: 36.0, lon: 138.0, name: "Japan" },
  JO: { lat: 36.0, lon: 138.0, name: "Japan" },
  JP: { lat: 36.0, lon: 138.0, name: "Japan" },
  JQ: { lat: 36.0, lon: 138.0, name: "Japan" },
  JS: { lat: 36.0, lon: 138.0, name: "Japan" },
  "7J": { lat: 36.0, lon: 138.0, name: "Japan" },
  "7K": { lat: 36.0, lon: 138.0, name: "Japan" },
  "7L": { lat: 36.0, lon: 138.0, name: "Japan" },
  "7M": { lat: 36.0, lon: 138.0, name: "Japan" },
  "7N": { lat: 36.0, lon: 138.0, name: "Japan" },
  "8J": { lat: 36.0, lon: 138.0, name: "Japan" },
  "8N": { lat: 36.0, lon: 138.0, name: "Japan" },

  // South Korea
  HL: { lat: 37.0, lon: 127.5, name: "South Korea" },
  DS: { lat: 37.0, lon: 127.5, name: "South Korea" },
  DT: { lat: 37.0, lon: 127.5, name: "South Korea" },
  "6K": { lat: 37.0, lon: 127.5, name: "South Korea" },
  "6L": { lat: 37.0, lon: 127.5, name: "South Korea" },
  "6M": { lat: 37.0, lon: 127.5, name: "South Korea" },
  "6N": { lat: 37.0, lon: 127.5, name: "South Korea" },

  // Taiwan
  BV: { lat: 23.5, lon: 121.0, name: "Taiwan" },
  BM: { lat: 23.5, lon: 121.0, name: "Taiwan" },
  BN: { lat: 23.5, lon: 121.0, name: "Taiwan" },
  BO: { lat: 23.5, lon: 121.0, name: "Taiwan" },
  BP: { lat: 23.5, lon: 121.0, name: "Taiwan" },
  BQ: { lat: 23.5, lon: 121.0, name: "Taiwan" },
  BW: { lat: 23.5, lon: 121.0, name: "Taiwan" },
  BX: { lat: 23.5, lon: 121.0, name: "Taiwan" },

  // China
  BY: { lat: 35.0, lon: 105.0, name: "China" },
  BA: { lat: 35.0, lon: 105.0, name: "China" },
  BD: { lat: 35.0, lon: 105.0, name: "China" },
  BG: { lat: 35.0, lon: 105.0, name: "China" },
  BH: { lat: 35.0, lon: 105.0, name: "China" },
  BI: { lat: 35.0, lon: 105.0, name: "China" },
  BJ: { lat: 35.0, lon: 105.0, name: "China" },
  BL: { lat: 35.0, lon: 105.0, name: "China" },
  BT: { lat: 35.0, lon: 105.0, name: "China" },
  BZ: { lat: 35.0, lon: 105.0, name: "China" },

  // Hong Kong
  VR2: { lat: 22.3, lon: 114.2, name: "Hong Kong" },
  VR: { lat: 22.3, lon: 114.2, name: "Hong Kong" },

  // Macao
  XX9: { lat: 22.2, lon: 113.5, name: "Macao" },

  // India
  VU: { lat: 20.0, lon: 77.0, name: "India" },
  AT: { lat: 20.0, lon: 77.0, name: "India" },

  // Thailand
  HS: { lat: 15.0, lon: 101.0, name: "Thailand" },
  E2: { lat: 15.0, lon: 101.0, name: "Thailand" },

  // Philippines
  DU: { lat: 12.0, lon: 122.0, name: "Philippines" },
  DV: { lat: 12.0, lon: 122.0, name: "Philippines" },
  DW: { lat: 12.0, lon: 122.0, name: "Philippines" },
  DX: { lat: 12.0, lon: 122.0, name: "Philippines" },
  DY: { lat: 12.0, lon: 122.0, name: "Philippines" },
  DZ: { lat: 12.0, lon: 122.0, name: "Philippines" },
  "4D": { lat: 12.0, lon: 122.0, name: "Philippines" },
  "4E": { lat: 12.0, lon: 122.0, name: "Philippines" },
  "4F": { lat: 12.0, lon: 122.0, name: "Philippines" },
  "4G": { lat: 12.0, lon: 122.0, name: "Philippines" },
  "4H": { lat: 12.0, lon: 122.0, name: "Philippines" },
  "4I": { lat: 12.0, lon: 122.0, name: "Philippines" },

  // Indonesia
  YB: { lat: -2.0, lon: 118.0, name: "Indonesia" },
  YC: { lat: -2.0, lon: 118.0, name: "Indonesia" },
  YD: { lat: -2.0, lon: 118.0, name: "Indonesia" },
  YE: { lat: -2.0, lon: 118.0, name: "Indonesia" },
  YF: { lat: -2.0, lon: 118.0, name: "Indonesia" },
  YG: { lat: -2.0, lon: 118.0, name: "Indonesia" },
  YH: { lat: -2.0, lon: 118.0, name: "Indonesia" },

  // Malaysia
  "9M": { lat: 4.0, lon: 109.0, name: "Malaysia" },
  "9W": { lat: 4.0, lon: 109.0, name: "Malaysia" },

  // Singapore
  "9V": { lat: 1.3, lon: 103.8, name: "Singapore" },

  // Israel
  "4X": { lat: 31.5, lon: 35.0, name: "Israel" },
  "4Z": { lat: 31.5, lon: 35.0, name: "Israel" },

  // ==========================================================================
  // Oceania (ITU Region 3)
  // ==========================================================================
  // Australia
  VK: { lat: -25.0, lon: 135.0, name: "Australia" },
  AX: { lat: -25.0, lon: 135.0, name: "Australia" },

  // New Zealand
  ZL: { lat: -41.0, lon: 174.0, name: "New Zealand" },

  // ==========================================================================
  // South America (ITU Region 2)
  // ==========================================================================
  // Argentina
  LU: { lat: -34.0, lon: -64.0, name: "Argentina" },
  LO: { lat: -34.0, lon: -64.0, name: "Argentina" },
  LP: { lat: -34.0, lon: -64.0, name: "Argentina" },
  LQ: { lat: -34.0, lon: -64.0, name: "Argentina" },
  LR: { lat: -34.0, lon: -64.0, name: "Argentina" },
  LS: { lat: -34.0, lon: -64.0, name: "Argentina" },
  LT: { lat: -34.0, lon: -64.0, name: "Argentina" },
  LV: { lat: -34.0, lon: -64.0, name: "Argentina" },
  LW: { lat: -34.0, lon: -64.0, name: "Argentina" },
  AY: { lat: -34.0, lon: -64.0, name: "Argentina" },
  AZ: { lat: -34.0, lon: -64.0, name: "Argentina" },
  L2: { lat: -34.0, lon: -64.0, name: "Argentina" },

  // Brazil
  PY: { lat: -15.0, lon: -47.0, name: "Brazil" },
  PP: { lat: -15.0, lon: -47.0, name: "Brazil" },
  PQ: { lat: -15.0, lon: -47.0, name: "Brazil" },
  PR: { lat: -15.0, lon: -47.0, name: "Brazil" },
  PS: { lat: -15.0, lon: -47.0, name: "Brazil" },
  PT: { lat: -15.0, lon: -47.0, name: "Brazil" },
  PU: { lat: -15.0, lon: -47.0, name: "Brazil" },
  PV: { lat: -15.0, lon: -47.0, name: "Brazil" },
  PW: { lat: -15.0, lon: -47.0, name: "Brazil" },
  PX: { lat: -15.0, lon: -47.0, name: "Brazil" },
  ZV: { lat: -15.0, lon: -47.0, name: "Brazil" },
  ZW: { lat: -15.0, lon: -47.0, name: "Brazil" },
  ZX: { lat: -15.0, lon: -47.0, name: "Brazil" },
  ZY: { lat: -15.0, lon: -47.0, name: "Brazil" },
  ZZ: { lat: -15.0, lon: -47.0, name: "Brazil" },

  // Chile
  CE: { lat: -33.0, lon: -70.5, name: "Chile" },
  CA: { lat: -33.0, lon: -70.5, name: "Chile" },
  CB: { lat: -33.0, lon: -70.5, name: "Chile" },
  CC: { lat: -33.0, lon: -70.5, name: "Chile" },
  CD: { lat: -33.0, lon: -70.5, name: "Chile" },
  XQ: { lat: -33.0, lon: -70.5, name: "Chile" },
  XR: { lat: -33.0, lon: -70.5, name: "Chile" },
  "3G": { lat: -33.0, lon: -70.5, name: "Chile" },

  // Uruguay
  CX: { lat: -33.0, lon: -56.0, name: "Uruguay" },
  CV: { lat: -33.0, lon: -56.0, name: "Uruguay" },
  CW: { lat: -33.0, lon: -56.0, name: "Uruguay" },

  // Paraguay
  ZP: { lat: -23.0, lon: -58.0, name: "Paraguay" },

  // Bolivia
  CP: { lat: -17.0, lon: -65.0, name: "Bolivia" },

  // Peru
  OA: { lat: -10.0, lon: -76.0, name: "Peru" },
  OB: { lat: -10.0, lon: -76.0, name: "Peru" },
  OC: { lat: -10.0, lon: -76.0, name: "Peru" },

  // Colombia
  HK: { lat: 4.0, lon: -72.0, name: "Colombia" },
  HJ: { lat: 4.0, lon: -72.0, name: "Colombia" },
  "5J": { lat: 4.0, lon: -72.0, name: "Colombia" },
  "5K": { lat: 4.0, lon: -72.0, name: "Colombia" },

  // Venezuela
  YV: { lat: 8.0, lon: -66.0, name: "Venezuela" },
  YW: { lat: 8.0, lon: -66.0, name: "Venezuela" },
  YX: { lat: 8.0, lon: -66.0, name: "Venezuela" },
  YY: { lat: 8.0, lon: -66.0, name: "Venezuela" },
  "4M": { lat: 8.0, lon: -66.0, name: "Venezuela" },

  // Ecuador
  HC: { lat: -1.0, lon: -78.0, name: "Ecuador" },
  HD: { lat: -1.0, lon: -78.0, name: "Ecuador" },

  // ==========================================================================
  // Central America & Caribbean (ITU Region 2)
  // ==========================================================================
  // Mexico
  XE: { lat: 23.0, lon: -102.0, name: "Mexico" },
  XF: { lat: 23.0, lon: -102.0, name: "Mexico" },
  "4A": { lat: 23.0, lon: -102.0, name: "Mexico" },
  "4B": { lat: 23.0, lon: -102.0, name: "Mexico" },
  "4C": { lat: 23.0, lon: -102.0, name: "Mexico" },
  "6D": { lat: 23.0, lon: -102.0, name: "Mexico" },
  "6E": { lat: 23.0, lon: -102.0, name: "Mexico" },
  "6F": { lat: 23.0, lon: -102.0, name: "Mexico" },
  "6G": { lat: 23.0, lon: -102.0, name: "Mexico" },
  "6H": { lat: 23.0, lon: -102.0, name: "Mexico" },
  "6I": { lat: 23.0, lon: -102.0, name: "Mexico" },
  "6J": { lat: 23.0, lon: -102.0, name: "Mexico" },

  // Cuba
  CM: { lat: 22.0, lon: -79.5, name: "Cuba" },
  CO: { lat: 22.0, lon: -79.5, name: "Cuba" },
  CL: { lat: 22.0, lon: -79.5, name: "Cuba" },
  T4: { lat: 22.0, lon: -79.5, name: "Cuba" },

  // Jamaica
  "6Y": { lat: 18.1, lon: -77.3, name: "Jamaica" },

  // Dominican Republic
  HI: { lat: 19.0, lon: -70.5, name: "Dominican Republic" },

  // Haiti
  HH: { lat: 19.0, lon: -72.0, name: "Haiti" },
  "4V": { lat: 19.0, lon: -72.0, name: "Haiti" },

  // Costa Rica
  TI: { lat: 10.0, lon: -84.0, name: "Costa Rica" },
  TE: { lat: 10.0, lon: -84.0, name: "Costa Rica" },

  // Panama
  HP: { lat: 9.0, lon: -79.5, name: "Panama" },
  HO: { lat: 9.0, lon: -79.5, name: "Panama" },
  H3: { lat: 9.0, lon: -79.5, name: "Panama" },
  "3E": { lat: 9.0, lon: -79.5, name: "Panama" },
  "3F": { lat: 9.0, lon: -79.5, name: "Panama" },

  // ==========================================================================
  // Africa (ITU Region 1)
  // ==========================================================================
  // South Africa
  ZS: { lat: -29.0, lon: 24.0, name: "South Africa" },
  ZR: { lat: -29.0, lon: 24.0, name: "South Africa" },
  ZT: { lat: -29.0, lon: 24.0, name: "South Africa" },
  ZU: { lat: -29.0, lon: 24.0, name: "South Africa" },

  // Morocco
  CN: { lat: 32.0, lon: -5.0, name: "Morocco" },

  // Algeria
  "7X": { lat: 28.0, lon: 3.0, name: "Algeria" },

  // Tunisia
  "3V": { lat: 34.0, lon: 9.0, name: "Tunisia" },

  // Egypt
  SU: { lat: 27.0, lon: 30.0, name: "Egypt" },

  // Kenya
  "5Z": { lat: -1.0, lon: 38.0, name: "Kenya" },

  // Nigeria
  "5N": { lat: 10.0, lon: 8.0, name: "Nigeria" },

  // Mauritius
  "3B8": { lat: -20.2, lon: 57.5, name: "Mauritius" },
  "3B9": { lat: -10.4, lon: 56.8, name: "Rodrigues Island" },

  // Reunion
  FR: { lat: -21.1, lon: 55.5, name: "Reunion" },

  // Madagascar
  "5R": { lat: -19.0, lon: 47.0, name: "Madagascar" },

  // Senegal
  "6W": { lat: 14.5, lon: -14.5, name: "Senegal" },

  // Ghana
  "9G": { lat: 8.0, lon: -1.0, name: "Ghana" },

  // ==========================================================================
  // Middle East
  // ==========================================================================
  // United Arab Emirates
  A6: { lat: 24.0, lon: 54.0, name: "United Arab Emirates" },
  A61: { lat: 24.0, lon: 54.0, name: "United Arab Emirates" },

  // Qatar
  A7: { lat: 25.3, lon: 51.5, name: "Qatar" },
  A71: { lat: 25.3, lon: 51.5, name: "Qatar" },

  // Bahrain
  A9: { lat: 26.0, lon: 50.5, name: "Bahrain" },
  A91: { lat: 26.0, lon: 50.5, name: "Bahrain" },

  // Kuwait
  "9K": { lat: 29.5, lon: 47.5, name: "Kuwait" },

  // Saudi Arabia
  "7Z": { lat: 24.0, lon: 45.0, name: "Saudi Arabia" },
  HZ: { lat: 24.0, lon: 45.0, name: "Saudi Arabia" },

  // Oman
  A4: { lat: 21.0, lon: 57.0, name: "Oman" },

  // Jordan
  JY: { lat: 31.5, lon: 36.0, name: "Jordan" },

  // Lebanon
  OD: { lat: 34.0, lon: 36.0, name: "Lebanon" },

  // Cyprus
  "5B": { lat: 35.0, lon: 33.0, name: "Cyprus" },
  C4: { lat: 35.0, lon: 33.0, name: "Cyprus" },
  H2: { lat: 35.0, lon: 33.0, name: "Cyprus" },
  P3: { lat: 35.0, lon: 33.0, name: "Cyprus" },
};

/**
 * Continent fallback locations for when prefix is not found
 * Uses standard 2-letter continent codes from RBN
 */
export const CONTINENT_LOCATIONS: Record<string, PrefixLocation> = {
  NA: { lat: 39.8, lon: -98.6, name: "North America" },
  SA: { lat: -15.0, lon: -60.0, name: "South America" },
  EU: { lat: 50.0, lon: 10.0, name: "Europe" },
  AF: { lat: 0.0, lon: 20.0, name: "Africa" },
  AS: { lat: 35.0, lon: 105.0, name: "Asia" },
  OC: { lat: -25.0, lon: 140.0, name: "Oceania" },
  AN: { lat: -80.0, lon: 0.0, name: "Antarctica" },
};

/**
 * Get location from callsign prefix
 * Tries exact match first, then progressively shorter prefixes
 *
 * @param prefix - Callsign prefix (e.g., 'W1', 'DL', 'JA', 'HB9')
 * @returns PrefixLocation or null if no match found
 */
export function getLocationFromPrefix(prefix: string): PrefixLocation | null {
  if (!prefix) {
    return null;
  }

  const upperPrefix = prefix.toUpperCase();

  // Try exact match first (for longer prefixes like 'HB9', 'KP4', 'EA6')
  if (PREFIX_LOCATIONS[upperPrefix]) {
    return PREFIX_LOCATIONS[upperPrefix];
  }

  // Try progressively shorter prefixes
  // For a prefix like "HB9ABC", try "HB9AB", "HB9A", "HB9", "HB", "H"
  for (let len = upperPrefix.length - 1; len >= 1; len--) {
    const shortPrefix = upperPrefix.slice(0, len);
    if (PREFIX_LOCATIONS[shortPrefix]) {
      return PREFIX_LOCATIONS[shortPrefix];
    }
  }

  return null;
}

/**
 * Get location from continent code
 *
 * @param continent - Continent code (e.g., 'NA', 'EU', 'AS')
 * @returns PrefixLocation or null if not found
 */
export function getLocationFromContinent(
  continent: string,
): PrefixLocation | null {
  if (!continent) {
    return null;
  }
  return CONTINENT_LOCATIONS[continent.toUpperCase()] || null;
}

/**
 * Extract prefix from a full callsign
 * Handles various callsign formats
 *
 * @param callsign - Full callsign (e.g., 'W1ABC', 'DL2XYZ', 'JA1ABC/P')
 * @returns Extracted prefix suitable for location lookup
 */
export function extractPrefixFromCallsign(callsign: string): string {
  if (!callsign) {
    return "";
  }

  // Remove any suffix (like /P, /M, /QRP)
  const baseCall = callsign.split("/")[0].toUpperCase();

  // Handle special prefixes with numbers in them (e.g., HB9, EA6, KP4)
  // These typically have 2-3 letters followed by a digit
  const specialPrefixMatch = baseCall.match(/^([A-Z]{1,2}\d)[A-Z]/);
  if (specialPrefixMatch) {
    return specialPrefixMatch[1];
  }

  // Standard format: 1-2 letters, then a number
  // Extract the letter prefix and optionally the first digit for region specificity
  const standardMatch = baseCall.match(/^([A-Z]{1,2})(\d)?/);
  if (standardMatch) {
    // Return letters + optional digit for better matching
    return standardMatch[1] + (standardMatch[2] || "");
  }

  // Handle numeric prefixes like 3DA (Swaziland), 5B (Cyprus), 9M (Malaysia)
  const numericPrefixMatch = baseCall.match(/^(\d[A-Z]{1,2})/);
  if (numericPrefixMatch) {
    return numericPrefixMatch[1];
  }

  // Fallback: return first 2 characters
  return baseCall.slice(0, 2);
}
