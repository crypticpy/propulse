import { describe, expect, it } from "vitest";
import requestCases from "@/lib/propagation/contracts/fixtures/request.cases.json";
import {
  parseRequest,
  predictionRequestSchema,
} from "@/lib/propagation/contracts/request";
import {
  GEOMETRY_CLASSES,
  MECHANISM_FAMILIES,
  PERMITTED_GEOMETRY_CLASSES,
  protocolCoverageContainsHz,
} from "@/lib/propagation/contracts/enums";
import type { ContractIssue } from "@/lib/propagation/contracts/validation";

type Mutable = Record<string, unknown>;

const cases = requestCases as unknown as Record<string, Mutable>;

function candidate(name: keyof typeof cases): Mutable {
  return structuredClone(cases[name]) as Mutable;
}

/**
 * hfShortPath moved onto a bistatic scatter circuit for `family`: the frozen
 * row for that family, the scatter route shape, and no direct leg.
 */
function scatterCase(
  family: string,
  basis = "great_circle_plane",
  extra: (draft: Mutable) => void = () => {},
): Mutable {
  const draft = candidate("hfShortPath");
  (draft.mechanismPolicy as Mutable).family = family;
  (draft.mechanismPolicy as Mutable).geometryClass = "bistatic_scatter";
  draft.route = { kind: "scatter", basis };
  if (family === "aurora") {
    draft.targetEvent = "conditional_decode";
    (draft.scope as Mutable).domain = "mechanism_labeled_exposure";
    (draft.scope as Mutable).horizon = "current";
  } else {
    // meteor, rain_scatter and aircraft_scatter are frozen as usable_burst
    // over a known exposure interval.
    draft.targetEvent = "usable_burst";
    (draft.scope as Mutable).domain = "known_exposure_interval";
    (draft.scope as Mutable).horizon = "current";
    (draft.scope as Mutable).aggregation = "interval";
    (draft.scope as Mutable).intervalSeconds = 900;
  }
  extra(draft);
  return draft;
}

/**
 * hfShortPath with the receiver moved `offsetDeg` from the transmitter and
 * neither endpoint declaring its horizontal uncertainty.
 */
function unstatedPrecisionCase(offsetDeg: number): Mutable {
  const draft = candidate("hfShortPath");
  const tx = (draft.tx as Mutable).coordinates as Mutable;
  const rx = (draft.rx as Mutable).coordinates as Mutable;
  rx.latitudeDeg = tx.latitudeDeg;
  rx.longitudeDeg = (tx.longitudeDeg as number) + offsetDeg;
  for (const point of [tx, rx]) {
    (point.precision as Mutable).horizontalMeters = {
      state: "unknown",
      reason: "not_reported",
    };
  }
  return draft;
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

/** hfShortPath with exactly antipodal endpoints and an explicit azimuth. */
function antipodalCase(): Mutable {
  const draft = candidate("hfShortPath");
  const tx = (draft.tx as Mutable).coordinates as Mutable;
  const rx = (draft.rx as Mutable).coordinates as Mutable;
  rx.latitudeDeg = -(tx.latitudeDeg as number);
  rx.longitudeDeg = (tx.longitudeDeg as number) + 180;
  (draft.route as Mutable).azimuthDeg = 45;
  (draft.route as Mutable).leg = null;
  return draft;
}

/**
 * hfShortPath with the endpoints offset from exact antipodes by `offsetDeg`,
 * each coordinate declaring `uncertaintyMeters` of horizontal uncertainty.
 */
function nearAntipodalCase(
  offsetDeg: number,
  uncertaintyMeters: number,
): Mutable {
  const draft = candidate("hfShortPath");
  const tx = (draft.tx as Mutable).coordinates as Mutable;
  const rx = (draft.rx as Mutable).coordinates as Mutable;
  rx.latitudeDeg = -(tx.latitudeDeg as number);
  rx.longitudeDeg = (tx.longitudeDeg as number) + 180 - offsetDeg;
  for (const point of [tx, rx]) {
    (point.precision as Mutable).horizontalMeters = {
      state: "known",
      value: uncertaintyMeters,
    };
  }
  return draft;
}

/**
 * A 2 m field-strength request on the qualified terrain climate row, with no
 * terrain profile: the row the protocol froze for terrain_troposphere alone.
 */
function terrainClimateRequest(family: string): Mutable {
  const draft = candidate("hfShortPath");
  draft.targetEvent = "field_strength";
  (draft.scope as Mutable).domain = "qualified_terrain_climate";
  (draft.scope as Mutable).horizon = "climatology";
  (draft.mechanismPolicy as Mutable).family = family;
  (draft.mechanismPolicy as Mutable).geometryClass = "terrestrial_great_circle";
  draft.frequencyHz = 144100000;
  draft.bandKey = "8m_6m_4m_2m";
  draft.terrainProfileId = null;
  return draft;
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

  it("rejects an identifier with surrounding whitespace instead of trimming it", () => {
    const bad = candidate("hfShortPath");
    bad.contextId = `${cases.hfShortPath.contextId as string} `;
    expect(reasonsAt(bad, "contextId").join()).toMatch(
      /no leading or trailing whitespace/,
    );
  });

  it("accepts the same identifier already trimmed", () => {
    const good = candidate("hfShortPath");
    good.contextId = (cases.hfShortPath.contextId as string).trim();
    expect(good.contextId).toBe(cases.hfShortPath.contextId);
    const outcome = parseRequest(good);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("rejects a mechanism family on a geometry class it never takes (A21, A22)", () => {
    const bad = candidate("hfShortPath");
    // satellite physics on a single terrestrial great circle with no relay:
    // the two fields name one path and this pair contradicts itself.
    (bad.mechanismPolicy as Mutable).family = "satellite";
    expect(reasonsAt(bad, "mechanismPolicy.geometryClass").join()).toMatch(
      /satellite is not requested on geometry class terrestrial_great_circle/,
    );
  });

  it.each(["aurora", "meteor", "rain_scatter"])(
    "routes %s through a scattering region, not a direct leg (A19, A20)",
    (family) => {
      const outcome = parseRequest(scatterCase(family));
      expect(outcome.ok ? [] : outcome.issues).toEqual([]);
      if (!outcome.ok) return;
      expect(outcome.value.route).toEqual({
        kind: "scatter",
        basis: "great_circle_plane",
      });
    },
  );

  it("rejects a bistatic scatter request that declares a direct leg (A19)", () => {
    const bad = scatterCase("meteor", "great_circle_plane", (draft) => {
      draft.route = { kind: "direct", leg: "short", azimuthDeg: null };
    });
    expect(reasonsAt(bad, "route.kind").join()).toMatch(
      /takes the scatter route shape/,
    );
  });

  it("rejects a scatter route on a single-great-circle geometry (M06)", () => {
    const bad = candidate("hfShortPath");
    bad.route = { kind: "scatter", basis: "great_circle_plane" };
    expect(reasonsAt(bad, "route.kind").join()).toMatch(
      /must declare its short or long leg/,
    );
  });

  it("rejects an aircraft-scatter request, whose target it cannot represent (A19)", () => {
    const bad = scatterCase("aircraft_scatter", "target");
    expect(reasonsAt(bad, "mechanismPolicy.family").join()).toMatch(
      /no target identity or trajectory/,
    );
  });

  it("rejects a target basis, which places no scatterer (A19)", () => {
    const bad = scatterCase("meteor", "target");
    expect(reasonsAt(bad, "route.basis").join()).toMatch(
      /no target identity or trajectory to place it/,
    );
  });

  it("rejects a scatter basis the named family does not use (A19, A20)", () => {
    const bad = scatterCase("aircraft_scatter", "great_circle_plane");
    expect(reasonsAt(bad, "route.basis").join()).toMatch(
      /locates its scattering region on basis target/,
    );
  });

  it("resolves an auto scatter request only onto representable families (A19)", () => {
    const good = scatterCase("meteor", "great_circle_plane", (draft) => {
      (draft.mechanismPolicy as Mutable).family = "auto";
    });
    const outcome = parseRequest(good);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("rejects antipodal endpoints on a scattering circuit (M06, A19)", () => {
    const bad = scatterCase("meteor", "great_circle_plane", (draft) => {
      const tx = (draft.tx as Mutable).coordinates as Mutable;
      const rx = (draft.rx as Mutable).coordinates as Mutable;
      rx.latitudeDeg = -(tx.latitudeDeg as number);
      rx.longitudeDeg = (tx.longitudeDeg as number) + 180;
    });
    expect(reasonsAt(bad, "rx.coordinates").join()).toMatch(
      /lie on no single great circle/,
    );
  });

  it("models aurora as bistatic scatter, not a great circle (A19)", () => {
    const bad = candidate("hfShortPath");
    (bad.mechanismPolicy as Mutable).family = "aurora";
    expect(reasonsAt(bad, "mechanismPolicy.geometryClass").join()).toMatch(
      /aurora is not requested on geometry class terrestrial_great_circle/,
    );
    // The protocol freezes aurora as a mechanism-labelled exposure row, and
    // A19 puts its scattering volume in the plane of the terminal circle.
    const outcome = parseRequest(scatterCase("aurora"));
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("rejects a satellite family served by a fixed relay (A21)", () => {
    const bad = candidate("fixedRelay");
    (bad.mechanismPolicy as Mutable).family = "satellite";
    expect(reasonsAt(bad, "relay.kind").join()).toMatch(
      /satellite is not served by a relay of kind fixed/,
    );
  });

  it("rejects a terrestrial relay family served by an orbital relay (A21)", () => {
    const bad = candidate("satellitePass");
    (bad.mechanismPolicy as Mutable).family = "relay";
    (bad.mechanismPolicy as Mutable).geometryClass = "two_leg_relay";
    expect(reasonsAt(bad, "relay.kind").join()).toMatch(
      /relay is not served by a relay of kind orbital/,
    );
  });

  it("accepts every request fixture's family and geometry pair (A21, A22)", () => {
    for (const name of Object.keys(cases)) {
      const outcome = parseRequest(candidate(name));
      expect(outcome.ok ? [] : outcome.issues).toEqual([]);
    }
  });

  it("rejects a fixed relay antipodal to one of its endpoints (M06, A21)", () => {
    for (const end of ["tx", "rx"] as const) {
      const bad = candidate("fixedRelay");
      const endpoint = (bad[end] as Mutable).coordinates as Mutable;
      const relay = (bad.relay as Mutable).coordinates as Mutable;
      relay.latitudeDeg = -(endpoint.latitudeDeg as number);
      relay.longitudeDeg =
        (((endpoint.longitudeDeg as number) + 360) % 360) - 180;
      expect(reasonsAt(bad, "relay.coordinates").join()).toMatch(
        new RegExp(`antipodal to the ${end} station`),
      );
    }
  });

  it("still accepts an ordinary fixed relay between its endpoints (A21)", () => {
    const outcome = parseRequest(candidate("fixedRelay"));
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
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
    // 10 GHz is inside the protocol's 13cm_to_47GHz refractivity row.
    (microwave.scope as Mutable).domain = "qualified_terrain_profile";
    (microwave.mechanismPolicy as Mutable).family = "refractivity_pe";
    microwave.terrainProfileId = "srtm-30m-path-profile-v2";
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
      kind: "orbital",
      relayId: "so-50",
      ephemerisId: "celestrak-tle-2026-09-11",
      ephemerisEpoch: "2026-09-11T06:14:02Z",
    };
    expect(reasonsAt(bad, "relay").join()).toMatch(/no relay leg/);
  });

  it("accepts a fixed ground relay with no ephemeris (A21)", () => {
    const outcome = parseRequest(candidate("fixedRelay"));
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("still requires both ephemeris fields on an orbital relay (A21)", () => {
    const bad = candidate("satellitePass");
    delete (bad.relay as Mutable).ephemerisEpoch;
    expect(issues(bad).length).toBeGreaterThan(0);
  });

  it("rejects a fixed relay that smuggles in an ephemeris", () => {
    const bad = candidate("fixedRelay");
    (bad.relay as Mutable).ephemerisId = "celestrak-tle-2026-09-11";
    expect(issues(bad).length).toBeGreaterThan(0);
  });

  it("rejects an ephemeris captured after the issue time (M02)", () => {
    const bad = candidate("satellitePass");
    (bad.relay as Mutable).ephemerisEpoch = "2026-09-11T18:00:01Z";
    expect(reasonsAt(bad, "relay.ephemerisEpoch").join()).toMatch(
      /not as-issued/,
    );
  });

  it("requires a terrain profile for a terrain-dependent mechanism (A02)", () => {
    const bad = terrainClimateRequest("terrain_troposphere");
    expect(reasonsAt(bad, "terrainProfileId").join()).toMatch(
      /Mechanism family terrain_troposphere requires a terrain profile identity/,
    );
    const good = structuredClone(bad);
    good.terrainProfileId = "srtm-30m-path-profile-v2";
    const outcome = parseRequest(good);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("requires a terrain profile from the families that could serve the row (A02)", () => {
    // The protocol froze 2 m field strength on a qualified terrain climate for
    // terrain_troposphere alone. Reading the candidates off the geometry would
    // find great-circle families that need no profile and excuse the caller
    // from the one input the only family that could answer needs.
    const bad = terrainClimateRequest("auto");
    expect(reasonsAt(bad, "terrainProfileId").join()).toMatch(
      /Every mechanism family that could serve geometry class terrestrial_great_circle at 144100000 Hz requires a terrain profile identity \(A02\)/,
    );
    const good = structuredClone(bad);
    good.terrainProfileId = "srtm-30m-path-profile-v2";
    const outcome = parseRequest(good);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
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
    // usable_burst is frozen as a known exposure interval on a scatter family.
    const outcome = parseRequest(scatterCase("meteor"));
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

  it("treats two spellings of the same pole as coincident (M06)", () => {
    const bad = candidate("hfShortPath");
    // At +90 every meridian names the same point, so these are one station.
    (bad.tx as Mutable).coordinates = {
      ...((bad.tx as Mutable).coordinates as Mutable),
      latitudeDeg: 90,
      longitudeDeg: 0,
    };
    (bad.rx as Mutable).coordinates = {
      ...((bad.rx as Mutable).coordinates as Mutable),
      latitudeDeg: 90,
      longitudeDeg: 120,
    };
    expect(reasonsAt(bad, "rx.coordinates").join()).toMatch(
      /zero-distance circuit/,
    );
  });

  it("rejects a fixed relay on an earth_space geometry (A21)", () => {
    const bad = candidate("fixedRelay");
    (bad.mechanismPolicy as Mutable).geometryClass = "earth_space";
    expect(reasonsAt(bad, "relay.kind").join()).toMatch(
      /earth_space does not admit a fixed relay/,
    );
  });

  it("rejects a fixed relay on an earth_moon_earth geometry (A22)", () => {
    const bad = candidate("fixedRelay");
    (bad.mechanismPolicy as Mutable).geometryClass = "earth_moon_earth";
    expect(reasonsAt(bad, "relay.kind").join()).toMatch(
      /earth_moon_earth does not admit a fixed relay/,
    );
  });

  it("accepts an orbital relay on an earth_space geometry (A21)", () => {
    const good = candidate("satellitePass");
    (good.mechanismPolicy as Mutable).geometryClass = "earth_space";
    const outcome = parseRequest(good);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("accepts a fixed relay on a two_leg_relay geometry (A21)", () => {
    const outcome = parseRequest(candidate("fixedRelay"));
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
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

  /** Move rx a given number of metres north of tx, with declared precision. */
  function offsetCase(metres: number, sigmaMeters: number): Mutable {
    const draft = candidate("hfShortPath");
    const tx = (draft.tx as Mutable).coordinates as Mutable;
    const rx = (draft.rx as Mutable).coordinates as Mutable;
    rx.latitudeDeg =
      (tx.latitudeDeg as number) + (metres / 6371000) * (180 / Math.PI);
    rx.longitudeDeg = tx.longitudeDeg;
    for (const coordinates of [tx, rx]) {
      (coordinates.precision as Mutable).kind = "surveyed";
      (coordinates.precision as Mutable).horizontalMeters = {
        state: "known",
        value: sigmaMeters,
      };
    }
    return draft;
  }

  it("accepts a surveyed one-metre path with sub-metre uncertainty (M06)", () => {
    const outcome = parseRequest(offsetCase(1, 0.3));
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("treats endpoints inside their declared uncertainty as coincident (M06)", () => {
    const inside = offsetCase(1, 5);
    expect(reasonsAt(inside, "rx.coordinates").join()).toMatch(
      /zero-distance circuit/,
    );
  });

  it("rejects a coincident terrestrial circuit even with an explicit azimuth (M06)", () => {
    const zeroLength = candidate("hfShortPath");
    (zeroLength.rx as Mutable).coordinates = structuredClone(
      (zeroLength.tx as Mutable).coordinates,
    );
    (zeroLength.route as Mutable).azimuthDeg = 45;
    expect(reasonsAt(zeroLength, "rx.coordinates").join()).toMatch(
      /zero-distance circuit/,
    );
  });

  it("accepts antipodal endpoints once the route azimuth is explicit (M06)", () => {
    const explicit = candidate("hfShortPath");
    const tx = (explicit.tx as Mutable).coordinates as Mutable;
    const rx = (explicit.rx as Mutable).coordinates as Mutable;
    rx.latitudeDeg = -(tx.latitudeDeg as number);
    rx.longitudeDeg = (tx.longitudeDeg as number) + 180;
    (explicit.route as Mutable).azimuthDeg = 45;
    (explicit.route as Mutable).leg = null;
    const outcome = parseRequest(explicit);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("treats a point a few hundred metres short of the antipode as an ordinary path (M06)", () => {
    // 0.0029 deg of longitude off the antipode is about 280 m on the surface:
    // a dot-product guard of 1e-9 would swallow it (the dot product varies
    // quadratically near pi), the angular guard of 1e-12 rad does not. The
    // path keeps its leg.
    const nearly = nearAntipodalCase(0.0029, 1);
    const outcome = parseRequest(nearly);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
    const noLeg = nearAntipodalCase(0.0029, 1);
    (noLeg.route as Mutable).leg = null;
    expect(reasonsAt(noLeg, "route.leg").join()).toMatch(
      /A direct path must declare the short/,
    );
  });

  it("accepts the two geographic poles as exact antipodes (M06)", () => {
    // Both poles canonicalise to longitude 0, so only the unit vectors show
    // the half-turn: the pair is antipodal, takes a null leg and an azimuth.
    const poles = candidate("hfShortPath");
    const tx = (poles.tx as Mutable).coordinates as Mutable;
    const rx = (poles.rx as Mutable).coordinates as Mutable;
    tx.latitudeDeg = 90;
    tx.longitudeDeg = 12;
    rx.latitudeDeg = -90;
    rx.longitudeDeg = -37;
    (poles.route as Mutable).leg = null;
    (poles.route as Mutable).azimuthDeg = 180;
    const outcome = parseRequest(poles);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("rejects endpoints antipodal only within their declared uncertainty (M06)", () => {
    const bad = nearAntipodalCase(0.5, 100000);
    expect(reasonsAt(bad, "rx.coordinates").join()).toMatch(
      /declared position uncertainty/,
    );
  });

  it("accepts a near-antipodal path resolved by its declared precision (M06)", () => {
    // The same half-degree offset, declared to one metre, is an ordinary path:
    // it keeps its leg and derives its own tangent.
    const outcome = parseRequest(nearAntipodalCase(0.5, 1));
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("rejects near-coincident endpoints whose precision is unstated (M06)", () => {
    // One degree apart is about 100 km, and neither endpoint says how well it
    // knows where it is. Read as exact, that is an ordinary path; read as what
    // the producer actually declared, the two cannot be told apart.
    const bad = unstatedPrecisionCase(1);
    expect(
      reasonsAt(bad, "rx.coordinates.precision.horizontalMeters").join(),
    ).toMatch(/cannot be told apart from coincident/);
  });

  it("accepts the same short path once its precision is declared (M06)", () => {
    const good = unstatedPrecisionCase(1);
    for (const end of ["tx", "rx"] as const) {
      (
        ((good[end] as Mutable).coordinates as Mutable).precision as Mutable
      ).horizontalMeters = { state: "known", value: 5 };
    }
    const outcome = parseRequest(good);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("keeps a long path legal with an unstated precision (M06)", () => {
    // The fixture path is Austin to Sydney: far from coincident and far from
    // antipodal even at the coarsest position the contract admits.
    const good = candidate("hfShortPath");
    for (const end of ["tx", "rx"] as const) {
      (
        ((good[end] as Mutable).coordinates as Mutable).precision as Mutable
      ).horizontalMeters = { state: "unknown", reason: "not_reported" };
    }
    const outcome = parseRequest(good);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("rejects near-antipodal endpoints whose precision is unstated (M06)", () => {
    const bad = nearAntipodalCase(0.5, 1);
    for (const end of ["tx", "rx"] as const) {
      (
        ((bad[end] as Mutable).coordinates as Mutable).precision as Mutable
      ).horizontalMeters = { state: "unknown", reason: "not_reported" };
    }
    expect(
      reasonsAt(bad, "rx.coordinates.precision.horizontalMeters").join(),
    ).toMatch(/cannot be told apart from antipodal/);
  });

  it("rejects a leg on antipodal endpoints (M06)", () => {
    const bad = antipodalCase();
    (bad.route as Mutable).leg = "long";
    expect(reasonsAt(bad, "route.leg").join()).toMatch(/the leg is null/);
  });

  it("still requires a leg on an ordinary direct path (M06)", () => {
    const bad = candidate("hfShortPath");
    (bad.route as Mutable).leg = null;
    expect(reasonsAt(bad, "route.leg").join()).toMatch(
      /must declare the short or the long leg/,
    );
  });

  it("rejects a known relay height measured against an unknown datum (A21)", () => {
    const bad = candidate("fixedRelay");
    (bad.relay as Mutable).heightDatum = "unknown";
    expect(reasonsAt(bad, "relay.heightDatum").join()).toMatch(
      /must name the datum/,
    );
  });

  it("accepts a known relay height against a named datum (A21)", () => {
    const outcome = parseRequest(candidate("fixedRelay"));
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("accepts coincident outer endpoints on a relayed geometry (A21)", () => {
    const relayed = candidate("satellitePass");
    (relayed.rx as Mutable).coordinates = structuredClone(
      (relayed.tx as Mutable).coordinates,
    );
    const outcome = parseRequest(relayed);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("rejects a leg or an azimuth on a relayed route (A21)", () => {
    for (const field of ["leg", "azimuthDeg"] as const) {
      const bad = candidate("satellitePass");
      (bad.route as Mutable)[field] = field === "leg" ? "short" : 45;
      expect(
        issues(bad)
          .map((issue) => issue.reason)
          .join(),
      ).toMatch(/Unrecognized key/i);
    }
  });

  it("rejects a direct route shape on a relayed geometry (A21)", () => {
    const bad = candidate("satellitePass");
    bad.route = { kind: "direct", leg: "short", azimuthDeg: null };
    expect(reasonsAt(bad, "route.kind").join()).toMatch(
      /takes the relayed route shape/,
    );
  });

  it("accepts a relayed request that declares no leg (A21)", () => {
    const outcome = parseRequest(candidate("satellitePass"));
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("still requires a leg on a direct geometry (M06)", () => {
    const bad = candidate("hfShortPath");
    bad.route = { kind: "relayed" };
    expect(reasonsAt(bad, "route.kind").join()).toMatch(
      /must declare its short or long leg/,
    );
  });

  it("rejects a fixed relay sitting on one of its own endpoints (A21)", () => {
    const bad = candidate("fixedRelay");
    (bad.tx as Mutable).coordinates = structuredClone(
      (bad.relay as Mutable).coordinates,
    );
    expect(reasonsAt(bad, "relay.coordinates").join()).toMatch(
      /zero-length leg/,
    );
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

  it("rejects a band label that does not contain the request frequency (A02)", () => {
    const bad = candidate("hfShortPath");
    bad.bandKey = "160m";
    expect(reasonsAt(bad, "bandKey").join()).toMatch(
      /Band label 160m does not contain 14074000 Hz/,
    );
  });

  it("rejects endpoints declared in different geodetic datums (M06)", () => {
    const bad = candidate("hfShortPath");
    const rx = (bad.rx as Mutable).coordinates as Mutable;
    // A grid square may honestly leave the datum unnamed; differencing it
    // against a WGS 84 endpoint is what the rule refuses.
    rx.datum = "unknown";
    (rx.precision as Mutable).kind = "maidenhead_grid";
    expect(reasonsAt(bad, "rx.coordinates.datum").join()).toMatch(
      /one circuit is one geodetic frame/,
    );
  });

  it("rejects a surveyed coordinate with an unknown datum (M06)", () => {
    const bad = candidate("fixedRelay");
    const relay = (bad.relay as Mutable).coordinates as Mutable;
    relay.datum = "unknown";
    expect(reasonsAt(bad, "relay.coordinates.datum").join()).toMatch(
      /surveyed coordinate must name the geodetic datum/,
    );
  });

  it("treats two endpoints inside one quantized cell as coincident (M06, M01)", () => {
    const draft = candidate("hfShortPath");
    for (const end of ["tx", "rx"] as const) {
      const point = (draft[end] as Mutable).coordinates as Mutable;
      point.precision = {
        kind: "quantized_cell",
        horizontalMeters: { state: "unknown", reason: "grid_locator_only" },
        cellSizeDeg: 1,
      };
    }
    // About 5 km apart, far inside one one-degree cell at this latitude.
    const rx = (draft.rx as Mutable).coordinates as Mutable;
    rx.latitudeDeg = 30.3;
    rx.longitudeDeg = -97.7;
    expect(reasonsAt(draft, "rx.coordinates").join()).toMatch(
      /zero-distance circuit/,
    );
    // The same two points at metre-level precision are an ordinary short path.
    const precise = candidate("hfShortPath");
    ((precise.rx as Mutable).coordinates as Mutable).latitudeDeg = 30.3;
    ((precise.rx as Mutable).coordinates as Mutable).longitudeDeg = -97.7;
    expect(parseRequest(precise).ok).toBe(true);
  });

  it("rejects an auto family served by a relay kind no candidate family admits (A21)", () => {
    const bad = candidate("satellitePass");
    (bad.mechanismPolicy as Mutable).family = "auto";
    (bad.relay as Mutable) = {
      kind: "fixed",
      relayId: "repeater-w5xyz-145350",
      coordinates: (candidate("fixedRelay").relay as Mutable)
        .coordinates as Mutable,
      heightMeters: { state: "known", value: 183 },
      heightDatum: "above_ground_level",
      configurationId: "repeater-config-2026-03",
    };
    expect(reasonsAt(bad, "relay.kind").join()).toMatch(
      /No mechanism family on geometry class earth_space is served by a relay of kind fixed/,
    );
  });

  it("leaves an auto family a candidate on every geometry class the contract defines (A21)", () => {
    // The companion of the rule above: the geometry-only branch is a boundary,
    // not a live case, because every geometry class is taken by some family.
    for (const geometryClass of GEOMETRY_CLASSES) {
      const takers = MECHANISM_FAMILIES.filter((family) =>
        PERMITTED_GEOMETRY_CLASSES[family].includes(geometryClass),
      );
      expect(takers.length).toBeGreaterThan(0);
    }
  });

  it("requires a terrain profile when every candidate auto family is terrain-dependent (A02)", () => {
    const bad = candidate("hfShortPath");
    // Ground wave is served by `groundwave` alone, which is terrain-dependent,
    // so "auto" cannot resolve to anything that would not need the profile.
    (bad.mechanismPolicy as Mutable).family = "auto";
    (bad.mechanismPolicy as Mutable).geometryClass = "ground_wave";
    bad.targetEvent = "field_strength";
    (bad.scope as Mutable).horizon = "climatology";
    bad.frequencyHz = 137500;
    bad.bandKey = "2200m";
    bad.terrainProfileId = null;
    expect(reasonsAt(bad, "terrainProfileId").join()).toMatch(
      /Every mechanism family that could serve geometry class ground_wave at 137500 Hz requires a terrain profile identity/,
    );
    const good = structuredClone(bad);
    good.terrainProfileId = "srtm-30m-path-profile-v2";
    const outcome = parseRequest(good);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("rejects a request on a tuple the protocol never froze (M11)", () => {
    const bad = candidate("hfShortPath");
    // completed_qso is frozen only as a versioned event population.
    bad.targetEvent = "completed_qso";
    expect(reasonsAt(bad, "targetEvent").join()).toMatch(
      /The protocol defines no completed_qso on characterized_fixed_path at forecast_1_24h via regular_ef/,
    );
  });

  it("accepts every request fixture on a protocol row", () => {
    for (const name of Object.keys(cases)) {
      const fixture = cases[name];
      const scope = fixture.scope as Mutable;
      expect(
        protocolCoverageContainsHz(
          {
            event: fixture.targetEvent as never,
            domain: scope.domain as never,
            horizon: scope.horizon as never,
            mechanism: (fixture.mechanismPolicy as Mutable).family as never,
          },
          fixture.frequencyHz as number,
        ),
      ).toBe(true);
    }
  });

  it("states the frame the route azimuth is measured in (M06)", () => {
    const route = predictionRequestSchema.innerType().shape.route;
    const direct = route.options[0];
    expect(direct.shape.azimuthDeg.description).toBe(
      "true bearing in degrees measured clockwise from true north at the transmitting station",
    );
  });

  it("returns the antimeridian in its canonical spelling (M06)", () => {
    const draft = candidate("hfShortPath");
    const rx = (draft.rx as Mutable).coordinates as Mutable;
    rx.latitudeDeg = -33.8688;
    rx.longitudeDeg = 180;
    const outcome = parseRequest(draft);
    if (!outcome.ok) {
      throw new Error(`must parse: ${JSON.stringify(outcome.issues)}`);
    }
    expect(outcome.value.rx.coordinates.longitudeDeg).toBe(-180);
  });
});
