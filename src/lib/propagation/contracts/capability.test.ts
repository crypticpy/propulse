import { describe, expect, it } from "vitest";
import capabilityCases from "@/lib/propagation/contracts/fixtures/capability.cases.json";
import {
  CALIBRATION_REQUIRED_QUANTITIES,
  PREDICTION_QUANTITIES,
  INTERVAL_VALUED_QUANTITIES,
  isProtocolCoverage,
  mandatoryInputsForFamilies,
  MANDATORY_INPUTS_BY_FAMILY,
  isProtocolGeometry,
  PERMITTED_GEOMETRY_CLASSES,
  permittedRelayKinds,
  protocolBandEnvelope,
  PROTOCOL_COVERAGE_TUPLES,
  RECEIVER_PARTICIPATION,
  QUANTITY_UNITS,
} from "@/lib/propagation/contracts/enums";
import {
  hasPointValue,
  RESULT_SCHEMA_VERSION,
} from "@/lib/propagation/contracts/result";
import {
  capabilityCovers,
  capabilityDigest,
  parseCapability,
  parseResultForRequest,
  RANGE_ROUTING_DIMENSIONS,
  RESULT_BINDINGS,
  ROUTING_DIMENSIONS,
} from "@/lib/propagation/contracts/capability";
import requestCases from "@/lib/propagation/contracts/fixtures/request.cases.json";
import resultCases from "@/lib/propagation/contracts/fixtures/result.cases.json";
import { parseRequest } from "@/lib/propagation/contracts/request";
import { requestKeyDigest } from "@/lib/propagation/contracts/requestKey";
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
  // snr2500 is sampled at an instant, so the request carries no interval (M02).
  intervalSeconds: null,
  txAntennaClass: "modeled_pattern",
  rxAntennaClass: "modeled_pattern",
  txReceiverClass: "modeled_noise_figure_chain",
  rxReceiverClass: "modeled_noise_figure_chain",
  policyVersion: "source-policy-0.1.0",
  sourceMode: "cached_live",
  availableInputs: [
    "station_pair",
    "smoothed_solar_index",
    "mode_profile",
    "noise_assumption",
  ],
} as const;

/** The same quantity and domain as the fixture's SNR head, other physics. */
const SECOND_SNR_HEAD = {
  quantity: "snr2500",
  units: "dB",
  domain: "characterized_fixed_path",
  state: "implemented_unvalidated",
  horizons: ["current"],
  mechanismFamilies: ["ground_sky_coherent"],
  geometryClasses: ["terrestrial_great_circle"],
  antennaClasses: ["modeled_pattern", "unspecified_scenario_range"],
  receiverClasses: ["modeled_noise_figure_chain", "unspecified_scenario_range"],
  frequencyRangeHz: { minHz: 1800000, maxHz: 2000000 },
  intervalSecondsRange: null,
  sourceModes: ["offline", "cached_live", "live"],
  bandKeys: ["160m"],
  modeProfileIds: ["msk144-wsjtx-2.7.0-15s"],
  requiredInputs: ["station_pair", "mode_profile", "terrain_profile"],
  optionalInputs: [],
  featureSchemaId: "vhf-feature-schema-0.1.0",
  featureHash:
    "sha256:0000000000000000000000000000000000000000000000000000000000000001",
  outputSchemaId: "propagation-result-0.1.0",
  calibrationId: null,
  uncertaintyKind: "model_spread",
  internalFallback: { kind: "none" },
};

const secondQuery = {
  ...baseQuery,
  frequencyHz: 1840000,
  mechanismFamily: "ground_sky_coherent",
  modeProfileId: "msk144-wsjtx-2.7.0-15s",
  // A02: ground_sky_coherent cannot run without a terrain profile, so a head
  // serving it requires one and a request routing to it carries one. The
  // environment pack is carried for the terrain/atmosphere families.
  availableInputs: [
    ...baseQuery.availableInputs,
    "terrain_profile",
    "environment_pack",
    "ephemeris",
  ],
} as const;

/**
 * A routable head for `quantity` on a tuple the frozen protocol actually
 * defines, so a test about some other rule is not failed by the coverage gate.
 */
function protocolHead(
  quantity: (typeof PREDICTION_QUANTITIES)[number],
  pick: (tuple: (typeof PROTOCOL_COVERAGE_TUPLES)[number]) => boolean = () =>
    true,
) {
  const tuple = PROTOCOL_COVERAGE_TUPLES.find(
    (candidateTuple) =>
      candidateTuple.event === quantity && pick(candidateTuple),
  );
  if (tuple === undefined) {
    throw new Error(`the protocol defines no ${quantity} row`);
  }
  const head = structuredClone(SECOND_SNR_HEAD) as Mutable;
  head.quantity = quantity;
  head.units = QUANTITY_UNITS[quantity];
  head.domain = tuple.domain;
  head.horizons = [tuple.horizon];
  head.mechanismFamilies = [tuple.mechanism];
  // The row's own band, so the head is inside the coverage the protocol froze.
  head.frequencyRangeHz = protocolBandEnvelope(tuple.band) as {
    minHz: number;
    maxHz: number;
  };
  // A21/A22: the geometry classes the row's mechanism is answered on, narrowed
  // to the ones the row's own domain is served on (M11): the satellite family
  // takes both earth_space and two_leg_relay, but an ephemeris-horizon row is
  // a pass and a configured-two-leg row is a transponder circuit.
  head.geometryClasses = PERMITTED_GEOMETRY_CLASSES[tuple.mechanism].filter(
    (geometryClass) => isProtocolGeometry(tuple.domain, geometryClass),
  );
  // A01: only a quantity with a receive chain names receiver classes.
  if (RECEIVER_PARTICIPATION[quantity] === "none") head.receiverClasses = [];
  // M02: an interval-valued head declares the interval lengths it answers.
  head.intervalSecondsRange = INTERVAL_VALUED_QUANTITIES.includes(quantity)
    ? { minSeconds: 60, maxSeconds: 3600 }
    : null;
  // A02: no display labels, so a test may narrow the range without a label
  // contradicting it.
  head.bandKeys = [];
  // A02/A21: the inputs the row's family cannot run without, plus an ephemeris
  // for a direct orbital geometry.
  const mandatory = new Set<string>([
    ...(head.requiredInputs as string[]),
    ...mandatoryInputsForFamilies([tuple.mechanism]),
  ]);
  if (
    (head.geometryClasses as string[]).some(
      (geometryClass) =>
        geometryClass === "earth_space" || geometryClass === "earth_moon_earth",
    )
  ) {
    mandatory.add("ephemeris");
  }
  head.requiredInputs = [...mandatory];
  return { head, tuple };
}

/** The fixture plus a second SNR head for a different mechanism family. */
function twoMechanismCapability() {
  const draft = structuredClone(cases.hfPhysics) as Mutable;
  (draft.heads as Mutable[]).push(structuredClone(SECOND_SNR_HEAD));
  const outcome = parseCapability(draft);
  if (!outcome.ok) {
    throw new Error(
      `two-mechanism capability must parse: ${JSON.stringify(outcome.issues)}`,
    );
  }
  return outcome.value;
}

/**
 * The fixture plus two extra routable SNR heads on the given ranges, alike on
 * every routing dimension unless `tweak` moves the second one off one. The
 * heads sit on the deferred-band lunar row, whose coverage is the head's own
 * declared range (M11), so a range the test chooses is never refused by the
 * coverage gate and only the overlap rule is under test.
 */
function overlapDraft(
  first: { minHz: number; maxHz: number },
  second: { minHz: number; maxHz: number },
  tweak?: (head: Mutable) => void,
): Mutable {
  const draft = structuredClone(cases.hfPhysics) as Mutable;
  const left = protocolHead(
    "snr2500",
    (tuple) => tuple.band === "qualified_family_bands",
  ).head;
  const right = structuredClone(left) as Mutable;
  left.frequencyRangeHz = first;
  right.frequencyRangeHz = second;
  tweak?.(right);
  (draft.heads as Mutable[]).push(left, right);
  return draft;
}

/**
 * The fixture plus two routable usable_burst heads alike on every routing
 * dimension but their interval ranges, so only the interval dimension decides
 * whether they could both answer one request (M02, M19).
 */
function intervalOverlapDraft(
  first: { minSeconds: number; maxSeconds: number },
  second: { minSeconds: number; maxSeconds: number },
): Mutable {
  const draft = structuredClone(cases.hfPhysics) as Mutable;
  const left = protocolHead(
    "usable_burst",
    (tuple) => tuple.mechanism === "meteor",
  ).head;
  left.uncertaintyKind = "none";
  const right = structuredClone(left) as Mutable;
  left.intervalSecondsRange = first;
  right.intervalSecondsRange = second;
  (draft.heads as Mutable[]).push(left, right);
  return draft;
}

/**
 * The routing dimensions a non-routable gap declaration may leave empty.
 * `horizons`, `mechanismFamilies`, `geometryClasses`, `antennaClasses` and
 * `sourceModes` carry `.min(1)` in the schema, and a received quantity must
 * name its receiver classes at every state (A01), so only the mode profile
 * list is silent-able, and only off the routable states.
 */
const SCHEMA_OPTIONAL_DIMENSIONS: readonly string[] = ["modeProfileIds"];

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
    expect(capabilityCovers(capability, secondQuery)).toBe(true);
    // The regular_ef head does not acquire the second head's frequencies or
    // family, and the second head does not acquire the first head's.
    expect(
      capabilityCovers(capability, {
        ...baseQuery,
        mechanismFamily: "ground_sky_coherent",
      }),
    ).toBe(false);
    expect(
      capabilityCovers(capability, {
        ...secondQuery,
        mechanismFamily: "regular_ef",
      }),
    ).toBe(false);
    expect(
      capabilityCovers(capability, { ...baseQuery, frequencyHz: 1840000 }),
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

  it("requires calibration in capabilities for every quantity results require it for", () => {
    for (const quantity of CALIBRATION_REQUIRED_QUANTITIES) {
      const bad = candidate("hfPhysics");
      const head = structuredClone((bad.heads as Mutable[])[1]);
      head.quantity = quantity;
      head.units = QUANTITY_UNITS[quantity];
      head.calibrationId = null;
      head.state = "implemented_unvalidated";
      (bad.heads as Mutable[]).push(head);
      expect(reasonsAt(bad, "heads[3].calibrationId").join()).toMatch(
        /requires a calibration identity/,
      );
    }
  });

  it("rejects a routable completed_qso head with no calibration (M22)", () => {
    const bad = candidate("hfPhysics");
    const head = structuredClone((bad.heads as Mutable[])[1]);
    head.quantity = "completed_qso";
    head.units = "probability";
    head.calibrationId = null;
    head.state = "implemented_unvalidated";
    (bad.heads as Mutable[]).push(head);
    expect(reasonsAt(bad, "heads[3].calibrationId").join()).toMatch(
      /requires a calibration identity/,
    );
  });

  it("accepts a routable completed_qso head that names its calibration", () => {
    const good = candidate("hfPhysics");
    const { head } = protocolHead("completed_qso");
    head.calibrationId = "qso-chain-calibration-0.1.0";
    head.state = "implemented_unvalidated";
    (good.heads as Mutable[]).push(head);
    const outcome = parseCapability(good);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("accepts a planned completed_qso head with no calibration yet", () => {
    const planned = candidate("hfPhysics");
    const head = structuredClone((planned.heads as Mutable[])[1]);
    head.quantity = "completed_qso";
    head.units = "probability";
    head.calibrationId = null;
    head.state = "planned";
    (planned.heads as Mutable[]).push(head);
    const outcome = parseCapability(planned);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("rejects a routable head that pins no feature hash (M19)", () => {
    const bad = candidate("hfPhysics");
    (bad.heads as Mutable[])[1].featureHash = null;
    expect(reasonsAt(bad, "heads[1].featureHash").join()).toMatch(
      /pin its feature hash/,
    );
  });

  it("accepts a routable head that pins its feature hash (M19)", () => {
    const outcome = parseCapability(candidate("hfPhysics"));
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("rejects a routable head that pins no feature artefact at all (M19, M24)", () => {
    // The result contract refuses every value-bearing head whose featureHash
    // is null (M24), so a routable head with neither a schema nor a hash could
    // only produce results the parser rejects.
    const physics = candidate("hfPhysics");
    for (const head of physics.heads as Mutable[]) {
      head.featureSchemaId = null;
      head.featureHash = null;
    }
    expect(reasonsAt(physics, "heads[0].featureHash").join()).toMatch(
      /pins no feature artefact/,
    );
    // A planned head has nothing to pin yet and is left alone.
    expect(
      issues(physics).some((issue) => issue.path === "heads[2].featureHash"),
    ).toBe(false);
  });

  it("rejects a head claiming validation on a row the protocol has blocked (A01)", () => {
    const bad = candidate("hfPhysics");
    (bad.heads as Mutable[])[1].state = "validated_current";
    expect(reasonsAt(bad, "heads[1].state").join()).toMatch(
      /validated no coverage row/,
    );
  });

  it("rejects a head declaring the evidence of a row of the other status (A01)", () => {
    // 2-30 MHz regular_ef SNR is frozen data_limited; the 160 m
    // ground_sky_coherent rows are experimental. Neither may borrow the
    // other's evidence label.
    const bad = candidate("hfPhysics");
    (bad.heads as Mutable[])[1].state = "experimental";
    expect(reasonsAt(bad, "heads[1].state").join()).toMatch(
      /as data_limited, not as experimental/,
    );
  });

  it("rejects a band label outside the head's frequency range (A02)", () => {
    const bad = candidate("hfPhysics");
    // 160 m ends exactly where the 2-30 MHz head begins, so the label names no
    // frequency this head serves.
    (bad.heads as Mutable[])[1].bandKeys = ["160m", "20m"];
    expect(reasonsAt(bad, "heads[1].bandKeys[0]").join()).toMatch(
      /lies outside this head's frequency range/,
    );
  });

  it("does not route a live-only head to an offline request (M11)", () => {
    const draft = candidate("hfPhysics");
    (draft.heads as Mutable[])[1].sourceModes = ["live"];
    const outcome = parseCapability(draft);
    if (!outcome.ok) throw new Error("mutated fixture must parse");
    expect(
      capabilityCovers(outcome.value, { ...baseQuery, sourceMode: "live" }),
    ).toBe(true);
    expect(
      capabilityCovers(outcome.value, { ...baseQuery, sourceMode: "offline" }),
    ).toBe(false);
  });

  it("rejects an event_head head advertising a relayed geometry (A21)", () => {
    // A24: event_head is an aggregate over a declared population on the
    // terrestrial frame; it is not carried by a relay body.
    const draft = candidate("hfPhysics");
    const { head } = protocolHead("network_detection");
    head.geometryClasses = ["two_leg_relay"];
    (draft.heads as Mutable[]).push(head);
    expect(reasonsAt(draft, "heads[3].geometryClasses").join()).toMatch(
      /event_head is not answered on geometry class two_leg_relay/,
    );
  });

  it("rejects a feature hash that pins no schema", () => {
    const bad = candidate("hfPhysics");
    (bad.heads as Mutable[])[1].featureSchemaId = null;
    expect(reasonsAt(bad, "heads[1].featureSchemaId").join()).toMatch(
      /pins nothing/,
    );
  });

  it("rejects a hash that is not a sha256 digest", () => {
    const bad = candidate("hfPhysics");
    bad.modelHash = "physics-v1-build-17";
    expect(reasonsAt(bad, "modelHash").join()).toMatch(/64 lowercase hex/);
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

  it("rejects a receiving station outside the head's receiver class (A01)", () => {
    expect(
      capabilityCovers(parsed("hfPhysics"), {
        ...baseQuery,
        rxReceiverClass: "calibrated_system_temperature",
      }),
    ).toBe(false);
  });

  it("rejects a routable head on a tuple the protocol never defines (M11)", () => {
    const bad = candidate("hfPhysics");
    const head = (bad.heads as Mutable[])[1];
    head.quantity = "conditional_decode";
    head.units = QUANTITY_UNITS.conditional_decode;
    // conditional_decode exists only on mechanism_labeled_exposure and
    // configured_two_leg_path, never on a characterized fixed path via
    // regular_ef.
    expect(reasonsAt(bad, "heads[1].mechanismFamilies").join()).toMatch(
      /protocol defines no conditional_decode on characterized_fixed_path/,
    );
  });

  it("rejects a routable head whose band is not the row's band (M11)", () => {
    const bad = candidate("hfPhysics");
    // circuit_support via ground_sky_coherent is frozen on 160 m only, so a
    // head declaring 50-148 MHz borrows a row from an unrelated band.
    (bad.heads as Mutable[])[0].frequencyRangeHz = {
      minHz: 50000000,
      maxHz: 148000000,
    };
    expect(reasonsAt(bad, "heads[0].mechanismFamilies").join()).toMatch(
      /only for 160m, not for this frequency range/,
    );
  });

  it("rejects a routable head that serves only part of the row's band (M11)", () => {
    const bad = candidate("hfPhysics");
    // The row is frozen for the whole of 160 m; a head over 1.81-1.90 MHz
    // would answer it for frequencies it never declared.
    (bad.heads as Mutable[])[0].frequencyRangeHz = {
      minHz: 1810000,
      maxHz: 1900000,
    };
    expect(reasonsAt(bad, "heads[0].mechanismFamilies").join()).toMatch(
      /only for 160m, not for this frequency range/,
    );
  });

  it("rejects a head that covers one constituent of a grouped band (M11)", () => {
    const row = PROTOCOL_COVERAGE_TUPLES.find(
      (tuple) => tuple.band === "8m_6m_4m_2m",
    );
    if (row === undefined) throw new Error("the grouped row must exist");
    const draft = structuredClone(cases.hfPhysics) as Mutable;
    const { head } = protocolHead(row.event);
    head.domain = row.domain;
    head.horizons = [row.horizon];
    head.mechanismFamilies = [row.mechanism];
    head.geometryClasses = [...PERMITTED_GEOMETRY_CLASSES[row.mechanism]];
    // 6 m alone is one of the four allocations the label names.
    head.frequencyRangeHz = { minHz: 50000000, maxHz: 54000000 };
    (draft.heads as Mutable[]).push(head);
    const reason = reasonsAt(draft, "heads[3].mechanismFamilies").join();
    expect(reason).toMatch(/8m_6m_4m_2m/);
    expect(reason).toMatch(/not for this frequency range/);
  });

  it("does not route a frequency in a gap between grouped constituents", () => {
    const row = PROTOCOL_COVERAGE_TUPLES.find(
      (tuple) => tuple.band === "8m_6m_4m_2m",
    );
    if (row === undefined) throw new Error("the grouped row must exist");
    const draft = structuredClone(cases.hfPhysics) as Mutable;
    const { head } = protocolHead(row.event);
    head.domain = row.domain;
    head.horizons = [row.horizon];
    head.mechanismFamilies = [row.mechanism];
    head.geometryClasses = [...PERMITTED_GEOMETRY_CLASSES[row.mechanism]];
    head.units = QUANTITY_UNITS[row.event];
    head.frequencyRangeHz = protocolBandEnvelope(row.band) as {
      minHz: number;
      maxHz: number;
    };
    (draft.heads as Mutable[]).push(head);
    const outcome = parseCapability(draft);
    if (!outcome.ok) {
      throw new Error(`must parse: ${JSON.stringify(outcome.issues)}`);
    }
    const groupedQuery = {
      ...secondQuery,
      quantity: row.event,
      domain: row.domain,
      horizon: row.horizon,
      mechanismFamily: row.mechanism,
      geometryClass: PERMITTED_GEOMETRY_CLASSES[row.mechanism][0],
    } as const;
    // 100 MHz is between the 4 m and 2 m allocations: no protocol row.
    expect(
      capabilityCovers(outcome.value, {
        ...groupedQuery,
        frequencyHz: 100000000,
      }),
    ).toBe(false);
    // 144.2 MHz is inside the 2 m constituent of the same label.
    expect(
      capabilityCovers(outcome.value, {
        ...groupedQuery,
        frequencyHz: 144200000,
      }),
    ).toBe(true);
  });

  it("rejects a routable head pairing a family with an alien geometry (A21, A22)", () => {
    const bad = candidate("hfPhysics");
    const head = (bad.heads as Mutable[])[1];
    head.geometryClasses = ["terrestrial_great_circle", "earth_space"];
    expect(reasonsAt(bad, "heads[1].geometryClasses").join()).toMatch(
      /regular_ef is not answered on geometry class earth_space/,
    );
  });

  it("pairs a relayed geometry with a relay kind the family admits (A21)", () => {
    // Geometry alone admits both relay kinds on a two-leg circuit; the family
    // decides which body may be on it, so the pair is the intersection.
    expect(permittedRelayKinds("satellite", "two_leg_relay")).toEqual([
      "orbital",
    ]);
    expect(permittedRelayKinds("relay", "two_leg_relay")).toEqual(["fixed"]);
    expect(permittedRelayKinds("relay", "earth_space")).toEqual([]);
    expect(permittedRelayKinds("eme", "earth_moon_earth")).toEqual(["orbital"]);
    // A routable satellite head on a two-leg circuit is therefore legal: an
    // orbital relay satisfies both tables.
    const draft = structuredClone(cases.hfPhysics) as Mutable;
    const { head } = protocolHead("conditional_decode");
    head.domain = "configured_two_leg_path";
    head.horizons = ["current"];
    head.mechanismFamilies = ["satellite"];
    head.geometryClasses = ["two_leg_relay"];
    // A21: the relay body on this circuit is a spacecraft, so where it is at
    // the valid time is an input the head requires.
    head.requiredInputs = [...(head.requiredInputs as string[]), "ephemeris"];
    head.units = QUANTITY_UNITS.conditional_decode;
    head.uncertaintyKind = "none";
    head.frequencyRangeHz = protocolBandEnvelope("qualified_family_bands") as {
      minHz: number;
      maxHz: number;
    };
    (draft.heads as Mutable[]).push(head);
    const outcome = parseCapability(draft);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("serves a deferred band row from the head's own declared range (M11)", () => {
    // declared_model_bands names no frequencies: the row defers them to the
    // declaration. A network model restricted to 20 m is therefore a legal
    // head on that row, and must not have to advertise the whole radio
    // universe to be accepted.
    const draft = structuredClone(cases.hfPhysics) as Mutable;
    const { head, tuple } = protocolHead("network_detection");
    expect(tuple.band).toBe("declared_model_bands");
    head.frequencyRangeHz = { minHz: 14e6, maxHz: 14.35e6 };
    head.uncertaintyKind = "none";
    (draft.heads as Mutable[]).push(head);
    const outcome = parseCapability(draft);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
    if (!outcome.ok) return;
    const networkQuery = {
      ...secondQuery,
      quantity: "network_detection",
      // M02: the bucket length the request asks about, inside the head's range.
      intervalSeconds: 3600,
      domain: tuple.domain,
      horizon: tuple.horizon,
      mechanismFamily: tuple.mechanism,
      geometryClass: "terrestrial_great_circle",
      frequencyHz: 14.1e6,
    } as const;
    expect(capabilityCovers(outcome.value, networkQuery)).toBe(true);
    // The row is the declaration's own range, so a frequency the declaration
    // does not serve is on no row either.
    expect(
      capabilityCovers(outcome.value, { ...networkQuery, frequencyHz: 7e6 }),
    ).toBe(false);
  });

  it("rejects an orbital head that does not require an ephemeris (A21, M11)", () => {
    const draft = structuredClone(cases.hfPhysics) as Mutable;
    const { head } = protocolHead("pass_geometry");
    head.geometryClasses = ["earth_space"];
    head.receiverClasses = [];
    head.uncertaintyKind = "none";
    head.requiredInputs = ["station_pair", "mode_profile"];
    (draft.heads as Mutable[]).push(head);
    expect(reasonsAt(draft, "heads[3].requiredInputs").join()).toMatch(
      /orbital geometry must require an ephemeris \(A21, M11\)/,
    );
  });

  it("rejects a satellite relay head that does not require an ephemeris (A21, M11)", () => {
    const draft = structuredClone(cases.hfPhysics) as Mutable;
    const { head } = protocolHead("conditional_decode");
    head.domain = "configured_two_leg_path";
    head.horizons = ["current"];
    head.mechanismFamilies = ["satellite"];
    head.geometryClasses = ["two_leg_relay"];
    head.units = QUANTITY_UNITS.conditional_decode;
    head.uncertaintyKind = "none";
    head.requiredInputs = ["station_pair", "mode_profile"];
    head.frequencyRangeHz = protocolBandEnvelope("qualified_family_bands") as {
      minHz: number;
      maxHz: number;
    };
    (draft.heads as Mutable[]).push(head);
    expect(reasonsAt(draft, "heads[3].requiredInputs").join()).toMatch(
      /orbital geometry must require an ephemeris \(A21, M11\)/,
    );
  });

  it("rejects a terrain-dependent head that does not require a terrain profile (A02, M11)", () => {
    const draft = structuredClone(cases.hfPhysics) as Mutable;
    // The fixture's own circuit_support head is ground_sky_coherent, which the
    // request contract calls meaningless without a profile.
    const head = (draft.heads as Mutable[])[0];
    expect(head.mechanismFamilies).toEqual(["ground_sky_coherent"]);
    head.requiredInputs = [
      "station_pair",
      "smoothed_solar_index",
      "mode_profile",
    ];
    expect(reasonsAt(draft, "heads[0].requiredInputs").join()).toMatch(
      /must require terrain_profile \(A02, M11\)/,
    );
  });

  it("requires every mandatory input of every family a routable head advertises (A02, A21, M11)", () => {
    for (const [family, inputs] of Object.entries(MANDATORY_INPUTS_BY_FAMILY)) {
      if (inputs.length === 0) continue;
      const tuple = PROTOCOL_COVERAGE_TUPLES.find(
        (row) => row.mechanism === family,
      );
      if (tuple === undefined) throw new Error(`no row for ${family}`);
      for (const input of inputs) {
        const draft = structuredClone(cases.hfPhysics) as Mutable;
        const { head } = protocolHead(
          tuple.event,
          (row) => row.mechanism === family,
        );
        head.uncertaintyKind = "none";
        head.calibrationId = CALIBRATION_REQUIRED_QUANTITIES.includes(
          tuple.event,
        )
          ? "calibration-0.1.0"
          : null;
        head.requiredInputs = (head.requiredInputs as string[]).filter(
          (declared) => declared !== input,
        );
        (draft.heads as Mutable[]).push(head);
        expect({
          family,
          input,
          reasons: reasonsAt(draft, "heads[3].requiredInputs"),
        }).toMatchObject({
          family,
          input,
          reasons: expect.arrayContaining([expect.stringContaining(input)]),
        });
      }
    }
  });

  it("accepts every routable head in the capability fixtures", () => {
    for (const name of Object.keys(cases)) {
      const outcome = parseCapability(candidate(name));
      expect(outcome.ok ? [] : outcome.issues).toEqual([]);
    }
  });

  it("lets a planned head describe a tuple the protocol has not frozen", () => {
    const planned = parsed("hfPhysics").heads[2];
    expect(planned.state).toBe("planned");
    expect(
      isProtocolCoverage({
        event: planned.quantity,
        domain: planned.domain,
        horizon: planned.horizons[0],
        mechanism: planned.mechanismFamilies[0],
      }),
    ).toBe(false);
  });

  it("rejects a routable head that advertises another result schema (M19)", () => {
    const bad = candidate("hfPhysics");
    (bad.heads as Mutable[])[1].outputSchemaId = "propagation-result-0.2.0";
    expect(reasonsAt(bad, "heads[1].outputSchemaId").join()).toMatch(
      new RegExp(`answered by ${RESULT_SCHEMA_VERSION}`),
    );
  });

  it("accepts a routable head on the current result schema (M19)", () => {
    const good = candidate("hfPhysics");
    expect((good.heads as Mutable[])[1].outputSchemaId).toBe(
      RESULT_SCHEMA_VERSION,
    );
    expect(parseCapability(good).ok).toBe(true);
  });

  it("lets a planned head name a future result schema (M19)", () => {
    const good = candidate("hfPhysics");
    const planned = (good.heads as Mutable[])[2];
    expect(planned.state).toBe("planned");
    planned.outputSchemaId = "propagation-result-0.2.0";
    expect(parseCapability(good).ok).toBe(true);
  });

  it("rejects an artefact hash with surrounding whitespace", () => {
    const bad = candidate("hfPhysics");
    bad.modelHash = `${bad.modelHash as string} `;
    expect(reasonsAt(bad, "modelHash").join()).toMatch(
      /no leading or trailing whitespace/,
    );
  });

  it("accepts the same artefact hash written exactly", () => {
    expect(parseCapability(candidate("hfPhysics")).ok).toBe(true);
  });

  it("rejects an interval uncertainty kind on the non-scalar quantities (M17)", () => {
    for (const quantity of ["circuit_support", "pass_geometry"] as const) {
      const draft = structuredClone(cases.hfPhysics) as Mutable;
      const { head } = protocolHead(quantity);
      (draft.heads as Mutable[]).push(head);
      expect(reasonsAt(draft, "heads[3].uncertaintyKind").join()).toMatch(
        /no scalar to bracket/,
      );
      head.uncertaintyKind = "none";
      expect(parseCapability(draft).ok).toBe(true);
    }
  });

  it("treats the same quantities as non-scalar as the result side does", () => {
    for (const quantity of PREDICTION_QUANTITIES) {
      if (hasPointValue(quantity)) continue;
      const draft = structuredClone(cases.hfPhysics) as Mutable;
      const { head } = protocolHead(quantity);
      head.uncertaintyKind = "model_spread";
      (draft.heads as Mutable[]).push(head);
      expect(reasonsAt(draft, "heads[3].uncertaintyKind").join()).toMatch(
        /no scalar to bracket/,
      );
    }
  });

  it("accepts a pass_geometry head that names no receiver class (A01)", () => {
    const draft = structuredClone(cases.hfPhysics) as Mutable;
    const { head } = protocolHead("pass_geometry");
    head.uncertaintyKind = "none";
    expect(head.receiverClasses).toEqual([]);
    (draft.heads as Mutable[]).push(head);
    const outcome = parseCapability(draft);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("rejects a received head that names no receiver class (A01)", () => {
    const bad = candidate("hfPhysics");
    (bad.heads as Mutable[])[1].receiverClasses = [];
    expect(reasonsAt(bad, "heads[1].receiverClasses").join()).toMatch(
      /must declare its receiver classes/,
    );
  });

  it("rejects a pass_geometry head that names a receiver class (A01)", () => {
    const draft = structuredClone(cases.hfPhysics) as Mutable;
    const { head } = protocolHead("pass_geometry");
    head.uncertaintyKind = "none";
    head.receiverClasses = ["external_noise_dominated"];
    (draft.heads as Mutable[]).push(head);
    expect(reasonsAt(draft, "heads[3].receiverClasses").join()).toMatch(
      /involves no receive chain/,
    );
  });

  it("ignores both receive chains for pass_geometry (A21)", () => {
    // A pass is mutual visibility of the relay, received by nobody, so a
    // declaration that names neither station's receiver class still covers it.
    const draft = structuredClone(cases.hfPhysics) as Mutable;
    const { head, tuple } = protocolHead("pass_geometry");
    head.geometryClasses = ["earth_space"];
    head.receiverClasses = [];
    head.uncertaintyKind = "none";
    head.requiredInputs = ["station_pair", "mode_profile", "ephemeris"];
    (draft.heads as Mutable[]).push(head);
    const outcome = parseCapability(draft);
    if (!outcome.ok) {
      throw new Error(`must parse: ${JSON.stringify(outcome.issues)}`);
    }
    const passQuery = {
      ...secondQuery,
      quantity: "pass_geometry",
      intervalSeconds: 750,
      domain: tuple.domain,
      horizon: tuple.horizon,
      mechanismFamily: tuple.mechanism,
      geometryClass: "earth_space",
      availableInputs: ["station_pair", "mode_profile", "ephemeris"] as const,
    } as const;
    expect(capabilityCovers(outcome.value, passQuery)).toBe(true);
    // The same declaration does not cover a quantity that is received.
    expect(
      capabilityCovers(outcome.value, { ...passQuery, quantity: "snr2500" }),
    ).toBe(false);
  });

  it("ignores the transmitting receive chain for a directed quantity", () => {
    // snr2500 is measured at one receiver (M08/M09), so the transmitting
    // station's own receive chain does not take part in coverage.
    expect(
      capabilityCovers(parsed("hfPhysics"), {
        ...baseQuery,
        txReceiverClass: "calibrated_system_temperature",
      }),
    ).toBe(true);
  });

  it("checks both receive chains for a reciprocal quantity (M18)", () => {
    const reciprocal = {
      ...baseQuery,
      quantity: "circuit_support",
      // The fixture's circuit_support head sits on the tuple and the band the
      // protocol actually defines for it.
      frequencyHz: 1840000,
      horizon: "climatology",
      mechanismFamily: "ground_sky_coherent",
      // A02: the head's family needs a terrain profile, so the request carries
      // one; this test is about the receive chains, not the inputs.
      availableInputs: [...baseQuery.availableInputs, "terrain_profile"],
    } as const;
    expect(capabilityCovers(parsed("hfPhysics"), reciprocal)).toBe(true);
    expect(
      capabilityCovers(parsed("hfPhysics"), {
        ...reciprocal,
        txReceiverClass: "calibrated_system_temperature",
      }),
    ).toBe(false);
  });

  it("still rejects a directed head with an out-of-class receiving chain", () => {
    expect(
      capabilityCovers(parsed("hfPhysics"), {
        ...baseQuery,
        rxReceiverClass: "calibrated_system_temperature",
      }),
    ).toBe(false);
  });

  it("accepts a station inside both declared classes (A01)", () => {
    expect(
      capabilityCovers(parsed("hfPhysics"), {
        ...baseQuery,
        txAntennaClass: "unspecified_scenario_range",
        txReceiverClass: "unspecified_scenario_range",
        rxReceiverClass: "unspecified_scenario_range",
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

  it("rejects a routable interval head that declares no interval range (M02, M19)", () => {
    const bad = candidate("hfPhysics");
    const { head } = protocolHead(
      "usable_burst",
      (tuple) => tuple.mechanism === "meteor",
    );
    head.intervalSecondsRange = null;
    head.uncertaintyKind = "none";
    (bad.heads as Mutable[]).push(head);
    expect(reasonsAt(bad, "heads[3].intervalSecondsRange").join()).toMatch(
      /declares the interval lengths it answers/,
    );
  });

  it("rejects an instantaneous head that declares an interval range (M02)", () => {
    const bad = candidate("hfPhysics");
    ((bad.heads as Mutable[])[1] as Mutable).intervalSecondsRange = {
      minSeconds: 60,
      maxSeconds: 3600,
    };
    expect(reasonsAt(bad, "heads[1].intervalSecondsRange").join()).toMatch(
      /sampled at an instant and declares no interval range/,
    );
  });

  it("routes an interval head only for the lengths it was qualified for (M02, M19)", () => {
    const draft = candidate("hfPhysics");
    const { head, tuple } = protocolHead(
      "usable_burst",
      (tuple) => tuple.mechanism === "meteor",
    );
    head.uncertaintyKind = "none";
    head.intervalSecondsRange = { minSeconds: 600, maxSeconds: 3600 };
    (draft.heads as Mutable[]).push(head);
    const outcome = parseCapability(draft);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
    if (!outcome.ok) return;
    const burstQuery = {
      ...secondQuery,
      quantity: "usable_burst",
      domain: tuple.domain,
      horizon: tuple.horizon,
      mechanismFamily: tuple.mechanism,
      geometryClass: "bistatic_scatter",
      frequencyHz:
        ((head.frequencyRangeHz as { minHz: number }).minHz +
          (head.frequencyRangeHz as { maxHz: number }).maxHz) /
        2,
      intervalSeconds: 900,
    } as const;
    expect(capabilityCovers(outcome.value, burstQuery)).toBe(true);
    // A one-second burst probability is a different event, not a finer one.
    expect(
      capabilityCovers(outcome.value, { ...burstQuery, intervalSeconds: 1 }),
    ).toBe(false);
    // An interval head answers no instantaneous request either.
    expect(
      capabilityCovers(outcome.value, { ...burstQuery, intervalSeconds: null }),
    ).toBe(false);
  });

  it("rejects two routable interval heads whose interval ranges intersect (M19)", () => {
    const bad = intervalOverlapDraft(
      { minSeconds: 60, maxSeconds: 900 },
      { minSeconds: 600, maxSeconds: 3600 },
    );
    expect(reasonsAt(bad, "heads[4].frequencyRangeHz").join()).toMatch(
      /both answer one request/,
    );
  });

  it("accepts two routable interval heads on disjoint lengths (M19)", () => {
    const good = intervalOverlapDraft(
      { minSeconds: 60, maxSeconds: 599 },
      { minSeconds: 600, maxSeconds: 3600 },
    );
    const outcome = parseCapability(good);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("rejects a routable head advertising a family no request can name (A19)", () => {
    const bad = candidate("hfPhysics");
    const { head } = protocolHead(
      "usable_burst",
      (tuple) => tuple.mechanism === "meteor",
    );
    head.uncertaintyKind = "none";
    head.mechanismFamilies = ["aircraft_scatter"];
    (bad.heads as Mutable[]).push(head);
    expect(reasonsAt(bad, "heads[3].mechanismFamilies").join()).toMatch(
      /No request can be written for mechanism family aircraft_scatter/,
    );
  });

  it("rejects two routable heads whose frequency ranges overlap (M19)", () => {
    // 1.8-2.1 MHz and 1.7-2.0 MHz are not byte-identical, so the two heads have
    // distinct tuple keys, yet both answer a 1.85 MHz request with no tie-break.
    const bad = overlapDraft(
      { minHz: 1800000, maxHz: 2100000 },
      { minHz: 1700000, maxHz: 2000000 },
    );
    expect(reasonsAt(bad, "heads[4].frequencyRangeHz").join()).toMatch(
      /both answer one request/,
    );
  });

  it("accepts two routable heads whose frequency ranges are disjoint (M19)", () => {
    const good = overlapDraft(
      { minHz: 1700000, maxHz: 1799999 },
      { minHz: 1800000, maxHz: 2000000 },
    );
    const outcome = parseCapability(good);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("accepts one range on two mode profiles, which routing tells apart (M19)", () => {
    const good = overlapDraft(
      { minHz: 1800000, maxHz: 2000000 },
      { minHz: 1800000, maxHz: 2000000 },
      (head) => {
        head.modeProfileIds = ["ft4-wsjtx-2.7.0-7.5s"];
      },
    );
    const outcome = parseCapability(good);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("a routable head declares every dimension capabilityCovers matches on", () => {
    for (const dimension of ROUTING_DIMENSIONS) {
      const bad = candidate("hfPhysics");
      const head = structuredClone(SECOND_SNR_HEAD) as Mutable;
      head.bandKeys = [];
      head[dimension.field] = [];
      (bad.heads as Mutable[]).push(head);
      expect(reasonsAt(bad, `heads[3].${dimension.field}`).join()).toMatch(
        /declares at least one/,
      );

      // The same silence is how a gap is declared, so it stays legal off the
      // routable states -- for the two lists the schema itself leaves open.
      if (!SCHEMA_OPTIONAL_DIMENSIONS.includes(dimension.field)) continue;
      const good = candidate("hfPhysics");
      const planned = structuredClone(head) as Mutable;
      planned.state = "planned";
      planned.featureHash = null;
      planned.featureSchemaId = null;
      (good.heads as Mutable[]).push(planned);
      const outcome = parseCapability(good);
      expect(outcome.ok ? [] : outcome.issues).toEqual([]);
    }
  });

  it("allows only one head per coverage tuple, whatever its state", () => {
    const bad = candidate("hfPhysics");
    const heads = bad.heads as Mutable[];
    heads.push(structuredClone(heads[1]));
    expect(reasonsAt(bad, "heads[3].quantity").join()).toMatch(/Duplicate/);
  });
});

describe("capabilityDigest (M24)", () => {
  it("digests two independently parsed copies of one capability to the same value (M24)", async () => {
    const first = await capabilityDigest(parsed("hfPhysics"));
    const second = await capabilityDigest(parsed("hfPhysics"));
    expect(first).toBe(second);
    expect(first).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("gives two declarations that differ only by a head's state different digests", async () => {
    const draft = candidate("hfPhysics");
    (draft.heads as Mutable[])[2].state = "unsupported";
    const outcome = parseCapability(draft);
    if (!outcome.ok) throw new Error("mutated fixture must parse");
    expect(await capabilityDigest(outcome.value)).not.toBe(
      await capabilityDigest(parsed("hfPhysics")),
    );
  });
  it("rejects a routable head on a geometry its domain is not served on (M11, A21)", () => {
    // The protocol froze conditional_decode on configured_two_leg_path for the
    // satellite family, which also takes earth_space: without the domain
    // pairing this head would advertise and route a direct pass onto the
    // configured two-leg decode population.
    const draft = structuredClone(cases.hfPhysics) as Mutable;
    const { head } = protocolHead(
      "conditional_decode",
      (tuple) => tuple.mechanism === "satellite",
    );
    head.geometryClasses = ["earth_space"];
    (draft.heads as Mutable[]).push(head);
    expect(reasonsAt(draft, "heads[3].geometryClasses").join()).toMatch(
      /serves domain configured_two_leg_path on two_leg_relay, not on geometry class earth_space \(M11, A21\)/,
    );

    // The transponder circuit the row was frozen over is accepted.
    head.geometryClasses = ["two_leg_relay"];
    expect(parseCapability(draft).ok).toBe(true);
  });
});

describe("parseResultForRequest binds a result to its request", () => {
  /**
   * A coherent pair: the hfShortPath request moved onto 160 m, which is the
   * band the protocol froze the fixture's ground_sky_coherent rows for, and the
   * fullHfCircuit result whose decode head (frozen for 3-300 MHz) is reported
   * as a declared gap rather than served there.
   */
  function boundRequest(edit?: (draft: Mutable) => void): Mutable {
    const draft = structuredClone(
      (requestCases as unknown as Record<string, Mutable>).hfShortPath,
    ) as Mutable;
    (draft.mechanismPolicy as Mutable).family = "ground_sky_coherent";
    draft.frequencyHz = 1840000;
    draft.bandKey = "160m";
    draft.terrainProfileId = "terrain-em12-to-jo21-v3";
    edit?.(draft);
    return draft;
  }

  function boundResult(edit?: (draft: Mutable) => void): Mutable {
    const draft = structuredClone(
      (resultCases as unknown as Record<string, Mutable>).fullHfCircuit,
    ) as Mutable;
    const decode = (draft.heads as Mutable[]).find(
      (head) => head.quantity === "conditional_decode",
    ) as Mutable;
    decode.state = {
      availability: "missing_input",
      reason: "no_calibrated_decoder",
    };
    edit?.(draft);
    return draft;
  }

  async function bind(
    result: Mutable,
    request: Mutable = boundRequest(),
    rekey = true,
  ): Promise<ContractIssue[]> {
    const parsedRequest = parseRequest(request);
    if (!parsedRequest.ok) {
      throw new Error(
        `request must parse: ${JSON.stringify(parsedRequest.issues)}`,
      );
    }
    if (rekey) result.requestKey = await requestKeyDigest(parsedRequest.value);
    const outcome = await parseResultForRequest(result, parsedRequest.value);
    return outcome.ok ? [] : outcome.issues;
  }

  it("accepts a result that answers the request it names", async () => {
    expect(await bind(boundResult())).toEqual([]);
  });

  it("rejects a served head the protocol does not define at the requested frequency (M11)", async () => {
    // The reviewer's case: the decode head's row is frozen for 3-300 MHz, so a
    // 1.84 MHz result may not carry it as a value-bearing companion head. The
    // standalone parser cannot see this: the four-field tuple does exist.
    const result = boundResult((draft) => {
      const decode = (draft.heads as Mutable[]).find(
        (head) => head.quantity === "conditional_decode",
      ) as Mutable;
      const source = structuredClone(
        (resultCases as unknown as Record<string, Mutable>).fullHfCircuit,
      );
      decode.state = ((source.heads as Mutable[])[2] as Mutable).state;
    });
    const reasons = (await bind(result))
      .filter((issue) => issue.path === "heads[2].mechanismFamily")
      .map((issue) => issue.reason);
    expect(reasons.join()).toMatch(
      /defines no conditional_decode on mechanism_labeled_exposure at current via f2_daytime at 1840000 Hz \(M11\)/,
    );
  });

  it("rejects a result that names another request (M01)", async () => {
    const result = boundResult();
    const issues = await bind(result, boundRequest(), false);
    expect(
      issues.filter((issue) => issue.path === "requestKey").length,
    ).toBeGreaterThan(0);
  });

  it("rejects a result valid at another instant (M02)", async () => {
    const result = boundResult((draft) => {
      draft.validAt = "2026-09-11T20:00:00Z";
      for (const head of draft.heads as Mutable[]) head.validAt = draft.validAt;
    });
    const issues = await bind(result);
    expect(issues.map((issue) => issue.path)).toContain("validAt");
  });

  it("rejects a target head that answers another row of the request (M11, M19)", async () => {
    // The request asks for the climatology row; the head answers the forecast
    // row. Both are frozen, and both parse on their own.
    const request = boundRequest((draft) => {
      (draft.scope as Mutable).horizon = "climatology";
    });
    const issues = await bind(boundResult(), request);
    expect(
      issues
        .filter((issue) => issue.path === "heads[1].horizon")
        .map((issue) => issue.reason)
        .join(),
    ).toMatch(/answers the requested horizon climatology, not forecast_1_24h/);
  });

  it("rejects a result with no head for the requested event (M01)", async () => {
    const result = boundResult((draft) => {
      draft.heads = (draft.heads as Mutable[]).filter(
        (head) => head.quantity !== "snr2500",
      );
    });
    expect(
      (await bind(result))
        .filter((issue) => issue.path === "heads")
        .map((issue) => issue.reason)
        .join(),
    ).toMatch(/carries no snr2500 head/);
  });

  /**
   * A relayed pair: the repeater request with the family left to the router,
   * so only the relay the caller supplied says which family may answer. Both
   * conditional_decode/configured_two_leg_path/current rows are frozen, one
   * for `relay` and one for `satellite`, which is what makes the pairing
   * checkable only against the relay kind.
   */
  function relayRequest(relayKind: "fixed" | "orbital"): Mutable {
    const draft = structuredClone(
      (requestCases as unknown as Record<string, Mutable>).fixedRelay,
    ) as Mutable;
    (draft.mechanismPolicy as Mutable).family = "auto";
    if (relayKind === "orbital") {
      draft.relay = {
        kind: "orbital",
        relayId: "sat-ao-91",
        ephemerisId: "tle-ao-91-2026-09-11",
        ephemerisEpoch: "2026-09-11T17:30:00Z",
      };
    }
    return draft;
  }

  function relayResult(family: "relay" | "satellite"): Mutable {
    const draft = structuredClone(
      (resultCases as unknown as Record<string, Mutable>).fullHfCircuit,
    ) as Mutable;
    const contextId = (
      (requestCases as unknown as Record<string, Mutable>).fixedRelay as Mutable
    ).contextId as string;
    const head = structuredClone((draft.heads as Mutable[])[2]) as Mutable;
    head.domain = "configured_two_leg_path";
    head.mechanismFamily = family;
    head.contextId = contextId;
    draft.contextId = contextId;
    draft.heads = [head];
    return draft;
  }

  it("rejects a satellite head answering a fixed relay (A21, A22)", async () => {
    // The reviewer's case: geometry alone admits both families on a two-leg
    // path, so without the relay kind a transponder model answers a request
    // that named a ground repeater.
    const reasons = (
      await bind(relayResult("satellite"), relayRequest("fixed"))
    ).map((issue) => issue.reason);
    expect(reasons.join()).toMatch(
      /Mechanism family satellite is not served by a relay of kind fixed/,
    );
  });

  it("rejects a terrestrial relay head answering an orbital relay (A21, A22)", async () => {
    const reasons = (
      await bind(relayResult("relay"), relayRequest("orbital"))
    ).map((issue) => issue.reason);
    expect(reasons.join()).toMatch(
      /Mechanism family relay is not served by a relay of kind orbital/,
    );
  });

  it("accepts each family the supplied relay admits (A21, A22)", async () => {
    expect(await bind(relayResult("relay"), relayRequest("fixed"))).toEqual([]);
    expect(
      await bind(relayResult("satellite"), relayRequest("orbital")),
    ).toEqual([]);
  });

  /** The EME pair the reviewer named: a 145.95 MHz request for a Doppler shift. */
  function dopplerRequest(): Mutable {
    const draft = structuredClone(
      (requestCases as unknown as Record<string, Mutable>).satellitePass,
    ) as Mutable;
    draft.targetEvent = "doppler";
    draft.scope = {
      domain: "qualified_lunar_station",
      horizon: "forecast_seconds",
      aggregation: "instantaneous",
      intervalSeconds: null,
    };
    draft.mechanismPolicy = {
      family: "eme",
      geometryClass: "earth_moon_earth",
    };
    draft.relay = {
      kind: "orbital",
      relayId: "moon",
      ephemerisId: "jpl-de440-2026-09-11",
      ephemerisEpoch: "2026-09-11T00:00:00Z",
    };
    draft.requestedModel = {
      policy: "named",
      modelId: "propulse-physics-v1",
      modelVersion: "1.0.0",
      policyVersion: "source-policy-0.1.0",
    };
    return draft;
  }

  function dopplerResult(transmittedFrequencyHz: number): Mutable {
    const draft = structuredClone(
      (resultCases as unknown as Record<string, Mutable>).fullHfCircuit,
    ) as Mutable;
    const satellite = (requestCases as unknown as Record<string, Mutable>)
      .satellitePass as Mutable;
    const head = structuredClone((draft.heads as Mutable[])[2]) as Mutable;
    head.quantity = "doppler";
    head.units = "Hz";
    head.domain = "qualified_lunar_station";
    head.horizon = "forecast_seconds";
    head.mechanismFamily = "eme";
    head.assumptions = [];
    head.uncertainty = { kind: "none" };
    head.contextId = satellite.contextId;
    head.validAt = satellite.validAt;
    head.state = {
      availability: "available",
      value: {
        dopplerHz: -318.4,
        transmittedFrequencyHz,
        signConvention: "positive_receding",
      },
    };
    draft.contextId = satellite.contextId;
    draft.validAt = satellite.validAt;
    draft.heads = [head];
    return draft;
  }

  it("rejects a doppler head computed on another carrier (M02, M11)", async () => {
    // Doppler is proportional to the carrier, so a 432 MHz shift answers a
    // different calculation than the 145.95 MHz one that was asked for, even
    // though the digest, the protocol row and the band all check out.
    const issues = await bind(dopplerResult(432000000), dopplerRequest());
    expect(issues).toEqual([
      {
        path: "heads[0].state.value.transmittedFrequencyHz",
        reason:
          "A doppler head answers the requested carrier 145950000 Hz, not 432000000 Hz (M02, M11)",
      },
    ]);
  });

  it("accepts a doppler head computed on the requested carrier (M02, M11)", async () => {
    expect(await bind(dopplerResult(145950000), dopplerRequest())).toEqual([]);
  });

  it("binds an unavailable target head to the request too (M11)", async () => {
    // A declared gap is attributed to a request population: a gap copied from
    // another horizon would be counted against the horizon that was asked for.
    const result = boundResult((draft) => {
      const head = (draft.heads as Mutable[]).find(
        (candidate) => candidate.quantity === "snr2500",
      ) as Mutable;
      head.horizon = "current";
      head.uncertainty = { kind: "none" };
      head.state = { availability: "unavailable", reason: "no_solar_input" };
    });
    const reasons = (await bind(result)).map((issue) => issue.reason);
    expect(reasons.join()).toMatch(
      /answers the requested horizon forecast_1_24h, not current/,
    );
  });

  it("binds or documents an exemption for every routing dimension (M19)", () => {
    // The structural guarantee: a dimension added to routing later cannot be
    // left unchecked on the result side without someone writing down why.
    const bound = new Map(
      RESULT_BINDINGS.map((binding) => [binding.field, binding]),
    );
    const routed = [
      ...ROUTING_DIMENSIONS.map((dimension) => dimension.field),
      ...RANGE_ROUTING_DIMENSIONS.map((dimension) => dimension.field),
    ];
    for (const field of routed) {
      const binding = bound.get(field);
      expect(binding, `routing dimension ${field}`).toBeDefined();
      if (binding === undefined) continue;
      if (binding.check === null) {
        expect(binding.exemption, `exemption for ${field}`).toMatch(/\w/);
      } else {
        expect(binding.exemption, `binding for ${field}`).toBeNull();
      }
    }
    // Every row says whether it survives an unavailable target head, and a row
    // that reads a value cannot: there is none to read.
    for (const binding of RESULT_BINDINGS) {
      expect(
        typeof binding.onUnavailableTarget,
        `${binding.field} declares onUnavailableTarget`,
      ).toBe("boolean");
      if (binding.check === null || binding.appliesTo === "served") {
        expect(
          binding.onUnavailableTarget,
          `${binding.field} reads a value and cannot bind a gap`,
        ).toBe(false);
      }
    }
  });
});
