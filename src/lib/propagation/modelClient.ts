import type { StationFeatureEnvelope } from "@/lib/station/stationChainEngine";
import {
  FUTURECAST_HORIZONS_HOURS,
  PROPAGATION_RUNTIME_MODES,
  propagationRuntimeModeIsActivated,
} from "./runtimeActivation";

export type CoreFeatureValues = Record<string, number | null>;

export interface PredictionCell {
  target_grid4: string;
  values: CoreFeatureValues;
  station?: StationFeatureEnvelope;
}

export interface PathPredictionRequest {
  origin_grid4: string;
  issue_time: string;
  valid_time: string;
  band: string;
  mode: string;
  declared_power_watts: number;
  features: PredictionCell;
  station?: StationFeatureEnvelope;
  data_freshness_seconds?: Record<string, number>;
  research_subject_binding?: ResearchSubjectBinding;
}

export interface ResearchSubjectBinding {
  schema_version: "propagation-research-subject-v1";
  expires_at: string;
  hmac_sha256: string;
}

export interface SignedResearchReceipt {
  signed_payload: string;
  hmac_sha256: string;
}

export interface SurfacePredictionRequest
  extends Omit<PathPredictionRequest, "features"> {
  cells: PredictionCell[];
}

export interface PropagationPrediction {
  model_version: string;
  feature_contract: string;
  issue_time: string;
  valid_time: string;
  band: string;
  mode: string;
  target_grid4: string;
  core_probability: number;
  personalized_probability: number;
  confidence: number;
  ood_flags: string[];
  data_freshness: Record<string, number>;
  top_factors: string[];
  assumptions: string[];
  profile: "physics" | "nowcast" | string;
  /** Present only for active, server-authorized beta outcome collection. */
  research_receipt?: SignedResearchReceipt;
}

export interface SurfacePredictionResponse {
  origin_grid4: string;
  issue_time: string;
  valid_time: string;
  band: string;
  mode: string;
  cells: PropagationPrediction[];
}

export interface PropagationCapabilityStatus {
  internal_available: boolean;
  released_eligible: boolean;
  released_horizons_hours?: number[];
}

export interface PropagationCapabilitiesResponse {
  schema_version: "propagation-capabilities-v1";
  inference_mode: "disabled" | "shadow" | "active";
  service_execution_enabled: boolean;
  model_loaded: boolean;
  loaded_profiles: string[];
  runtime_activation_valid: boolean;
  runtime_activation_errors: string[];
  beta_collection_enabled: boolean;
  modes: Record<
    typeof PROPAGATION_RUNTIME_MODES[number],
    PropagationCapabilityStatus
  >;
}

export interface PropagationModelClient {
  path: (request: PathPredictionRequest, signal?: AbortSignal) => Promise<PropagationPrediction>;
  surface: (
    request: SurfacePredictionRequest,
    signal?: AbortSignal,
  ) => Promise<SurfacePredictionResponse>;
  health: (signal?: AbortSignal) => Promise<Record<string, unknown>>;
  capabilities: (signal?: AbortSignal) => Promise<PropagationCapabilitiesResponse>;
}

export type PropagationModelMode = "off" | "internal" | "released";

export function resolvePropagationModelMode(
  configuredMode: string | undefined,
  legacyEnabled: string | undefined,
  baseUrl: string,
): PropagationModelMode {
  if (!baseUrl.trim()) return "off";
  const normalized = configuredMode?.trim().toLowerCase();
  if (normalized === "off" || normalized === "internal" || normalized === "released") {
    return normalized;
  }
  if (normalized === "shadow") return "internal";
  if (normalized === "active") return "released";
  // The retired boolean flag predates evidence gating, so keep it internal.
  return legacyEnabled === "true" ? "internal" : "off";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function propagationCapabilitiesAreValid(
  value: unknown,
): value is PropagationCapabilitiesResponse {
  if (!isRecord(value) || !isRecord(value.modes)) return false;
  const inferenceModes = ["disabled", "shadow", "active"];
  if (
    value.schema_version !== "propagation-capabilities-v1" ||
    !inferenceModes.includes(String(value.inference_mode)) ||
    typeof value.service_execution_enabled !== "boolean" ||
    typeof value.model_loaded !== "boolean" ||
    typeof value.runtime_activation_valid !== "boolean" ||
    typeof value.beta_collection_enabled !== "boolean" ||
    !Array.isArray(value.loaded_profiles) ||
    !value.loaded_profiles.every((item) => typeof item === "string") ||
    !Array.isArray(value.runtime_activation_errors) ||
    !value.runtime_activation_errors.every((item) => typeof item === "string") ||
    Object.keys(value.modes).length !== PROPAGATION_RUNTIME_MODES.length
  ) {
    return false;
  }
  for (const mode of PROPAGATION_RUNTIME_MODES) {
    const status = value.modes[mode];
    if (
      !isRecord(status) ||
      typeof status.internal_available !== "boolean" ||
      typeof status.released_eligible !== "boolean"
    ) {
      return false;
    }
    if (mode !== "futurecast") {
      if (
        Object.keys(status).length !== 2 ||
        "released_horizons_hours" in status
      ) return false;
      continue;
    }
    const horizons = status.released_horizons_hours;
    if (
      Object.keys(status).length !== 3 ||
      !Array.isArray(horizons) ||
      !horizons.every((item) =>
        typeof item === "number" &&
        FUTURECAST_HORIZONS_HOURS.includes(
          item as typeof FUTURECAST_HORIZONS_HOURS[number],
        )) ||
      new Set(horizons).size !== horizons.length ||
      !horizons.every((item, index) => index === 0 || item > horizons[index - 1]) ||
      status.released_eligible !== (horizons.length > 0)
    ) return false;
  }
  return true;
}

async function responseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = `Propagation API returned HTTP ${response.status}`;
    try {
      const body = await response.json() as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      // Preserve the status-based error when the body is not JSON.
    }
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

export function createPropagationModelClient(
  baseUrl: string,
  fetcher: typeof fetch = fetch,
): PropagationModelClient {
  const root = baseUrl.replace(/\/$/, "");
  const post = <T>(path: string, body: unknown, signal?: AbortSignal) =>
    fetcher(`${root}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    }).then(responseJson<T>);

  return {
    path: (request, signal) =>
      post<PropagationPrediction>("/v1/propagation/path", request, signal),
    surface: (request, signal) =>
      post<SurfacePredictionResponse>("/v1/propagation/surface", request, signal),
    health: (signal) =>
      fetcher(`${root}/v1/propagation/health`, { signal }).then(
        responseJson<Record<string, unknown>>,
      ),
    capabilities: async (signal) => {
      const response = await fetcher(`${root}/v1/propagation/capabilities`, {
        signal,
      });
      const value = await responseJson<unknown>(response);
      if (!propagationCapabilitiesAreValid(value)) {
        throw new Error("Propagation API returned an invalid capabilities contract");
      }
      return value;
    },
  };
}

export const propagationModelUrl =
  import.meta.env.VITE_PROPAGATION_MODEL_URL?.trim() ?? "";

export const propagationModelMode = resolvePropagationModelMode(
  import.meta.env.VITE_PROPAGATION_V4_MODE,
  import.meta.env.VITE_PROPAGATION_V4_ENABLED,
  propagationModelUrl,
);

export const propagationModelEnabled =
  propagationModelMode !== "off";

export const propagationModelVisible =
  propagationModelMode === "internal" ||
  (propagationModelMode === "released" &&
    propagationRuntimeModeIsActivated("core_nowcast"));

export const propagationCoreNowCastVisible = propagationModelVisible;

export const propagationStationCastVisible =
  propagationModelMode === "internal" ||
  (propagationModelMode === "released" &&
    propagationRuntimeModeIsActivated("stationcast_deterministic"));

export const propagationStationCastRequested =
  propagationModelMode === "internal" || propagationStationCastVisible;

// Retained until PropSphere's Phase C query lifecycle is capability-driven.
export const propagationModelShadow = propagationModelMode === "internal";

export const propagationModelClient = propagationModelEnabled
  ? createPropagationModelClient(propagationModelUrl)
  : null;
