import { describe, expect, it } from "vitest";
import { composeRimScores, computeRIM, RIM_WEIGHTS } from "./rim";
import type { RIMInput } from "./rimTypes";
import type { RIMSubScore } from "@/types/atmos";

function sub(
  value: number,
  available: boolean,
  label: string,
): RIMSubScore {
  return { value, label, trend: "stable", dataAvailable: available };
}

const VALUES = {
  hfBand: 80,
  vhfUhf: 70,
  infraRisk: 60,
  emcommReadiness: 40,
} as const;

const LABELS = {
  hfBand: "HF Bands",
  vhfUhf: "VHF/UHF",
  infraRisk: "Infrastructure",
  emcommReadiness: "EmComm",
} as const;

type Slot = keyof typeof VALUES;

function parts(missing: readonly Slot[]) {
  const dropped = new Set(missing);
  return {
    hfBand: sub(VALUES.hfBand, !dropped.has("hfBand"), LABELS.hfBand),
    vhfUhf: sub(VALUES.vhfUhf, !dropped.has("vhfUhf"), LABELS.vhfUhf),
    infraRisk: sub(VALUES.infraRisk, !dropped.has("infraRisk"), LABELS.infraRisk),
    emcommReadiness: sub(
      VALUES.emcommReadiness,
      !dropped.has("emcommReadiness"),
      LABELS.emcommReadiness,
    ),
  };
}

function expectedComposite(missing: readonly Slot[]): number {
  const kept = (Object.keys(VALUES) as Slot[]).filter(
    (slot) => !missing.includes(slot),
  );
  if (kept.length === 0) return 0;
  const weight = kept.reduce((sum, slot) => sum + RIM_WEIGHTS[slot], 0);
  const raw = kept.reduce(
    (sum, slot) => sum + VALUES[slot] * RIM_WEIGHTS[slot],
    0,
  );
  return Math.round(raw / weight);
}

const ONE_MISSING: Slot[][] = [
  ["hfBand"],
  ["vhfUhf"],
  ["infraRisk"],
  ["emcommReadiness"],
];

const TWO_MISSING: Slot[][] = [
  ["hfBand", "vhfUhf"],
  ["hfBand", "infraRisk"],
  ["hfBand", "emcommReadiness"],
  ["vhfUhf", "infraRisk"],
  ["vhfUhf", "emcommReadiness"],
  ["infraRisk", "emcommReadiness"],
];

describe("composeRimScores", () => {
  it("matches the 0.35/0.25/0.25/0.15 formula when every sub-score is present", () => {
    const result = composeRimScores(parts([]), "home", 0);
    expect(result.composite).toBe(
      Math.round(80 * 0.35 + 70 * 0.25 + 60 * 0.25 + 40 * 0.15),
    );
    expect(result.partial).toBe(false);
    expect(result.excludedInputs).toEqual([]);
  });

  it.each(ONE_MISSING)(
    "drops %s, renormalises the rest, and never mixes the dummy value",
    (slot) => {
      const dummyZero = {
        ...parts([slot]),
        [slot]: sub(0, false, LABELS[slot]),
      };
      const result = composeRimScores(dummyZero, "home", 0);
      expect(result.composite).toBe(expectedComposite([slot]));
      expect(result.partial).toBe(true);
      expect(result.excludedInputs).toEqual([LABELS[slot]]);
      // Mixing the dummy 0 would pull the composite down.
      const wronglyIncluded = Math.round(
        0 * RIM_WEIGHTS[slot] +
          (Object.keys(VALUES) as Slot[])
            .filter((key) => key !== slot)
            .reduce((sum, key) => sum + VALUES[key] * RIM_WEIGHTS[key], 0),
      );
      expect(result.composite).not.toBe(wronglyIncluded);
    },
  );

  it.each(TWO_MISSING)(
    "drops %s and %s together and renormalises",
    (a, b) => {
      const missing: Slot[] = [a, b];
      const result = composeRimScores(parts(missing), "home", 0);
      expect(result.composite).toBe(expectedComposite(missing));
      expect(result.partial).toBe(true);
      expect(result.excludedInputs).toEqual([LABELS[a], LABELS[b]]);
    },
  );

  it("returns composite 0 labelled PARTIAL when every sub-score is missing", () => {
    const result = composeRimScores(
      parts(["hfBand", "vhfUhf", "infraRisk", "emcommReadiness"]),
      "home",
      0,
    );
    expect(result.composite).toBe(0);
    expect(result.partial).toBe(true);
    expect(result.excludedInputs).toEqual([
      "HF Bands",
      "VHF/UHF",
      "Infrastructure",
      "EmComm",
    ]);
  });
});

const FULL_INPUT: RIMInput = {
  kpIndex: 2,
  solarFlux: 120,
  xrayFlux: 1e-6,
  protonFlux: 1,
  dstIndex: 0,
  tecValue: 30,
  lightningStrikeCount: 1,
  nearestLightningKm: 800,
  activeAlertSeverities: [],
  hasActiveRadar: false,
  floodProximity: "none",
  stationLat: 30,
  stationLon: -97,
  repeaterCount: 4,
  operationalRepeaterRatio: 0.8,
  nvisViable: true,
  alertMaxSeverityLevel: 0,
};

describe("computeRIM", () => {
  it("keeps the old composite on the all-inputs path", () => {
    const result = computeRIM(FULL_INPUT, "home");
    expect(result.hfBand.dataAvailable).toBe(true);
    expect(result.vhfUhf.dataAvailable).toBe(true);
    expect(result.infraRisk.dataAvailable).toBe(true);
    expect(result.emcommReadiness.dataAvailable).toBe(true);
    expect(result.partial).toBe(false);
    expect(result.composite).toBe(
      Math.round(
        result.hfBand.value * 0.35 +
          result.vhfUhf.value * 0.25 +
          result.infraRisk.value * 0.25 +
          result.emcommReadiness.value * 0.15,
      ),
    );
  });

  it("does not let Kp alone unlock the VHF default", () => {
    const result = computeRIM(
      {
        ...FULL_INPUT,
        kpIndex: 2,
        nearestLightningKm: null,
        lightningStrikeCount: 0,
        activeAlertSeverities: [],
        floodProximity: "none",
      },
      "home",
    );
    expect(result.vhfUhf.dataAvailable).toBe(false);
    expect(result.partial).toBe(true);
    expect(result.excludedInputs).toContain("VHF/UHF");
  });

  it("names the inputs that moved each available sub-score", () => {
    const result = computeRIM(
      { ...FULL_INPUT, nearestLightningKm: 80, floodProximity: "minor" },
      "home",
    );
    expect(result.hfBand.reason).toMatch(/Kp 2/);
    expect(result.hfBand.reason).toMatch(/lightning QRN at 80 km/);
    expect(result.infraRisk.reason).toMatch(/minor flood stage/);
    expect(result.emcommReadiness.reason).toMatch(/4 repeaters/);
  });

  it("labels missing HF as NO DATA and excludes it from the composite", () => {
    const result = computeRIM(
      {
        ...FULL_INPUT,
        kpIndex: null,
        solarFlux: null,
        xrayFlux: null,
        protonFlux: null,
        tecValue: null,
      },
      "home",
    );
    expect(result.hfBand.dataAvailable).toBe(false);
    expect(result.hfBand.reason).toMatch(/^NO DATA/);
    expect(result.excludedInputs).toContain("HF Bands");
    expect(result.partial).toBe(true);
    const remaining =
      (result.vhfUhf.value * 0.25 +
        result.infraRisk.value * 0.25 +
        result.emcommReadiness.value * 0.15) /
      0.65;
    expect(result.composite).toBe(Math.round(remaining));
  });
});
