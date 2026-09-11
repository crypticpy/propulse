import { describe, expect, it } from "vitest";
import capabilityCases from "@/lib/propagation/contracts/fixtures/capability.cases.json";
import {
  capabilityCovers,
  parseCapability,
} from "@/lib/propagation/contracts/capability";
import type { ContractIssue } from "@/lib/propagation/contracts/validation";

type Mutable = Record<string, unknown>;

const cases = capabilityCases as unknown as Record<string, Mutable>;

function candidate(name: string): Mutable {
  return structuredClone(cases[name]) as Mutable;
}

function parsed(name: string) {
  const outcome = parseCapability(candidate(name));
  if (!outcome.ok) {
    throw new Error(`fixture must parse: ${JSON.stringify(outcome.issues)}`);
  }
  return outcome.value;
}

/** A request shape the HF physics fixture's SNR head does declare. */
const baseQuery = {
  quantity: "snr2500",
  domain: "characterized_fixed_path",
  horizon: "current",
  geometryClass: "terrestrial_great_circle",
  mechanismFamily: "regular_ef",
  modeProfileId: "ft8-wsjtx-2.7.0-15s",
  frequencyHz: 14074000,
  txAntennaClass: "modeled_pattern",
  rxAntennaClass: "modeled_pattern",
  receiverClass: "modeled_noise_figure_chain",
  policyVersion: "source-policy-0.1.0",
  availableInputs: [
    "station_pair",
    "smoothed_solar_index",
    "mode_profile",
    "noise_assumption",
  ],
} as const;

/** The same quantity and domain as the fixture's SNR head, other physics. */
const METEOR_SNR_HEAD = {
  quantity: "snr2500",
  units: "dB",
  domain: "characterized_fixed_path",
  state: "implemented_unvalidated",
  horizons: ["current"],
  mechanismFamilies: ["meteor"],
  geometryClasses: ["terrestrial_great_circle"],
  antennaClasses: ["modeled_pattern", "unspecified_scenario_range"],
  receiverClasses: ["modeled_noise_figure_chain", "unspecified_scenario_range"],
  frequencyRangeHz: { minHz: 50000000, maxHz: 148000000 },
  bandKeys: ["6m", "2m"],
  modeProfileIds: ["msk144-wsjtx-2.7.0-15s"],
  requiredInputs: ["station_pair", "mode_profile"],
  optionalInputs: [],
  featureSchemaId: "meteor-feature-schema-0.1.0",
  outputSchemaId: "propagation-result-0.1.0",
  calibrationId: null,
  uncertaintyKind: "model_spread",
  internalFallback: { kind: "none" },
};

const meteorQuery = {
  ...baseQuery,
  frequencyHz: 144140000,
  mechanismFamily: "meteor",
  modeProfileId: "msk144-wsjtx-2.7.0-15s",
} as const;

/** The fixture plus a second SNR head for a different mechanism family. */
function twoMechanismCapability() {
  const draft = structuredClone(cases.hfPhysics) as Mutable;
  (draft.heads as Mutable[]).push(structuredClone(METEOR_SNR_HEAD));
  const outcome = parseCapability(draft);
  if (!outcome.ok) {
    throw new Error(
      `two-mechanism capability must parse: ${JSON.stringify(outcome.issues)}`,
    );
  }
  return outcome.value;
}

function issues(value: unknown): ContractIssue[] {
  const outcome = parseCapability(value);
  expect(outcome.ok).toBe(false);
  return outcome.ok ? [] : outcome.issues;
}

function reasonsAt(value: unknown, path: string): string[] {
  return issues(value)
    .filter((issue) => issue.path === path)
    .map((issue) => issue.reason);
}

describe("parseCapability fixtures", () => {
  it.each(Object.keys(cases))("round-trips the %s fixture", (name) => {
    const outcome = parseCapability(candidate(name));
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
    if (!outcome.ok) return;
    expect(JSON.parse(JSON.stringify(outcome.value))).toEqual(cases[name]);
  });

  it("treats a model with no heads as a valid no-op capability", () => {
    const outcome = parseCapability(candidate("noOp"));
    if (!outcome.ok) throw new Error("no-op fixture must parse");
    expect(outcome.value.heads).toEqual([]);
    expect(
      capabilityCovers(outcome.value, { ...baseQuery, frequencyHz: 14074000 }),
    ).toBe(false);
  });

  it("answers coverage from the frequency range, not a band nickname", () => {
    const capability = parsed("hfPhysics");
    expect(
      capabilityCovers(capability, { ...baseQuery, frequencyHz: 14074000 }),
    ).toBe(true);
    // 6 m is inside the declared band keys but outside the 2-30 MHz range.
    expect(
      capabilityCovers(capability, { ...baseQuery, frequencyHz: 50313000 }),
    ).toBe(false);
    // 160 m below 2 MHz is out of the reference domain and is not clamped in.
    expect(
      capabilityCovers(capability, { ...baseQuery, frequencyHz: 1840000 }),
    ).toBe(false);
  });

  it("does not route to a head that is only planned or unsupported", () => {
    const capability = parsed("hfPhysics");
    const decodeQuery = {
      ...baseQuery,
      quantity: "conditional_decode",
      frequencyHz: 14074000,
    } as const;
    // The fixture's decode head is `planned`: declared, not implemented.
    expect(capabilityCovers(capability, decodeQuery)).toBe(false);

    const declaredGap = structuredClone(cases.hfPhysics) as Mutable;
    (declaredGap.heads as Mutable[])[1].state = "unsupported";
    const gap = parseCapability(declaredGap);
    if (!gap.ok) throw new Error("mutated fixture must parse");
    expect(
      capabilityCovers(gap.value, { ...baseQuery, frequencyHz: 14074000 }),
    ).toBe(false);
  });

  it("lets one quantity and domain carry separate mechanism coverage", () => {
    const capability = twoMechanismCapability();
    // Both heads are declared, and each answers only its own physics.
    expect(capabilityCovers(capability, baseQuery)).toBe(true);
    expect(capabilityCovers(capability, meteorQuery)).toBe(true);
    // The HF head does not acquire the meteor head's frequencies or family,
    // and the meteor head does not acquire the HF head's.
    expect(
      capabilityCovers(capability, {
        ...baseQuery,
        mechanismFamily: "meteor",
      }),
    ).toBe(false);
    expect(
      capabilityCovers(capability, {
        ...meteorQuery,
        mechanismFamily: "regular_ef",
      }),
    ).toBe(false);
    expect(
      capabilityCovers(capability, { ...baseQuery, frequencyHz: 144140000 }),
    ).toBe(false);
  });

  it("does not route a head whose required input is absent (M11)", () => {
    const draft = structuredClone(cases.hfPhysics) as Mutable;
    (draft.heads as Mutable[])[1].requiredInputs = [
      "station_pair",
      "mode_profile",
      "terrain_profile",
    ];
    const outcome = parseCapability(draft);
    if (!outcome.ok) throw new Error("mutated fixture must parse");
    expect(capabilityCovers(outcome.value, baseQuery)).toBe(false);
    expect(
      capabilityCovers(outcome.value, {
        ...baseQuery,
        availableInputs: [...baseQuery.availableInputs, "terrain_profile"],
      }),
    ).toBe(true);
  });

  it("does not let a missing optional input block routing", () => {
    const capability = parsed("hfPhysics");
    // The SNR head lists eligible_foF2_observations as optional and the query
    // does not carry it; the head is still routable.
    expect(capability.heads[1].optionalInputs).toContain(
      "eligible_foF2_observations",
    );
    expect(baseQuery.availableInputs).not.toContain(
      "eligible_foF2_observations",
    );
    expect(capabilityCovers(capability, baseQuery)).toBe(true);
  });

  it("does not route a mechanism family the head never declared", () => {
    expect(
      capabilityCovers(parsed("hfPhysics"), {
        ...baseQuery,
        frequencyHz: 14074000,
        mechanismFamily: "es",
      }),
    ).toBe(false);
  });

  it("does not route a mode profile the head never declared", () => {
    expect(
      capabilityCovers(parsed("hfPhysics"), {
        ...baseQuery,
        frequencyHz: 14074000,
        modeProfileId: "cw-500hz-v1",
      }),
    ).toBe(false);
  });

  it("does not route a horizon, domain or geometry the head never declared", () => {
    const capability = parsed("hfPhysics");
    expect(
      capabilityCovers(capability, {
        ...baseQuery,
        frequencyHz: 14074000,
        horizon: "forecast_seconds",
      }),
    ).toBe(false);
    expect(
      capabilityCovers(capability, {
        ...baseQuery,
        frequencyHz: 14074000,
        domain: "versioned_event_population",
      }),
    ).toBe(false);
    expect(
      capabilityCovers(capability, {
        ...baseQuery,
        frequencyHz: 14074000,
        geometryClass: "earth_space",
      }),
    ).toBe(false);
  });
});

describe("parseCapability fails closed", () => {
  it("rejects non-objects and unknown keys", () => {
    expect(parseCapability(null).ok).toBe(false);
    const extra = candidate("noOp");
    extra.currentTarget = "K5XYZ";
    expect(parseCapability(extra).ok).toBe(false);
  });

  it("rejects units that disagree with the protocol quantity", () => {
    const bad = candidate("hfPhysics");
    ((bad.heads as Mutable[])[1] as Mutable).units = "dBm";
    expect(reasonsAt(bad, "heads[1].units").join()).toMatch(/measured in dB/);
  });

  it("rejects an inverted frequency range", () => {
    const bad = candidate("hfPhysics");
    (bad.heads as Mutable[])[0].frequencyRangeHz = {
      minHz: 30000000,
      maxHz: 2000000,
    };
    expect(reasonsAt(bad, "heads[0].frequencyRangeHz.maxHz").join()).toMatch(
      /minHz < maxHz/,
    );
  });

  it("rejects a frequency range expressed in MHz", () => {
    const bad = candidate("hfPhysics");
    (bad.heads as Mutable[])[0].frequencyRangeHz = { minHz: 2, maxHz: 30 };
    expect(parseCapability(bad).ok).toBe(false);
  });

  it("rejects an input listed as both required and optional", () => {
    const bad = candidate("hfPhysics");
    const head = (bad.heads as Mutable[])[1] as Mutable;
    head.optionalInputs = ["mode_profile"];
    expect(reasonsAt(bad, "heads[1].optionalInputs").join()).toMatch(
      /both required and optional/,
    );
  });

  it("rejects a head with no declared horizon or mechanism", () => {
    const bad = candidate("hfPhysics");
    (bad.heads as Mutable[])[0].horizons = [];
    expect(parseCapability(bad).ok).toBe(false);
  });

  it("rejects two corrections that claim the same total quantity (M11)", () => {
    const bad = candidate("hfPhysics");
    const corrections = bad.corrections as Mutable[];
    corrections.push({
      ...structuredClone(corrections[1]),
      correctionId: "xray-absorption-v2",
      active: true,
      inactiveReason: null,
    });
    expect(reasonsAt(bad, "corrections[2].ownsQuantityId").join()).toMatch(
      /already owned by xray-absorption-v1/,
    );
  });

  it("rejects corrections declared out of the immutable order (M11)", () => {
    const bad = candidate("hfPhysics");
    const corrections = bad.corrections as Mutable[];
    bad.corrections = [corrections[1], corrections[0]];
    expect(reasonsAt(bad, "corrections[1].stage").join()).toMatch(
      /immutable correction order/,
    );
  });

  it("rejects an inactive correction with no reason", () => {
    const bad = candidate("hfPhysics");
    (bad.corrections as Mutable[])[1].inactiveReason = null;
    expect(reasonsAt(bad, "corrections[1].inactiveReason").join()).toMatch(
      /must name why it is inactive/,
    );
  });

  it("rejects a calibrated interval capability with no calibration id", () => {
    const bad = candidate("hfPhysics");
    (bad.heads as Mutable[])[1].uncertaintyKind =
      "calibrated_predictive_interval";
    expect(reasonsAt(bad, "heads[1].calibrationId").join()).toMatch(
      /calibration identity/,
    );
  });

  it("rejects a routable capability with no model hash (M11)", () => {
    const bad = candidate("hfPhysics");
    bad.modelHash = null;
    expect(reasonsAt(bad, "modelHash").join()).toMatch(/pin its model hash/);
  });

  it("rejects a routable capability with no preprocessing hash (M11)", () => {
    const bad = candidate("hfPhysics");
    bad.preprocessingHash = null;
    expect(reasonsAt(bad, "preprocessingHash").join()).toMatch(
      /pin its preprocessing hash/,
    );
  });

  it("accepts unpinned hashes on a planned-only declaration", () => {
    const planned = candidate("hfPhysics");
    planned.modelHash = null;
    planned.preprocessingHash = null;
    for (const head of planned.heads as Mutable[]) head.state = "planned";
    const outcome = parseCapability(planned);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("rejects a capability declared under another source policy version", () => {
    expect(
      capabilityCovers(parsed("hfPhysics"), {
        ...baseQuery,
        policyVersion: "source-policy-0.2.0",
      }),
    ).toBe(false);
  });

  it("accepts the matching source policy version", () => {
    expect(capabilityCovers(parsed("hfPhysics"), baseQuery)).toBe(true);
  });

  it("rejects a station outside the head's antenna class (A01)", () => {
    expect(
      capabilityCovers(parsed("hfPhysics"), {
        ...baseQuery,
        rxAntennaClass: "electrically_short",
      }),
    ).toBe(false);
  });

  it("rejects a station outside the head's receiver class (A01)", () => {
    expect(
      capabilityCovers(parsed("hfPhysics"), {
        ...baseQuery,
        receiverClass: "calibrated_system_temperature",
      }),
    ).toBe(false);
  });

  it("accepts a station inside both declared classes (A01)", () => {
    expect(
      capabilityCovers(parsed("hfPhysics"), {
        ...baseQuery,
        txAntennaClass: "unspecified_scenario_range",
        receiverClass: "unspecified_scenario_range",
      }),
    ).toBe(true);
  });

  it("separates two heads that differ only by antenna class", () => {
    const draft = candidate("hfPhysics");
    const heads = draft.heads as Mutable[];
    const twin = structuredClone(heads[1]);
    twin.antennaClasses = ["electrically_short"];
    heads.push(twin);
    const outcome = parseCapability(draft);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("does not confuse a two-entry list with one joined entry", () => {
    const draft = candidate("hfPhysics");
    const heads = draft.heads as Mutable[];
    const twin = structuredClone(heads[1]);
    heads[1].modeProfileIds = ["a", "b"];
    twin.modeProfileIds = ["a+b"];
    heads.push(twin);
    const outcome = parseCapability(draft);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("treats a repeated list entry and a reordered list as the same tuple", () => {
    const draft = candidate("hfPhysics");
    const heads = draft.heads as Mutable[];
    const twin = structuredClone(heads[1]);
    heads[1].modeProfileIds = ["a", "a", "b"];
    twin.modeProfileIds = ["b", "a"];
    heads.push(twin);
    expect(reasonsAt(draft, "heads[3].quantity").join()).toMatch(/Duplicate/);
  });

  it("rejects a head that repeats a complete coverage tuple", () => {
    const bad = candidate("hfPhysics");
    const heads = bad.heads as Mutable[];
    heads.push(structuredClone(heads[1]));
    expect(reasonsAt(bad, "heads[3].quantity").join()).toMatch(/Duplicate/);
  });
});
