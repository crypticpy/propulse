/**
 * PROP-05 source ledger (#951), implementing the M11 declaration requirement.
 *
 * M11: "Each provider declares actual variables, units, measurement support,
 * quality semantics, access/license terms, observation interval, publication
 * latency, valid horizons and outage behavior." This file is that declaration,
 * expressed as a type, so a source that has not been declared cannot be
 * selected at all.
 *
 * Two things are deliberately absent. There is no age bound invented here for
 * a source that has none upstream: `maxAgeSeconds: null` means no operational
 * bound has been established, and the selection code then applies none rather
 * than guessing one. And there is no entry for a product this leaf cannot
 * stamp today; the unsupported packs are named in `DISABLED_CAPABILITIES`
 * instead of being half-declared.
 */
import type { ArchiveClass } from "@/lib/propagation/context/types";

export const LEDGER_VERSION = "prop05-source-ledger-1";

/**
 * Per-source operational age bounds, in seconds.
 *
 * These are not this leaf's numbers. They are the bounds the deployed N5
 * service already applies in `ml/service/operational_weather.py`
 * (`SOURCE_MAX_AGE_SECONDS`), each one justified there from cadence,
 * publication latency and the granularity training consumed. #951 forbids
 * modifying those source latency rules, so they are mirrored here and
 * `parity.test.ts` fails loudly if the two ever drift or if the Python block
 * stops being parseable.
 */
export const SOURCE_AGE_BOUNDS_SECONDS: Readonly<Record<string, number>> = Object.freeze({
  kp: 1800,
  magnetic_field: 1800,
  solar_wind: 1800,
  proton_flux_10mev: 3600,
  dst: 7200,
  f107: 172800,
  sunspot_number: 3888000,
  hp60: 10800,
});

export type SourceKind = "observation" | "forecast" | "bundled";

export interface SourceLedgerEntry {
  readonly sourceId: string;
  readonly label: string;
  readonly provider: string;
  readonly kind: SourceKind;
  /** Variables this source may carry. A record naming another is rejected. */
  readonly variables: readonly string[];
  readonly units: string;
  /** The producer's cadence in seconds, or null for an irregular product. */
  readonly observationIntervalSeconds: number | null;
  /**
   * Declared publication latency in seconds where the producer documents one,
   * null where it does not. Null is why a source is `capture_bounded`: with no
   * documented latency and no printed issue time there is nothing to verify a
   * publication history against.
   */
  readonly publicationLatencySeconds: number | null;
  /** Operational age bound, or null where none has been established. */
  readonly maxAgeSeconds: number | null;
  /** How far ahead a forecast from this source is valid, in seconds. */
  readonly validHorizonSeconds: number | null;
  /** The best archive class a record from this source can ever carry. */
  readonly archiveClass: ArchiveClass;
  readonly licence: string;
  readonly outageBehaviour: string;
}

function entry(value: SourceLedgerEntry): SourceLedgerEntry {
  return Object.freeze({ ...value, variables: Object.freeze([...value.variables]) });
}

const NOAA_LICENCE = "US government work, public domain (NOAA SWPC)";

export const SOURCE_LEDGER: Readonly<Record<string, SourceLedgerEntry>> = Object.freeze({
  kp: entry({
    sourceId: "kp",
    label: "Planetary K index",
    provider: "NOAA SWPC",
    kind: "observation",
    variables: ["kp"],
    units: "dimensionless (Kp, thirds)",
    observationIntervalSeconds: 10800,
    publicationLatencySeconds: null,
    maxAgeSeconds: SOURCE_AGE_BOUNDS_SECONDS.kp,
    validHorizonSeconds: null,
    archiveClass: "capture_bounded",
    licence: NOAA_LICENCE,
    outageBehaviour: "feed keeps serving older bins; no activity flag is published",
  }),
  f107: entry({
    sourceId: "f107",
    label: "10.7 cm solar radio flux",
    provider: "NOAA SWPC / DRAO Penticton",
    kind: "observation",
    variables: ["f107"],
    units: "solar flux units",
    observationIntervalSeconds: 86400,
    publicationLatencySeconds: null,
    maxAgeSeconds: SOURCE_AGE_BOUNDS_SECONDS.f107,
    validHorizonSeconds: null,
    archiveClass: "capture_bounded",
    licence: NOAA_LICENCE,
    outageBehaviour: "three measurements a day; a missed run leaves the previous value newest",
  }),
  sunspot_number: entry({
    sourceId: "sunspot_number",
    label: "Daily sunspot number",
    provider: "NOAA SWPC",
    kind: "observation",
    variables: ["sunspot_number"],
    units: "count",
    observationIntervalSeconds: 86400,
    publicationLatencySeconds: null,
    maxAgeSeconds: SOURCE_AGE_BOUNDS_SECONDS.sunspot_number,
    validHorizonSeconds: null,
    archiveClass: "capture_bounded",
    licence: NOAA_LICENCE,
    outageBehaviour: "daily; the 45 day bound tolerates a long publication gap",
  }),
  magnetic_field: entry({
    sourceId: "magnetic_field",
    label: "Interplanetary magnetic field",
    provider: "NOAA SWPC (DSCOVR / ACE)",
    kind: "observation",
    variables: ["bt", "bx_gsm", "by_gsm", "bz_gsm"],
    units: "nT",
    observationIntervalSeconds: 60,
    publicationLatencySeconds: null,
    maxAgeSeconds: SOURCE_AGE_BOUNDS_SECONDS.magnetic_field,
    validHorizonSeconds: null,
    archiveClass: "capture_bounded",
    licence: NOAA_LICENCE,
    outageBehaviour:
      "spacecraft can be flagged inactive; an inactive marker invalidates every older active record",
  }),
  solar_wind: entry({
    sourceId: "solar_wind",
    label: "Solar wind plasma",
    provider: "NOAA SWPC (DSCOVR / ACE)",
    kind: "observation",
    variables: ["wind_speed", "density_cm3", "temperature_k"],
    units: "km/s, cm^-3, K",
    observationIntervalSeconds: 60,
    publicationLatencySeconds: null,
    maxAgeSeconds: SOURCE_AGE_BOUNDS_SECONDS.solar_wind,
    validHorizonSeconds: null,
    archiveClass: "capture_bounded",
    licence: NOAA_LICENCE,
    outageBehaviour:
      "spacecraft can be flagged inactive; an inactive marker invalidates every older active record",
  }),
  proton_flux_10mev: entry({
    sourceId: "proton_flux_10mev",
    label: "Integral proton flux, >10 MeV",
    provider: "NOAA SWPC (GOES)",
    kind: "observation",
    variables: ["proton_flux_10mev"],
    units: "pfu",
    observationIntervalSeconds: 300,
    publicationLatencySeconds: null,
    maxAgeSeconds: SOURCE_AGE_BOUNDS_SECONDS.proton_flux_10mev,
    validHorizonSeconds: null,
    archiveClass: "capture_bounded",
    licence: NOAA_LICENCE,
    outageBehaviour: "five minute product; no activity flag is published",
  }),
  dst: entry({
    sourceId: "dst",
    label: "Disturbance storm time index",
    provider: "NOAA SWPC",
    kind: "observation",
    variables: ["dst"],
    units: "nT",
    observationIntervalSeconds: 3600,
    publicationLatencySeconds: null,
    maxAgeSeconds: SOURCE_AGE_BOUNDS_SECONDS.dst,
    validHorizonSeconds: null,
    archiveClass: "capture_bounded",
    licence: NOAA_LICENCE,
    outageBehaviour: "hourly; provisional values are revised, and a revision is a separate record",
  }),
  hp60: entry({
    sourceId: "hp60",
    label: "Hp60 geomagnetic index",
    provider: "GFZ Potsdam",
    kind: "observation",
    variables: ["hp60"],
    units: "dimensionless (Hp, thirds)",
    observationIntervalSeconds: 3600,
    publicationLatencySeconds: 3600,
    maxAgeSeconds: SOURCE_AGE_BOUNDS_SECONDS.hp60,
    validHorizonSeconds: null,
    archiveClass: "capture_bounded",
    licence: "GFZ Potsdam, CC BY 4.0 (attribution travels with the record)",
    outageBehaviour: "hourly index published about an hour after the hour it covers",
  }),
  kp_forecast: entry({
    sourceId: "kp_forecast",
    label: "Planetary K index forecast bins",
    provider: "NOAA SWPC",
    kind: "forecast",
    variables: ["kp"],
    units: "dimensionless (Kp, thirds)",
    observationIntervalSeconds: 10800,
    publicationLatencySeconds: null,
    maxAgeSeconds: null,
    validHorizonSeconds: 3 * 86400,
    archiveClass: "capture_bounded",
    licence: NOAA_LICENCE,
    outageBehaviour:
      "the same feed carries observed, estimated and predicted bins and prints no issue time, so a predicted bin can only be bounded by its capture",
  }),
  f107_forecast: entry({
    sourceId: "f107_forecast",
    label: "Daily 10.7 cm flux forecast",
    provider: "NOAA SWPC",
    kind: "forecast",
    variables: ["f107"],
    units: "solar flux units",
    observationIntervalSeconds: 86400,
    publicationLatencySeconds: null,
    maxAgeSeconds: null,
    validHorizonSeconds: 3 * 86400,
    archiveClass: "verified_as_issued",
    licence: NOAA_LICENCE,
    outageBehaviour: "text product with an :Issued: header; a stale issue time is visible as one",
  }),
  outlook_27day: entry({
    sourceId: "outlook_27day",
    label: "27 day space weather outlook",
    provider: "NOAA SWPC",
    kind: "forecast",
    variables: ["f107", "kp", "planetary_a"],
    units: "solar flux units, dimensionless, dimensionless",
    observationIntervalSeconds: 86400,
    publicationLatencySeconds: null,
    maxAgeSeconds: null,
    validHorizonSeconds: 27 * 86400,
    archiveClass: "verified_as_issued",
    licence: NOAA_LICENCE,
    outageBehaviour: "weekly text product with an :Issued: header and one row per day",
  }),
  r12_climatology: entry({
    sourceId: "r12_climatology",
    label: "SILSO 13 month smoothed sunspot number",
    provider: "SILSO / Royal Observatory of Belgium",
    kind: "bundled",
    variables: ["r12"],
    units: "dimensionless (classic R12 after the version 2.0 conversion)",
    observationIntervalSeconds: null,
    publicationLatencySeconds: null,
    maxAgeSeconds: null,
    validHorizonSeconds: null,
    archiveClass: "verified_as_issued",
    licence: "SILSO, free use with attribution to SILSO, Royal Observatory of Belgium",
    outageBehaviour:
      "bundled asset pinned by sha256 with its own captured_at; available in every mode including offline",
  }),
});

export type LedgerSourceId = keyof typeof SOURCE_LEDGER;

export const LEDGER_SOURCE_IDS: readonly string[] = Object.freeze(Object.keys(SOURCE_LEDGER));

export class UnknownSourceError extends Error {
  override readonly name = "UnknownSourceError";

  constructor(readonly sourceId: string) {
    super(
      `source "${sourceId}" is not declared in the PROP-05 ledger; an undeclared source cannot be selected (M11)`,
    );
  }
}

export function getLedgerEntry(sourceId: string): SourceLedgerEntry {
  const found = SOURCE_LEDGER[sourceId];
  if (found === undefined) throw new UnknownSourceError(sourceId);
  return found;
}

export interface DisabledCapability {
  readonly id: string;
  readonly reason: string;
  readonly owner: string;
}

/**
 * What this leaf does not do, stated rather than discovered.
 *
 * #951's first acceptance bullet requires disabled or unsupported capabilities
 * to be reported explicitly. Each entry names who owns the gap, so none of
 * them reads as an oversight.
 */
export const DISABLED_CAPABILITIES: readonly DisabledCapability[] = Object.freeze([
  Object.freeze({
    id: "verified_as_issued_replay",
    reason:
      "No client reader exists for the collector's as-issued forecast archive (space_weather_forecast_values, solar_snapshots), and the NOAA JSON observation feeds print no publication time. Live observation records are therefore capture_bounded, and selecting with requireVerifiedArchive leaves no eligible live observation. The offline and forecast text products are verified_as_issued and replay normally.",
    owner: "a future collector-reader leaf; PROP-05 reports the limit",
  }),
  Object.freeze({
    id: "disturbance_state_dynamics",
    reason:
      "M13's lag states, climatological relaxation and any horizon-limited persistence transition are not implemented here. The trajectory carries as-issued forecast series and marks the gaps; it never holds a last observation flat.",
    owner: "PROP-12",
  }),
  Object.freeze({
    id: "environment_pack_adapters",
    reason:
      "Terrain, atmospheric profile, rain and cloud, target and ephemeris records are not stamped by this leaf. Pretending existing surface weather is a vertical duct profile is exactly what #951 forbids.",
    owner: "PROP-34 and PROP-43",
  }),
  Object.freeze({
    id: "xray_flux_eligibility",
    reason:
      "The collector stamps xray_flux but no operational age bound has been established for it, and inventing one here would be a threshold nobody validated. It is not declared in the ledger and therefore cannot be selected.",
    owner: "a follow-up once a bound is established",
  }),
]);
