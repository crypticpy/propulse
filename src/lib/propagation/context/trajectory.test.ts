// @vitest-environment node

import { describe, expect, it } from "vitest";

import { getLedgerEntry } from "./ledger";
import { buildTrajectory, ContextForecastError } from "./trajectory";
import type { Selected, SourceRecord } from "./types";

interface ForecastOptions {
  sourceId: string;
  variable: string;
  value: number;
  issuedAt: string;
  validFrom: string;
  validTo: string;
  intervalSeconds: number;
  capturedAt?: string;
  revision?: string;
}

function forecast(options: ForecastOptions): SourceRecord {
  const capturedAt = options.capturedAt ?? options.issuedAt;
  return {
    sourceId: options.sourceId,
    variable: options.variable,
    units: "dimensionless",
    value: options.value,
    stamps: {
      observedIntervalStartAt: null,
      observedIntervalEndAt: options.issuedAt,
      publication: { kind: "declared", publishedAt: options.issuedAt },
      capturedAt,
      forecastIssuedAt: options.issuedAt,
      validFrom: options.validFrom,
      validTo: options.validTo,
      intervalSeconds: options.intervalSeconds,
      revision: options.revision ?? `${options.validFrom}/${options.issuedAt}`,
      archiveClass: "verified_as_issued",
    },
    origin: "network",
    activity: "not_reported",
    qualityFlags: [],
  };
}

function observation(variable: string, value: number, at: string): Selected {
  return {
    state: "selected",
    ageSeconds: 0,
    record: {
      sourceId: variable,
      variable,
      units: "dimensionless",
      value,
      stamps: {
        observedIntervalStartAt: null,
        observedIntervalEndAt: at,
        publication: { kind: "bounded_by_capture", publishedAt: at },
        capturedAt: at,
        forecastIssuedAt: null,
        validFrom: null,
        validTo: null,
        intervalSeconds: 10800,
        revision: "observed",
        archiveClass: "capture_bounded",
      },
      origin: "network",
      activity: "not_reported",
      qualityFlags: [],
    },
  };
}

const ISSUED = "2026-09-11T12:00:00.000Z";

/** Three consecutive 3 h Kp forecast bins covering 12:00 to 21:00. */
function kpBins(issuedAt = "2026-09-11T11:00:00.000Z"): SourceRecord[] {
  return [
    forecast({
      sourceId: "kp_forecast",
      variable: "kp",
      value: 3,
      issuedAt,
      validFrom: "2026-09-11T12:00:00.000Z",
      validTo: "2026-09-11T15:00:00.000Z",
      intervalSeconds: 10800,
      revision: "bin-12",
    }),
    forecast({
      sourceId: "kp_forecast",
      variable: "kp",
      value: 5,
      issuedAt,
      validFrom: "2026-09-11T15:00:00.000Z",
      validTo: "2026-09-11T18:00:00.000Z",
      intervalSeconds: 10800,
      revision: "bin-15",
    }),
    forecast({
      sourceId: "kp_forecast",
      variable: "kp",
      value: 7,
      issuedAt,
      validFrom: "2026-09-11T18:00:00.000Z",
      validTo: "2026-09-11T21:00:00.000Z",
      intervalSeconds: 10800,
      revision: "bin-18",
    }),
  ];
}

describe("buildTrajectory: the grid (M14, #982 section 1)", () => {
  it("emits 24 instantaneous samples at issuedAt + j hours", () => {
    const { samples } = buildTrajectory({
      issuedAt: ISSUED,
      forecasts: {},
      mode: "live",
    });
    expect(samples).toHaveLength(24);
    expect(samples[0].validAt).toBe("2026-09-11T12:00:00.000Z");
    expect(samples[0].horizonSeconds).toBe(0);
    expect(samples[23].validAt).toBe("2026-09-12T11:00:00.000Z");
    expect(samples[23].horizonSeconds).toBe(23 * 3600);
  });

  it("uses absolute instants across midnight, a month end and a year end", () => {
    const acrossYear = buildTrajectory({
      issuedAt: "2025-12-31T20:00:00.000Z",
      forecasts: {},
      mode: "live",
    });
    expect(acrossYear.samples[4].validAt).toBe("2026-01-01T00:00:00.000Z");
    expect(acrossYear.samples[23].validAt).toBe("2026-01-01T19:00:00.000Z");

    const acrossMonth = buildTrajectory({
      issuedAt: "2026-08-31T23:00:00.000Z",
      forecasts: {},
      mode: "live",
    });
    expect(acrossMonth.samples[1].validAt).toBe("2026-09-01T00:00:00.000Z");

    const acrossLeapDay = buildTrajectory({
      issuedAt: "2028-02-28T23:00:00.000Z",
      forecasts: {},
      mode: "live",
    });
    expect(acrossLeapDay.samples[1].validAt).toBe("2028-02-29T00:00:00.000Z");
  });
});

describe("buildTrajectory: original cadence is preserved (M14)", () => {
  it("serves three consecutive hourly samples from one 3 hour Kp bin", () => {
    const { samples } = buildTrajectory({
      issuedAt: ISSUED,
      forecasts: { kp: kpBins() },
      mode: "live",
    });
    const first = samples.slice(0, 3).map((sample) => sample.drivers.kp);
    for (const driver of first) {
      expect(driver.origin).toBe("issued_forecast");
      if (driver.origin === "absent") return;
      expect(driver.stamps.revision).toBe("bin-12");
      expect(driver.stamps.intervalSeconds).toBe(10800);
      expect(driver.value).toBe(3);
    }
    const fourth = samples[3].drivers.kp;
    expect(fourth.origin === "issued_forecast" && fourth.stamps.revision).toBe(
      "bin-15",
    );
  });

  it("puts 02:59:59.999 and 03:00:00.000 in different Kp buckets of the same length", () => {
    const bins = [
      forecast({
        sourceId: "kp_forecast",
        variable: "kp",
        value: 2,
        issuedAt: "2026-09-11T00:00:00.000Z",
        validFrom: "2026-09-11T00:00:00.000Z",
        validTo: "2026-09-11T03:00:00.000Z",
        intervalSeconds: 10800,
        revision: "bin-00",
      }),
      forecast({
        sourceId: "kp_forecast",
        variable: "kp",
        value: 4,
        issuedAt: "2026-09-11T00:00:00.000Z",
        validFrom: "2026-09-11T03:00:00.000Z",
        validTo: "2026-09-11T06:00:00.000Z",
        intervalSeconds: 10800,
        revision: "bin-03",
      }),
    ];
    const before = buildTrajectory({
      issuedAt: "2026-09-11T02:59:59.999Z",
      hours: 1,
      forecasts: { kp: bins },
      mode: "live",
    });
    const after = buildTrajectory({
      issuedAt: "2026-09-11T03:00:00.000Z",
      hours: 1,
      forecasts: { kp: bins },
      mode: "live",
    });
    expect(before.buckets).toHaveLength(1);
    expect(after.buckets).toHaveLength(1);
    expect(before.buckets[0]).toMatchObject({
      variable: "kp",
      startAt: "2026-09-11T00:00:00.000Z",
      endAt: "2026-09-11T03:00:00.000Z",
      intervalSeconds: 10800,
    });
    expect(after.buckets[0]).toMatchObject({
      startAt: "2026-09-11T03:00:00.000Z",
      endAt: "2026-09-11T06:00:00.000Z",
      intervalSeconds: 10800,
    });
    expect(before.buckets[0].intervalSeconds).toBe(
      after.buckets[0].intervalSeconds,
    );
  });

  it("keeps a daily flux forecast daily and hands over at its own boundary", () => {
    const days = [
      forecast({
        sourceId: "f107_forecast",
        variable: "f107",
        value: 150,
        issuedAt: "2026-09-11T00:30:00.000Z",
        validFrom: "2026-09-11T00:00:00.000Z",
        validTo: "2026-09-12T00:00:00.000Z",
        intervalSeconds: 86400,
        revision: "day-11",
      }),
      forecast({
        sourceId: "f107_forecast",
        variable: "f107",
        value: 155,
        issuedAt: "2026-09-11T00:30:00.000Z",
        validFrom: "2026-09-12T00:00:00.000Z",
        validTo: "2026-09-13T00:00:00.000Z",
        intervalSeconds: 86400,
        revision: "day-12",
      }),
    ];
    const { samples, buckets } = buildTrajectory({
      issuedAt: ISSUED,
      forecasts: { f107: days },
      mode: "live",
    });
    const revisions = samples.map((sample) => {
      const driver = sample.drivers.f107;
      return driver.origin === "absent" ? "absent" : driver.stamps.revision;
    });
    // 12:00 through 23:00 on the 11th, then 00:00 through 11:00 on the 12th.
    expect(
      revisions.slice(0, 12).every((revision) => revision === "day-11"),
    ).toBe(true);
    expect(revisions.slice(12).every((revision) => revision === "day-12")).toBe(
      true,
    );
    expect(buckets.filter((bucket) => bucket.variable === "f107")).toHaveLength(
      2,
    );
    expect(buckets[0].intervalSeconds).toBe(86400);
  });

  it("deduplicates the bucket window a record owns", () => {
    const { buckets } = buildTrajectory({
      issuedAt: ISSUED,
      forecasts: { kp: kpBins() },
      mode: "live",
    });
    expect(buckets).toHaveLength(3);
    expect(new Set(buckets.map((bucket) => bucket.revision)).size).toBe(3);
  });
});

describe("buildTrajectory: only forecasts already issued (M14)", () => {
  it("ignores a forecast issued after issuedAt", () => {
    const later = kpBins("2026-09-11T12:00:00.001Z");
    const { samples } = buildTrajectory({
      issuedAt: ISSUED,
      forecasts: { kp: later },
      mode: "live",
    });
    expect(samples[0].drivers.kp.origin).toBe("absent");
  });

  it("ignores a forecast this service had not captured by issuedAt", () => {
    const uncaptured = kpBins("2026-09-11T11:00:00.000Z").map((record) => ({
      ...record,
      stamps: { ...record.stamps, capturedAt: "2026-09-11T12:00:00.001Z" },
    }));
    const { samples } = buildTrajectory({
      issuedAt: ISSUED,
      forecasts: { kp: uncaptured },
      mode: "live",
    });
    expect(samples[0].drivers.kp.origin).toBe("absent");
  });

  it("prefers the more recently issued forecast for the same valid interval", () => {
    const early = forecast({
      sourceId: "kp_forecast",
      variable: "kp",
      value: 3,
      issuedAt: "2026-09-11T06:00:00.000Z",
      validFrom: "2026-09-11T12:00:00.000Z",
      validTo: "2026-09-11T15:00:00.000Z",
      intervalSeconds: 10800,
      revision: "early",
    });
    const late = forecast({
      sourceId: "kp_forecast",
      variable: "kp",
      value: 6,
      issuedAt: "2026-09-11T11:00:00.000Z",
      validFrom: "2026-09-11T12:00:00.000Z",
      validTo: "2026-09-11T15:00:00.000Z",
      intervalSeconds: 10800,
      revision: "late",
    });
    const { samples } = buildTrajectory({
      issuedAt: ISSUED,
      forecasts: { kp: [early, late] },
      mode: "live",
    });
    const driver = samples[0].drivers.kp;
    expect(driver.origin === "issued_forecast" && driver.stamps.revision).toBe(
      "late",
    );
  });

  it("rejects a forecast record with no valid interval", () => {
    const broken = {
      ...kpBins()[0],
      stamps: { ...kpBins()[0].stamps, validFrom: null, validTo: null },
    };
    expect(() =>
      buildTrajectory({
        issuedAt: ISSUED,
        forecasts: { kp: [broken] },
        mode: "live",
      }),
    ).toThrow(ContextForecastError);
  });

  it("excludes every network forecast in offline mode", () => {
    const { samples } = buildTrajectory({
      issuedAt: ISSUED,
      forecasts: { kp: kpBins() },
      mode: "offline",
    });
    expect(samples[0].drivers.kp).toMatchObject({ origin: "absent" });
  });
});

describe("buildTrajectory: missing is marked, never fabricated (M11, M14)", () => {
  it("marks an uncovered sample absent with a reason and no value", () => {
    const { samples } = buildTrajectory({
      issuedAt: ISSUED,
      forecasts: { kp: [] },
      mode: "live",
    });
    const driver = samples[0].drivers.kp;
    expect(driver.origin).toBe("absent");
    expect(driver).not.toHaveProperty("value");
    if (driver.origin !== "absent") return;
    expect(driver.reason.length).toBeGreaterThan(0);
  });

  it("never holds an observation flat across the horizon", () => {
    const { samples } = buildTrajectory({
      issuedAt: ISSUED,
      forecasts: { kp: [] },
      observations: { kp: observation("kp", 4, ISSUED) },
      mode: "live",
    });
    expect(samples[0].drivers.kp).toMatchObject({
      origin: "observed_at_issue",
      value: 4,
    });
    for (const sample of samples.slice(1)) {
      expect(sample.drivers.kp.origin).toBe("absent");
    }
  });

  it("labels a bundled climatological prior instead of inventing a forecast", () => {
    const prior = forecast({
      sourceId: "r12_climatology",
      variable: "r12",
      value: 96.4,
      issuedAt: "2026-08-01T00:00:00.000Z",
      validFrom: "2026-08-01T00:00:00.000Z",
      validTo: "2026-10-01T00:00:00.000Z",
      intervalSeconds: 86400 * 30,
      revision: "silso-2026-08",
    });
    const { samples } = buildTrajectory({
      issuedAt: ISSUED,
      forecasts: { r12: [] },
      priors: { r12: { ...prior, origin: "bundled" } },
      mode: "offline",
    });
    expect(samples[0].drivers.r12).toMatchObject({
      origin: "climatological_prior",
      value: 96.4,
    });
  });

  it("does not promote an observation to a forecast beyond the issue instant", () => {
    const { samples } = buildTrajectory({
      issuedAt: ISSUED,
      forecasts: { kp: kpBins() },
      observations: { kp: observation("kp", 9, ISSUED) },
      mode: "live",
    });
    // The issue instant is the observation; every later sample is the forecast.
    expect(samples[0].drivers.kp).toMatchObject({
      origin: "observed_at_issue",
      value: 9,
    });
    expect(samples[1].drivers.kp).toMatchObject({
      origin: "issued_forecast",
      value: 3,
    });
  });

  it("carries a declared horizon on every sample", () => {
    const entry = getLedgerEntry("kp_forecast");
    expect(entry.validHorizonSeconds).toBe(3 * 86400);
    const { samples } = buildTrajectory({
      issuedAt: ISSUED,
      forecasts: { kp: kpBins() },
      mode: "live",
    });
    expect(samples.map((sample) => sample.horizonSeconds)).toEqual(
      Array.from({ length: 24 }, (_, index) => index * 3600),
    );
  });
});

describe("a bundled prior passes the same as-of test as a forecast", () => {
  const prior = (overrides: Partial<ForecastOptions> = {}): SourceRecord => ({
    ...forecast({
      sourceId: "r12_climatology",
      variable: "r12",
      value: 96.4,
      issuedAt: "2026-08-01T00:00:00.000Z",
      validFrom: "2026-08-01T00:00:00.000Z",
      validTo: "2026-10-01T00:00:00.000Z",
      intervalSeconds: 86400 * 30,
      revision: "silso-2026-08",
      ...overrides,
    }),
    origin: "bundled",
  });

  it("does not emit a prior this service had not captured at the issue instant", () => {
    const { samples } = buildTrajectory({
      issuedAt: ISSUED,
      hours: 2,
      forecasts: { r12: [] },
      priors: { r12: prior({ capturedAt: "2026-09-11T13:00:00.000Z" }) },
      mode: "offline",
    });
    for (const sample of samples) {
      expect(sample.drivers.r12.origin).toBe("absent");
      expect(sample.drivers.r12).not.toHaveProperty("value");
    }
  });

  it("does not emit a prior issued after the issue instant", () => {
    const { samples } = buildTrajectory({
      issuedAt: ISSUED,
      hours: 2,
      forecasts: { r12: [] },
      priors: {
        r12: prior({
          issuedAt: "2026-09-12T00:00:00.000Z",
          capturedAt: "2026-09-12T00:00:00.000Z",
        }),
      },
      mode: "offline",
    });
    expect(samples).toHaveLength(2);
    for (const sample of samples) {
      expect(sample.drivers.r12.origin).toBe("absent");
      expect(sample.drivers.r12).not.toHaveProperty("value");
    }
  });

  it("does not carry a monthly climatology past the month it describes", () => {
    const { samples } = buildTrajectory({
      issuedAt: "2026-09-30T20:00:00.000Z",
      hours: 8,
      forecasts: { r12: [] },
      priors: { r12: prior() },
      mode: "offline",
    });
    // Valid to 2026-10-01T00:00:00Z: the first four samples are inside it.
    for (const sample of samples.slice(0, 4)) {
      expect(sample.drivers.r12).toMatchObject({
        origin: "climatological_prior",
        value: 96.4,
      });
    }
    for (const sample of samples.slice(4)) {
      expect(sample.drivers.r12.origin).toBe("absent");
      expect(sample.drivers.r12).not.toHaveProperty("value");
    }
  });
});

describe("a forecast history is bound to the variable it is filed under", () => {
  it("never reports a flux forecast as Kp", () => {
    const mixed = [
      forecast({
        sourceId: "outlook_27day",
        variable: "f107",
        value: 152,
        issuedAt: "2026-09-11T11:00:00.000Z",
        validFrom: "2026-09-11T00:00:00.000Z",
        validTo: "2026-09-12T00:00:00.000Z",
        intervalSeconds: 86400,
      }),
      forecast({
        sourceId: "outlook_27day",
        variable: "kp",
        value: 3,
        issuedAt: "2026-09-11T11:00:00.000Z",
        validFrom: "2026-09-11T00:00:00.000Z",
        validTo: "2026-09-12T00:00:00.000Z",
        intervalSeconds: 86400,
      }),
    ];
    expect(() =>
      buildTrajectory({
        issuedAt: ISSUED,
        hours: 2,
        forecasts: { kp: mixed },
        mode: "live",
      }),
    ).toThrow(ContextForecastError);
  });

  it("drops a record whose source never declared that variable", () => {
    const undeclared = forecast({
      sourceId: "kp_forecast",
      variable: "planetary_a",
      value: 12,
      issuedAt: "2026-09-11T11:00:00.000Z",
      validFrom: "2026-09-11T12:00:00.000Z",
      validTo: "2026-09-11T15:00:00.000Z",
      intervalSeconds: 10800,
    });
    const { samples } = buildTrajectory({
      issuedAt: ISSUED,
      hours: 2,
      forecasts: { planetary_a: [undeclared] },
      mode: "live",
    });
    for (const sample of samples) {
      expect(sample.drivers.planetary_a.origin).toBe("absent");
    }
  });

  it("still places a correctly filed record", () => {
    const { samples } = buildTrajectory({
      issuedAt: ISSUED,
      hours: 2,
      forecasts: { kp: kpBins() },
      mode: "live",
    });
    expect(samples[0].drivers.kp).toMatchObject({ origin: "issued_forecast" });
  });
});
