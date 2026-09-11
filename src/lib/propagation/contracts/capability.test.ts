import { describe, expect, it } from "vitest";
import capabilityCases from "@/lib/propagation/contracts/fixtures/capability.cases.json";
import {
  CALIBRATION_REQUIRED_QUANTITIES,
  PREDICTION_QUANTITIES,
  isProtocolCoverage,
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
  sourceModes: ["offline", "cached_live", "live"],
  bandKeys: ["160m"],
  modeProfileIds: ["msk144-wsjtx-2.7.0-15s"],
  requiredInputs: ["station_pair", "mode_profile"],
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
} as const;

/**
 * A routable head for `quantity` on a tuple the frozen protocol actually
 * defines, so a test about some other rule is not failed by the coverage gate.
 */
function protocolHead(quantity: (typeof PREDICTION_QUANTITIES)[number]) {
  const tuple = PROTOCOL_COVERAGE_TUPLES.find(
    (candidateTuple) => candidateTuple.event === quantity,
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
  // A21/A22: the geometry classes the row's mechanism is answered on.
  head.geometryClasses = [...PERMITTED_GEOMETRY_CLASSES[tuple.mechanism]];
  // A01: only a quantity with a receive chain names receiver classes.
  if (RECEIVER_PARTICIPATION[quantity] === "none") head.receiverClasses = [];
  // A02: no display labels, so a test may narrow the range without a label
  // contradicting it.
  head.bandKeys = [];
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
    (draft.heads as Mutable[]).push(head);
    const outcome = parseCapability(draft);
    if (!outcome.ok) {
      throw new Error(`must parse: ${JSON.stringify(outcome.issues)}`);
    }
    const passQuery = {
      ...secondQuery,
      quantity: "pass_geometry",
      domain: tuple.domain,
      horizon: tuple.horizon,
      mechanismFamily: tuple.mechanism,
      geometryClass: "earth_space",
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
});
