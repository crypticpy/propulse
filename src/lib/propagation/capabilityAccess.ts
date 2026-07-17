import type {
  PropagationCapabilitiesResponse,
  PropagationModelMode,
} from "./modelClient";

export interface NowCastCapabilityAccess {
  coreNowCast: boolean;
  stationCast: boolean;
}

export function resolveNowCastCapabilityAccess(
  capabilities: PropagationCapabilitiesResponse | undefined,
  mode: PropagationModelMode,
): NowCastCapabilityAccess {
  if (
    !capabilities ||
    mode === "off" ||
    !capabilities.service_execution_enabled ||
    !capabilities.model_loaded ||
    !capabilities.runtime_activation_valid
  ) {
    return { coreNowCast: false, stationCast: false };
  }
  const field = mode === "internal" ? "internal_available" : "released_eligible";
  const coreNowCast = capabilities.modes.core_nowcast[field];
  return {
    coreNowCast,
    stationCast:
      coreNowCast && capabilities.modes.stationcast_deterministic[field],
  };
}
