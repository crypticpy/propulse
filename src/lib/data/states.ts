/**
 * US States Database for WAS (Worked All States) Award Tracking
 *
 * Contains all 50 US states with their abbreviations and primary call areas.
 * Used to track progress toward the ARRL Worked All States award.
 */

export interface USState {
  /** 2-letter state abbreviation (e.g., "CA", "NY") */
  code: string;
  /** Full state name */
  name: string;
  /** Primary amateur radio call area (0-9) */
  callArea: number;
}

/**
 * All 50 US states with their call areas
 * Note: Some states span multiple call areas; the primary area is listed
 */
export const US_STATES: USState[] = [
  { code: "AL", name: "Alabama", callArea: 4 },
  { code: "AK", name: "Alaska", callArea: 7 },
  { code: "AZ", name: "Arizona", callArea: 7 },
  { code: "AR", name: "Arkansas", callArea: 5 },
  { code: "CA", name: "California", callArea: 6 },
  { code: "CO", name: "Colorado", callArea: 0 },
  { code: "CT", name: "Connecticut", callArea: 1 },
  { code: "DE", name: "Delaware", callArea: 3 },
  { code: "FL", name: "Florida", callArea: 4 },
  { code: "GA", name: "Georgia", callArea: 4 },
  { code: "HI", name: "Hawaii", callArea: 6 },
  { code: "ID", name: "Idaho", callArea: 7 },
  { code: "IL", name: "Illinois", callArea: 9 },
  { code: "IN", name: "Indiana", callArea: 9 },
  { code: "IA", name: "Iowa", callArea: 0 },
  { code: "KS", name: "Kansas", callArea: 0 },
  { code: "KY", name: "Kentucky", callArea: 4 },
  { code: "LA", name: "Louisiana", callArea: 5 },
  { code: "ME", name: "Maine", callArea: 1 },
  { code: "MD", name: "Maryland", callArea: 3 },
  { code: "MA", name: "Massachusetts", callArea: 1 },
  { code: "MI", name: "Michigan", callArea: 8 },
  { code: "MN", name: "Minnesota", callArea: 0 },
  { code: "MS", name: "Mississippi", callArea: 5 },
  { code: "MO", name: "Missouri", callArea: 0 },
  { code: "MT", name: "Montana", callArea: 7 },
  { code: "NE", name: "Nebraska", callArea: 0 },
  { code: "NV", name: "Nevada", callArea: 7 },
  { code: "NH", name: "New Hampshire", callArea: 1 },
  { code: "NJ", name: "New Jersey", callArea: 2 },
  { code: "NM", name: "New Mexico", callArea: 5 },
  { code: "NY", name: "New York", callArea: 2 },
  { code: "NC", name: "North Carolina", callArea: 4 },
  { code: "ND", name: "North Dakota", callArea: 0 },
  { code: "OH", name: "Ohio", callArea: 8 },
  { code: "OK", name: "Oklahoma", callArea: 5 },
  { code: "OR", name: "Oregon", callArea: 7 },
  { code: "PA", name: "Pennsylvania", callArea: 3 },
  { code: "RI", name: "Rhode Island", callArea: 1 },
  { code: "SC", name: "South Carolina", callArea: 4 },
  { code: "SD", name: "South Dakota", callArea: 0 },
  { code: "TN", name: "Tennessee", callArea: 4 },
  { code: "TX", name: "Texas", callArea: 5 },
  { code: "UT", name: "Utah", callArea: 7 },
  { code: "VT", name: "Vermont", callArea: 1 },
  { code: "VA", name: "Virginia", callArea: 4 },
  { code: "WA", name: "Washington", callArea: 7 },
  { code: "WV", name: "West Virginia", callArea: 8 },
  { code: "WI", name: "Wisconsin", callArea: 9 },
  { code: "WY", name: "Wyoming", callArea: 7 },
];

/**
 * State lookup map by code
 */
const STATE_BY_CODE: Map<string, USState> = new Map(
  US_STATES.map((state) => [state.code.toUpperCase(), state]),
);

/**
 * State lookup map by name (lowercase for case-insensitive matching)
 */
const STATE_BY_NAME: Map<string, USState> = new Map(
  US_STATES.map((state) => [state.name.toLowerCase(), state]),
);

/**
 * Common state abbreviations and alternative names
 */
const STATE_ALIASES: Record<string, string> = {
  // Common abbreviation variations
  CALIF: "CA",
  COLO: "CO",
  CONN: "CT",
  DEL: "DE",
  FLA: "FL",
  ILL: "IL",
  IND: "IN",
  KANS: "KS",
  MASS: "MA",
  MICH: "MI",
  MINN: "MN",
  MISS: "MS",
  MONT: "MT",
  NEBR: "NE",
  NEV: "NV",
  OKLA: "OK",
  ORE: "OR",
  OREG: "OR",
  PENN: "PA",
  PENNA: "PA",
  TENN: "TN",
  TEX: "TX",
  WASH: "WA",
  WISC: "WI",
  WIS: "WI",
  WYO: "WY",
  // Full names with minor variations
  "N CAROLINA": "NC",
  "S CAROLINA": "SC",
  "N DAKOTA": "ND",
  "S DAKOTA": "SD",
  "W VIRGINIA": "WV",
  "NEW YORK": "NY",
  "NEW JERSEY": "NJ",
  "NEW MEXICO": "NM",
  "NEW HAMPSHIRE": "NH",
  "NORTH CAROLINA": "NC",
  "SOUTH CAROLINA": "SC",
  "NORTH DAKOTA": "ND",
  "SOUTH DAKOTA": "SD",
  "WEST VIRGINIA": "WV",
  "RHODE ISLAND": "RI",
};

/**
 * Get a US state from a QTH string
 * Attempts to extract and match state information from various formats
 *
 * @param qth - Location/QTH string (e.g., "Los Angeles, CA", "California", "NY")
 * @returns USState or null if no match found
 */
export function getStateFromQTH(qth: string): USState | null {
  if (!qth) return null;

  const normalized = qth.toUpperCase().trim();

  // Try direct 2-letter code match
  if (normalized.length === 2) {
    return STATE_BY_CODE.get(normalized) || null;
  }

  // Try alias lookup
  if (STATE_ALIASES[normalized]) {
    return STATE_BY_CODE.get(STATE_ALIASES[normalized]) || null;
  }

  // Try full name match
  const lowerQth = qth.toLowerCase().trim();
  if (STATE_BY_NAME.has(lowerQth)) {
    return STATE_BY_NAME.get(lowerQth)!;
  }

  // Try to extract state code from end of string (e.g., "Los Angeles, CA")
  const trailingCodeMatch = normalized.match(/[,\s]+([A-Z]{2})$/);
  if (trailingCodeMatch) {
    const code = trailingCodeMatch[1];
    if (STATE_BY_CODE.has(code)) {
      return STATE_BY_CODE.get(code)!;
    }
  }

  // Try to find state name anywhere in the string
  for (const state of US_STATES) {
    if (lowerQth.includes(state.name.toLowerCase())) {
      return state;
    }
  }

  // Try alias patterns within the string
  for (const [alias, code] of Object.entries(STATE_ALIASES)) {
    if (normalized.includes(alias)) {
      return STATE_BY_CODE.get(code) || null;
    }
  }

  return null;
}

/**
 * Get a US state by its code
 *
 * @param code - 2-letter state code
 * @returns USState or null if not found
 */
export function getStateByCode(code: string): USState | null {
  if (!code) return null;
  return STATE_BY_CODE.get(code.toUpperCase()) || null;
}

/**
 * Get all states in a specific call area
 *
 * @param callArea - Call area number (0-9)
 * @returns Array of states in that call area
 */
export function getStatesByCallArea(callArea: number): USState[] {
  return US_STATES.filter((state) => state.callArea === callArea);
}

/**
 * Get state count by call area
 *
 * @returns Record of call area to state count
 */
export function getStateCountByCallArea(): Record<number, number> {
  const counts: Record<number, number> = {};

  for (const state of US_STATES) {
    counts[state.callArea] = (counts[state.callArea] || 0) + 1;
  }

  return counts;
}

/**
 * Total number of US states (for WAS award)
 */
export const TOTAL_STATES = 50;
