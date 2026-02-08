/**
 * License privilege lookup per class per country
 *
 * Provides band/mode/power data derived from FCC Part 97 (US) and
 * reasonable defaults for other countries' license tiers. This inverts
 * the per-segment view in bandplans.ts into a per-class view suitable
 * for profile privilege badges and permission checks.
 */

import type { LicenseClass, LicenseCountry, BandId } from "@/types/user";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BandPrivilege {
  band: BandId;
  modes: string[];
  maxPowerWatts: number;
  segments: { startKHz: number; endKHz: number }[];
}

// ─── US privilege data (FCC Part 97) ────────────────────────────────────────

const US_NOVICE: BandPrivilege[] = [
  {
    band: "80m",
    modes: ["CW"],
    maxPowerWatts: 200,
    segments: [{ startKHz: 3525, endKHz: 3600 }],
  },
  {
    band: "40m",
    modes: ["CW"],
    maxPowerWatts: 200,
    segments: [{ startKHz: 7025, endKHz: 7125 }],
  },
  {
    band: "15m",
    modes: ["CW"],
    maxPowerWatts: 200,
    segments: [{ startKHz: 21025, endKHz: 21200 }],
  },
  {
    band: "10m",
    modes: ["CW", "DATA", "PHONE"],
    maxPowerWatts: 200,
    segments: [{ startKHz: 28000, endKHz: 28500 }],
  },
];

const US_TECHNICIAN: BandPrivilege[] = [
  // HF privileges (same as Novice on HF, plus some 10m phone)
  {
    band: "80m",
    modes: ["CW"],
    maxPowerWatts: 200,
    segments: [{ startKHz: 3525, endKHz: 3600 }],
  },
  {
    band: "40m",
    modes: ["CW"],
    maxPowerWatts: 200,
    segments: [{ startKHz: 7025, endKHz: 7125 }],
  },
  {
    band: "15m",
    modes: ["CW"],
    maxPowerWatts: 200,
    segments: [{ startKHz: 21025, endKHz: 21200 }],
  },
  {
    band: "10m",
    modes: ["CW", "DATA", "PHONE"],
    maxPowerWatts: 200,
    segments: [{ startKHz: 28000, endKHz: 28500 }],
  },
  {
    band: "10m",
    modes: ["CW", "PHONE", "FM"],
    maxPowerWatts: 1500,
    segments: [{ startKHz: 29510, endKHz: 29700 }],
  },
  // VHF/UHF — full privileges
  {
    band: "6m",
    modes: ["CW", "PHONE", "DATA", "FM"],
    maxPowerWatts: 1500,
    segments: [{ startKHz: 50000, endKHz: 54000 }],
  },
  {
    band: "2m",
    modes: ["CW", "PHONE", "DATA", "FM"],
    maxPowerWatts: 1500,
    segments: [{ startKHz: 144000, endKHz: 148000 }],
  },
  {
    band: "70cm",
    modes: ["CW", "PHONE", "DATA", "FM"],
    maxPowerWatts: 1500,
    segments: [{ startKHz: 420000, endKHz: 450000 }],
  },
];

const US_GENERAL: BandPrivilege[] = [
  {
    band: "160m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 1500,
    segments: [{ startKHz: 1800, endKHz: 2000 }],
  },
  {
    band: "80m",
    modes: ["CW", "DATA"],
    maxPowerWatts: 1500,
    segments: [{ startKHz: 3525, endKHz: 3700 }],
  },
  {
    band: "80m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 1500,
    segments: [{ startKHz: 3800, endKHz: 4000 }],
  },
  {
    band: "60m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 100,
    segments: [
      { startKHz: 5330, endKHz: 5331 },
      { startKHz: 5346, endKHz: 5347 },
      { startKHz: 5357, endKHz: 5358 },
      { startKHz: 5371, endKHz: 5372 },
      { startKHz: 5403, endKHz: 5404 },
    ],
  },
  {
    band: "40m",
    modes: ["CW", "DATA"],
    maxPowerWatts: 1500,
    segments: [{ startKHz: 7025, endKHz: 7125 }],
  },
  {
    band: "40m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 1500,
    segments: [{ startKHz: 7225, endKHz: 7300 }],
  },
  {
    band: "30m",
    modes: ["CW", "DATA"],
    maxPowerWatts: 200,
    segments: [{ startKHz: 10100, endKHz: 10150 }],
  },
  {
    band: "20m",
    modes: ["CW", "DATA"],
    maxPowerWatts: 1500,
    segments: [{ startKHz: 14025, endKHz: 14150 }],
  },
  {
    band: "20m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 1500,
    segments: [{ startKHz: 14225, endKHz: 14350 }],
  },
  {
    band: "17m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 1500,
    segments: [{ startKHz: 18068, endKHz: 18168 }],
  },
  {
    band: "15m",
    modes: ["CW", "DATA"],
    maxPowerWatts: 1500,
    segments: [{ startKHz: 21025, endKHz: 21200 }],
  },
  {
    band: "15m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 1500,
    segments: [{ startKHz: 21275, endKHz: 21450 }],
  },
  {
    band: "12m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 1500,
    segments: [{ startKHz: 24890, endKHz: 24990 }],
  },
  {
    band: "10m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 1500,
    segments: [{ startKHz: 28000, endKHz: 29700 }],
  },
  {
    band: "6m",
    modes: ["CW", "PHONE", "DATA", "FM"],
    maxPowerWatts: 1500,
    segments: [{ startKHz: 50000, endKHz: 54000 }],
  },
  {
    band: "2m",
    modes: ["CW", "PHONE", "DATA", "FM"],
    maxPowerWatts: 1500,
    segments: [{ startKHz: 144000, endKHz: 148000 }],
  },
  {
    band: "70cm",
    modes: ["CW", "PHONE", "DATA", "FM"],
    maxPowerWatts: 1500,
    segments: [{ startKHz: 420000, endKHz: 450000 }],
  },
];

const US_ADVANCED: BandPrivilege[] = [
  {
    band: "160m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 1500,
    segments: [{ startKHz: 1800, endKHz: 2000 }],
  },
  {
    band: "80m",
    modes: ["CW", "DATA"],
    maxPowerWatts: 1500,
    segments: [{ startKHz: 3525, endKHz: 3700 }],
  },
  {
    band: "80m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 1500,
    segments: [{ startKHz: 3700, endKHz: 4000 }],
  },
  {
    band: "60m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 100,
    segments: [
      { startKHz: 5330, endKHz: 5331 },
      { startKHz: 5346, endKHz: 5347 },
      { startKHz: 5357, endKHz: 5358 },
      { startKHz: 5371, endKHz: 5372 },
      { startKHz: 5403, endKHz: 5404 },
    ],
  },
  {
    band: "40m",
    modes: ["CW", "DATA"],
    maxPowerWatts: 1500,
    segments: [{ startKHz: 7025, endKHz: 7125 }],
  },
  {
    band: "40m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 1500,
    segments: [{ startKHz: 7175, endKHz: 7300 }],
  },
  {
    band: "30m",
    modes: ["CW", "DATA"],
    maxPowerWatts: 200,
    segments: [{ startKHz: 10100, endKHz: 10150 }],
  },
  {
    band: "20m",
    modes: ["CW", "DATA"],
    maxPowerWatts: 1500,
    segments: [{ startKHz: 14025, endKHz: 14150 }],
  },
  {
    band: "20m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 1500,
    segments: [{ startKHz: 14175, endKHz: 14350 }],
  },
  {
    band: "17m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 1500,
    segments: [{ startKHz: 18068, endKHz: 18168 }],
  },
  {
    band: "15m",
    modes: ["CW", "DATA"],
    maxPowerWatts: 1500,
    segments: [{ startKHz: 21025, endKHz: 21200 }],
  },
  {
    band: "15m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 1500,
    segments: [{ startKHz: 21225, endKHz: 21450 }],
  },
  {
    band: "12m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 1500,
    segments: [{ startKHz: 24890, endKHz: 24990 }],
  },
  {
    band: "10m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 1500,
    segments: [{ startKHz: 28000, endKHz: 29700 }],
  },
  {
    band: "6m",
    modes: ["CW", "PHONE", "DATA", "FM"],
    maxPowerWatts: 1500,
    segments: [{ startKHz: 50000, endKHz: 54000 }],
  },
  {
    band: "2m",
    modes: ["CW", "PHONE", "DATA", "FM"],
    maxPowerWatts: 1500,
    segments: [{ startKHz: 144000, endKHz: 148000 }],
  },
  {
    band: "70cm",
    modes: ["CW", "PHONE", "DATA", "FM"],
    maxPowerWatts: 1500,
    segments: [{ startKHz: 420000, endKHz: 450000 }],
  },
];

const US_EXTRA: BandPrivilege[] = [
  {
    band: "160m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 1500,
    segments: [{ startKHz: 1800, endKHz: 2000 }],
  },
  {
    band: "80m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 1500,
    segments: [{ startKHz: 3500, endKHz: 4000 }],
  },
  {
    band: "60m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 100,
    segments: [
      { startKHz: 5330, endKHz: 5331 },
      { startKHz: 5346, endKHz: 5347 },
      { startKHz: 5357, endKHz: 5358 },
      { startKHz: 5371, endKHz: 5372 },
      { startKHz: 5403, endKHz: 5404 },
    ],
  },
  {
    band: "40m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 1500,
    segments: [{ startKHz: 7000, endKHz: 7300 }],
  },
  {
    band: "30m",
    modes: ["CW", "DATA"],
    maxPowerWatts: 200,
    segments: [{ startKHz: 10100, endKHz: 10150 }],
  },
  {
    band: "20m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 1500,
    segments: [{ startKHz: 14000, endKHz: 14350 }],
  },
  {
    band: "17m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 1500,
    segments: [{ startKHz: 18068, endKHz: 18168 }],
  },
  {
    band: "15m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 1500,
    segments: [{ startKHz: 21000, endKHz: 21450 }],
  },
  {
    band: "12m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 1500,
    segments: [{ startKHz: 24890, endKHz: 24990 }],
  },
  {
    band: "10m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 1500,
    segments: [{ startKHz: 28000, endKHz: 29700 }],
  },
  {
    band: "6m",
    modes: ["CW", "PHONE", "DATA", "FM"],
    maxPowerWatts: 1500,
    segments: [{ startKHz: 50000, endKHz: 54000 }],
  },
  {
    band: "2m",
    modes: ["CW", "PHONE", "DATA", "FM"],
    maxPowerWatts: 1500,
    segments: [{ startKHz: 144000, endKHz: 148000 }],
  },
  {
    band: "70cm",
    modes: ["CW", "PHONE", "DATA", "FM"],
    maxPowerWatts: 1500,
    segments: [{ startKHz: 420000, endKHz: 450000 }],
  },
];

// ─── International defaults ─────────────────────────────────────────────────
// Foundation/Basic: limited HF (low power), full VHF/UHF
// Intermediate/Basic Honours: most HF bands, moderate power
// Full/Extra/Advanced: all amateur bands, full power

const INTL_FOUNDATION: BandPrivilege[] = [
  {
    band: "80m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 10,
    segments: [{ startKHz: 3500, endKHz: 3800 }],
  },
  {
    band: "40m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 10,
    segments: [{ startKHz: 7000, endKHz: 7200 }],
  },
  {
    band: "20m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 10,
    segments: [{ startKHz: 14000, endKHz: 14350 }],
  },
  {
    band: "15m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 10,
    segments: [{ startKHz: 21000, endKHz: 21450 }],
  },
  {
    band: "10m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 10,
    segments: [{ startKHz: 28000, endKHz: 29700 }],
  },
  {
    band: "6m",
    modes: ["CW", "PHONE", "DATA", "FM"],
    maxPowerWatts: 10,
    segments: [{ startKHz: 50000, endKHz: 54000 }],
  },
  {
    band: "2m",
    modes: ["CW", "PHONE", "DATA", "FM"],
    maxPowerWatts: 10,
    segments: [{ startKHz: 144000, endKHz: 148000 }],
  },
  {
    band: "70cm",
    modes: ["CW", "PHONE", "DATA", "FM"],
    maxPowerWatts: 10,
    segments: [{ startKHz: 420000, endKHz: 450000 }],
  },
];

const INTL_INTERMEDIATE: BandPrivilege[] = [
  {
    band: "160m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 100,
    segments: [{ startKHz: 1800, endKHz: 2000 }],
  },
  {
    band: "80m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 100,
    segments: [{ startKHz: 3500, endKHz: 3800 }],
  },
  {
    band: "40m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 100,
    segments: [{ startKHz: 7000, endKHz: 7200 }],
  },
  {
    band: "30m",
    modes: ["CW", "DATA"],
    maxPowerWatts: 100,
    segments: [{ startKHz: 10100, endKHz: 10150 }],
  },
  {
    band: "20m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 100,
    segments: [{ startKHz: 14000, endKHz: 14350 }],
  },
  {
    band: "17m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 100,
    segments: [{ startKHz: 18068, endKHz: 18168 }],
  },
  {
    band: "15m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 100,
    segments: [{ startKHz: 21000, endKHz: 21450 }],
  },
  {
    band: "12m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 100,
    segments: [{ startKHz: 24890, endKHz: 24990 }],
  },
  {
    band: "10m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 100,
    segments: [{ startKHz: 28000, endKHz: 29700 }],
  },
  {
    band: "6m",
    modes: ["CW", "PHONE", "DATA", "FM"],
    maxPowerWatts: 100,
    segments: [{ startKHz: 50000, endKHz: 54000 }],
  },
  {
    band: "2m",
    modes: ["CW", "PHONE", "DATA", "FM"],
    maxPowerWatts: 100,
    segments: [{ startKHz: 144000, endKHz: 148000 }],
  },
  {
    band: "70cm",
    modes: ["CW", "PHONE", "DATA", "FM"],
    maxPowerWatts: 100,
    segments: [{ startKHz: 420000, endKHz: 450000 }],
  },
];

const INTL_FULL: BandPrivilege[] = [
  {
    band: "160m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 1000,
    segments: [{ startKHz: 1800, endKHz: 2000 }],
  },
  {
    band: "80m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 1000,
    segments: [{ startKHz: 3500, endKHz: 3800 }],
  },
  {
    band: "60m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 15,
    segments: [{ startKHz: 5351, endKHz: 5367 }],
  },
  {
    band: "40m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 1000,
    segments: [{ startKHz: 7000, endKHz: 7200 }],
  },
  {
    band: "30m",
    modes: ["CW", "DATA"],
    maxPowerWatts: 150,
    segments: [{ startKHz: 10100, endKHz: 10150 }],
  },
  {
    band: "20m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 1000,
    segments: [{ startKHz: 14000, endKHz: 14350 }],
  },
  {
    band: "17m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 1000,
    segments: [{ startKHz: 18068, endKHz: 18168 }],
  },
  {
    band: "15m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 1000,
    segments: [{ startKHz: 21000, endKHz: 21450 }],
  },
  {
    band: "12m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 1000,
    segments: [{ startKHz: 24890, endKHz: 24990 }],
  },
  {
    band: "10m",
    modes: ["CW", "PHONE", "DATA"],
    maxPowerWatts: 1000,
    segments: [{ startKHz: 28000, endKHz: 29700 }],
  },
  {
    band: "6m",
    modes: ["CW", "PHONE", "DATA", "FM"],
    maxPowerWatts: 1000,
    segments: [{ startKHz: 50000, endKHz: 54000 }],
  },
  {
    band: "2m",
    modes: ["CW", "PHONE", "DATA", "FM"],
    maxPowerWatts: 1000,
    segments: [{ startKHz: 144000, endKHz: 148000 }],
  },
  {
    band: "70cm",
    modes: ["CW", "PHONE", "DATA", "FM"],
    maxPowerWatts: 1000,
    segments: [{ startKHz: 420000, endKHz: 450000 }],
  },
];

// ─── Privilege lookup table ─────────────────────────────────────────────────

type PrivilegeKey = `${LicenseCountry}:${LicenseClass}`;

const PRIVILEGE_TABLE: Record<string, BandPrivilege[]> = {
  // US classes
  "US:NOVICE": US_NOVICE,
  "US:TECHNICIAN": US_TECHNICIAN,
  "US:GENERAL": US_GENERAL,
  "US:ADVANCED": US_ADVANCED,
  "US:EXTRA": US_EXTRA,

  // Canada
  "CA:BASIC": INTL_FOUNDATION,
  "CA:BASIC_HONOURS": INTL_INTERMEDIATE,
  "CA:ADVANCED_CA": INTL_FULL,

  // UK
  "UK:FOUNDATION": INTL_FOUNDATION,
  "UK:INTERMEDIATE": INTL_INTERMEDIATE,
  "UK:FULL": INTL_FULL,

  // Germany
  "DE:KLASSE_E": INTL_INTERMEDIATE,
  "DE:KLASSE_A": INTL_FULL,

  // Japan (similar to US tiers)
  "JP:TECHNICIAN": INTL_FOUNDATION,
  "JP:GENERAL": INTL_INTERMEDIATE,
  "JP:ADVANCED": INTL_FULL,
  "JP:EXTRA": INTL_FULL,

  // Australia
  "AU:FOUNDATION": INTL_FOUNDATION,
  "AU:INTERMEDIATE": INTL_INTERMEDIATE,
  "AU:FULL": INTL_FULL,

  // New Zealand
  "NZ:FOUNDATION": INTL_FOUNDATION,
  "NZ:INTERMEDIATE": INTL_INTERMEDIATE,
  "NZ:FULL": INTL_FULL,

  // Generic tier mapping for countries with simplified license structures
  "FR:TECHNICIAN": INTL_FOUNDATION,
  "FR:GENERAL": INTL_INTERMEDIATE,
  "FR:EXTRA": INTL_FULL,

  "ES:TECHNICIAN": INTL_FOUNDATION,
  "ES:GENERAL": INTL_INTERMEDIATE,
  "ES:EXTRA": INTL_FULL,

  "IT:TECHNICIAN": INTL_FOUNDATION,
  "IT:GENERAL": INTL_INTERMEDIATE,
  "IT:EXTRA": INTL_FULL,

  "BR:TECHNICIAN": INTL_FOUNDATION,
  "BR:GENERAL": INTL_INTERMEDIATE,
  "BR:EXTRA": INTL_FULL,

  "MX:TECHNICIAN": INTL_FOUNDATION,
  "MX:GENERAL": INTL_INTERMEDIATE,
  "MX:EXTRA": INTL_FULL,

  "OTHER:BASIC": INTL_FOUNDATION,
  "OTHER:ADVANCED": INTL_INTERMEDIATE,
  "OTHER:EXTRA": INTL_FULL,
};

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Get band privileges for a license class within a country.
 * Returns an empty array for unrecognised country:class combinations.
 */
export function getPrivileges(
  country: LicenseCountry,
  licenseClass: LicenseClass,
): BandPrivilege[] {
  const key: PrivilegeKey = `${country}:${licenseClass}`;
  return PRIVILEGE_TABLE[key] ?? [];
}

/**
 * Quick check: can this license class operate on a given band at all?
 */
export function canOperateBand(
  country: LicenseCountry,
  licenseClass: LicenseClass,
  band: BandId,
): boolean {
  const privileges = getPrivileges(country, licenseClass);
  return privileges.some((p) => p.band === band);
}
