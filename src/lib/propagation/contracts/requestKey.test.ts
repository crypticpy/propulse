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

describe("requestKey identity", () => {
  it("gives two independently parsed copies of one request the same key", () => {
    expect(requestKey(build())).toBe(requestKey(build()));
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
