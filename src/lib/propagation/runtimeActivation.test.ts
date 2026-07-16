import { describe, expect, it } from "vitest";
import { runtimeModeIsActivated } from "./runtimeActivation";

const activation = {
  schema_version: 1,
  scope: "phase6_runtime_activation",
  activation_state: "approved",
  product_activation_recorded: true,
  approved_modes: ["core_nowcast"],
  locked_prospective_outcomes_read: false,
};

const eligibility = {
  schema_version: 1,
  scope: "phase6_runtime_eligibility",
  locked_prospective_outcomes_read: false,
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
  });
});
