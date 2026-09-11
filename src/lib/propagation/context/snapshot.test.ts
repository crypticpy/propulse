import { describe, expect, it } from "vitest";

import resultCases from "@/lib/propagation/contracts/fixtures/result.cases.json";
import { parseResult } from "@/lib/propagation/contracts/result";

import { recordsFromSnapshotRow, type SolarSnapshotRow } from "./adapters";
import { DISABLED_CAPABILITIES, LEDGER_VERSION } from "./ledger";
import {
  buildContextSnapshot,
  CENSUS_SOURCE_IDS,
  toEvidenceSources,
} from "./snapshot";
import type { ContextSnapshot } from "./types";

/** The issue time the merged result fixture was written against. */
const ISSUED = "2026-09-11T18:00:00Z";

const ROW: SolarSnapshotRow = {
  captured_at: "2026-09-11T17:50:00.000Z",
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
    kp: "2026-09-11T17:45:00.000Z",
    f107: "2026-09-11T00:00:00.000Z",
    magnetic_field: "2026-09-11T17:45:00.000Z",
    solar_wind: "2026-09-11T17:45:00.000Z",
    sunspot_number: "2026-09-11T00:00:00.000Z",
    proton_flux_10mev: "2026-09-11T17:40:00.000Z",
    dst: "2026-09-11T17:00:00.000Z",
    hp60: "2026-09-11T16:00:00.000Z",
  },
  source_status: {
    magnetic_field: { active: true },
    solar_wind: { active: true },
  },
};

function historiesFrom(
  row: SolarSnapshotRow,
): Record<string, ReturnType<typeof recordsFromSnapshotRow>> {
  const histories: Record<
    string,
    ReturnType<typeof recordsFromSnapshotRow>
  > = {};
  for (const record of recordsFromSnapshotRow(row)) {
    histories[record.sourceId] = [
      ...(histories[record.sourceId] ?? []),
      record,
    ];
  }
  return histories;
}

async function snapshot(
  overrides: Partial<Parameters<typeof buildContextSnapshot>[0]> = {},
): Promise<ContextSnapshot> {
  return buildContextSnapshot({
    issuedAt: ISSUED,
    mode: "cached_live",
    histories: historiesFrom(ROW),
    ...overrides,
  });
}

/** Every `value` key reachable under a subtree, however deeply nested. */
function valueKeys(node: unknown, path: string[] = []): string[] {
  if (node === null || typeof node !== "object") return [];
  if (Array.isArray(node)) {
    return node.flatMap((child, index) =>
      valueKeys(child, [...path, String(index)]),
    );
  }
  return Object.entries(node as Record<string, unknown>).flatMap(
    ([key, child]) =>
      key === "value"
        ? [[...path, key].join(".")]
        : valueKeys(child, [...path, key]),
  );
}

describe("buildContextSnapshot: the census", () => {
  it("carries one entry for every declared source, present or not", async () => {
    const built = await snapshot();
    expect(Object.keys(built.sources).sort()).toEqual(
      [...CENSUS_SOURCE_IDS].sort(),
    );
    expect(built.sources.r12_climatology.state).toBe("absent");
    expect(built.sources.kp.state).toBe("selected");
    expect(built.ledgerVersion).toBe(LEDGER_VERSION);
  });

  it("never exposes a number for a source that was not selected", async () => {
    const built = await snapshot();
    for (const [sourceId, entry] of Object.entries(built.sources)) {
      if (entry.state === "selected") continue;
      expect(valueKeys(entry), `${sourceId} exposes a value`).toEqual([]);
    }
  });

  it("discloses the age of every selected source", async () => {
    const built = await snapshot();
    const kp = built.sources.kp;
    expect(kp.state).toBe("selected");
    if (kp.state !== "selected") return;
    expect(kp.ageSeconds).toBe(900);
  });

  it("is deeply frozen", async () => {
    const built = await snapshot();
    expect(Object.isFrozen(built)).toBe(true);
    expect(Object.isFrozen(built.sources)).toBe(true);
    expect(Object.isFrozen(built.sources.kp)).toBe(true);
    expect(() => {
      (built as { issuedAt: string }).issuedAt = "2020-01-01T00:00:00.000Z";
    }).toThrow(TypeError);
  });
});

describe("buildContextSnapshot: identity", () => {
  it("is deterministic for the same inputs", async () => {
    const [first, second] = await Promise.all([snapshot(), snapshot()]);
    expect(first.contextId).toMatch(/^ctx:sha256:[0-9a-f]{64}$/);
    expect(first.contextId).toBe(second.contextId);
  });

  it("changes when the mode changes", async () => {
    const live = await snapshot({ mode: "cached_live" });
    const offline = await snapshot({ mode: "offline" });
    expect(offline.contextId).not.toBe(live.contextId);
  });

  it("changes when one source degrades, so a degraded context cannot reuse a cache", async () => {
    const healthy = await snapshot();
    const degraded = await snapshot({
      histories: historiesFrom({
        ...ROW,
        source_status: { ...ROW.source_status, solar_wind: { active: false } },
      }),
    });
    expect(degraded.contextId).not.toBe(healthy.contextId);
    expect(degraded.sources.solar_wind).toMatchObject({
      reason: "source_inactive",
    });
    // The other evidence survives the outage untouched.
    expect(degraded.sources.kp).toEqual(healthy.sources.kp);
    expect(degraded.sources.magnetic_field.state).toBe("selected");
  });
});

describe("buildContextSnapshot: modes", () => {
  it("excludes every cached observation in offline mode and says why", async () => {
    const built = await snapshot({ mode: "offline" });
    for (const sourceId of ["kp", "f107", "magnetic_field", "dst", "hp60"]) {
      expect(built.sources[sourceId]).toMatchObject({ reason: "offline_mode" });
    }
  });

  it("names the capture-bounded sources and the disabled capabilities in its assumptions", async () => {
    const built = await snapshot();
    expect(built.assumptions.length).toBeGreaterThan(0);
    expect(built.assumptions[0]).toContain("M02");
    expect(
      built.assumptions.some((line) => line.includes("capture_bounded")),
    ).toBe(true);
    for (const capability of DISABLED_CAPABILITIES) {
      expect(
        built.assumptions.some((line) => line.includes(capability.id)),
      ).toBe(true);
    }
  });
});

describe("toEvidenceSources: the PROP-04 projection", () => {
  it("parses inside the merged prediction result contract", async () => {
    const built = await snapshot();
    const fixture = resultCases.fullHfCircuit as unknown as Record<
      string,
      unknown
    >;
    const candidate = {
      ...fixture,
      contextId: built.contextId,
      evidence: { sources: toEvidenceSources(built) },
      heads: (fixture.heads as Record<string, unknown>[]).map((head) => ({
        ...head,
        contextId: built.contextId,
      })),
    };
    const outcome = parseResult(candidate);
    expect(
      outcome.ok,
      JSON.stringify(outcome.ok ? [] : outcome.issues, null, 2),
    ).toBe(true);
  });

  it("pins an eligible source with a sha256 version and an excluded one with a reason", async () => {
    const built = await snapshot();
    const projected = toEvidenceSources(built);
    const kp = projected.find((source) => source.sourceId === "kp");
    expect(kp?.eligible).toBe(true);
    expect(kp?.sourceVersion).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(kp?.exclusionReason).toBeNull();

    const absent = projected.find(
      (source) => source.sourceId === "r12_climatology",
    );
    expect(absent?.eligible).toBe(false);
    expect(absent?.sourceVersion).toBe("unknown");
    expect(absent?.exclusionReason).toBe("no_record_in_history");
    expect(absent?.capturedAt).toBeNull();
  });

  it("keeps a stale source visible and dated rather than dropping or zeroing it", async () => {
    const stale: SolarSnapshotRow = {
      ...ROW,
      source_observed_at: {
        ...ROW.source_observed_at,
        kp: "2026-09-11T10:00:00.000Z",
      },
    };
    const built = await snapshot({ histories: historiesFrom(stale) });
    expect(built.sources.kp).toMatchObject({
      state: "excluded",
      reason: "beyond_age_bound",
    });
    const projected = toEvidenceSources(built);
    const kp = projected.find((source) => source.sourceId === "kp");
    expect(kp?.eligible).toBe(false);
    expect(kp?.observedIntervalEndAt).toBe("2026-09-11T10:00:00.000Z");
    expect(kp?.sourceVersion).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

describe("buildContextSnapshot: a forecast source never stands in for an observation", () => {
  /** A predicted Kp bin, issued and captured before the issue instant. */
  const predictedKp = {
    sourceId: "kp_forecast",
    variable: "kp",
    units: "dimensionless (Kp, thirds)",
    value: 7,
    stamps: {
      observedIntervalStartAt: null,
      observedIntervalEndAt: "2026-09-11T17:55:00.000Z",
      publication: {
        kind: "bounded_by_capture" as const,
        publishedAt: "2026-09-11T17:55:00.000Z",
      },
      capturedAt: "2026-09-11T17:55:00.000Z",
      forecastIssuedAt: "2026-09-11T17:55:00.000Z",
      validFrom: "2026-09-11T18:00:00.000Z",
      validTo: "2026-09-11T21:00:00.000Z",
      intervalSeconds: 10800,
      revision: "kp-forecast test",
      archiveClass: "capture_bounded" as const,
    },
    origin: "network" as const,
    activity: "not_reported" as const,
    qualityFlags: ["predicted"],
  };

  it("drives horizon zero from the measurement, not from the prediction", async () => {
    const built = await snapshot({
      histories: { ...historiesFrom(ROW), kp_forecast: [predictedKp] },
      trajectoryHours: 2,
    });
    const first = built.trajectory[0].drivers.kp;
    expect(first.origin).toBe("observed_at_issue");
    if (first.origin === "absent") return;
    expect(first.value).toBe(3);
    expect(first.sourceId).toBe("kp");
    // One sample later the forecast is the only thing that speaks.
    expect(built.trajectory[1].drivers.kp.origin).toBe("issued_forecast");
  });
});

describe("buildContextSnapshot: a multi-variable source keeps every variable", () => {
  it("exposes all four magnetic field components, not only the first", async () => {
    const built = await snapshot();
    const field = built.sources.magnetic_field;
    expect(field.state).toBe("selected");
    expect(Object.keys(field.variables).sort()).toEqual([
      "bt",
      "bx_gsm",
      "by_gsm",
      "bz_gsm",
    ]);
    for (const [variable, outcome] of Object.entries(field.variables)) {
      expect(outcome.state, `${variable} was not selected`).toBe("selected");
      if (outcome.state !== "selected") continue;
      expect(Number.isFinite(outcome.record.value)).toBe(true);
    }
    const values = Object.fromEntries(
      Object.entries(field.variables).map(([variable, outcome]) => [
        variable,
        outcome.state === "selected" ? outcome.record.value : null,
      ]),
    );
    expect(values).toEqual({ bt: 6, bx_gsm: 1, by_gsm: 2, bz_gsm: -3 });
  });

  it("changes identity when one component of a shared source changes", async () => {
    const base = await snapshot();
    const southward = await snapshot({
      histories: historiesFrom({ ...ROW, bz_gsm: -12 }),
    });
    expect(southward.contextId).not.toBe(base.contextId);
  });

  it("drives every component of the trajectory at horizon zero", async () => {
    const built = await snapshot({ trajectoryHours: 1 });
    const drivers = built.trajectory[0].drivers;
    for (const variable of ["bt", "bx_gsm", "by_gsm", "bz_gsm"]) {
      expect(drivers[variable]?.origin, `${variable} has no driver`).toBe(
        "observed_at_issue",
      );
    }
  });
});

describe("buildContextSnapshot: an outage row acts as a barrier", () => {
  /** A row with no readings at all, recording only that a feed went dark. */
  const outage: SolarSnapshotRow = {
    ...ROW,
    captured_at: "2026-09-11T17:55:00.000Z",
    kp_index: null,
    sfi: null,
    bt: null,
    bx_gsm: null,
    by_gsm: null,
    bz_gsm: null,
    solar_wind_speed: null,
    solar_wind_temperature: null,
    solar_wind_density: null,
    sunspot_number: null,
    proton_flux_10mev: null,
    dst_index: null,
    hp60: null,
    source_observed_at: { solar_wind: "2026-09-11T17:50:00.000Z" },
    source_status: { solar_wind: { active: false } },
  };

  function merged(): Record<string, ReturnType<typeof recordsFromSnapshotRow>> {
    const histories = historiesFrom(ROW);
    for (const record of recordsFromSnapshotRow(outage)) {
      histories[record.sourceId] = [
        ...(histories[record.sourceId] ?? []),
        record,
      ];
    }
    return histories;
  }

  it("reports the outage, not the older reading, once a feed goes dark", async () => {
    const built = await snapshot({ histories: merged() });
    expect(built.sources.solar_wind).toMatchObject({
      state: "excluded",
      reason: "source_inactive",
    });
    expect(valueKeys(built.sources.solar_wind)).toEqual([]);
    // The outage belongs to one feed; the rest of the census is untouched.
    expect(built.sources.magnetic_field.state).toBe("selected");
  });
});

describe("buildContextSnapshot: the trajectory reads the censused records", () => {
  const bin = (value: number, from: string, to: string) => ({
    sourceId: "kp_forecast",
    variable: "kp",
    units: "dimensionless (Kp, thirds)",
    value,
    stamps: {
      observedIntervalStartAt: null,
      observedIntervalEndAt: "2026-09-11T17:55:00.000Z",
      publication: {
        kind: "bounded_by_capture" as const,
        publishedAt: "2026-09-11T17:55:00.000Z",
      },
      capturedAt: "2026-09-11T17:55:00.000Z",
      forecastIssuedAt: "2026-09-11T17:55:00.000Z",
      validFrom: from,
      validTo: to,
      intervalSeconds: 10800,
      revision: `kp-forecast ${from}`,
      archiveClass: "capture_bounded" as const,
    },
    origin: "network" as const,
    activity: "not_reported" as const,
    qualityFlags: ["predicted"],
  });

  const bins = (later: number) => [
    bin(3, "2026-09-11T18:00:00.000Z", "2026-09-11T21:00:00.000Z"),
    bin(later, "2026-09-11T21:00:00.000Z", "2026-09-12T00:00:00.000Z"),
  ];

  it("cannot be driven by a forecast the census never saw", async () => {
    const smuggled = {
      issuedAt: ISSUED,
      mode: "cached_live",
      histories: historiesFrom(ROW),
      trajectoryHours: 2,
      forecasts: { kp: bins(5) },
      priors: {},
    } as unknown as Parameters<typeof buildContextSnapshot>[0];
    const built = await buildContextSnapshot(smuggled);
    expect(built.sources.kp_forecast.state).toBe("absent");
    expect(built.trajectory[1].drivers.kp.origin).toBe("absent");
  });

  it("drives the trajectory from the forecast records in the histories", async () => {
    const built = await snapshot({
      histories: { ...historiesFrom(ROW), kp_forecast: bins(5) },
      trajectoryHours: 2,
    });
    expect(built.sources.kp_forecast.state).toBe("selected");
    expect(built.trajectory[1].drivers.kp).toMatchObject({
      origin: "issued_forecast",
      value: 3,
    });
  });

  it("pins every eligible record, so a later bin cannot change unnoticed", async () => {
    const base = await snapshot({
      histories: { ...historiesFrom(ROW), kp_forecast: bins(5) },
      trajectoryHours: 1,
    });
    const moved = await snapshot({
      histories: { ...historiesFrom(ROW), kp_forecast: bins(8) },
      trajectoryHours: 1,
    });
    // The grid is one sample long, so the changed bin drives nothing: only
    // the pin of the product itself can carry the difference.
    expect(base.trajectory).toEqual(moved.trajectory);
    expect(moved.sources.kp_forecast.sourceVersion).not.toBe(
      base.sources.kp_forecast.sourceVersion,
    );
    expect(moved.contextId).not.toBe(base.contextId);
  });
});
