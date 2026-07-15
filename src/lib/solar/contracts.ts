/** Versioned contracts shared by the solar edge, cache, model, and widgets. */

export const SOLAR_SCHEMA_VERSION = 1 as const;

export type SolarSourceId =
  | "noaa-k-index"
  | "noaa-solar-flux"
  | "noaa-magnetometer"
  | "noaa-probabilities"
  | "noaa-sunspots"
  | "noaa-xray"
  | "noaa-protons"
  | "noaa-dst"
  | "noaa-drap"
  | "noaa-flux-forecast"
  | "nasa-cme"
  | "swpc-scales"
  | "swpc-alerts"
  | "swpc-xray-latest"
  | "swpc-solar-wind-mag"
  | "swpc-solar-wind-plasma";

export type SolarWidgetState =
  | "loading"
  | "fresh"
  | "refreshing"
  | "stale"
  | "partial"
  | "empty"
  | "unavailable"
  | "error";

export type SolarCacheOutcome =
  | "network"
  | "fresh-cache"
  | "stale-cache"
  | "revalidated"
  | "stale-on-error"
  | "hard-expired"
  | "miss";

export interface SolarEnvelope<T> {
  schemaVersion: typeof SOLAR_SCHEMA_VERSION;
  sourceId: SolarSourceId;
  provider: string;
  product: string;
  data: T;
  observedAt: string;
  fetchedAt: string;
  sourceUrl: string;
  warnings?: string[];
}

export interface SolarCachedEnvelope<T = unknown> {
  envelope: SolarEnvelope<T>;
  storedAt: number;
  softExpiresAt: number;
  hardExpiresAt: number;
  lastAttemptAt: number;
  lastAttemptError: SolarErrorBody | null;
  approximateBytes: number;
}

export interface SolarResource<T> {
  envelope: SolarEnvelope<T>;
  state: "fresh" | "stale";
  cacheOutcome: SolarCacheOutcome;
  observationAgeMs: number;
  lastError?: SolarErrorBody;
}

export type SolarErrorCode =
  | "METHOD_NOT_ALLOWED"
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "UPSTREAM_REJECTED"
  | "WRONG_CONTENT_TYPE"
  | "PAYLOAD_TOO_LARGE"
  | "SCHEMA_INVALID"
  | "EMPTY_REQUIRED_DATA"
  | "HARD_EXPIRED"
  | "CONTRACT_MISMATCH"
  | "NETWORK_ERROR"
  | "INTERNAL_ERROR";

export interface SolarErrorBody {
  error: {
    code: SolarErrorCode;
    message: string;
    sourceId?: SolarSourceId;
    retryable: boolean;
    upstreamStatus?: number;
  };
}

export function isSolarEnvelope(value: unknown): value is SolarEnvelope<unknown> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SolarEnvelope<unknown>>;
  return (
    candidate.schemaVersion === SOLAR_SCHEMA_VERSION &&
    typeof candidate.sourceId === "string" &&
    typeof candidate.provider === "string" &&
    typeof candidate.product === "string" &&
    typeof candidate.observedAt === "string" &&
    Number.isFinite(Date.parse(candidate.observedAt)) &&
    typeof candidate.fetchedAt === "string" &&
    Number.isFinite(Date.parse(candidate.fetchedAt)) &&
    typeof candidate.sourceUrl === "string" &&
    (candidate.warnings === undefined ||
      (Array.isArray(candidate.warnings) &&
        candidate.warnings.every((warning) => typeof warning === "string"))) &&
    "data" in candidate
  );
}

export function isSolarErrorBody(value: unknown): value is SolarErrorBody {
  if (!value || typeof value !== "object") return false;
  const error = (value as { error?: unknown }).error;
  return Boolean(
    error &&
      typeof error === "object" &&
      typeof (error as { code?: unknown }).code === "string" &&
      typeof (error as { message?: unknown }).message === "string",
  );
}
