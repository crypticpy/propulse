import activationManifest from "../../../ml/config/propagation_v4_2_runtime_activation.json";
import runtimeEligibility from "../../../ml/config/propagation_v4_2_runtime_eligibility.json";

export const PROPAGATION_RUNTIME_MODES = [
  "system_health_view",
  "beta_collection",
  "core_nowcast",
  "stationcast_deterministic",
  "stationcast_learned",
  "futurecast",
  "six_meter",
] as const;

export type PropagationRuntimeMode = typeof PROPAGATION_RUNTIME_MODES[number];

interface RuntimeActivationDocument {
  schema_version?: unknown;
  scope?: unknown;
  activation_state?: unknown;
  product_activation_recorded?: unknown;
  approved_modes?: unknown;
  locked_prospective_outcomes_read?: unknown;
}

interface RuntimeEligibilityDocument {
  schema_version?: unknown;
  scope?: unknown;
  locked_prospective_outcomes_read?: unknown;
  modes?: unknown;
}

export function runtimeModeIsActivated(
  mode: PropagationRuntimeMode,
  activation: RuntimeActivationDocument,
  eligibility: RuntimeEligibilityDocument,
): boolean {
  const approvedModes = Array.isArray(activation.approved_modes)
    ? activation.approved_modes
    : [];
  if (
    activation.schema_version !== 1 ||
    activation.scope !== "phase6_runtime_activation" ||
    activation.activation_state !== "approved" ||
    activation.product_activation_recorded !== true ||
    activation.locked_prospective_outcomes_read !== false ||
    !Array.isArray(activation.approved_modes) ||
    !approvedModes.every((value) =>
      typeof value === "string" &&
      PROPAGATION_RUNTIME_MODES.includes(value as PropagationRuntimeMode)) ||
    new Set(approvedModes).size !== approvedModes.length ||
    !approvedModes.includes(mode)
  ) {
    return false;
  }
  if (
    eligibility.schema_version !== 1 ||
    eligibility.scope !== "phase6_runtime_eligibility" ||
    eligibility.locked_prospective_outcomes_read !== false ||
    typeof eligibility.modes !== "object" ||
    eligibility.modes === null
  ) {
    return false;
  }
  const eligibleModes = eligibility.modes as Record<string, unknown>;
  if (
    Object.keys(eligibleModes).length !== PROPAGATION_RUNTIME_MODES.length ||
    !PROPAGATION_RUNTIME_MODES.every((name) =>
      typeof eligibleModes[name] === "boolean")
  ) {
    return false;
  }
  return eligibleModes[mode] === true;
}

export function propagationRuntimeModeIsActivated(
  mode: PropagationRuntimeMode,
): boolean {
  return runtimeModeIsActivated(mode, activationManifest, runtimeEligibility);
}
