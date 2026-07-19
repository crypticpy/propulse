import type {
  PropagationCapabilitiesResponse,
  PropagationModelMode,
} from "./modelClient";
import {
  FUTURECAST_HORIZONS_HOURS,
  type FutureCastHorizonHours,
} from "./runtimeActivation";

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

export function resolveFutureCastHorizons(
  capabilities: PropagationCapabilitiesResponse | undefined,
  mode: PropagationModelMode,
): FutureCastHorizonHours[] {
  if (
    !capabilities ||
    mode === "off" ||
    !capabilities.service_execution_enabled ||
    !capabilities.model_loaded ||
    !capabilities.runtime_activation_valid
  ) {
    return [];
  }
  const futurecast = capabilities.modes.futurecast;
  if (mode === "internal") {
    return futurecast.internal_available ? [...FUTURECAST_HORIZONS_HOURS] : [];
  }
  if (!futurecast.released_eligible) {
    return [];
  }
  return FUTURECAST_HORIZONS_HOURS.filter((horizon) =>
    futurecast.released_horizons_hours?.includes(horizon),
  );
}
