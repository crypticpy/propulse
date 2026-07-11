/**
 * CQ Zones Database for WAZ (Worked All Zones) Award Tracking
 *
 * Contains all 40 CQ (CQ Magazine) zones used for the WAZ award.
 * Each zone covers a specific geographic region of the world.
 */

export interface CQZone {
  /** Zone number (1-40) */
  zone: number;
  /** Geographic description of the zone */
  description: string;
  /** Sample callsign prefixes commonly found in this zone */
  prefixes: string[];
}

/**
 * All 40 CQ zones with descriptions and sample prefixes
 */
export const CQ_ZONES: CQZone[] = [
  {
    zone: 1,
    description: "Northwestern North America (Alaska, Yukon, NWT)",
    prefixes: ["KL7", "VY1", "VE8"],
  },
  {
    zone: 2,
    description: "Northeastern North America (Labrador, Quebec)",
    prefixes: ["VO1", "VO2", "VE2"],
  },
  {
    zone: 3,
    description: "Western North America (BC, Alberta, Washington, Oregon)",
    prefixes: ["VE6", "VE7", "W7", "K7"],
  },
  {
    zone: 4,
    description:
      "Central North America (Manitoba, Saskatchewan, Montana, Dakotas)",
    prefixes: ["VE4", "VE5", "K0", "W0"],
  },
  {
    zone: 5,
    description: "Eastern North America (Ontario, Quebec, NY, New England)",
    prefixes: ["VE3", "VE2", "W1", "W2", "W3", "K1", "K2", "K3"],
  },
  {
    zone: 6,
    description: "Mexico & Central America",
    prefixes: ["XE", "TG", "HR", "YS", "TI", "HP", "YN"],
  },
  {
    zone: 7,
    description: "Central America & Northern South America",
    prefixes: ["HK", "YV", "8R", "PZ"],
  },
  {
    zone: 8,
    description: "Caribbean & Gulf of Mexico",
    prefixes: ["KP4", "KP2", "VP2", "VP5", "6Y", "HI", "HH", "CM", "C6", "ZF"],
  },
  {
    zone: 9,
    description: "Northern South America (Venezuela, Colombia)",
    prefixes: ["YV", "HK", "PZ", "8R", "9Y"],
  },
  {
    zone: 10,
    description: "Western South America (Peru, Ecuador, Bolivia)",
    prefixes: ["OA", "HC", "CP"],
  },
  {
    zone: 11,
    description: "Central South America (Brazil)",
    prefixes: ["PY", "PP", "PU", "ZP"],
  },
  {
    zone: 12,
    description: "Southern South America (Chile, Argentina)",
    prefixes: ["CE", "LU"],
  },
  {
    zone: 13,
    description: "Extreme Southern South America & Falklands",
    prefixes: ["LU", "CE", "VP8", "CX"],
  },
  {
    zone: 14,
    description: "Western Europe (UK, Ireland, Scandinavia, Benelux)",
    prefixes: [
      "G",
      "GI",
      "GM",
      "GW",
      "EI",
      "LA",
      "SM",
      "OZ",
      "PA",
      "ON",
      "LX",
      "F",
    ],
  },
  {
    zone: 15,
    description:
      "Central Europe (Germany, Austria, Switzerland, Italy, Baltic)",
    prefixes: [
      "DL",
      "OE",
      "HB",
      "I",
      "9A",
      "S5",
      "9H",
      "OH",
      "ES",
      "YL",
      "LY",
      "SP",
      "OK",
      "OM",
      "HA",
    ],
  },
  {
    zone: 16,
    description: "Eastern Europe (Ukraine, Belarus, European Russia)",
    prefixes: ["UA", "UR", "EU", "ER"],
  },
  {
    zone: 17,
    description: "Central Asia (Kazakhstan, Uzbekistan, Kyrgyzstan)",
    prefixes: ["UN", "UK", "EX", "EY", "EZ"],
  },
  {
    zone: 18,
    description: "Arctic regions (Svalbard, Franz Josef Land)",
    prefixes: ["JW", "RI1F"],
  },
  {
    zone: 19,
    description: "Northern Asiatic Russia (Siberia)",
    prefixes: ["UA0", "RA0", "R0"],
  },
  {
    zone: 20,
    description: "Mediterranean & Middle East (Greece, Turkey, Cyprus, Israel)",
    prefixes: ["SV", "TA", "5B", "4X", "JY", "OD", "YK"],
  },
  {
    zone: 21,
    description: "Middle East & Arabian Peninsula",
    prefixes: [
      "HZ",
      "A4",
      "A6",
      "A7",
      "A9",
      "9K",
      "YI",
      "EP",
      "4J",
      "4L",
      "EK",
    ],
  },
  {
    zone: 22,
    description: "South Asia (India, Nepal, Bangladesh, Sri Lanka)",
    prefixes: ["VU", "9N", "S2", "4S", "8Q"],
  },
  {
    zone: 23,
    description: "Central Asia (Mongolia, Western China)",
    prefixes: ["JT", "BY"],
  },
  {
    zone: 24,
    description: "Eastern Asia (China, Taiwan, Hong Kong, Macao)",
    prefixes: ["BY", "BV", "VR", "XX9"],
  },
  {
    zone: 25,
    description: "Japan & Korea",
    prefixes: ["JA", "HL", "P5"],
  },
  {
    zone: 26,
    description: "Southeast Asia (Thailand, Vietnam, Myanmar, Cambodia, Laos)",
    prefixes: ["HS", "XV", "XZ", "XU", "XW"],
  },
  {
    zone: 27,
    description: "Philippines & Marianas",
    prefixes: ["DU", "KH0", "KH2", "T8", "V6"],
  },
  {
    zone: 28,
    description: "Indonesia, Malaysia, Singapore, Papua New Guinea",
    prefixes: ["YB", "9M", "9V", "V8", "P2"],
  },
  {
    zone: 29,
    description: "Western Australia & Cocos/Christmas Islands",
    prefixes: ["VK6", "VK9C", "VK9X"],
  },
  {
    zone: 30,
    description: "Eastern Australia",
    prefixes: ["VK2", "VK3", "VK4", "VK5", "VK7", "VK8"],
  },
  {
    zone: 31,
    description: "Central Pacific (Hawaii, Wake, Marshall Islands)",
    prefixes: ["KH6", "KH7", "KH9", "V7", "T30", "T31"],
  },
  {
    zone: 32,
    description: "South Pacific (New Zealand, Fiji, Samoa, French Polynesia)",
    prefixes: ["ZL", "3D2", "5W", "A3", "FO", "ZK", "FK"],
  },
  {
    zone: 33,
    description: "Northwest Africa (Morocco, Canary Islands, Western Sahara)",
    prefixes: ["CN", "EA8", "EA9", "S0", "3V"],
  },
  {
    zone: 34,
    description: "Northeast Africa (Egypt, Sudan, Libya)",
    prefixes: ["SU", "ST", "Z8", "5A"],
  },
  {
    zone: 35,
    description: "West Africa (Nigeria, Ghana, Senegal, etc.)",
    prefixes: [
      "5N",
      "9G",
      "6W",
      "5T",
      "5U",
      "5V",
      "TU",
      "EL",
      "9L",
      "C5",
      "TZ",
      "XT",
      "TY",
      "3X",
      "J5",
    ],
  },
  {
    zone: 36,
    description: "Central Africa (Congo, Cameroon, Gabon, etc.)",
    prefixes: ["9Q", "TN", "TR", "TJ", "TL", "TT", "3C", "D2", "9U", "9X"],
  },
  {
    zone: 37,
    description: "East Africa (Kenya, Tanzania, Ethiopia, etc.)",
    prefixes: ["5Z", "5H", "ET", "E3", "J2", "7Q", "C9"],
  },
  {
    zone: 38,
    description: "Southern Africa (South Africa, Namibia, Botswana, etc.)",
    prefixes: ["ZS", "V5", "A2", "7P", "3DA", "Z2", "9J"],
  },
  {
    zone: 39,
    description: "Indian Ocean (Madagascar, Mauritius, Reunion, Seychelles)",
    prefixes: ["5R", "3B8", "FR", "S7", "VQ9", "FT"],
  },
  {
    zone: 40,
    description: "Arctic & North Atlantic (Greenland, Iceland, Jan Mayen)",
    prefixes: ["OX", "TF", "JX"],
  },
];

/**
 * Zone lookup map by number
 */
const ZONE_BY_NUMBER: Map<number, CQZone> = new Map(
  CQ_ZONES.map((zone) => [zone.zone, zone]),
);

/**
 * Get a CQ zone by its number
 *
 * @param zoneNumber - Zone number (1-40)
 * @returns CQZone or null if not found
 */
export function getZoneByNumber(zoneNumber: number): CQZone | null {
  return ZONE_BY_NUMBER.get(zoneNumber) || null;
}

/**
 * Get zone from a callsign prefix
 * Note: This is an approximation; actual zone depends on station location
 *
 * @param prefix - Callsign prefix
 * @returns Zone number or null if not determined
 */
export function getZoneFromPrefix(prefix: string): number | null {
  if (!prefix) return null;

  const upperPrefix = prefix.toUpperCase();

  // Search through zones for matching prefix
  for (const zone of CQ_ZONES) {
    for (const zonePrefix of zone.prefixes) {
      if (
        upperPrefix.startsWith(zonePrefix) ||
        zonePrefix.startsWith(upperPrefix)
      ) {
        return zone.zone;
      }
    }
  }

  return null;
}

/**
 * Get all zones as an array of zone numbers
 *
 * @returns Array of zone numbers [1, 2, 3, ..., 40]
 */
export function getAllZoneNumbers(): number[] {
  return CQ_ZONES.map((z) => z.zone);
}

/**
 * Total number of CQ zones (for WAZ award)
 */
export const TOTAL_ZONES = 40;

/**
 * ITU Zone Database (for reference)
 * ITU zones are different from CQ zones and used for different purposes
 */
export interface ITUZone {
  /** Zone number (1-90) */
  zone: number;
  /** Geographic description */
  description: string;
}

/**
 * Total number of ITU zones
 */
export const TOTAL_ITU_ZONES = 90;
