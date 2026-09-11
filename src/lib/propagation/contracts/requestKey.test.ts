import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import requestCases from "@/lib/propagation/contracts/fixtures/request.cases.json";
import {
  parseRequest,
  type PredictionRequest,
} from "@/lib/propagation/contracts/request";
import {
  KEY_EXCLUDED,
  requestKey,
  requestKeyDigest,
  requestKeyProjection,
} from "@/lib/propagation/contracts/requestKey";
import { stationIdentitySchema } from "@/lib/propagation/contracts/request";
import { predictionRequestSchema } from "@/lib/propagation/contracts/request";

type Mutable = Record<string, unknown>;

const cases = requestCases as unknown as Record<string, Mutable>;

function build(mutate: (draft: Mutable) => void = () => {}): PredictionRequest {
  const draft = structuredClone(cases.hfShortPath) as Mutable;
  mutate(draft);
  const outcome = parseRequest(draft);
  if (!outcome.ok) {
    throw new Error(
      `fixture mutation invalid: ${JSON.stringify(outcome.issues)}`,
    );
  }
  return outcome.value;
}

function buildCase(
  name: string,
  mutate: (draft: Mutable) => void = () => {},
): PredictionRequest {
  const draft = structuredClone(cases[name]) as Mutable;
  mutate(draft);
  const outcome = parseRequest(draft);
  if (!outcome.ok) {
    throw new Error(
      `fixture mutation invalid: ${JSON.stringify(outcome.issues)}`,
    );
  }
  return outcome.value;
}

describe("requestKey identity", () => {
  it("gives two independently parsed copies of one request the same key", () => {
    expect(requestKey(build())).toBe(requestKey(build()));
  });

  it("gives two antipodal requests that name no leg one key", () => {
    // Both legs of an antipodal pair are pi * R, so there is no leg to choose
    // and nothing left that could split the cache (M06).
    const antipodal = (viewScopeId: string) =>
      build((draft) => {
        const tx = (draft.tx as Mutable).coordinates as Mutable;
        const rx = (draft.rx as Mutable).coordinates as Mutable;
        rx.latitudeDeg = -(tx.latitudeDeg as number);
        rx.longitudeDeg = (tx.longitudeDeg as number) + 180;
        (draft.route as Mutable).azimuthDeg = 45;
        (draft.route as Mutable).leg = null;
        draft.viewScopeId = viewScopeId;
      });
    expect(requestKey(antipodal("view-a"))).toBe(
      requestKey(antipodal("view-b")),
    );
    expect(requestKey(antipodal("view-a"))).toContain('"leg":null');
  });

  it("gives two relayed requests that name no leg one key", () => {
    // The leg used to be part of every request; on a relayed geometry there is
    // no great circle to choose, so it is no longer in the shape or the key.
    const satellite = buildCase("satellitePass");
    const again = buildCase("satellitePass", (draft) => {
      draft.viewScopeId = "view-other";
    });
    expect(requestKey(satellite)).toBe(requestKey(again));
    expect(requestKey(satellite)).toContain('"kind":"relayed"');
    expect(requestKey(satellite)).not.toContain('"leg"');
  });

  it("gives two spellings of one pole the same key", () => {
    const atPole = (longitudeDeg: number) =>
      build((draft) => {
        (draft.tx as Mutable).coordinates = {
          ...((draft.tx as Mutable).coordinates as Mutable),
          latitudeDeg: 90,
          longitudeDeg,
        };
      });
    expect(requestKey(atPole(0))).toBe(requestKey(atPole(137.5)));
  });

  it("rejects sub-millisecond instants rather than aliasing them onto one key", () => {
    // Date.parse truncates to whole milliseconds, so the wire schema refuses
    // any precision the canonical key could not carry.
    for (const spelling of [
      "2026-09-11T19:00:00.0001Z",
      "2026-09-11T19:00:00.0002Z",
    ]) {
      const draft = structuredClone(cases.hfShortPath) as Mutable;
      draft.validAt = spelling;
      expect(parseRequest(draft).ok).toBe(false);
    }
  });

  it("gives an orbital and a fixed relay different keys (A21)", () => {
    const orbital = buildCase("satellitePass");
    const fixed = buildCase("fixedRelay");
    expect(requestKey(fixed)).not.toBe(requestKey(orbital));
  });

  it("gives two fixed relays at different positions different keys (A21)", () => {
    const hilltop = buildCase("fixedRelay");
    const valley = buildCase("fixedRelay", (draft) => {
      ((draft.relay as Mutable).coordinates as Mutable).latitudeDeg = 30.4;
    });
    expect(requestKey(valley)).not.toBe(requestKey(hilltop));
  });

  it("gives the two spellings of the antimeridian one key", () => {
    const west = build((draft) => {
      ((draft.rx as Mutable).coordinates as Mutable).longitudeDeg = -180;
    });
    const east = build((draft) => {
      ((draft.rx as Mutable).coordinates as Mutable).longitudeDeg = 180;
    });
    expect(requestKey(east)).toBe(requestKey(west));
  });

  it("gives negative zero and zero one key", () => {
    const negative = build((draft) => {
      const coordinates = (draft.rx as Mutable).coordinates as Mutable;
      coordinates.latitudeDeg = -0;
      coordinates.longitudeDeg = -0;
    });
    const positive = build((draft) => {
      const coordinates = (draft.rx as Mutable).coordinates as Mutable;
      coordinates.latitudeDeg = 0;
      coordinates.longitudeDeg = 0;
    });
    expect(requestKey(negative)).toBe(requestKey(positive));
  });

  it("keeps the key stable across two spellings of one instant", () => {
    const zulu = build();
    const offset = build((draft) => {
      draft.validAt = "2026-09-11T20:00:00+01:00";
    });
    expect(zulu.validAt).toBe("2026-09-11T19:00:00Z");
    expect(requestKey(offset)).toBe(requestKey(zulu));
  });

  it("keeps the key stable when only view-owned fields differ", () => {
    const primary = build();
    const secondary = build((draft) => {
      draft.viewScopeId = "view-hamclock-wall";
      draft.bandKey = "twenty-metres";
    });
    expect(requestKey(secondary)).toBe(requestKey(primary));
  });

  const scientificChanges: [string, (draft: Mutable) => void][] = [
    [
      "tx antenna class",
      (draft) =>
        (((draft.tx as Mutable).antenna as Mutable).antennaClass =
          "electrically_short"),
    ],
    [
      "rx receiver class",
      (draft) =>
        ((draft.rx as Mutable).receiverClass = "measured_connector_noise"),
    ],
    [
      "tx receiver class",
      (draft) =>
        ((draft.tx as Mutable).receiverClass = "measured_connector_noise"),
    ],
    [
      "rx antenna class",
      (draft) => {
        ((draft.rx as Mutable).antenna as Mutable).antennaClass =
          "electrically_short";
      },
    ],
    ["contextId", (draft) => (draft.contextId = "ctx-other-operating-context")],
    ["frequencyHz", (draft) => (draft.frequencyHz = 14074001)],
    ["modeProfileId", (draft) => (draft.modeProfileId = "cw-500hz-v1")],
    ["validAt", (draft) => (draft.validAt = "2026-09-11T20:00:00Z")],
    ["issuedAt", (draft) => (draft.issuedAt = "2026-09-11T17:00:00Z")],
    ["route.leg", (draft) => ((draft.route as Mutable).leg = "long")],
    [
      "requestedModel.policy",
      (draft) => {
        draft.requestedModel = {
          policy: "physics_only",
          modelId: null,
          modelVersion: null,
          policyVersion: "source-policy-0.1.0",
        };
      },
    ],
    [
      "requestedModel.modelVersion",
      (draft) => ((draft.requestedModel as Mutable).modelVersion = "1.0.1"),
    ],
    [
      "requestedModel.policyVersion",
      (draft) =>
        ((draft.requestedModel as Mutable).policyVersion =
          "source-policy-0.2.0"),
    ],
    [
      "tx.stationId",
      (draft) => ((draft.tx as Mutable).stationId = "station-b"),
    ],
    [
      "tx.coordinates.latitudeDeg",
      (draft) =>
        (((draft.tx as Mutable).coordinates as Mutable).latitudeDeg = 30.2673),
    ],
    [
      "rx.antenna.polarization",
      (draft) =>
        (((draft.rx as Mutable).antenna as Mutable).polarization = "vertical"),
    ],
    [
      "rx.deliveredPowerWatts unknown reason",
      (draft) =>
        ((draft.rx as Mutable).deliveredPowerWatts = {
          state: "unknown",
          reason: "dx_power_withheld",
        }),
    ],
    [
      "mechanismPolicy.family",
      (draft) => ((draft.mechanismPolicy as Mutable).family = "auto"),
    ],
    [
      "environmentPackId",
      (draft) => (draft.environmentPackId = "p372-city-v17"),
    ],
    [
      "stationScenarioId",
      (draft) => (draft.stationScenarioId = "scenario-qrp"),
    ],
    ["sourceMode", (draft) => (draft.sourceMode = "offline")],
    [
      "scope.horizon",
      (draft) => ((draft.scope as Mutable).horizon = "current"),
    ],
  ];

  it.each(scientificChanges)(
    "changes the key when %s changes",
    (_name, mutate) => {
      expect(requestKey(build(mutate))).not.toBe(requestKey(build()));
    },
  );

  it("never aliases a known string with an unknown carrying that text", () => {
    // A known pattern id that literally reads "unknown:withheld" and an
    // unknown withheld for reason "withheld" are different scientific inputs.
    const knownLookalike = build((draft) => {
      ((draft.tx as Mutable).antenna as Mutable).patternId = {
        state: "known",
        value: "unknown:withheld",
      };
    });
    const genuinelyUnknown = build((draft) => {
      ((draft.tx as Mutable).antenna as Mutable).patternId = {
        state: "unknown",
        reason: "withheld",
      };
    });
    expect(requestKey(genuinelyUnknown)).not.toBe(requestKey(knownLookalike));
  });

  it("never aliases a known number with an unknown numeric field", () => {
    const knownGain = build((draft) => {
      ((draft.tx as Mutable).antenna as Mutable).gainDbi = {
        state: "known",
        value: 8.5,
      };
    });
    const unknownGain = build((draft) => {
      ((draft.tx as Mutable).antenna as Mutable).gainDbi = {
        state: "unknown",
        reason: "8.5",
      };
    });
    expect(requestKey(unknownGain)).not.toBe(requestKey(knownGain));
  });

  it("distinguishes the two directions of the same path", () => {
    const forward = build();
    const reverse = build((draft) => {
      const tx = draft.tx;
      draft.tx = draft.rx;
      draft.rx = tx;
    });
    expect(requestKey(reverse)).not.toBe(requestKey(forward));
  });

  it("never aliases two operating contexts that differ only by context", () => {
    const keys = new Set(
      ["ctx-globe", "ctx-wall", "ctx-contest"].map((contextId) =>
        requestKey(build((draft) => (draft.contextId = contextId))),
      ),
    );
    expect(keys.size).toBe(3);
  });

  it("digests to stable lowercase SHA-256 hex", async () => {
    const request = build();
    const digest = await requestKeyDigest(request);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(await requestKeyDigest(build())).toBe(digest);
    expect(
      await requestKeyDigest(build((draft) => (draft.frequencyHz = 7074000))),
    ).not.toBe(digest);
  });
});

describe("contracts directory holds no mutable module state", () => {
  const directory = resolve(__dirname);

  it("declares no module-level let or var binding", () => {
    const offenders: string[] = [];
    for (const file of readdirSync(directory)) {
      if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
      const lines = readFileSync(resolve(directory, file), "utf8").split("\n");
      lines.forEach((line, index) => {
        if (/^(export\s+)?(let|var)\s/.test(line)) {
          offenders.push(`${file}:${index + 1}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it("changes the key when only the target event changes (M01)", () => {
    // Two events the protocol froze on one row (lunar station, seconds ahead,
    // eme), so the pair differs in the target event and nothing else.
    const lunar = (event: string) =>
      buildCase("satellitePass", (draft) => {
        draft.targetEvent = event;
        (draft.scope as Mutable).domain = "qualified_lunar_station";
        (draft.scope as Mutable).aggregation = "instantaneous";
        (draft.scope as Mutable).intervalSeconds = null;
        (draft.mechanismPolicy as Mutable).family = "eme";
        (draft.mechanismPolicy as Mutable).geometryClass = "earth_moon_earth";
      });
    expect(requestKey(lunar("doppler"))).not.toBe(requestKey(lunar("snr2500")));
  });

  it("keeps the key stable when only the operator callsign differs (M01)", () => {
    // `stationId` is the fingerprint of the configuration the physics depends
    // on; the callsign labels who is operating it (M01).
    const withCallsign = (callsign: string) =>
      build((draft) => {
        (draft.tx as Mutable).callsign = callsign;
      });
    expect(requestKey(withCallsign("K5ABC"))).toBe(
      requestKey(withCallsign("W5XYZ")),
    );
  });

  it("projects every scientific field the request schema declares (M01)", () => {
    // The projection is an allowlist, so it needs a guard binding it to the
    // schema: a new request field must be projected or listed as excluded, and
    // a projected key must trace back to a field that exists.
    const REQUEST_FIELD_KEYS: Record<string, string[]> = {
      schemaVersion: ["schemaVersion"],
      contextId: ["contextId"],
      issuedAt: ["issuedAtMs"],
      validAt: ["validAtMs"],
      targetEvent: ["targetEvent"],
      scope: [
        "scopeDomain",
        "scopeHorizon",
        "scopeAggregation",
        "scopeIntervalSeconds",
      ],
      frequencyHz: ["frequencyHz"],
      modeProfileId: ["modeProfileId"],
      route: ["route"],
      mechanismPolicy: ["mechanismFamily", "geometryClass"],
      terrainProfileId: ["terrainProfileId"],
      environmentPackId: ["environmentPackId"],
      stationScenarioId: ["stationScenarioId"],
      tx: ["tx"],
      rx: ["rx"],
      relay: ["relay"],
      requestedModel: [
        "modelPolicy",
        "modelId",
        "modelVersion",
        "policyVersion",
      ],
      sourceMode: ["sourceMode"],
    };
    const STATION_FIELD_KEYS: Record<string, string[]> = {
      stationId: ["stationId"],
      coordinates: [
        "latitudeDeg",
        "longitudeDeg",
        "datum",
        "precisionKind",
        "precisionHorizontalMeters",
        "precisionCellSizeDeg",
      ],
      antenna: [
        "antennaPatternId",
        "antennaGainDbi",
        "antennaHeightMeters",
        "antennaHeightDatum",
        "polarization",
        "antennaClass",
      ],
      deliveredPowerWatts: ["deliveredPowerWatts"],
      feedLossDb: ["feedLossDb"],
      noiseAssumptionId: ["noiseAssumptionId"],
      receiverClass: ["receiverClass"],
    };
    const sorted = (values: string[]) => [...values].sort();

    const schemaFields = Object.keys(predictionRequestSchema.innerType().shape);
    expect(sorted(schemaFields)).toEqual(
      sorted([
        ...Object.keys(REQUEST_FIELD_KEYS),
        // `callsign` is a station field, excluded one level down.
        ...KEY_EXCLUDED.filter((field) => field !== "callsign"),
      ]),
    );
    const projection = requestKeyProjection(build());
    expect(sorted(Object.keys(projection))).toEqual(
      sorted(Object.values(REQUEST_FIELD_KEYS).flat()),
    );

    const stationFields = Object.keys(stationIdentitySchema.shape);
    expect(sorted(stationFields)).toEqual(
      sorted([
        ...Object.keys(STATION_FIELD_KEYS),
        ...KEY_EXCLUDED.filter((field) => field === "callsign"),
      ]),
    );
    expect(
      sorted(Object.keys(projection.tx as Record<string, unknown>)),
    ).toEqual(sorted(Object.values(STATION_FIELD_KEYS).flat()));

    // A21: the fixed relay variant carries its own fields, including the
    // known/unknown height, which enters the key structurally like every other
    // known/unknown field.
    const relayed = requestKeyProjection(buildCase("fixedRelay"));
    const relay = relayed.relay as Record<string, unknown>;
    expect(sorted(Object.keys(relay))).toEqual(
      sorted([
        "kind",
        "relayId",
        "latitudeDeg",
        "longitudeDeg",
        "datum",
        "precisionKind",
        "precisionHorizontalMeters",
        "precisionCellSizeDeg",
        "heightMeters",
        "heightDatum",
        "configurationId",
      ]),
    );
    expect(relay.heightMeters).toEqual({ state: "known", value: 183 });
    const orbital = requestKeyProjection(buildCase("satellitePass"))
      .relay as Record<string, unknown>;
    expect(sorted(Object.keys(orbital))).toEqual(
      sorted(["kind", "relayId", "ephemerisId", "ephemerisEpochMs"]),
    );
  });
});
