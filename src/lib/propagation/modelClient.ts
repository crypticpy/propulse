import type { StationFeatureEnvelope } from "@/lib/station/stationChainEngine";
import { propagationRuntimeModeIsActivated } from "./runtimeActivation";

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

export interface PropagationModelClient {
  path: (request: PathPredictionRequest, signal?: AbortSignal) => Promise<PropagationPrediction>;
  surface: (
    request: SurfacePredictionRequest,
    signal?: AbortSignal,
  ) => Promise<SurfacePredictionResponse>;
  health: (signal?: AbortSignal) => Promise<Record<string, unknown>>;
}

export type PropagationModelMode = "off" | "shadow" | "active";

export function resolvePropagationModelMode(
  configuredMode: string | undefined,
  legacyEnabled: string | undefined,
  baseUrl: string,
): PropagationModelMode {
  if (!baseUrl.trim()) return "off";
  const normalized = configuredMode?.trim().toLowerCase();
  if (normalized === "off" || normalized === "shadow" || normalized === "active") {
    return normalized;
  }
  return legacyEnabled === "true" ? "active" : "off";
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
  propagationModelMode === "active" &&
  propagationRuntimeModeIsActivated("core_nowcast");

export const propagationCoreNowCastVisible = propagationModelVisible;

export const propagationStationCastVisible =
  propagationModelMode === "active" &&
  propagationRuntimeModeIsActivated("stationcast_deterministic");

export const propagationStationCastRequested =
  propagationModelMode === "shadow" || propagationStationCastVisible;

export const propagationModelShadow = propagationModelMode === "shadow";

export const propagationModelClient = propagationModelEnabled
  ? createPropagationModelClient(propagationModelUrl)
  : null;
