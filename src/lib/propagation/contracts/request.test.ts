import { describe, expect, it } from "vitest";
import requestCases from "@/lib/propagation/contracts/fixtures/request.cases.json";
import { parseRequest } from "@/lib/propagation/contracts/request";
import type { ContractIssue } from "@/lib/propagation/contracts/validation";

type Mutable = Record<string, unknown>;

const cases = requestCases as unknown as Record<string, Mutable>;

function candidate(name: keyof typeof cases): Mutable {
  return structuredClone(cases[name]) as Mutable;
}

function issues(value: unknown): ContractIssue[] {
  const outcome = parseRequest(value);
  expect(outcome.ok).toBe(false);
  return outcome.ok ? [] : outcome.issues;
}

function reasonsAt(value: unknown, path: string): string[] {
  return issues(value)
    .filter((issue) => issue.path === path)
    .map((issue) => issue.reason);
}

describe("parseRequest fixtures", () => {
  it.each(Object.keys(cases))("round-trips the %s fixture", (name) => {
    const outcome = parseRequest(candidate(name));
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
    if (!outcome.ok) return;
    // The parsed value carries every field the fixture declared, unchanged.
    expect(JSON.parse(JSON.stringify(outcome.value))).toEqual(cases[name]);
    // An immutable context cannot be edited after parsing.
    expect(Object.isFrozen(outcome.value)).toBe(true);
    expect(Object.isFrozen(outcome.value.tx.coordinates)).toBe(true);
  });
});

describe("parseRequest fails closed", () => {
  it("rejects non-objects without throwing", () => {
    for (const value of [null, undefined, 42, "request", []]) {
      expect(parseRequest(value).ok).toBe(false);
    }
  });

  it("never returns a partially filled object", () => {
    const broken = candidate("hfShortPath");
    delete broken.modeProfileId;
    const outcome = parseRequest(broken);
    expect(outcome.ok).toBe(false);
    expect(outcome).not.toHaveProperty("value");
  });

  it("rejects an unknown key instead of dropping it", () => {
    const extra = candidate("hfShortPath");
    extra.selectedTarget = "DX";
    expect(reasonsAt(extra, "").join()).toMatch(/Unrecognized key/i);
  });

  it("rejects an unknown enum member", () => {
    const bad = candidate("hfShortPath");
    bad.targetEvent = "band_open";
    expect(reasonsAt(bad, "targetEvent")).toHaveLength(1);
  });

  it("rejects a frequency supplied in MHz where Hz is required", () => {
    const mhz = candidate("hfShortPath");
    mhz.frequencyHz = 14.074;
    expect(reasonsAt(mhz, "frequencyHz").join()).toMatch(
      /greater than or equal to 10000/,
    );
  });

  it("accepts a frequency far outside the eleven catalog band slots", () => {
    const microwave = candidate("hfShortPath");
    microwave.frequencyHz = 10_368_000_000;
    microwave.bandKey = "3cm";
    expect(parseRequest(microwave).ok).toBe(true);
  });

  it("rejects NaN and Infinity where a finite number is required", () => {
    for (const value of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      const bad = candidate("hfShortPath");
      bad.frequencyHz = value;
      expect(parseRequest(bad).ok).toBe(false);
    }
  });

  it("rejects a valid time before the issue time (M02)", () => {
    const reversed = candidate("hfShortPath");
    reversed.validAt = "2026-09-11T17:00:00Z";
    expect(reasonsAt(reversed, "validAt").join()).toMatch(/must not precede/);
  });

  it("rejects a named model policy without a model version", () => {
    const bad = candidate("hfShortPath");
    (bad.requestedModel as Mutable).modelVersion = null;
    expect(reasonsAt(bad, "requestedModel.modelId").join()).toMatch(
      /modelId and modelVersion/,
    );
  });

  it("rejects a named model on an auto or physics-only policy", () => {
    const bad = candidate("satellitePass");
    (bad.requestedModel as Mutable).modelId = "n5-nowcast";
    expect(reasonsAt(bad, "requestedModel.modelId").join()).toMatch(
      /must not name a model/,
    );
  });

  it("requires a relay identity for a relayed geometry class (A21)", () => {
    const bad = candidate("satellitePass");
    bad.relay = null;
    expect(reasonsAt(bad, "relay").join()).toMatch(/requires a relay/);
  });

  it("rejects a relay identity on a terrestrial geometry class", () => {
    const bad = candidate("hfShortPath");
    bad.relay = {
      relayId: "so-50",
      ephemerisId: "celestrak-tle-2026-09-11",
      ephemerisEpoch: "2026-09-11T06:14:02Z",
    };
    expect(reasonsAt(bad, "relay").join()).toMatch(/no relay leg/);
  });

  it("rejects an ephemeris captured after the issue time (M02)", () => {
    const bad = candidate("satellitePass");
    (bad.relay as Mutable).ephemerisEpoch = "2026-09-11T18:00:01Z";
    expect(reasonsAt(bad, "relay.ephemerisEpoch").join()).toMatch(
      /not as-issued/,
    );
  });

  it("requires a terrain profile for a terrain-dependent mechanism (A02)", () => {
    const bad = candidate("hfShortPath");
    (bad.mechanismPolicy as Mutable).family = "terrain_troposphere";
    expect(reasonsAt(bad, "terrainProfileId").join()).toMatch(
      /requires a terrain profile/,
    );
  });

  it("requires an explicit cell size for a quantized coordinate (M01)", () => {
    const bad = candidate("hfShortPath");
    const precision = ((bad.tx as Mutable).coordinates as Mutable)
      .precision as Mutable;
    precision.kind = "quantized_cell";
    expect(
      reasonsAt(bad, "tx.coordinates.precision.cellSizeDeg").join(),
    ).toMatch(/declare its cell size/);
  });

  it("rejects a cell size on a precise coordinate", () => {
    const bad = candidate("hfShortPath");
    const precision = ((bad.tx as Mutable).coordinates as Mutable)
      .precision as Mutable;
    precision.cellSizeDeg = 5;
    expect(
      reasonsAt(bad, "tx.coordinates.precision.cellSizeDeg").join(),
    ).toMatch(/Only a quantized_cell/);
  });

  it("rejects an unknown value that carries no reason", () => {
    const bad = candidate("hfShortPath");
    (bad.rx as Mutable).deliveredPowerWatts = { state: "unknown" };
    expect(reasonsAt(bad, "rx.deliveredPowerWatts.reason")).toHaveLength(1);
  });

  it("rejects a known antenna height with an unknown datum", () => {
    const bad = candidate("hfShortPath");
    ((bad.tx as Mutable).antenna as Mutable).heightDatum = "unknown";
    expect(reasonsAt(bad, "tx.antenna.heightDatum").join()).toMatch(
      /must name the datum/,
    );
  });

  it("rejects an interval scope with no interval length (M02)", () => {
    const bad = candidate("hfShortPath");
    bad.targetEvent = "observed_activity";
    (bad.scope as Mutable).aggregation = "interval";
    (bad.scope as Mutable).intervalSeconds = null;
    expect(reasonsAt(bad, "scope.intervalSeconds").join()).toMatch(
      /must declare intervalSeconds/,
    );
  });

  it("rejects an interval-valued event carrying an instantaneous scope (M02)", () => {
    const bad = candidate("hfShortPath");
    bad.targetEvent = "observed_activity";
    expect(reasonsAt(bad, "scope.aggregation").join()).toMatch(
      /observed_activity is defined over an interval/,
    );
  });

  it("rejects a burst event carrying an instantaneous scope (M02)", () => {
    const bad = candidate("hfShortPath");
    bad.targetEvent = "usable_burst";
    expect(reasonsAt(bad, "scope.aggregation").join()).toMatch(
      /usable_burst is defined over an interval/,
    );
  });

  it("rejects an instant-valued event carrying an interval scope (M02)", () => {
    const bad = candidate("hfShortPath");
    (bad.scope as Mutable).aggregation = "interval";
    (bad.scope as Mutable).intervalSeconds = 3600;
    expect(reasonsAt(bad, "scope.aggregation").join()).toMatch(
      /snr2500 is sampled at an instant/,
    );
  });

  it("accepts an interval-valued event with a positive interval scope", () => {
    const good = candidate("hfShortPath");
    good.targetEvent = "usable_burst";
    (good.scope as Mutable).aggregation = "interval";
    (good.scope as Mutable).intervalSeconds = 900;
    const outcome = parseRequest(good);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("rejects a non-positive interval length", () => {
    const bad = candidate("hfShortPath");
    bad.targetEvent = "usable_burst";
    (bad.scope as Mutable).aggregation = "interval";
    (bad.scope as Mutable).intervalSeconds = 0;
    expect(reasonsAt(bad, "scope.intervalSeconds").length).toBeGreaterThan(0);
  });

  it("rejects an instantaneous sample relabelled with an interval", () => {
    const bad = candidate("hfShortPath");
    (bad.scope as Mutable).intervalSeconds = 3600;
    expect(reasonsAt(bad, "scope.intervalSeconds").join()).toMatch(
      /must not declare an interval length/,
    );
  });

  it("rejects coincident endpoints with no explicit route azimuth (M06)", () => {
    const bad = candidate("hfShortPath");
    (bad.rx as Mutable).coordinates = structuredClone(
      (bad.tx as Mutable).coordinates,
    );
    expect(reasonsAt(bad, "route.azimuthDeg").join()).toMatch(
      /explicit route azimuth is required/,
    );
  });

  it("rejects exactly antipodal endpoints with no explicit route azimuth (M06)", () => {
    const bad = candidate("hfShortPath");
    const tx = (bad.tx as Mutable).coordinates as Mutable;
    const rx = (bad.rx as Mutable).coordinates as Mutable;
    rx.latitudeDeg = -(tx.latitudeDeg as number);
    rx.longitudeDeg = (tx.longitudeDeg as number) + 180;
    expect(reasonsAt(bad, "route.azimuthDeg").join()).toMatch(
      /explicit route azimuth is required/,
    );
  });

  it("accepts degenerate endpoints once the route azimuth is explicit", () => {
    const explicit = candidate("hfShortPath");
    (explicit.rx as Mutable).coordinates = structuredClone(
      (explicit.tx as Mutable).coordinates,
    );
    (explicit.route as Mutable).azimuthDeg = 45;
    expect(parseRequest(explicit).ok).toBe(true);
  });

  it("rejects an explicit route azimuth on an ordinary path (M06)", () => {
    const bad = candidate("hfShortPath");
    (bad.route as Mutable).azimuthDeg = 71.5;
    expect(reasonsAt(bad, "route.azimuthDeg").join()).toMatch(
      /only for degenerate endpoints/,
    );
  });

  it("rejects an instant with more than millisecond precision", () => {
    const bad = candidate("hfShortPath");
    bad.validAt = "2026-09-11T19:00:00.0001Z";
    expect(reasonsAt(bad, "validAt").join()).toMatch(
      /at most millisecond precision/,
    );
  });

  it("accepts an instant with exactly three fractional digits", () => {
    const good = candidate("hfShortPath");
    good.validAt = "2026-09-11T19:00:00.250Z";
    const outcome = parseRequest(good);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("accepts an instant written with a numeric offset", () => {
    const good = candidate("hfShortPath");
    good.validAt = "2026-09-11T20:00:00+01:00";
    const outcome = parseRequest(good);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("still accepts an ordinary path with a derived (null) azimuth", () => {
    const ordinary = candidate("hfShortPath");
    expect((ordinary.route as Mutable).azimuthDeg).toBeNull();
    expect(parseRequest(ordinary).ok).toBe(true);
  });

  it("rejects out-of-range coordinates", () => {
    const bad = candidate("hfShortPath");
    ((bad.tx as Mutable).coordinates as Mutable).latitudeDeg = 91;
    expect(reasonsAt(bad, "tx.coordinates.latitudeDeg")).toHaveLength(1);
  });
});
