/**
 * US State Postal Abbreviations
 *
 * Single source of truth for "what is a US state" as used by contest and
 * award logic. Two views are exported because two domains genuinely
 * disagree on whether DC counts:
 *
 * - ARRL's Worked All States (WAS) award is defined as exactly the 50
 *   states — DC does not count. Use `US_STATES` / `US_STATE_SET` here.
 * - Many contest exchanges (ARRL Sweepstakes, Field Day, etc.) award DC as
 *   its own multiplier alongside the 50 states. Use `US_STATES_WITH_DC` /
 *   `US_STATE_WITH_DC_SET` here.
 *
 * That split is intentional and recorded here as data — do not merge the
 * two views or "fix" one to match the other.
 *
 * @module lib/data/usStateAbbreviations
 */

/**
 * The 50 US states, as used by the WAS award. Does not include DC or any
 * territory.
 */
export const US_STATES = [
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
] as const;

/** `US_STATES` as a `Set` for O(1) membership checks. */
export const US_STATE_SET: ReadonlySet<string> = new Set(US_STATES);

/**
 * The 50 states plus DC, as used by contest multiplier tracking. DC is
 * appended at the end to match the historical order of the call sites this
 * table replaces.
 */
export const US_STATES_WITH_DC = [...US_STATES, "DC"] as const;

/** `US_STATES_WITH_DC` as a `Set` for O(1) membership checks. */
export const US_STATE_WITH_DC_SET: ReadonlySet<string> = new Set(
  US_STATES_WITH_DC,
);
