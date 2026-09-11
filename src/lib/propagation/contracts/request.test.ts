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
    const bad = candidate("satellitePass");
    (bad.scope as Mutable).intervalSeconds = null;
    expect(reasonsAt(bad, "scope.intervalSeconds").join()).toMatch(
      /must declare intervalSeconds/,
    );
  });

  it("rejects an instantaneous sample relabelled with an interval", () => {
    const bad = candidate("hfShortPath");
    (bad.scope as Mutable).intervalSeconds = 3600;
    expect(reasonsAt(bad, "scope.intervalSeconds").join()).toMatch(
      /must not declare an interval length/,
    );
  });

  it("rejects out-of-range coordinates", () => {
    const bad = candidate("hfShortPath");
    ((bad.tx as Mutable).coordinates as Mutable).latitudeDeg = 91;
    expect(reasonsAt(bad, "tx.coordinates.latitudeDeg")).toHaveLength(1);
  });
});
