/**
 * US State Data for WAS (Worked All States) Tracking
 *
 * Complete list of 50 US states with abbreviations, names, and zone info.
 * Data only — no SVG paths.
 */

export interface USStateData {
  /** 2-letter abbreviation */
  abbr: string;
  /** Full state name */
  name: string;
  /** CQ zone */
  cqZone: number;
  /** ITU zone */
  ituZone: number;
}

/**
 * All 50 US states with zone information.
 * CQ zone is 3, 4, or 5 depending on geographic location.
 * ITU zone is 6, 7, or 8.
 */
export const US_STATES_DATA: USStateData[] = [
  { abbr: "AL", name: "Alabama", cqZone: 4, ituZone: 8 },
  { abbr: "AK", name: "Alaska", cqZone: 1, ituZone: 1 },
  { abbr: "AZ", name: "Arizona", cqZone: 3, ituZone: 7 },
  { abbr: "AR", name: "Arkansas", cqZone: 4, ituZone: 8 },
  { abbr: "CA", name: "California", cqZone: 3, ituZone: 7 },
  { abbr: "CO", name: "Colorado", cqZone: 4, ituZone: 7 },
  { abbr: "CT", name: "Connecticut", cqZone: 5, ituZone: 8 },
  { abbr: "DE", name: "Delaware", cqZone: 5, ituZone: 8 },
  { abbr: "FL", name: "Florida", cqZone: 5, ituZone: 8 },
  { abbr: "GA", name: "Georgia", cqZone: 5, ituZone: 8 },
  { abbr: "HI", name: "Hawaii", cqZone: 31, ituZone: 61 },
  { abbr: "ID", name: "Idaho", cqZone: 3, ituZone: 7 },
  { abbr: "IL", name: "Illinois", cqZone: 4, ituZone: 8 },
  { abbr: "IN", name: "Indiana", cqZone: 4, ituZone: 8 },
  { abbr: "IA", name: "Iowa", cqZone: 4, ituZone: 8 },
  { abbr: "KS", name: "Kansas", cqZone: 4, ituZone: 7 },
  { abbr: "KY", name: "Kentucky", cqZone: 4, ituZone: 8 },
  { abbr: "LA", name: "Louisiana", cqZone: 4, ituZone: 8 },
  { abbr: "ME", name: "Maine", cqZone: 5, ituZone: 8 },
  { abbr: "MD", name: "Maryland", cqZone: 5, ituZone: 8 },
  { abbr: "MA", name: "Massachusetts", cqZone: 5, ituZone: 8 },
  { abbr: "MI", name: "Michigan", cqZone: 4, ituZone: 8 },
  { abbr: "MN", name: "Minnesota", cqZone: 4, ituZone: 8 },
  { abbr: "MS", name: "Mississippi", cqZone: 4, ituZone: 8 },
  { abbr: "MO", name: "Missouri", cqZone: 4, ituZone: 8 },
  { abbr: "MT", name: "Montana", cqZone: 4, ituZone: 7 },
  { abbr: "NE", name: "Nebraska", cqZone: 4, ituZone: 7 },
  { abbr: "NV", name: "Nevada", cqZone: 3, ituZone: 7 },
  { abbr: "NH", name: "New Hampshire", cqZone: 5, ituZone: 8 },
  { abbr: "NJ", name: "New Jersey", cqZone: 5, ituZone: 8 },
  { abbr: "NM", name: "New Mexico", cqZone: 4, ituZone: 7 },
  { abbr: "NY", name: "New York", cqZone: 5, ituZone: 8 },
  { abbr: "NC", name: "North Carolina", cqZone: 5, ituZone: 8 },
  { abbr: "ND", name: "North Dakota", cqZone: 4, ituZone: 7 },
  { abbr: "OH", name: "Ohio", cqZone: 4, ituZone: 8 },
  { abbr: "OK", name: "Oklahoma", cqZone: 4, ituZone: 7 },
  { abbr: "OR", name: "Oregon", cqZone: 3, ituZone: 7 },
  { abbr: "PA", name: "Pennsylvania", cqZone: 5, ituZone: 8 },
  { abbr: "RI", name: "Rhode Island", cqZone: 5, ituZone: 8 },
  { abbr: "SC", name: "South Carolina", cqZone: 5, ituZone: 8 },
  { abbr: "SD", name: "South Dakota", cqZone: 4, ituZone: 7 },
  { abbr: "TN", name: "Tennessee", cqZone: 4, ituZone: 8 },
  { abbr: "TX", name: "Texas", cqZone: 4, ituZone: 7 },
  { abbr: "UT", name: "Utah", cqZone: 3, ituZone: 7 },
  { abbr: "VT", name: "Vermont", cqZone: 5, ituZone: 8 },
  { abbr: "VA", name: "Virginia", cqZone: 5, ituZone: 8 },
  { abbr: "WA", name: "Washington", cqZone: 3, ituZone: 7 },
  { abbr: "WV", name: "West Virginia", cqZone: 5, ituZone: 8 },
  { abbr: "WI", name: "Wisconsin", cqZone: 4, ituZone: 8 },
  { abbr: "WY", name: "Wyoming", cqZone: 4, ituZone: 7 },
];

/** Lookup map: abbreviation -> state data */
export const US_STATE_BY_ABBR = new Map<string, USStateData>(
  US_STATES_DATA.map((s) => [s.abbr, s]),
);

/** Lookup map: lowercase name -> state data (for fuzzy matching) */
export const US_STATE_BY_NAME = new Map<string, USStateData>(
  US_STATES_DATA.map((s) => [s.name.toLowerCase(), s]),
);

/** Total number of US states for WAS */
export const TOTAL_US_STATES = 50;
