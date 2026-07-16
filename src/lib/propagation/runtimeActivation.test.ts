import { describe, expect, it } from "vitest";
import {
  runtimeFutureCastHorizonIsActivated,
  runtimeModeIsActivated,
} from "./runtimeActivation";

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
