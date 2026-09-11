// @vitest-environment node

import { describe, expect, it } from "vitest";

import type {
  KpPoint,
  SolarFluxForecastProduct,
  SolarFluxOutlookProduct,
} from "@/lib/solar/dataTypes";

import {
  fluxForecastRecords,
  fluxOutlookRecords,
  kpRecords,
  recordsFromSnapshotRow,
  type SolarSnapshotRow,
} from "./adapters";
import { getLedgerEntry } from "./ledger";
import { selectAsOf } from "./selection";
import { buildTrajectory } from "./trajectory";

const FETCHED = "2026-09-11T12:05:00.000Z";

function point(time_tag: string, kind: KpPoint["kind"], kp: number): KpPoint {
  return { time_tag, kp, kind, noaa_scale: null, a_running: null };
}

describe("kpRecords: predicted Kp comes from the resource, not the compatibility hook", () => {
  const points: KpPoint[] = [
    point("2026-09-11T06:00:00.000Z", "observed", 2),
    point("2026-09-11T09:00:00.000Z", "estimated", 3),
    point("2026-09-11T12:00:00.000Z", "estimated", 4),
    point("2026-09-11T15:00:00.000Z", "predicted", 5),
    point("2026-09-11T18:00:00.000Z", "predicted", 6),
  ];

  it("keeps every predicted bin instead of dropping it", () => {
    const { forecasts } = kpRecords(points, { fetchedAt: FETCHED });
    expect(forecasts.map((record) => record.value)).toEqual([4, 5, 6]);
  });

  it("turns closed observed and estimated bins into observations on their own cadence", () => {
    const { observations } = kpRecords(points, { fetchedAt: FETCHED });
    expect(observations).toHaveLength(2);
    const [first] = observations;
    expect(first.sourceId).toBe("kp");
    expect(first.variable).toBe("kp");
    expect(first.stamps.observedIntervalStartAt).toBe(
      "2026-09-11T06:00:00.000Z",
    );
    expect(first.stamps.observedIntervalEndAt).toBe("2026-09-11T09:00:00.000Z");
    expect(first.stamps.intervalSeconds).toBe(10800);
    expect(first.stamps.forecastIssuedAt).toBeNull();
  });

  it("treats a bin that had not closed at fetch time as a forecast, not an observation", () => {
    const { observations, forecasts } = kpRecords(points, {
      fetchedAt: FETCHED,
    });
    expect(observations.some((record) => record.value === 4)).toBe(false);
    const open = forecasts.find((record) => record.value === 4);
    expect(open?.stamps.validFrom).toBe("2026-09-11T12:00:00.000Z");
    expect(open?.stamps.validTo).toBe("2026-09-11T15:00:00.000Z");
    expect(open?.qualityFlags).toContain("open_bin_at_capture");
  });

  it("stamps a predicted bin capture bounded, because NOAA prints no issue time", () => {
    const { forecasts } = kpRecords(points, { fetchedAt: FETCHED });
    const predicted = forecasts.find((record) => record.value === 5);
    expect(predicted?.stamps.archiveClass).toBe("capture_bounded");
    expect(predicted?.stamps.publication.kind).toBe("bounded_by_capture");
    expect(predicted?.stamps.forecastIssuedAt).toBe(FETCHED);
    expect(predicted?.stamps.capturedAt).toBe(FETCHED);
  });

  it("takes the observation time from the bin, never from a clamped envelope stamp", () => {
    // `adaptKp` clamps its product-level `observedAt` to now; the bin's own
    // time_tag is the only thing that says what interval was measured.
    const { observations } = kpRecords(points, { fetchedAt: FETCHED });
    expect(
      observations.map((record) => record.stamps.observedIntervalEndAt),
    ).toEqual(["2026-09-11T09:00:00.000Z", "2026-09-11T12:00:00.000Z"]);
  });

  it("excludes a predicted bin from a trajectory issued before the fetch", () => {
    const { forecasts } = kpRecords(points, { fetchedAt: FETCHED });
    const { samples } = buildTrajectory({
      issuedAt: "2026-09-11T12:00:00.000Z",
      hours: 4,
      forecasts: { kp: forecasts },
      mode: "live",
    });
    for (const sample of samples)
      expect(sample.drivers.kp.origin).toBe("absent");
  });
});

describe("flux forecast and outlook: header-stamped products are verified as issued", () => {
  const outlook: SolarFluxOutlookProduct = {
    issued_at: "2026-09-08T12:30:00.000Z",
    outlook: [
      {
        date: "2026-09-11T00:00:00.000Z",
        predicted_flux: 152,
        predicted_planetary_a: 12,
        predicted_kp: 3,
      },
      {
        date: "2026-09-12T00:00:00.000Z",
        predicted_flux: 155,
        predicted_planetary_a: 8,
        predicted_kp: 2,
      },
    ],
  };

  it("emits one daily record per declared variable under the product issue time", () => {
    const records = fluxOutlookRecords(outlook, {
      fetchedAt: "2026-09-08T12:40:00.000Z",
    });
    expect(records).toHaveLength(6);
    const first = records[0];
    expect(first.sourceId).toBe("outlook_27day");
    expect(first.stamps.forecastIssuedAt).toBe("2026-09-08T12:30:00.000Z");
    expect(first.stamps.publication.kind).toBe("declared");
    expect(first.stamps.archiveClass).toBe("verified_as_issued");
    expect(first.stamps.intervalSeconds).toBe(86400);
    expect(first.stamps.validFrom).toBe("2026-09-11T00:00:00.000Z");
    expect(first.stamps.validTo).toBe("2026-09-12T00:00:00.000Z");
    expect(new Set(records.map((record) => record.variable))).toEqual(
      new Set(["f107", "kp", "planetary_a"]),
    );
  });

  it("keeps the 3 day flux forecast daily", () => {
    const product: SolarFluxForecastProduct = {
      issued_at: "2026-09-11T00:30:00.000Z",
      forecast: [
        {
          date: "2026-09-11T00:00:00.000Z",
          predicted_flux: 150,
          predicted_planetary_a: 10,
        },
        {
          date: "2026-09-12T00:00:00.000Z",
          predicted_flux: 151,
          predicted_planetary_a: 9,
        },
      ],
    };
    const records = fluxForecastRecords(product, {
      fetchedAt: "2026-09-11T00:35:00.000Z",
    });
    expect(records.every((record) => record.variable === "f107")).toBe(true);
    expect(
      records.every((record) => record.stamps.intervalSeconds === 86400),
    ).toBe(true);
    expect(records[0].stamps.archiveClass).toBe("verified_as_issued");
  });
});

describe("recordsFromSnapshotRow: the collector row is the parity input shape", () => {
  const row: SolarSnapshotRow = {
    captured_at: "2026-09-11T11:50:00.000Z",
    kp_index: 3,
    sfi: 150,
    bt: 6,
    bx_gsm: 1,
    by_gsm: 2,
    bz_gsm: -3,
    solar_wind_speed: 420,
    solar_wind_temperature: 90000,
    solar_wind_density: 5,
    sunspot_number: 60,
    proton_flux_10mev: 0.2,
    dst_index: -12,
    hp60: 2.7,
    source_observed_at: {
      kp: "2026-09-11T09:00:00.000Z",
      f107: "2026-09-11T00:00:00.000Z",
      magnetic_field: "2026-09-11T11:45:00.000Z",
      solar_wind: "2026-09-11T11:45:00.000Z",
      sunspot_number: "2026-09-11T00:00:00.000Z",
      proton_flux_10mev: "2026-09-11T11:40:00.000Z",
      dst: "2026-09-11T11:00:00.000Z",
      hp60: "2026-09-11T10:00:00.000Z",
    },
    source_status: {
      magnetic_field: { active: true },
      solar_wind: { active: false },
    },
  };

  it("stamps every value with its own source observation time and the row capture", () => {
    const records = recordsFromSnapshotRow(row);
    const kp = records.find((record) => record.variable === "kp");
    expect(kp?.stamps.observedIntervalEndAt).toBe("2026-09-11T09:00:00.000Z");
    expect(kp?.stamps.capturedAt).toBe("2026-09-11T11:50:00.000Z");
    expect(kp?.stamps.archiveClass).toBe("capture_bounded");
    expect(records.every((record) => record.origin === "cached")).toBe(true);
  });

  it("carries the producer's activity flag through to selection", () => {
    const records = recordsFromSnapshotRow(row);
    const wind = records.filter((record) => record.sourceId === "solar_wind");
    expect(wind.every((record) => record.activity === "inactive")).toBe(true);
    const selected = selectAsOf(wind, {
      issuedAt: "2026-09-11T11:55:00.000Z",
      entry: getLedgerEntry("solar_wind"),
      mode: "cached_live",
    });
    expect(selected).toMatchObject({
      state: "excluded",
      reason: "source_inactive",
    });

    const field = records.filter(
      (record) => record.sourceId === "magnetic_field",
    );
    expect(
      selectAsOf(field, {
        issuedAt: "2026-09-11T11:55:00.000Z",
        entry: getLedgerEntry("magnetic_field"),
        mode: "cached_live",
      }).state,
    ).toBe("selected");
  });

  it("emits nothing for a column the row left null", () => {
    const sparse: SolarSnapshotRow = {
      ...row,
      kp_index: null,
      source_observed_at: { ...row.source_observed_at, dst: null },
    };
    const records = recordsFromSnapshotRow(sparse);
    expect(records.some((record) => record.variable === "kp")).toBe(false);
    expect(records.some((record) => record.variable === "dst")).toBe(false);
  });
});
