/**
 * Callsign Prefix to Location Database
 *
 * Maps amateur radio callsign prefixes to approximate geographic coordinates.
 * Used for RBN (Reverse Beacon Network) spot geolocation when grid locators
 * are not available.
 *
 * This database covers all ~340 current DXCC entities plus common prefix variants.
 * Coordinates represent approximate geographic centers for each country/region.
 *
 * Organized by continent for readability:
 * - Africa (AF)
 * - Antarctica (AN)
 * - Asia (AS)
 * - Europe (EU)
 * - North America (NA)
 * - Oceania (OC)
 * - South America (SA)
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
  // AFRICA (AF)
  // ==========================================================================

  // 3B - Mauritius
  "3B8": { lat: -20.2, lon: 57.5, name: "Mauritius" },
  "3B9": { lat: -10.4, lon: 56.8, name: "Rodrigues Island" },
  "3B": { lat: -20.2, lon: 57.5, name: "Mauritius" },

  // 3C - Equatorial Guinea
  "3C": { lat: 1.5, lon: 10.0, name: "Equatorial Guinea" },
  "3C0": { lat: -3.4, lon: 8.7, name: "Annobon Island" },

  // 3DA - Eswatini (Swaziland)
  "3DA": { lat: -26.5, lon: 31.5, name: "Eswatini" },
  "3DA0": { lat: -26.5, lon: 31.5, name: "Eswatini" },

  // 3V - Tunisia
  "3V": { lat: 34.0, lon: 9.0, name: "Tunisia" },

  // 3X - Guinea
  "3X": { lat: 10.0, lon: -10.0, name: "Guinea" },

  // 5A - Libya
  "5A": { lat: 27.0, lon: 17.0, name: "Libya" },

  // 5H - Tanzania
  "5H": { lat: -6.0, lon: 35.0, name: "Tanzania" },
  "5I": { lat: -6.0, lon: 35.0, name: "Tanzania" },

  // 5N - Nigeria
  "5N": { lat: 10.0, lon: 8.0, name: "Nigeria" },
  "5O": { lat: 10.0, lon: 8.0, name: "Nigeria" },

  // 5R - Madagascar
  "5R": { lat: -19.0, lon: 47.0, name: "Madagascar" },
  "5S": { lat: -19.0, lon: 47.0, name: "Madagascar" },
  "6X": { lat: -19.0, lon: 47.0, name: "Madagascar" },

  // 5T - Mauritania
  "5T": { lat: 20.0, lon: -10.0, name: "Mauritania" },

  // 5U - Niger
  "5U": { lat: 16.0, lon: 8.0, name: "Niger" },

  // 5V - Togo
  "5V": { lat: 8.0, lon: 1.0, name: "Togo" },

  // 5X - Uganda
  "5X": { lat: 1.0, lon: 32.0, name: "Uganda" },

  // 5Z - Kenya
  "5Z": { lat: -1.0, lon: 38.0, name: "Kenya" },

  // 6W - Senegal
  "6W": { lat: 14.5, lon: -14.5, name: "Senegal" },

  // 7O - Yemen
  "7O": { lat: 15.5, lon: 48.0, name: "Yemen" },

  // 7P - Lesotho
  "7P": { lat: -29.5, lon: 28.5, name: "Lesotho" },

  // 7Q - Malawi
  "7Q": { lat: -13.5, lon: 34.0, name: "Malawi" },

  // 7X - Algeria
  "7X": { lat: 28.0, lon: 3.0, name: "Algeria" },
  "7Y": { lat: 28.0, lon: 3.0, name: "Algeria" },

  // 9G - Ghana
  "9G": { lat: 8.0, lon: -1.0, name: "Ghana" },

  // 9J - Zambia
  "9J": { lat: -15.0, lon: 28.0, name: "Zambia" },

  // 9L - Sierra Leone
  "9L": { lat: 8.5, lon: -11.5, name: "Sierra Leone" },

  // 9Q - Democratic Republic of Congo
  "9Q": { lat: -3.0, lon: 23.0, name: "Dem. Rep. of Congo" },

  // 9U - Burundi
  "9U": { lat: -3.5, lon: 30.0, name: "Burundi" },

  // 9X - Rwanda
  "9X": { lat: -2.0, lon: 30.0, name: "Rwanda" },

  // A2 - Botswana
  A2: { lat: -22.0, lon: 24.0, name: "Botswana" },

  // C5 - The Gambia
  C5: { lat: 13.5, lon: -15.5, name: "The Gambia" },

  // C9 - Mozambique
  C9: { lat: -18.0, lon: 35.0, name: "Mozambique" },

  // CN - Morocco
  CN: { lat: 32.0, lon: -5.0, name: "Morocco" },

  // CT3 - Madeira
  CT3: { lat: 32.7, lon: -17.0, name: "Madeira" },

  // D2 - Angola
  D2: { lat: -12.0, lon: 18.0, name: "Angola" },
  D3: { lat: -12.0, lon: 18.0, name: "Angola" },

  // D4 - Cape Verde
  D4: { lat: 16.0, lon: -24.0, name: "Cape Verde" },

  // D6 - Comoros
  D6: { lat: -12.0, lon: 44.0, name: "Comoros" },

  // E3 - Eritrea
  E3: { lat: 15.0, lon: 39.0, name: "Eritrea" },

  // EA8 - Canary Islands
  EA8: { lat: 28.1, lon: -15.4, name: "Canary Islands" },
  EB8: { lat: 28.1, lon: -15.4, name: "Canary Islands" },
  EC8: { lat: 28.1, lon: -15.4, name: "Canary Islands" },

  // EA9 - Ceuta & Melilla
  EA9: { lat: 35.9, lon: -5.3, name: "Ceuta & Melilla" },
  EB9: { lat: 35.9, lon: -5.3, name: "Ceuta & Melilla" },
  EC9: { lat: 35.9, lon: -5.3, name: "Ceuta & Melilla" },

  // EL - Liberia
  EL: { lat: 6.5, lon: -9.5, name: "Liberia" },

  // ET - Ethiopia
  ET: { lat: 9.0, lon: 38.5, name: "Ethiopia" },

  // FR - Reunion
  FR: { lat: -21.1, lon: 55.5, name: "Reunion" },

  // FT5W - Crozet
  FT5W: { lat: -46.4, lon: 51.9, name: "Crozet" },
  FT4W: { lat: -46.4, lon: 51.9, name: "Crozet" },

  // FT5X - Kerguelen
  FT5X: { lat: -49.3, lon: 69.3, name: "Kerguelen" },
  FT4X: { lat: -49.3, lon: 69.3, name: "Kerguelen" },

  // FT5Z - Amsterdam & St. Paul
  FT5Z: { lat: -37.8, lon: 77.5, name: "Amsterdam & St. Paul" },
  FT4Z: { lat: -37.8, lon: 77.5, name: "Amsterdam & St. Paul" },

  // J5 - Guinea-Bissau
  J5: { lat: 12.0, lon: -15.0, name: "Guinea-Bissau" },

  // S0 - Western Sahara
  S0: { lat: 24.0, lon: -13.0, name: "Western Sahara" },

  // S7 - Seychelles
  S7: { lat: -4.5, lon: 55.5, name: "Seychelles" },

  // S9 - Sao Tome & Principe
  S9: { lat: 0.3, lon: 6.7, name: "Sao Tome & Principe" },

  // ST - Sudan
  ST: { lat: 15.5, lon: 32.5, name: "Sudan" },

  // SU - Egypt
  SU: { lat: 27.0, lon: 30.0, name: "Egypt" },

  // T5 - Somalia
  T5: { lat: 5.0, lon: 46.0, name: "Somalia" },
  "6O": { lat: 5.0, lon: 46.0, name: "Somalia" },

  // TJ - Cameroon
  TJ: { lat: 6.0, lon: 12.0, name: "Cameroon" },

  // TL - Central African Republic
  TL: { lat: 6.5, lon: 20.5, name: "Central African Republic" },

  // TN - Republic of Congo
  TN: { lat: -1.0, lon: 15.0, name: "Republic of Congo" },

  // TR - Gabon
  TR: { lat: -0.5, lon: 11.5, name: "Gabon" },

  // TT - Chad
  TT: { lat: 15.0, lon: 19.0, name: "Chad" },

  // TU - Ivory Coast (Cote d'Ivoire)
  TU: { lat: 8.0, lon: -5.0, name: "Ivory Coast" },

  // TY - Benin
  TY: { lat: 9.5, lon: 2.0, name: "Benin" },

  // TZ - Mali
  TZ: { lat: 17.0, lon: -4.0, name: "Mali" },

  // V5 - Namibia
  V5: { lat: -22.0, lon: 17.0, name: "Namibia" },

  // VQ9 - Chagos (Diego Garcia)
  VQ9: { lat: -7.3, lon: 72.4, name: "Chagos" },

  // XT - Burkina Faso
  XT: { lat: 12.0, lon: -1.5, name: "Burkina Faso" },

  // Z2 - Zimbabwe
  Z2: { lat: -19.0, lon: 29.0, name: "Zimbabwe" },

  // Z8 - South Sudan
  Z8: { lat: 7.0, lon: 30.0, name: "South Sudan" },

  // ZD7 - St. Helena
  ZD7: { lat: -15.9, lon: -5.7, name: "St. Helena" },

  // ZD8 - Ascension Island
  ZD8: { lat: -7.9, lon: -14.4, name: "Ascension Island" },

  // ZD9 - Tristan da Cunha
  ZD9: { lat: -37.1, lon: -12.3, name: "Tristan da Cunha" },

  // ZS - South Africa
  ZS: { lat: -29.0, lon: 24.0, name: "South Africa" },
  ZR: { lat: -29.0, lon: 24.0, name: "South Africa" },
  ZT: { lat: -29.0, lon: 24.0, name: "South Africa" },
  ZU: { lat: -29.0, lon: 24.0, name: "South Africa" },

  // ZS8 - Prince Edward & Marion Islands
  ZS8: { lat: -46.9, lon: 37.8, name: "Prince Edward & Marion Islands" },

  // ==========================================================================
  // ANTARCTICA (AN)
  // ==========================================================================

  // CE9 - Antarctica (Chile)
  CE9: { lat: -62.0, lon: -58.0, name: "Antarctica (Chile)" },

  // KC4 - Antarctica (USA)
  KC4: { lat: -77.0, lon: 166.0, name: "Antarctica (USA)" },

  // VK0 - Antarctica (Australia) / Heard / Macquarie
  VK0: { lat: -66.0, lon: 110.0, name: "Antarctica (Australia)" },
  VK0H: { lat: -53.1, lon: 73.5, name: "Heard Island" },
  VK0M: { lat: -54.6, lon: 158.9, name: "Macquarie Island" },

  // VP8 - Falklands, South Georgia, South Sandwich, South Orkney, South Shetland, Antarctica
  VP8: { lat: -51.8, lon: -59.0, name: "Falkland Islands" },
  VP8G: { lat: -54.3, lon: -36.5, name: "South Georgia" },
  VP8H: { lat: -57.0, lon: -26.5, name: "South Sandwich Islands" },
  VP8O: { lat: -60.6, lon: -45.5, name: "South Orkney Islands" },
  VP8S: { lat: -62.5, lon: -60.5, name: "South Shetland Islands" },

  // ZL5 - Antarctica (New Zealand)
  ZL5: { lat: -77.9, lon: 166.7, name: "Antarctica (New Zealand)" },

  // ==========================================================================
  // ASIA (AS)
  // ==========================================================================

  // 4J - Azerbaijan
  "4J": { lat: 40.5, lon: 47.5, name: "Azerbaijan" },
  "4K": { lat: 40.5, lon: 47.5, name: "Azerbaijan" },

  // 4L - Georgia
  "4L": { lat: 42.0, lon: 43.5, name: "Georgia" },

  // 4S - Sri Lanka
  "4S": { lat: 7.0, lon: 81.0, name: "Sri Lanka" },

  // 4W - Timor-Leste
  "4W": { lat: -8.5, lon: 125.5, name: "Timor-Leste" },

  // 4X/4Z - Israel
  "4X": { lat: 31.5, lon: 35.0, name: "Israel" },
  "4Z": { lat: 31.5, lon: 35.0, name: "Israel" },

  // 5B - Cyprus
  "5B": { lat: 35.0, lon: 33.0, name: "Cyprus" },
  C4: { lat: 35.0, lon: 33.0, name: "Cyprus" },
  H2: { lat: 35.0, lon: 33.0, name: "Cyprus" },
  P3: { lat: 35.0, lon: 33.0, name: "Cyprus" },

  // 9K - Kuwait
  "9K": { lat: 29.5, lon: 47.5, name: "Kuwait" },

  // 9M - Malaysia
  "9M": { lat: 4.0, lon: 109.0, name: "Malaysia" },
  "9M2": { lat: 3.0, lon: 101.5, name: "West Malaysia" },
  "9M6": { lat: 5.5, lon: 116.0, name: "East Malaysia" },
  "9M8": { lat: 2.5, lon: 113.0, name: "East Malaysia (Sarawak)" },
  "9W": { lat: 4.0, lon: 109.0, name: "Malaysia" },

  // 9M0 - Spratly Islands
  "9M0": { lat: 9.0, lon: 114.0, name: "Spratly Islands" },

  // 9N - Nepal
  "9N": { lat: 28.0, lon: 84.0, name: "Nepal" },

  // 9V - Singapore
  "9V": { lat: 1.3, lon: 103.8, name: "Singapore" },

  // A4 - Oman
  A4: { lat: 21.0, lon: 57.0, name: "Oman" },

  // A5 - Bhutan
  A5: { lat: 27.5, lon: 90.5, name: "Bhutan" },

  // A6 - United Arab Emirates
  A6: { lat: 24.0, lon: 54.0, name: "United Arab Emirates" },
  A61: { lat: 24.0, lon: 54.0, name: "United Arab Emirates" },

  // A7 - Qatar
  A7: { lat: 25.3, lon: 51.5, name: "Qatar" },
  A71: { lat: 25.3, lon: 51.5, name: "Qatar" },

  // A9 - Bahrain
  A9: { lat: 26.0, lon: 50.5, name: "Bahrain" },
  A91: { lat: 26.0, lon: 50.5, name: "Bahrain" },

  // AP - Pakistan
  AP: { lat: 30.0, lon: 70.0, name: "Pakistan" },
  "6P": { lat: 30.0, lon: 70.0, name: "Pakistan" },
  "6Q": { lat: 30.0, lon: 70.0, name: "Pakistan" },
  "6R": { lat: 30.0, lon: 70.0, name: "Pakistan" },
  "6S": { lat: 30.0, lon: 70.0, name: "Pakistan" },

  // BS7 - Scarborough Reef
  BS7: { lat: 15.1, lon: 117.8, name: "Scarborough Reef" },

  // BV - Taiwan
  BV: { lat: 23.5, lon: 121.0, name: "Taiwan" },
  BM: { lat: 23.5, lon: 121.0, name: "Taiwan" },
  BN: { lat: 23.5, lon: 121.0, name: "Taiwan" },
  BO: { lat: 23.5, lon: 121.0, name: "Taiwan" },
  BP: { lat: 23.5, lon: 121.0, name: "Taiwan" },
  BQ: { lat: 23.5, lon: 121.0, name: "Taiwan" },
  BW: { lat: 23.5, lon: 121.0, name: "Taiwan" },
  BX: { lat: 23.5, lon: 121.0, name: "Taiwan" },

  // BV9P - Pratas Island
  BV9P: { lat: 20.7, lon: 116.7, name: "Pratas Island" },

  // BY - China
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

  // EK - Armenia
  EK: { lat: 40.0, lon: 45.0, name: "Armenia" },

  // EP - Iran
  EP: { lat: 32.0, lon: 53.0, name: "Iran" },
  EQ: { lat: 32.0, lon: 53.0, name: "Iran" },

  // EX - Kyrgyzstan
  EX: { lat: 41.0, lon: 75.0, name: "Kyrgyzstan" },

  // EY - Tajikistan
  EY: { lat: 39.0, lon: 71.0, name: "Tajikistan" },

  // EZ - Turkmenistan
  EZ: { lat: 40.0, lon: 60.0, name: "Turkmenistan" },

  // HL - South Korea
  HL: { lat: 37.0, lon: 127.5, name: "South Korea" },
  DS: { lat: 37.0, lon: 127.5, name: "South Korea" },
  DT: { lat: 37.0, lon: 127.5, name: "South Korea" },
  "6K": { lat: 37.0, lon: 127.5, name: "South Korea" },
  "6L": { lat: 37.0, lon: 127.5, name: "South Korea" },
  "6M": { lat: 37.0, lon: 127.5, name: "South Korea" },
  "6N": { lat: 37.0, lon: 127.5, name: "South Korea" },

  // HS - Thailand
  HS: { lat: 15.0, lon: 101.0, name: "Thailand" },
  E2: { lat: 15.0, lon: 101.0, name: "Thailand" },

  // HZ - Saudi Arabia
  "7Z": { lat: 24.0, lon: 45.0, name: "Saudi Arabia" },
  HZ: { lat: 24.0, lon: 45.0, name: "Saudi Arabia" },
  "8Z": { lat: 24.0, lon: 45.0, name: "Saudi Arabia" },

  // JA - Japan
  JA: { lat: 36.0, lon: 138.0, name: "Japan" },
  JD: { lat: 36.0, lon: 138.0, name: "Japan" },
  JE: { lat: 36.0, lon: 138.0, name: "Japan" },
  JF: { lat: 36.0, lon: 138.0, name: "Japan" },
  JG: { lat: 36.0, lon: 138.0, name: "Japan" },
  JH: { lat: 36.0, lon: 138.0, name: "Japan" },
  JI: { lat: 36.0, lon: 138.0, name: "Japan" },
  JJ: { lat: 36.0, lon: 138.0, name: "Japan" },
  JK: { lat: 36.0, lon: 138.0, name: "Japan" },
  JL: { lat: 36.0, lon: 138.0, name: "Japan" },
  JM: { lat: 36.0, lon: 138.0, name: "Japan" },
  JN: { lat: 36.0, lon: 138.0, name: "Japan" },
  JO: { lat: 36.0, lon: 138.0, name: "Japan" },
  JP: { lat: 36.0, lon: 138.0, name: "Japan" },
  JQ: { lat: 36.0, lon: 138.0, name: "Japan" },
  JR: { lat: 36.0, lon: 138.0, name: "Japan" },
  JS: { lat: 36.0, lon: 138.0, name: "Japan" },
  "7J": { lat: 36.0, lon: 138.0, name: "Japan" },
  "7K": { lat: 36.0, lon: 138.0, name: "Japan" },
  "7L": { lat: 36.0, lon: 138.0, name: "Japan" },
  "7M": { lat: 36.0, lon: 138.0, name: "Japan" },
  "7N": { lat: 36.0, lon: 138.0, name: "Japan" },
  "8J": { lat: 36.0, lon: 138.0, name: "Japan" },
  "8N": { lat: 36.0, lon: 138.0, name: "Japan" },

  // JD1 - Ogasawara / Minami Torishima
  JD1: { lat: 27.1, lon: 142.2, name: "Ogasawara" },

  // JT - Mongolia
  JT: { lat: 46.0, lon: 105.0, name: "Mongolia" },
  JU: { lat: 46.0, lon: 105.0, name: "Mongolia" },
  JV: { lat: 46.0, lon: 105.0, name: "Mongolia" },

  // JY - Jordan
  JY: { lat: 31.5, lon: 36.0, name: "Jordan" },

  // OD - Lebanon
  OD: { lat: 34.0, lon: 36.0, name: "Lebanon" },

  // P5 - North Korea
  P5: { lat: 40.0, lon: 127.0, name: "North Korea" },

  // S2 - Bangladesh
  S2: { lat: 24.0, lon: 90.0, name: "Bangladesh" },

  // TA - Turkey
  TA: { lat: 39.0, lon: 35.0, name: "Turkey" },
  TB: { lat: 39.0, lon: 35.0, name: "Turkey" },
  TC: { lat: 39.0, lon: 35.0, name: "Turkey" },
  YM: { lat: 39.0, lon: 35.0, name: "Turkey" },

  // T6 - Afghanistan
  T6: { lat: 34.0, lon: 66.0, name: "Afghanistan" },
  YA: { lat: 34.0, lon: 66.0, name: "Afghanistan" },

  // UK - Uzbekistan
  UK: { lat: 41.0, lon: 64.0, name: "Uzbekistan" },

  // UN - Kazakhstan
  UN: { lat: 48.0, lon: 67.0, name: "Kazakhstan" },
  UP: { lat: 48.0, lon: 67.0, name: "Kazakhstan" },
  UQ: { lat: 48.0, lon: 67.0, name: "Kazakhstan" },

  // VR - Hong Kong
  VR2: { lat: 22.3, lon: 114.2, name: "Hong Kong" },
  VR: { lat: 22.3, lon: 114.2, name: "Hong Kong" },

  // VU - India
  VU: { lat: 20.0, lon: 77.0, name: "India" },
  AT: { lat: 20.0, lon: 77.0, name: "India" },
  "8T": { lat: 20.0, lon: 77.0, name: "India" },
  "8U": { lat: 20.0, lon: 77.0, name: "India" },
  "8V": { lat: 20.0, lon: 77.0, name: "India" },
  "8W": { lat: 20.0, lon: 77.0, name: "India" },
  "8X": { lat: 20.0, lon: 77.0, name: "India" },
  "8Y": { lat: 20.0, lon: 77.0, name: "India" },

  // VU4 - Andaman & Nicobar Islands
  VU4: { lat: 12.0, lon: 93.0, name: "Andaman & Nicobar Islands" },

  // VU7 - Lakshadweep Islands
  VU7: { lat: 10.0, lon: 73.0, name: "Lakshadweep Islands" },

  // XU - Cambodia
  XU: { lat: 12.5, lon: 105.0, name: "Cambodia" },

  // XW - Laos
  XW: { lat: 18.0, lon: 105.0, name: "Laos" },

  // XV/3W - Vietnam
  XV: { lat: 16.0, lon: 108.0, name: "Vietnam" },
  "3W": { lat: 16.0, lon: 108.0, name: "Vietnam" },

  // XX9 - Macao
  XX9: { lat: 22.2, lon: 113.5, name: "Macao" },

  // XZ - Myanmar (Burma)
  XZ: { lat: 22.0, lon: 96.0, name: "Myanmar" },

  // YI - Iraq
  YI: { lat: 33.0, lon: 44.0, name: "Iraq" },

  // YK - Syria
  YK: { lat: 35.0, lon: 38.0, name: "Syria" },

  // ==========================================================================
  // EUROPE (EU)
  // ==========================================================================

  // 1A - Sovereign Military Order of Malta
  "1A": { lat: 41.9, lon: 12.5, name: "Sov. Military Order of Malta" },

  // 3A - Monaco
  "3A": { lat: 43.7, lon: 7.4, name: "Monaco" },

  // 4O - Montenegro
  "4O": { lat: 42.5, lon: 19.3, name: "Montenegro" },

  // 4U - United Nations
  "4U1V": { lat: 46.2, lon: 6.1, name: "UN Geneva" },
  "4U1I": { lat: 45.4, lon: 12.3, name: "ITU Geneva" },
  "4U": { lat: 46.2, lon: 6.1, name: "United Nations" },

  // 9A - Croatia
  "9A": { lat: 45.0, lon: 16.0, name: "Croatia" },

  // 9H - Malta
  "9H": { lat: 35.9, lon: 14.4, name: "Malta" },

  // C3 - Andorra
  C3: { lat: 42.5, lon: 1.5, name: "Andorra" },

  // CT - Portugal
  CT: { lat: 39.5, lon: -8.0, name: "Portugal" },
  CS: { lat: 39.5, lon: -8.0, name: "Portugal" },
  CQ: { lat: 39.5, lon: -8.0, name: "Portugal" },
  CR: { lat: 39.5, lon: -8.0, name: "Portugal" },

  // CU - Azores
  CU: { lat: 37.7, lon: -25.5, name: "Azores" },

  // DL - Germany
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

  // E7 - Bosnia-Herzegovina
  E7: { lat: 44.0, lon: 18.0, name: "Bosnia-Herzegovina" },

  // EA - Spain
  EA: { lat: 40.0, lon: -4.0, name: "Spain" },
  EB: { lat: 40.0, lon: -4.0, name: "Spain" },
  EC: { lat: 40.0, lon: -4.0, name: "Spain" },
  ED: { lat: 40.0, lon: -4.0, name: "Spain" },
  EE: { lat: 40.0, lon: -4.0, name: "Spain" },
  EF: { lat: 40.0, lon: -4.0, name: "Spain" },
  EG: { lat: 40.0, lon: -4.0, name: "Spain" },
  EH: { lat: 40.0, lon: -4.0, name: "Spain" },
  AM: { lat: 40.0, lon: -4.0, name: "Spain" },
  AN: { lat: 40.0, lon: -4.0, name: "Spain" },
  AO: { lat: 40.0, lon: -4.0, name: "Spain" },

  // EA6 - Balearic Islands
  EA6: { lat: 39.6, lon: 2.9, name: "Balearic Islands" },
  EB6: { lat: 39.6, lon: 2.9, name: "Balearic Islands" },
  EC6: { lat: 39.6, lon: 2.9, name: "Balearic Islands" },

  // EI - Ireland
  EI: { lat: 53.0, lon: -8.0, name: "Ireland" },
  EJ: { lat: 53.0, lon: -8.0, name: "Ireland" },

  // ER - Moldova
  ER: { lat: 47.0, lon: 29.0, name: "Moldova" },

  // ES - Estonia
  ES: { lat: 59.0, lon: 25.0, name: "Estonia" },

  // F - France
  F: { lat: 46.5, lon: 2.5, name: "France" },

  // G - England
  G: { lat: 52.0, lon: -1.0, name: "England" },
  M: { lat: 52.0, lon: -1.0, name: "England" },
  "2E": { lat: 52.0, lon: -1.0, name: "England" },

  // GD - Isle of Man
  GD: { lat: 54.2, lon: -4.5, name: "Isle of Man" },
  MD: { lat: 54.2, lon: -4.5, name: "Isle of Man" },
  "2D": { lat: 54.2, lon: -4.5, name: "Isle of Man" },
  GT: { lat: 54.2, lon: -4.5, name: "Isle of Man" },

  // GI - Northern Ireland
  GI: { lat: 54.6, lon: -6.0, name: "Northern Ireland" },
  MI: { lat: 54.6, lon: -6.0, name: "Northern Ireland" },
  "2I": { lat: 54.6, lon: -6.0, name: "Northern Ireland" },

  // GJ - Jersey
  GJ: { lat: 49.2, lon: -2.1, name: "Jersey" },
  MJ: { lat: 49.2, lon: -2.1, name: "Jersey" },
  "2J": { lat: 49.2, lon: -2.1, name: "Jersey" },

  // GM - Scotland
  GM: { lat: 56.5, lon: -4.0, name: "Scotland" },
  MM: { lat: 56.5, lon: -4.0, name: "Scotland" },
  "2M": { lat: 56.5, lon: -4.0, name: "Scotland" },

  // GU - Guernsey
  GU: { lat: 49.5, lon: -2.5, name: "Guernsey" },
  MU: { lat: 49.5, lon: -2.5, name: "Guernsey" },
  "2U": { lat: 49.5, lon: -2.5, name: "Guernsey" },
  GP: { lat: 49.5, lon: -2.5, name: "Guernsey" },

  // GW - Wales
  GW: { lat: 52.0, lon: -3.5, name: "Wales" },
  MW: { lat: 52.0, lon: -3.5, name: "Wales" },
  "2W": { lat: 52.0, lon: -3.5, name: "Wales" },

  // HA - Hungary
  HA: { lat: 47.0, lon: 19.5, name: "Hungary" },
  HG: { lat: 47.0, lon: 19.5, name: "Hungary" },

  // HB - Switzerland
  HB9: { lat: 47.0, lon: 8.0, name: "Switzerland" },
  HB3: { lat: 47.0, lon: 8.0, name: "Switzerland" },
  HE: { lat: 47.0, lon: 8.0, name: "Switzerland" },
  HB: { lat: 47.0, lon: 8.0, name: "Switzerland" },

  // HB0 - Liechtenstein
  HB0: { lat: 47.1, lon: 9.5, name: "Liechtenstein" },

  // HV - Vatican City
  HV: { lat: 41.9, lon: 12.5, name: "Vatican City" },

  // I - Italy
  I: { lat: 42.5, lon: 12.5, name: "Italy" },
  IK: { lat: 42.5, lon: 12.5, name: "Italy" },
  IN: { lat: 42.5, lon: 12.5, name: "Italy" },
  IO: { lat: 42.5, lon: 12.5, name: "Italy" },
  IQ: { lat: 42.5, lon: 12.5, name: "Italy" },
  IR: { lat: 42.5, lon: 12.5, name: "Italy" },
  IU: { lat: 42.5, lon: 12.5, name: "Italy" },
  IW: { lat: 42.5, lon: 12.5, name: "Italy" },
  IZ: { lat: 42.5, lon: 12.5, name: "Italy" },

  // IS - Sardinia
  IS: { lat: 40.0, lon: 9.0, name: "Sardinia" },
  IS0: { lat: 40.0, lon: 9.0, name: "Sardinia" },
  IM0: { lat: 40.0, lon: 9.0, name: "Sardinia" },

  // JW - Svalbard
  JW: { lat: 78.0, lon: 16.0, name: "Svalbard" },

  // JX - Jan Mayen
  JX: { lat: 71.0, lon: -8.3, name: "Jan Mayen" },

  // LA - Norway
  LA: { lat: 62.0, lon: 10.0, name: "Norway" },
  LB: { lat: 62.0, lon: 10.0, name: "Norway" },
  LC: { lat: 62.0, lon: 10.0, name: "Norway" },
  LD: { lat: 62.0, lon: 10.0, name: "Norway" },
  LE: { lat: 62.0, lon: 10.0, name: "Norway" },
  LF: { lat: 62.0, lon: 10.0, name: "Norway" },
  LG: { lat: 62.0, lon: 10.0, name: "Norway" },
  LH: { lat: 62.0, lon: 10.0, name: "Norway" },
  LI: { lat: 62.0, lon: 10.0, name: "Norway" },
  LJ: { lat: 62.0, lon: 10.0, name: "Norway" },
  LK: { lat: 62.0, lon: 10.0, name: "Norway" },
  LL: { lat: 62.0, lon: 10.0, name: "Norway" },
  LM: { lat: 62.0, lon: 10.0, name: "Norway" },
  LN: { lat: 62.0, lon: 10.0, name: "Norway" },

  // LX - Luxembourg
  LX: { lat: 49.8, lon: 6.1, name: "Luxembourg" },

  // LY - Lithuania
  LY: { lat: 55.0, lon: 24.0, name: "Lithuania" },

  // LZ - Bulgaria
  LZ: { lat: 43.0, lon: 25.0, name: "Bulgaria" },

  // OE - Austria
  OE: { lat: 47.5, lon: 14.0, name: "Austria" },

  // OH - Finland
  OH: { lat: 64.0, lon: 26.0, name: "Finland" },
  OF: { lat: 64.0, lon: 26.0, name: "Finland" },
  OG: { lat: 64.0, lon: 26.0, name: "Finland" },
  OI: { lat: 64.0, lon: 26.0, name: "Finland" },

  // OH0 - Aland Islands
  OH0: { lat: 60.2, lon: 20.0, name: "Aland Islands" },
  OF0: { lat: 60.2, lon: 20.0, name: "Aland Islands" },
  OG0: { lat: 60.2, lon: 20.0, name: "Aland Islands" },

  // OJ0 - Market Reef
  OJ0: { lat: 60.3, lon: 19.1, name: "Market Reef" },

  // OK - Czech Republic
  OK: { lat: 50.0, lon: 15.0, name: "Czech Republic" },
  OL: { lat: 50.0, lon: 15.0, name: "Czech Republic" },

  // OM - Slovakia
  OM: { lat: 48.7, lon: 19.5, name: "Slovakia" },

  // ON - Belgium
  ON: { lat: 50.5, lon: 4.5, name: "Belgium" },
  OO: { lat: 50.5, lon: 4.5, name: "Belgium" },
  OP: { lat: 50.5, lon: 4.5, name: "Belgium" },
  OQ: { lat: 50.5, lon: 4.5, name: "Belgium" },
  OR: { lat: 50.5, lon: 4.5, name: "Belgium" },
  OS: { lat: 50.5, lon: 4.5, name: "Belgium" },
  OT: { lat: 50.5, lon: 4.5, name: "Belgium" },

  // OY - Faroe Islands
  OY: { lat: 62.0, lon: -7.0, name: "Faroe Islands" },

  // OZ - Denmark
  OZ: { lat: 56.0, lon: 10.0, name: "Denmark" },
  OU: { lat: 56.0, lon: 10.0, name: "Denmark" },
  OV: { lat: 56.0, lon: 10.0, name: "Denmark" },
  OW: { lat: 56.0, lon: 10.0, name: "Denmark" },
  OX: { lat: 56.0, lon: 10.0, name: "Denmark" },
  "5P": { lat: 56.0, lon: 10.0, name: "Denmark" },
  "5Q": { lat: 56.0, lon: 10.0, name: "Denmark" },

  // PA - Netherlands
  PA: { lat: 52.0, lon: 5.5, name: "Netherlands" },
  PB: { lat: 52.0, lon: 5.5, name: "Netherlands" },
  PC: { lat: 52.0, lon: 5.5, name: "Netherlands" },
  PD: { lat: 52.0, lon: 5.5, name: "Netherlands" },
  PE: { lat: 52.0, lon: 5.5, name: "Netherlands" },
  PF: { lat: 52.0, lon: 5.5, name: "Netherlands" },
  PG: { lat: 52.0, lon: 5.5, name: "Netherlands" },
  PH: { lat: 52.0, lon: 5.5, name: "Netherlands" },
  PI: { lat: 52.0, lon: 5.5, name: "Netherlands" },

  // R1FJ - Franz Josef Land
  R1FJ: { lat: 80.5, lon: 53.0, name: "Franz Josef Land" },

  // R1MV - Malyj Vysotskij Island
  R1MV: { lat: 60.6, lon: 28.1, name: "Malyj Vysotskij Island" },

  // S5 - Slovenia
  S5: { lat: 46.0, lon: 15.0, name: "Slovenia" },

  // SM - Sweden
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
  "7S": { lat: 62.0, lon: 15.0, name: "Sweden" },
  "8S": { lat: 62.0, lon: 15.0, name: "Sweden" },

  // SP - Poland
  SP: { lat: 52.0, lon: 19.0, name: "Poland" },
  SQ: { lat: 52.0, lon: 19.0, name: "Poland" },
  SO: { lat: 52.0, lon: 19.0, name: "Poland" },
  SN: { lat: 52.0, lon: 19.0, name: "Poland" },
  SR: { lat: 52.0, lon: 19.0, name: "Poland" },
  "3Z": { lat: 52.0, lon: 19.0, name: "Poland" },
  HF: { lat: 52.0, lon: 19.0, name: "Poland" },

  // SV - Greece
  SV: { lat: 39.0, lon: 22.0, name: "Greece" },
  SW: { lat: 39.0, lon: 22.0, name: "Greece" },
  SX: { lat: 39.0, lon: 22.0, name: "Greece" },
  SY: { lat: 39.0, lon: 22.0, name: "Greece" },
  SZ: { lat: 39.0, lon: 22.0, name: "Greece" },
  J4: { lat: 39.0, lon: 22.0, name: "Greece" },

  // SV5 - Dodecanese
  SV5: { lat: 36.4, lon: 28.2, name: "Dodecanese" },

  // SV9 - Crete
  SV9: { lat: 35.2, lon: 24.9, name: "Crete" },

  // SV/A - Mount Athos
  "SV/A": { lat: 40.2, lon: 24.3, name: "Mount Athos" },

  // T7 - San Marino
  T7: { lat: 43.9, lon: 12.5, name: "San Marino" },

  // T9 - Bosnia-Herzegovina
  T9: { lat: 44.0, lon: 18.0, name: "Bosnia-Herzegovina" },

  // TF - Iceland
  TF: { lat: 65.0, lon: -18.0, name: "Iceland" },

  // TK - Corsica
  TK: { lat: 42.0, lon: 9.0, name: "Corsica" },

  // UA - European Russia
  UA: { lat: 55.75, lon: 37.6, name: "European Russia" },
  UB: { lat: 55.75, lon: 37.6, name: "European Russia" },
  UC: { lat: 55.75, lon: 37.6, name: "European Russia" },
  UD: { lat: 55.75, lon: 37.6, name: "European Russia" },
  UE: { lat: 55.75, lon: 37.6, name: "European Russia" },
  UF: { lat: 55.75, lon: 37.6, name: "European Russia" },
  UG: { lat: 55.75, lon: 37.6, name: "European Russia" },
  UH: { lat: 55.75, lon: 37.6, name: "European Russia" },
  UI: { lat: 55.75, lon: 37.6, name: "European Russia" },
  R: { lat: 55.75, lon: 37.6, name: "Russia" },
  RA: { lat: 55.75, lon: 37.6, name: "Russia" },
  RB: { lat: 55.75, lon: 37.6, name: "Russia" },
  RC: { lat: 55.75, lon: 37.6, name: "Russia" },
  RD: { lat: 55.75, lon: 37.6, name: "Russia" },
  RE: { lat: 55.75, lon: 37.6, name: "Russia" },
  RF: { lat: 55.75, lon: 37.6, name: "Russia" },
  RG: { lat: 55.75, lon: 37.6, name: "Russia" },
  RJ: { lat: 55.75, lon: 37.6, name: "Russia" },
  RK: { lat: 55.75, lon: 37.6, name: "Russia" },
  RL: { lat: 55.75, lon: 37.6, name: "Russia" },
  RM: { lat: 55.75, lon: 37.6, name: "Russia" },
  RN: { lat: 55.75, lon: 37.6, name: "Russia" },
  RO: { lat: 55.75, lon: 37.6, name: "Russia" },
  RP: { lat: 55.75, lon: 37.6, name: "Russia" },
  RQ: { lat: 55.75, lon: 37.6, name: "Russia" },
  RR: { lat: 55.75, lon: 37.6, name: "Russia" },
  RS: { lat: 55.75, lon: 37.6, name: "Russia" },
  RT: { lat: 55.75, lon: 37.6, name: "Russia" },
  RU: { lat: 55.75, lon: 37.6, name: "Russia" },
  RV: { lat: 55.75, lon: 37.6, name: "Russia" },
  RW: { lat: 55.75, lon: 37.6, name: "Russia" },
  RX: { lat: 55.75, lon: 37.6, name: "Russia" },
  RY: { lat: 55.75, lon: 37.6, name: "Russia" },
  RZ: { lat: 55.75, lon: 37.6, name: "Russia" },

  // UA0/UA9 - Asiatic Russia
  UA0: { lat: 62.0, lon: 130.0, name: "Asiatic Russia" },
  UA9: { lat: 60.0, lon: 75.0, name: "Asiatic Russia" },
  R0: { lat: 62.0, lon: 130.0, name: "Asiatic Russia" },
  R9: { lat: 60.0, lon: 75.0, name: "Asiatic Russia" },
  RA0: { lat: 62.0, lon: 130.0, name: "Asiatic Russia" },
  RA9: { lat: 60.0, lon: 75.0, name: "Asiatic Russia" },

  // UA2 - Kaliningrad
  UA2: { lat: 54.7, lon: 20.5, name: "Kaliningrad" },
  RA2: { lat: 54.7, lon: 20.5, name: "Kaliningrad" },
  R2F: { lat: 54.7, lon: 20.5, name: "Kaliningrad" },

  // UR - Ukraine
  UR: { lat: 49.0, lon: 32.0, name: "Ukraine" },
  US: { lat: 49.0, lon: 32.0, name: "Ukraine" },
  UT: { lat: 49.0, lon: 32.0, name: "Ukraine" },
  UU: { lat: 49.0, lon: 32.0, name: "Ukraine" },
  UV: { lat: 49.0, lon: 32.0, name: "Ukraine" },
  UW: { lat: 49.0, lon: 32.0, name: "Ukraine" },
  UX: { lat: 49.0, lon: 32.0, name: "Ukraine" },
  UY: { lat: 49.0, lon: 32.0, name: "Ukraine" },
  UZ: { lat: 49.0, lon: 32.0, name: "Ukraine" },
  EM: { lat: 49.0, lon: 32.0, name: "Ukraine" },
  EN: { lat: 49.0, lon: 32.0, name: "Ukraine" },
  EO: { lat: 49.0, lon: 32.0, name: "Ukraine" },

  // YL - Latvia
  YL: { lat: 57.0, lon: 25.0, name: "Latvia" },

  // YO - Romania
  YO: { lat: 46.0, lon: 25.0, name: "Romania" },
  YP: { lat: 46.0, lon: 25.0, name: "Romania" },
  YQ: { lat: 46.0, lon: 25.0, name: "Romania" },
  YR: { lat: 46.0, lon: 25.0, name: "Romania" },

  // YU - Serbia
  YU: { lat: 44.0, lon: 21.0, name: "Serbia" },
  YT: { lat: 44.0, lon: 21.0, name: "Serbia" },

  // Z3 - North Macedonia
  Z3: { lat: 41.5, lon: 21.5, name: "North Macedonia" },

  // Z6 - Kosovo
  Z6: { lat: 42.6, lon: 21.0, name: "Kosovo" },

  // ZA - Albania
  ZA: { lat: 41.0, lon: 20.0, name: "Albania" },

  // ZB - Gibraltar
  ZB: { lat: 36.1, lon: -5.4, name: "Gibraltar" },
  ZG: { lat: 36.1, lon: -5.4, name: "Gibraltar" },

  // ==========================================================================
  // NORTH AMERICA (NA)
  // ==========================================================================

  // 4U1UN - United Nations NYC
  "4U1UN": { lat: 40.75, lon: -73.97, name: "United Nations NYC" },

  // 6Y - Jamaica
  "6Y": { lat: 18.1, lon: -77.3, name: "Jamaica" },

  // 8P - Barbados
  "8P": { lat: 13.2, lon: -59.5, name: "Barbados" },

  // 8R - Guyana
  "8R": { lat: 5.0, lon: -59.0, name: "Guyana" },

  // 9Y - Trinidad & Tobago
  "9Y": { lat: 10.5, lon: -61.3, name: "Trinidad & Tobago" },
  "9Z": { lat: 10.5, lon: -61.3, name: "Trinidad & Tobago" },

  // C6 - Bahamas
  C6: { lat: 24.2, lon: -76.0, name: "Bahamas" },

  // CM/CO - Cuba
  CM: { lat: 22.0, lon: -79.5, name: "Cuba" },
  CO: { lat: 22.0, lon: -79.5, name: "Cuba" },
  CL: { lat: 22.0, lon: -79.5, name: "Cuba" },
  T4: { lat: 22.0, lon: -79.5, name: "Cuba" },

  // FG - Guadeloupe
  FG: { lat: 16.2, lon: -61.5, name: "Guadeloupe" },

  // FJ - St. Barthelemy
  FJ: { lat: 17.9, lon: -62.8, name: "St. Barthelemy" },

  // FM - Martinique
  FM: { lat: 14.6, lon: -61.0, name: "Martinique" },

  // FP - St. Pierre & Miquelon
  FP: { lat: 46.8, lon: -56.2, name: "St. Pierre & Miquelon" },

  // FS - St. Martin
  FS: { lat: 18.1, lon: -63.0, name: "St. Martin" },

  // HH - Haiti
  HH: { lat: 19.0, lon: -72.0, name: "Haiti" },
  "4V": { lat: 19.0, lon: -72.0, name: "Haiti" },

  // HI - Dominican Republic
  HI: { lat: 19.0, lon: -70.5, name: "Dominican Republic" },

  // HK - Colombia
  HK: { lat: 4.0, lon: -72.0, name: "Colombia" },
  HJ: { lat: 4.0, lon: -72.0, name: "Colombia" },
  "5J": { lat: 4.0, lon: -72.0, name: "Colombia" },
  "5K": { lat: 4.0, lon: -72.0, name: "Colombia" },

  // HK0 - San Andres & Providencia
  HK0: { lat: 12.5, lon: -81.7, name: "San Andres & Providencia" },
  HK0A: { lat: 12.5, lon: -81.7, name: "San Andres & Providencia" },

  // HP - Panama
  HP: { lat: 9.0, lon: -79.5, name: "Panama" },
  HO: { lat: 9.0, lon: -79.5, name: "Panama" },
  H3: { lat: 9.0, lon: -79.5, name: "Panama" },
  "3E": { lat: 9.0, lon: -79.5, name: "Panama" },
  "3F": { lat: 9.0, lon: -79.5, name: "Panama" },

  // HR - Honduras
  HR: { lat: 15.0, lon: -86.5, name: "Honduras" },
  HQ: { lat: 15.0, lon: -86.5, name: "Honduras" },

  // J3 - Grenada
  J3: { lat: 12.1, lon: -61.7, name: "Grenada" },

  // J6 - St. Lucia
  J6: { lat: 13.9, lon: -61.0, name: "St. Lucia" },

  // J7 - Dominica
  J7: { lat: 15.4, lon: -61.4, name: "Dominica" },

  // J8 - St. Vincent
  J8: { lat: 13.2, lon: -61.2, name: "St. Vincent" },

  // K - USA
  K: { lat: 39.8, lon: -98.6, name: "USA" },
  W: { lat: 39.8, lon: -98.6, name: "USA" },
  N: { lat: 39.8, lon: -98.6, name: "USA" },
  AA: { lat: 39.8, lon: -98.6, name: "USA" },
  AB: { lat: 39.8, lon: -98.6, name: "USA" },
  AC: { lat: 39.8, lon: -98.6, name: "USA" },
  AD: { lat: 39.8, lon: -98.6, name: "USA" },
  AE: { lat: 39.8, lon: -98.6, name: "USA" },
  AF: { lat: 39.8, lon: -98.6, name: "USA" },
  AG: { lat: 39.8, lon: -98.6, name: "USA" },
  AH: { lat: 39.8, lon: -98.6, name: "USA" },
  AI: { lat: 39.8, lon: -98.6, name: "USA" },
  AJ: { lat: 39.8, lon: -98.6, name: "USA" },
  AK: { lat: 39.8, lon: -98.6, name: "USA" },

  // KG4 - Guantanamo Bay
  KG4: { lat: 19.9, lon: -75.1, name: "Guantanamo Bay" },

  // KH0 - Mariana Islands
  KH0: { lat: 15.2, lon: 145.7, name: "Mariana Islands" },
  NH0: { lat: 15.2, lon: 145.7, name: "Mariana Islands" },
  WH0: { lat: 15.2, lon: 145.7, name: "Mariana Islands" },
  AH0: { lat: 15.2, lon: 145.7, name: "Mariana Islands" },

  // KH1 - Baker & Howland Islands
  KH1: { lat: 0.2, lon: -176.5, name: "Baker & Howland Islands" },

  // KH2 - Guam
  KH2: { lat: 13.4, lon: 144.8, name: "Guam" },
  NH2: { lat: 13.4, lon: 144.8, name: "Guam" },
  WH2: { lat: 13.4, lon: 144.8, name: "Guam" },
  AH2: { lat: 13.4, lon: 144.8, name: "Guam" },

  // KH3 - Johnston Island
  KH3: { lat: 16.7, lon: -169.5, name: "Johnston Island" },

  // KH4 - Midway Island
  KH4: { lat: 28.2, lon: -177.4, name: "Midway Island" },

  // KH5 - Palmyra & Jarvis Islands
  KH5: { lat: 5.9, lon: -162.1, name: "Palmyra & Jarvis Islands" },

  // KH5K - Kingman Reef
  KH5K: { lat: 6.4, lon: -162.4, name: "Kingman Reef" },

  // KH6 - Hawaii
  KH6: { lat: 21.3, lon: -157.8, name: "Hawaii" },
  NH6: { lat: 21.3, lon: -157.8, name: "Hawaii" },
  WH6: { lat: 21.3, lon: -157.8, name: "Hawaii" },
  AH6: { lat: 21.3, lon: -157.8, name: "Hawaii" },

  // KH7K - Kure Island
  KH7K: { lat: 28.4, lon: -178.3, name: "Kure Island" },

  // KH8 - American Samoa
  KH8: { lat: -14.3, lon: -170.8, name: "American Samoa" },
  NH8: { lat: -14.3, lon: -170.8, name: "American Samoa" },
  WH8: { lat: -14.3, lon: -170.8, name: "American Samoa" },
  AH8: { lat: -14.3, lon: -170.8, name: "American Samoa" },

  // KH9 - Wake Island
  KH9: { lat: 19.3, lon: 166.6, name: "Wake Island" },

  // KL - Alaska
  KL7: { lat: 64.0, lon: -153.0, name: "Alaska" },
  NL7: { lat: 64.0, lon: -153.0, name: "Alaska" },
  WL7: { lat: 64.0, lon: -153.0, name: "Alaska" },
  AL7: { lat: 64.0, lon: -153.0, name: "Alaska" },
  KL: { lat: 64.0, lon: -153.0, name: "Alaska" },
  NL: { lat: 64.0, lon: -153.0, name: "Alaska" },
  WL: { lat: 64.0, lon: -153.0, name: "Alaska" },
  AL: { lat: 64.0, lon: -153.0, name: "Alaska" },

  // KP1 - Navassa Island
  KP1: { lat: 18.4, lon: -75.0, name: "Navassa Island" },
  NP1: { lat: 18.4, lon: -75.0, name: "Navassa Island" },

  // KP2 - US Virgin Islands
  KP2: { lat: 18.3, lon: -64.9, name: "US Virgin Islands" },
  NP2: { lat: 18.3, lon: -64.9, name: "US Virgin Islands" },
  WP2: { lat: 18.3, lon: -64.9, name: "US Virgin Islands" },

  // KP4 - Puerto Rico
  KP4: { lat: 18.2, lon: -66.5, name: "Puerto Rico" },
  NP4: { lat: 18.2, lon: -66.5, name: "Puerto Rico" },
  WP4: { lat: 18.2, lon: -66.5, name: "Puerto Rico" },

  // KP5 - Desecheo Island
  KP5: { lat: 18.4, lon: -67.5, name: "Desecheo Island" },
  NP5: { lat: 18.4, lon: -67.5, name: "Desecheo Island" },

  // OX - Greenland
  OX3: { lat: 64.0, lon: -51.0, name: "Greenland" },
  XP: { lat: 64.0, lon: -51.0, name: "Greenland" },

  // PJ2 - Curacao
  PJ2: { lat: 12.2, lon: -69.0, name: "Curacao" },

  // PJ4 - Bonaire
  PJ4: { lat: 12.2, lon: -68.3, name: "Bonaire" },

  // PJ5/PJ6 - Saba & St. Eustatius
  PJ5: { lat: 17.6, lon: -63.2, name: "Saba & St. Eustatius" },
  PJ6: { lat: 17.5, lon: -63.0, name: "Saba & St. Eustatius" },

  // PJ7 - Sint Maarten
  PJ7: { lat: 18.0, lon: -63.1, name: "Sint Maarten" },

  // TG - Guatemala
  TG: { lat: 15.5, lon: -90.5, name: "Guatemala" },
  TD: { lat: 15.5, lon: -90.5, name: "Guatemala" },

  // TI - Costa Rica
  TI: { lat: 10.0, lon: -84.0, name: "Costa Rica" },
  TE: { lat: 10.0, lon: -84.0, name: "Costa Rica" },

  // TI9 - Cocos Island
  TI9: { lat: 5.5, lon: -87.0, name: "Cocos Island" },

  // V2 - Antigua & Barbuda
  V2: { lat: 17.1, lon: -61.8, name: "Antigua & Barbuda" },

  // V3 - Belize
  V3: { lat: 17.2, lon: -88.8, name: "Belize" },

  // V4 - St. Kitts & Nevis
  V4: { lat: 17.3, lon: -62.7, name: "St. Kitts & Nevis" },
  V47: { lat: 17.3, lon: -62.7, name: "St. Kitts & Nevis" },

  // VE - Canada
  VE: { lat: 56.0, lon: -106.0, name: "Canada" },
  VA: { lat: 56.0, lon: -106.0, name: "Canada" },
  VO: { lat: 47.5, lon: -52.7, name: "Canada (Newfoundland)" },
  VY: { lat: 56.0, lon: -106.0, name: "Canada" },
  CY: { lat: 44.0, lon: -64.0, name: "Canada (Sable Island)" },
  CY9: { lat: 47.0, lon: -60.0, name: "St. Paul Island" },
  CY0: { lat: 43.9, lon: -60.0, name: "Sable Island" },
  CF: { lat: 56.0, lon: -106.0, name: "Canada" },
  CG: { lat: 56.0, lon: -106.0, name: "Canada" },
  CH: { lat: 56.0, lon: -106.0, name: "Canada" },
  CI: { lat: 56.0, lon: -106.0, name: "Canada" },
  CJ: { lat: 56.0, lon: -106.0, name: "Canada" },
  CK: { lat: 56.0, lon: -106.0, name: "Canada" },

  // VP2E - Anguilla
  VP2E: { lat: 18.2, lon: -63.1, name: "Anguilla" },

  // VP2M - Montserrat
  VP2M: { lat: 16.7, lon: -62.2, name: "Montserrat" },

  // VP2V - British Virgin Islands
  VP2V: { lat: 18.4, lon: -64.6, name: "British Virgin Islands" },

  // VP5 - Turks & Caicos Islands
  VP5: { lat: 21.8, lon: -71.8, name: "Turks & Caicos Islands" },
  VQ5: { lat: 21.8, lon: -71.8, name: "Turks & Caicos Islands" },

  // VP9 - Bermuda
  VP9: { lat: 32.3, lon: -64.8, name: "Bermuda" },

  // XE - Mexico
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

  // XF4 - Revillagigedo
  XF4: { lat: 18.7, lon: -111.1, name: "Revillagigedo" },

  // YN - Nicaragua
  YN: { lat: 13.0, lon: -85.5, name: "Nicaragua" },
  HT: { lat: 13.0, lon: -85.5, name: "Nicaragua" },
  H7: { lat: 13.0, lon: -85.5, name: "Nicaragua" },

  // YS - El Salvador
  YS: { lat: 13.8, lon: -89.0, name: "El Salvador" },
  HU: { lat: 13.8, lon: -89.0, name: "El Salvador" },

  // YV - Venezuela
  YV: { lat: 8.0, lon: -66.0, name: "Venezuela" },
  YW: { lat: 8.0, lon: -66.0, name: "Venezuela" },
  YX: { lat: 8.0, lon: -66.0, name: "Venezuela" },
  YY: { lat: 8.0, lon: -66.0, name: "Venezuela" },
  "4M": { lat: 8.0, lon: -66.0, name: "Venezuela" },

  // YV0 - Aves Island
  YV0: { lat: 15.7, lon: -63.6, name: "Aves Island" },

  // ZF - Cayman Islands
  ZF: { lat: 19.3, lon: -81.2, name: "Cayman Islands" },

  // ==========================================================================
  // OCEANIA (OC)
  // ==========================================================================

  // 3D2 - Fiji
  "3D2": { lat: -18.0, lon: 178.0, name: "Fiji" },

  // 3D2/C - Conway Reef
  "3D2/C": { lat: -22.0, lon: 174.6, name: "Conway Reef" },

  // 3D2/R - Rotuma
  "3D2/R": { lat: -12.5, lon: 177.1, name: "Rotuma" },

  // 5W - Samoa
  "5W": { lat: -13.8, lon: -172.0, name: "Samoa" },

  // A3 - Tonga
  A3: { lat: -21.2, lon: -175.2, name: "Tonga" },

  // C2 - Nauru
  C2: { lat: -0.5, lon: 166.9, name: "Nauru" },

  // DU - Philippines
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

  // E5 - Cook Islands (North & South)
  E5: { lat: -21.2, lon: -159.8, name: "Cook Islands" },
  E51: { lat: -21.2, lon: -159.8, name: "South Cook Islands" },
  E52: { lat: -10.0, lon: -161.0, name: "North Cook Islands" },

  // FK - New Caledonia
  FK: { lat: -21.5, lon: 165.5, name: "New Caledonia" },

  // FO - French Polynesia
  FO: { lat: -17.5, lon: -149.5, name: "French Polynesia" },
  "FO/A": { lat: -23.0, lon: -151.0, name: "Austral Islands" },
  "FO/M": { lat: -9.0, lon: -140.0, name: "Marquesas Islands" },

  // FO/C - Clipperton Island
  "FO/C": { lat: 10.3, lon: -109.2, name: "Clipperton Island" },

  // FW - Wallis & Futuna
  FW: { lat: -13.3, lon: -176.2, name: "Wallis & Futuna" },

  // H4 - Solomon Islands
  H4: { lat: -9.0, lon: 160.0, name: "Solomon Islands" },

  // H40 - Temotu Province
  H40: { lat: -10.7, lon: 165.8, name: "Temotu Province" },

  // P2 - Papua New Guinea
  P2: { lat: -6.0, lon: 147.0, name: "Papua New Guinea" },

  // T2 - Tuvalu
  T2: { lat: -8.5, lon: 179.2, name: "Tuvalu" },

  // T3 - Kiribati (Gilbert/Phoenix/Line)
  T3: { lat: 1.0, lon: 173.0, name: "Kiribati" },
  T30: { lat: 1.0, lon: 173.0, name: "Western Kiribati" },
  T31: { lat: -4.0, lon: -171.0, name: "Central Kiribati" },
  T32: { lat: 2.0, lon: -157.0, name: "Eastern Kiribati" },
  T33: { lat: -0.9, lon: 169.5, name: "Banaba Island" },

  // T8 - Palau
  T8: { lat: 7.5, lon: 134.5, name: "Palau" },

  // V6 - Micronesia
  V6: { lat: 7.0, lon: 158.0, name: "Micronesia" },

  // V7 - Marshall Islands
  V7: { lat: 9.0, lon: 168.0, name: "Marshall Islands" },

  // VK - Australia
  VK: { lat: -25.0, lon: 135.0, name: "Australia" },
  AX: { lat: -25.0, lon: 135.0, name: "Australia" },

  // VK9C - Cocos (Keeling) Islands
  VK9C: { lat: -12.2, lon: 96.8, name: "Cocos (Keeling) Islands" },

  // VK9L - Lord Howe Island
  VK9L: { lat: -31.5, lon: 159.1, name: "Lord Howe Island" },

  // VK9N - Norfolk Island
  VK9N: { lat: -29.0, lon: 168.0, name: "Norfolk Island" },

  // VK9W - Willis Island
  VK9W: { lat: -16.3, lon: 149.9, name: "Willis Island" },

  // VK9X - Christmas Island
  VK9X: { lat: -10.4, lon: 105.7, name: "Christmas Island" },

  // VP6 - Pitcairn Island
  VP6: { lat: -25.1, lon: -130.1, name: "Pitcairn Island" },
  VP6D: { lat: -24.4, lon: -128.3, name: "Ducie Island" },

  // YB - Indonesia
  YB: { lat: -2.0, lon: 118.0, name: "Indonesia" },
  YC: { lat: -2.0, lon: 118.0, name: "Indonesia" },
  YD: { lat: -2.0, lon: 118.0, name: "Indonesia" },
  YE: { lat: -2.0, lon: 118.0, name: "Indonesia" },
  YF: { lat: -2.0, lon: 118.0, name: "Indonesia" },
  YG: { lat: -2.0, lon: 118.0, name: "Indonesia" },
  YH: { lat: -2.0, lon: 118.0, name: "Indonesia" },

  // YJ - Vanuatu
  YJ: { lat: -17.7, lon: 168.3, name: "Vanuatu" },

  // ZK3 - Tokelau
  ZK3: { lat: -9.2, lon: -171.8, name: "Tokelau" },

  // ZL - New Zealand
  ZL: { lat: -41.0, lon: 174.0, name: "New Zealand" },
  ZM: { lat: -41.0, lon: 174.0, name: "New Zealand" },

  // ZL7 - Chatham Islands
  ZL7: { lat: -44.0, lon: -176.5, name: "Chatham Islands" },

  // ZL8 - Kermadec Islands
  ZL8: { lat: -29.3, lon: -177.9, name: "Kermadec Islands" },

  // ZL9 - Auckland & Campbell Islands
  ZL9: { lat: -52.5, lon: 169.0, name: "Auckland & Campbell Islands" },

  // ==========================================================================
  // SOUTH AMERICA (SA)
  // ==========================================================================

  // CE - Chile
  CE: { lat: -33.0, lon: -70.5, name: "Chile" },
  CA: { lat: -33.0, lon: -70.5, name: "Chile" },
  CB: { lat: -33.0, lon: -70.5, name: "Chile" },
  CC: { lat: -33.0, lon: -70.5, name: "Chile" },
  CD: { lat: -33.0, lon: -70.5, name: "Chile" },
  XQ: { lat: -33.0, lon: -70.5, name: "Chile" },
  XR: { lat: -33.0, lon: -70.5, name: "Chile" },
  "3G": { lat: -33.0, lon: -70.5, name: "Chile" },

  // CE0Y - Easter Island
  CE0Y: { lat: -27.1, lon: -109.4, name: "Easter Island" },

  // CE0Z - Juan Fernandez Islands
  CE0Z: { lat: -33.6, lon: -78.8, name: "Juan Fernandez Islands" },

  // CP - Bolivia
  CP: { lat: -17.0, lon: -65.0, name: "Bolivia" },

  // CX - Uruguay
  CX: { lat: -33.0, lon: -56.0, name: "Uruguay" },
  CV: { lat: -33.0, lon: -56.0, name: "Uruguay" },
  CW: { lat: -33.0, lon: -56.0, name: "Uruguay" },

  // HC - Ecuador
  HC: { lat: -1.0, lon: -78.0, name: "Ecuador" },
  HD: { lat: -1.0, lon: -78.0, name: "Ecuador" },

  // HC8 - Galapagos Islands
  HC8: { lat: -0.9, lon: -89.6, name: "Galapagos Islands" },

  // LU - Argentina
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

  // OA - Peru
  OA: { lat: -10.0, lon: -76.0, name: "Peru" },
  OB: { lat: -10.0, lon: -76.0, name: "Peru" },
  OC: { lat: -10.0, lon: -76.0, name: "Peru" },
  "4T": { lat: -10.0, lon: -76.0, name: "Peru" },

  // PY - Brazil
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

  // PY0F - Fernando de Noronha
  PY0F: { lat: -3.9, lon: -32.4, name: "Fernando de Noronha" },

  // PY0S - St. Peter & St. Paul Rocks
  PY0S: { lat: 0.9, lon: -29.3, name: "St. Peter & St. Paul Rocks" },

  // PY0T - Trindade & Martim Vaz
  PY0T: { lat: -20.5, lon: -29.3, name: "Trindade & Martim Vaz" },

  // ZP - Paraguay
  ZP: { lat: -23.0, lon: -58.0, name: "Paraguay" },
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
 * @param enableDebug - Optional flag to enable debug logging for failed lookups
 * @returns PrefixLocation or null if no match found
 */
export function getLocationFromPrefix(
  prefix: string,
  enableDebug: boolean = false,
): PrefixLocation | null {
  if (!prefix) {
    return null;
  }

  const upperPrefix = prefix.toUpperCase();

  // Try exact match first (for longer prefixes like 'HB9', 'KP4', 'EA6', 'VK9X')
  if (PREFIX_LOCATIONS[upperPrefix]) {
    return PREFIX_LOCATIONS[upperPrefix];
  }

  // Try progressively shorter prefixes for more specific matches first
  // For a prefix like "VK9XYZ", try "VK9XY", "VK9X", "VK9", "VK", "V"
  for (let len = upperPrefix.length - 1; len >= 1; len--) {
    const shortPrefix = upperPrefix.slice(0, len);
    if (PREFIX_LOCATIONS[shortPrefix]) {
      return PREFIX_LOCATIONS[shortPrefix];
    }
  }

  // Log failed lookups in development mode for debugging
  if (enableDebug && process.env.NODE_ENV === "development") {
    console.warn(`[RBN] Failed to resolve location for prefix: ${prefix}`);
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

  // Handle special prefixes with numbers in them (e.g., HB9, EA6, KP4, VK9X)
  // These typically have 2-3 letters followed by a digit, optionally followed by more letters
  const specialPrefixMatch = baseCall.match(/^([A-Z]{1,2}\d[A-Z]?)/);
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
