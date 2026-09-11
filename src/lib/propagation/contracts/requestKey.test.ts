import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import requestCases from "@/lib/propagation/contracts/fixtures/request.cases.json";
import {
  parseRequest,
  type PredictionRequest,
} from "@/lib/propagation/contracts/request";
import {
  requestKey,
  requestKeyDigest,
} from "@/lib/propagation/contracts/requestKey";

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
    ["targetEvent", (draft) => (draft.targetEvent = "circuit_support")],
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
});
