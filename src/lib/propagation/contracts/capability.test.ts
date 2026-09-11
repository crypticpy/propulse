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
      capabilityCovers(outcome.value, {
        quantity: "snr2500",
        domain: "characterized_fixed_path",
        horizon: "current",
        frequencyHz: 14074000,
        geometryClass: "terrestrial_great_circle",
      }),
    ).toBe(false);
  });

  it("answers coverage from the frequency range, not a band nickname", () => {
    const outcome = parseCapability(candidate("hfPhysics"));
    if (!outcome.ok) throw new Error("fixture must parse");
    const query = {
      quantity: "snr2500",
      domain: "characterized_fixed_path",
      horizon: "current",
      geometryClass: "terrestrial_great_circle",
    } as const;
    expect(
      capabilityCovers(outcome.value, { ...query, frequencyHz: 14074000 }),
    ).toBe(true);
    // 6 m is inside the declared band keys but outside the 2-30 MHz range.
    expect(
      capabilityCovers(outcome.value, { ...query, frequencyHz: 50313000 }),
    ).toBe(false);
    // 160 m below 2 MHz is out of the reference domain and is not clamped in.
    expect(
      capabilityCovers(outcome.value, { ...query, frequencyHz: 1840000 }),
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

  it("rejects a duplicate head for the same quantity and domain", () => {
    const bad = candidate("hfPhysics");
    const heads = bad.heads as Mutable[];
    heads.push(structuredClone(heads[1]));
    expect(reasonsAt(bad, "heads[3].quantity").join()).toMatch(/Duplicate/);
  });
});
