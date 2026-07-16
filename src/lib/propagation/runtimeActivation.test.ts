import { describe, expect, it } from "vitest";
import fixture from "../../../ml/fixtures/runtime_activation_v2_cases.json";
import {
  FUTURECAST_HORIZONS_HOURS,
  PROPAGATION_RUNTIME_MODES,
  type FutureCastHorizonHours,
  type PropagationRuntimeMode,
  runtimeFutureCastHorizonIsActivated,
  runtimeModeIsActivated,
} from "./runtimeActivation";

interface SharedCase {
  name: string;
  activation: Parameters<typeof runtimeModeIsActivated>[1];
  eligibility: Parameters<typeof runtimeModeIsActivated>[2];
  allowed_modes: PropagationRuntimeMode[];
  futurecast_horizons_hours: FutureCastHorizonHours[];
  valid: boolean;
}

const readinessSha256 = "a".repeat(64);

const activation = {
  schema_version: 1,
  scope: "phase6_runtime_activation",
  activation_state: "approved",
  product_activation_recorded: true,
  approved_modes: ["core_nowcast"],
  locked_prospective_outcomes_read: false,
  source_readiness_sha256: readinessSha256,
};

const eligibility = {
  schema_version: 2,
  scope: "phase6_runtime_eligibility",
  locked_prospective_outcomes_read: false,
  source_readiness_sha256: readinessSha256,
  futurecast_horizons_hours: [],
  modes: {
    system_health_view: false,
    beta_collection: false,
    core_nowcast: true,
    stationcast_deterministic: false,
    stationcast_learned: false,
    futurecast: false,
    six_meter: false,
  },
};

describe("runtimeModeIsActivated", () => {
  it("matches every shared Python/TypeScript v2 fixture", () => {
    for (const testCase of fixture.cases as SharedCase[]) {
      for (const mode of PROPAGATION_RUNTIME_MODES) {
        expect(
          runtimeModeIsActivated(mode, testCase.activation, testCase.eligibility),
          `${testCase.name}:${mode}`,
        ).toBe(testCase.allowed_modes.includes(mode));
      }
      for (const horizon of FUTURECAST_HORIZONS_HOURS) {
        expect(
          runtimeFutureCastHorizonIsActivated(
            horizon,
            testCase.activation,
            testCase.eligibility,
          ),
          `${testCase.name}:${horizon}h`,
        ).toBe(testCase.futurecast_horizons_hours.includes(horizon));
      }
      expect(testCase.valid).toBe(testCase.allowed_modes.length > 0);
    }
  });

  it("requires both an explicit product decision and current evidence eligibility", () => {
    expect(runtimeModeIsActivated("core_nowcast", activation, eligibility)).toBe(true);
    expect(runtimeModeIsActivated("beta_collection", activation, eligibility)).toBe(false);
    expect(runtimeModeIsActivated("core_nowcast", activation, {
      ...eligibility,
      modes: { ...eligibility.modes, core_nowcast: false },
    })).toBe(false);
  });

  it("fails closed for malformed, unread, or unrecorded activation state", () => {
    expect(runtimeModeIsActivated("core_nowcast", {
      ...activation,
      product_activation_recorded: false,
    }, eligibility)).toBe(false);
    expect(runtimeModeIsActivated("core_nowcast", {
      ...activation,
      approved_modes: ["not-a-mode"],
    }, eligibility)).toBe(false);
    expect(runtimeModeIsActivated("core_nowcast", {
      ...activation,
      approved_modes: ["core_nowcast", "core_nowcast"],
    }, eligibility)).toBe(false);
    expect(runtimeModeIsActivated("core_nowcast", activation, {
      ...eligibility,
      locked_prospective_outcomes_read: true,
    })).toBe(false);
    expect(runtimeModeIsActivated("core_nowcast", activation, {
      ...eligibility,
      modes: { core_nowcast: true },
    })).toBe(false);
    expect(runtimeModeIsActivated("core_nowcast", activation, {
      ...eligibility,
      source_readiness_sha256: "b".repeat(64),
    })).toBe(false);
  });

  it("activates only independently eligible FutureCast horizons", () => {
    const futurecastActivation = {
      ...activation,
      approved_modes: ["futurecast"],
    };
    const partialEligibility = {
      ...eligibility,
      futurecast_horizons_hours: [3, 12],
      modes: { ...eligibility.modes, futurecast: true },
    };
    expect(runtimeFutureCastHorizonIsActivated(
      3,
      futurecastActivation,
      partialEligibility,
    )).toBe(true);
    expect(runtimeFutureCastHorizonIsActivated(
      6,
      futurecastActivation,
      partialEligibility,
    )).toBe(false);
    expect(runtimeModeIsActivated("futurecast", futurecastActivation, {
      ...partialEligibility,
      futurecast_horizons_hours: [12, 3],
    })).toBe(false);
  });
});
