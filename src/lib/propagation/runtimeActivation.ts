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

export const FUTURECAST_HORIZONS_HOURS = [3, 6, 12, 24] as const;
export type FutureCastHorizonHours = typeof FUTURECAST_HORIZONS_HOURS[number];

interface RuntimeActivationDocument {
  schema_version?: unknown;
  scope?: unknown;
  activation_state?: unknown;
  product_activation_recorded?: unknown;
  approved_modes?: unknown;
  locked_prospective_outcomes_read?: unknown;
  source_readiness_sha256?: unknown;
}

interface RuntimeEligibilityDocument {
  schema_version?: unknown;
  scope?: unknown;
  locked_prospective_outcomes_read?: unknown;
  source_readiness_sha256?: unknown;
  futurecast_horizons_hours?: unknown;
  modes?: unknown;
}

function validSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
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
    !validSha256(activation.source_readiness_sha256) ||
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
    eligibility.schema_version !== 2 ||
    eligibility.scope !== "phase6_runtime_eligibility" ||
    eligibility.locked_prospective_outcomes_read !== false ||
    !validSha256(eligibility.source_readiness_sha256) ||
    eligibility.source_readiness_sha256 !== activation.source_readiness_sha256 ||
    !Array.isArray(eligibility.futurecast_horizons_hours) ||
    typeof eligibility.modes !== "object" ||
    eligibility.modes === null
  ) {
    return false;
  }
  const eligibleModes = eligibility.modes as Record<string, unknown>;
  const futurecastHorizons = eligibility.futurecast_horizons_hours;
  if (
    Object.keys(eligibleModes).length !== PROPAGATION_RUNTIME_MODES.length ||
    !PROPAGATION_RUNTIME_MODES.every((name) =>
      typeof eligibleModes[name] === "boolean") ||
    !futurecastHorizons.every((value) =>
      typeof value === "number" &&
      FUTURECAST_HORIZONS_HOURS.includes(value as FutureCastHorizonHours)) ||
    new Set(futurecastHorizons).size !== futurecastHorizons.length ||
    !futurecastHorizons.every((value, index) =>
      index === 0 || value > futurecastHorizons[index - 1]) ||
    eligibleModes.futurecast !== (futurecastHorizons.length > 0)
  ) {
    return false;
  }
  return eligibleModes[mode] === true;
}

export function runtimeFutureCastHorizonIsActivated(
  horizonHours: FutureCastHorizonHours,
  activation: RuntimeActivationDocument,
  eligibility: RuntimeEligibilityDocument,
): boolean {
  return (
    runtimeModeIsActivated("futurecast", activation, eligibility) &&
    Array.isArray(eligibility.futurecast_horizons_hours) &&
    eligibility.futurecast_horizons_hours.includes(horizonHours)
  );
}

export function propagationRuntimeModeIsActivated(
  mode: PropagationRuntimeMode,
): boolean {
  return runtimeModeIsActivated(mode, activationManifest, runtimeEligibility);
}

export function propagationFutureCastHorizonIsActivated(
  horizonHours: FutureCastHorizonHours,
): boolean {
  return runtimeFutureCastHorizonIsActivated(
    horizonHours,
    activationManifest,
    runtimeEligibility,
  );
}
