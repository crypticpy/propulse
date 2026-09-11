/**
 * PROP-05 record adapters (#951).
 *
 * These turn the two shapes this repository already produces into the one
 * normal form the context leaf selects over. They add no data and invent no
 * timestamp: every stamp below is either printed by the producer or is the
 * capture instant the fetching layer already recorded.
 *
 * The Kp adapter is the one #951 names directly. `useKIndex`
 * (`src/hooks/useSolarData.ts`) drops every `kind === "predicted"` bin and
 * flattens the rest into a legacy shape with no `kind` at all, so nothing
 * downstream of that hook can see a forecast. This adapter reads the
 * underlying `noaa-k-index` resource instead, keeps all three kinds, and
 * classifies them by what they actually are at capture time. The hook is left
 * exactly as it is.
 */
import type {
  KpPoint,
  SolarFluxForecastProduct,
  SolarFluxOutlookProduct,
} from "@/lib/solar/dataTypes";

import {
  instantMs,
  type Instant,
  type SourceRecord,
  type SourceStamps,
} from "@/lib/propagation/context/types";

/** What the fetching layer already knows about a product it just received. */
export interface CaptureMeta {
  /**
   * `SolarEnvelope.fetchedAt`. This is the only publication-related instant a
   * NOAA JSON feed gives us, and it is an upper bound on publication rather
   * than a publication time, which is why every record built from it is
   * `capture_bounded`.
   */
  readonly fetchedAt: Instant;
}

const KP_BIN_SECONDS = 10800;
const DAY_SECONDS = 86400;

function plusSeconds(at: Instant, seconds: number): Instant {
  return new Date(
    instantMs(at, "interval anchor") + seconds * 1000,
  ).toISOString();
}

function captureBounded(capturedAt: Instant): SourceStamps["publication"] {
  return { kind: "bounded_by_capture", publishedAt: capturedAt };
}

export interface KpRecords {
  readonly observations: readonly SourceRecord[];
  readonly forecasts: readonly SourceRecord[];
}

/**
 * Split a Kp series into what had been measured by the capture and what was
 * still a prediction then.
 *
 * A bin's `time_tag` is the start of its 3 hour interval, so the interval ends
 * three hours later and the bin is not an observation until it does. A bin
 * still open at the capture instant is a forecast of that interval whatever
 * NOAA calls it, and it is flagged so a reader can see why it was classified
 * that way.
 */
export function kpRecords(
  points: readonly KpPoint[],
  meta: CaptureMeta,
): KpRecords {
  const capturedAt = meta.fetchedAt;
  const capturedMs = instantMs(capturedAt, "fetchedAt");
  const observations: SourceRecord[] = [];
  const forecasts: SourceRecord[] = [];

  for (const point of points) {
    const startAt = new Date(
      instantMs(point.time_tag, "time_tag"),
    ).toISOString();
    const endAt = plusSeconds(startAt, KP_BIN_SECONDS);
    const closed = instantMs(endAt, "bin end") <= capturedMs;
    const isForecast = point.kind === "predicted" || !closed;

    if (isForecast) {
      forecasts.push({
        sourceId: "kp_forecast",
        variable: "kp",
        units: "dimensionless (Kp, thirds)",
        value: point.kp,
        stamps: {
          observedIntervalStartAt: null,
          // A forecast "closes" when it is issued, and the only issue instant
          // this feed offers is the capture that first held it.
          observedIntervalEndAt: capturedAt,
          publication: captureBounded(capturedAt),
          capturedAt,
          forecastIssuedAt: capturedAt,
          validFrom: startAt,
          validTo: endAt,
          intervalSeconds: KP_BIN_SECONDS,
          revision: `kp-forecast ${startAt} ${capturedAt}`,
          archiveClass: "capture_bounded",
        },
        origin: "network",
        activity: "not_reported",
        qualityFlags: closed
          ? [point.kind]
          : [point.kind, "open_bin_at_capture"],
      });
      continue;
    }

    observations.push({
      sourceId: "kp",
      variable: "kp",
      units: "dimensionless (Kp, thirds)",
      value: point.kp,
      stamps: {
        observedIntervalStartAt: startAt,
        observedIntervalEndAt: endAt,
        publication: captureBounded(capturedAt),
        capturedAt,
        forecastIssuedAt: null,
        validFrom: null,
        validTo: null,
        intervalSeconds: KP_BIN_SECONDS,
        revision: `kp ${startAt} ${capturedAt}`,
        archiveClass: "capture_bounded",
      },
      origin: "network",
      activity: "not_reported",
      qualityFlags: [point.kind],
    });
  }

  return { observations, forecasts };
}

function dailyForecast(
  sourceId: string,
  variable: string,
  units: string,
  value: number,
  date: Instant,
  issuedAt: Instant,
  capturedAt: Instant,
): SourceRecord {
  const validFrom = new Date(instantMs(date, "forecast date")).toISOString();
  return {
    sourceId,
    variable,
    units,
    value,
    stamps: {
      observedIntervalStartAt: null,
      observedIntervalEndAt: issuedAt,
      publication: { kind: "declared", publishedAt: issuedAt },
      capturedAt,
      forecastIssuedAt: issuedAt,
      validFrom,
      validTo: plusSeconds(validFrom, DAY_SECONDS),
      intervalSeconds: DAY_SECONDS,
      revision: `${sourceId} ${variable} ${validFrom} ${issuedAt}`,
      archiveClass: "verified_as_issued",
    },
    origin: "network",
    activity: "not_reported",
    qualityFlags: [],
  };
}

/**
 * The 27 day outlook: one daily row carrying flux, the planetary A index and a
 * predicted Kp, all under one printed issue time. This is the second, longer
 * horizon predicted Kp the compatibility hook never exposed.
 */
export function fluxOutlookRecords(
  product: SolarFluxOutlookProduct,
  meta: CaptureMeta,
): readonly SourceRecord[] {
  return product.outlook.flatMap((row) => [
    dailyForecast(
      "outlook_27day",
      "f107",
      "solar flux units",
      row.predicted_flux,
      row.date,
      product.issued_at,
      meta.fetchedAt,
    ),
    dailyForecast(
      "outlook_27day",
      "kp",
      "dimensionless (Kp, thirds)",
      row.predicted_kp,
      row.date,
      product.issued_at,
      meta.fetchedAt,
    ),
    dailyForecast(
      "outlook_27day",
      "planetary_a",
      "dimensionless",
      row.predicted_planetary_a,
      row.date,
      product.issued_at,
      meta.fetchedAt,
    ),
  ]);
}

/**
 * The 3 day flux forecast. Only `f107` is emitted: the product also carries a
 * planetary A index, but the ledger entry for this source declares `f107`
 * alone, and an undeclared variable cannot be selected (M11).
 */
export function fluxForecastRecords(
  product: SolarFluxForecastProduct,
  meta: CaptureMeta,
): readonly SourceRecord[] {
  return product.forecast.map((row) =>
    dailyForecast(
      "f107_forecast",
      "f107",
      "solar flux units",
      row.predicted_flux,
      row.date,
      product.issued_at,
      meta.fetchedAt,
    ),
  );
}

/**
 * One row of the collector's `solar_snapshots` table.
 *
 * This is the shape `ml/service/operational_weather.py` reads, reproduced here
 * so the parity fixture drives the identical selection code the production
 * path uses. Nothing in this leaf queries that table: no client reader exists
 * today, and creating one is an API decision, not a context decision.
 */
export interface SolarSnapshotRow {
  readonly captured_at: string;
  readonly kp_index: number | null;
  readonly sfi: number | null;
  readonly bt: number | null;
  readonly bx_gsm: number | null;
  readonly by_gsm: number | null;
  readonly bz_gsm: number | null;
  readonly solar_wind_speed: number | null;
  readonly solar_wind_temperature: number | null;
  readonly solar_wind_density: number | null;
  readonly sunspot_number: number | null;
  readonly proton_flux_10mev: number | null;
  readonly dst_index: number | null;
  readonly hp60: number | null;
  readonly source_observed_at: Readonly<
    Record<string, string | null | undefined>
  >;
  readonly source_status?: Readonly<
    Record<string, { readonly active?: boolean | null } | null | undefined>
  >;
}

/** column -> [ledger source, variable, units]. Mirrors `FIELD_DEFINITIONS`. */
const SNAPSHOT_FIELDS: readonly (readonly [
  keyof SolarSnapshotRow,
  string,
  string,
  string,
])[] = [
  ["kp_index", "kp", "kp", "dimensionless (Kp, thirds)"],
  ["sfi", "f107", "f107", "solar flux units"],
  ["bx_gsm", "magnetic_field", "bx_gsm", "nT"],
  ["by_gsm", "magnetic_field", "by_gsm", "nT"],
  ["bz_gsm", "magnetic_field", "bz_gsm", "nT"],
  ["bt", "magnetic_field", "bt", "nT"],
  ["solar_wind_speed", "solar_wind", "wind_speed", "km/s"],
  ["solar_wind_temperature", "solar_wind", "temperature_k", "K"],
  ["solar_wind_density", "solar_wind", "density_cm3", "cm^-3"],
  ["sunspot_number", "sunspot_number", "sunspot_number", "count"],
  ["proton_flux_10mev", "proton_flux_10mev", "proton_flux_10mev", "pfu"],
  ["dst_index", "dst", "dst", "nT"],
  ["hp60", "hp60", "hp60", "dimensionless (Hp, thirds)"],
];

export function recordsFromSnapshotRow(
  row: SolarSnapshotRow,
): readonly SourceRecord[] {
  const capturedAt = new Date(
    instantMs(row.captured_at, "captured_at"),
  ).toISOString();
  const records: SourceRecord[] = [];

  for (const [column, sourceId, variable, units] of SNAPSHOT_FIELDS) {
    const raw = row[column];
    if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
    const observed = row.source_observed_at[sourceId];
    // No observation time means no eligibility question can be answered, so
    // the value is not turned into a record at all.
    if (typeof observed !== "string" || observed.length === 0) continue;
    const observedAt = new Date(
      instantMs(observed, "source_observed_at"),
    ).toISOString();
    const status = row.source_status?.[sourceId];
    const active =
      status === null || status === undefined ? undefined : status.active;

    records.push({
      sourceId,
      variable,
      units,
      value: raw,
      stamps: {
        observedIntervalStartAt: null,
        observedIntervalEndAt: observedAt,
        publication: captureBounded(capturedAt),
        capturedAt,
        forecastIssuedAt: null,
        validFrom: null,
        validTo: null,
        intervalSeconds: null,
        revision: `${sourceId} ${observedAt} ${capturedAt}`,
        archiveClass: "capture_bounded",
      },
      origin: "cached",
      activity:
        active === true
          ? "active"
          : active === false
            ? "inactive"
            : "not_reported",
      qualityFlags: [],
    });
  }

  return records;
}
