/**
 * ARRL/RAC Contest Sections
 *
 * Single source of truth for valid ARRL/RAC sections as used in contests
 * like Sweepstakes and Field Day. 83 total sections including US states,
 * Canadian provinces, and special areas.
 *
 * @module lib/data/arrlSections
 */

export const ARRL_RAC_SECTIONS = [
  // New England Division
  "CT",
  "EMA",
  "ME",
  "NH",
  "RI",
  "VT",
  "WMA",
  // Hudson Division
  "ENY",
  "NLI",
  "NNJ",
  "NNY",
  "SNJ",
  "WNY",
  // Atlantic Division
  "DE",
  "EPA",
  "MDC",
  "WPA",
  // Delta Division
  "AL",
  "GA",
  "KY",
  "NC",
  "NFL",
  "SC",
  "SFL",
  "TN",
  "VA",
  "WCF",
  "PR",
  "VI",
  // Midwest Division
  "AR",
  "LA",
  "MS",
  "NM",
  "NTX",
  "OK",
  "STX",
  "WTX",
  // Pacific Division
  "EB",
  "LAX",
  "ORG",
  "PAC",
  "SB",
  "SCV",
  "SDG",
  "SF",
  "SJV",
  "SV",
  // Rocky Mountain Division
  "AZ",
  "EWA",
  "ID",
  "MT",
  "NV",
  "OR",
  "UT",
  "WWA",
  "WY",
  "AK",
  // Central Division
  "IA",
  "KS",
  "MN",
  "MO",
  "NE",
  "ND",
  "SD",
  // Great Lakes Division
  "IL",
  "IN",
  "WI",
  // Dakota Division
  "CO",
  "MI",
  "OH",
  "WV",
  // Canada
  "MAR",
  "QC",
  "ONE",
  "ONN",
  "ONS",
  "GTA",
  "MB",
  "SK",
  "AB",
  "BC",
  "NT",
  "YT",
] as const;

/** `ARRL_RAC_SECTIONS` as a `Set` for O(1) membership checks. */
export const ARRL_RAC_SECTION_SET: ReadonlySet<string> = new Set(
  ARRL_RAC_SECTIONS,
);
