import {
  isSolarEnvelope,
  isSolarErrorBody,
  type SolarCachedEnvelope,
  type SolarEnvelope,
  type SolarErrorBody,
  type SolarResource,
  type SolarSourceId,
} from "@/lib/solar/contracts";
import { getSolarSourcePolicy } from "@/lib/solar/sourcePolicies";
import {
  getSolarCachedEnvelope,
  recordSolarCacheFailure,
  setSolarCachedEnvelope,
} from "@/lib/utils/idbCache";
import { recordSolarTelemetry } from "@/lib/solar/telemetry";

const inflight = new Map<SolarSourceId, Promise<SolarResource<unknown>>>();

export class SolarClientError extends Error {
  constructor(
    message: string,
    readonly body: SolarErrorBody,
    readonly status?: number,
  ) {
    super(message);
    this.name = "SolarClientError";
  }
}

function fallbackError(
  sourceId: SolarSourceId,
  message: string,
): SolarErrorBody {
  return {
    error: {
      code: "NETWORK_ERROR",
      message,
      sourceId,
      retryable: true,
    },
  };
}

async function errorFromResponse(
  response: Response,
  sourceId: SolarSourceId,
): Promise<SolarErrorBody> {
  try {
    const value: unknown = await response.clone().json();
    if (isSolarErrorBody(value)) return value;
  } catch {
    // Use the stable fallback below.
  }
  return {
    error: {
      code: response.status === 429 ? "RATE_LIMITED" : "UPSTREAM_REJECTED",
      message: `Solar endpoint returned HTTP ${response.status}`,
      sourceId,
      retryable: response.status === 429 || response.status >= 500,
      upstreamStatus: response.status,
    },
  };
}

function cacheState<T>(
  cached: SolarCachedEnvelope<T>,
  outcome: SolarResource<T>["cacheOutcome"],
  now = Date.now(),
): SolarResource<T> {
  return {
    envelope: cached.envelope,
    state: now < cached.softExpiresAt ? "fresh" : "stale",
    cacheOutcome: outcome,
    observationAgeMs: Math.max(0, now - Date.parse(cached.envelope.observedAt)),
    ...(cached.lastAttemptError ? { lastError: cached.lastAttemptError } : {}),
  };
}

/** Read a usable last-good value without starting a provider request. */
export async function readSolarCachedResource<T>(
  sourceId: SolarSourceId,
): Promise<SolarResource<T> | null> {
  const cached = await getSolarCachedEnvelope<T>(sourceId);
  const now = Date.now();
  if (!cached || now >= cached.hardExpiresAt) return null;
  return cacheState(
    cached,
    now < cached.softExpiresAt ? "fresh-cache" : "stale-cache",
    now,
  );
}

async function fetchNetwork<T>(sourceId: SolarSourceId): Promise<SolarEnvelope<T>> {
  const policy = getSolarSourcePolicy(sourceId);
  let response: Response;
  try {
    response = await fetch(policy.endpoint, {
      headers: { Accept: "application/json" },
      cache: "no-cache",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network request failed";
    const body = fallbackError(sourceId, message);
    throw new SolarClientError(message, body);
  }
  if (!response.ok) {
    const body = await errorFromResponse(response, sourceId);
    throw new SolarClientError(body.error.message, body, response.status);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    const body: SolarErrorBody = {
      error: {
        code: "WRONG_CONTENT_TYPE",
        message: `Solar endpoint returned ${contentType || "an unknown media type"}`,
        sourceId,
        retryable: true,
      },
    };
    throw new SolarClientError(body.error.message, body, response.status);
  }
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    const body: SolarErrorBody = {
      error: {
        code: "SCHEMA_INVALID",
        message: "Solar endpoint returned invalid JSON",
        sourceId,
        retryable: true,
      },
    };
    throw new SolarClientError(body.error.message, body, response.status);
  }
  if (!isSolarEnvelope(value) || value.sourceId !== sourceId) {
    const body: SolarErrorBody = {
      error: {
        code: "CONTRACT_MISMATCH",
        message: "Solar endpoint response does not match the requested source contract",
        sourceId,
        retryable: true,
      },
    };
    throw new SolarClientError(body.error.message, body, response.status);
  }
  return value as SolarEnvelope<T>;
}

function usability<T>(envelope: SolarEnvelope<T>, now = Date.now()) {
  const policy = getSolarSourcePolicy(envelope.sourceId);
  const basis = Date.parse(
    policy.freshnessBasis === "fetchedAt"
      ? envelope.fetchedAt
      : envelope.observedAt,
  );
  const anchor = Number.isFinite(basis) ? basis : now;
  return {
    softExpiresAt: anchor + policy.softTtlMs,
    hardExpiresAt: anchor + policy.hardTtlMs,
  };
}

function hardExpiredError(sourceId: SolarSourceId): SolarClientError {
  const body: SolarErrorBody = {
    error: {
      code: "HARD_EXPIRED",
      message: "Provider data is older than its approved usability limit",
      sourceId,
      retryable: true,
    },
  };
  return new SolarClientError(body.error.message, body);
}

async function execute<T>(
  sourceId: SolarSourceId,
  force: boolean,
): Promise<SolarResource<T>> {
  const cached = await getSolarCachedEnvelope<T>(sourceId);
  const now = Date.now();
  if (!force && cached && now < cached.softExpiresAt) {
    return cacheState(cached, "fresh-cache", now);
  }

  try {
    const envelope = await fetchNetwork<T>(sourceId);
    const limits = usability(envelope);
    if (Date.now() >= limits.hardExpiresAt) throw hardExpiredError(sourceId);
    await setSolarCachedEnvelope(envelope);
    const stored = await getSolarCachedEnvelope<T>(sourceId);
    if (!stored) {
      return {
        envelope,
        state: Date.now() < limits.softExpiresAt ? "fresh" : "stale",
        cacheOutcome: cached ? "revalidated" : "network",
        observationAgeMs: Math.max(0, Date.now() - Date.parse(envelope.observedAt)),
      };
    }
    if (Date.now() >= stored.hardExpiresAt) {
      throw hardExpiredError(sourceId);
    }
    return cacheState(stored, cached ? "revalidated" : "network");
  } catch (error) {
    const body =
      error instanceof SolarClientError
        ? error.body
        : fallbackError(
            sourceId,
            error instanceof Error ? error.message : "Solar request failed",
          );
    await recordSolarCacheFailure(sourceId, body);
    if (cached && now < cached.hardExpiresAt) {
      return {
        ...cacheState({ ...cached, lastAttemptError: body }, "stale-on-error", now),
        state: "stale",
        lastError: body,
      };
    }
    if (error instanceof SolarClientError) throw error;
    throw new SolarClientError(body.error.message, body);
  }
}

export function fetchSolarResource<T>(
  sourceId: SolarSourceId,
  options: { force?: boolean } = {},
): Promise<SolarResource<T>> {
  const existing = inflight.get(sourceId);
  if (existing) return existing as Promise<SolarResource<T>>;
  const startedAt = performance.now();
  const request = execute<T>(sourceId, options.force ?? false)
    .then((resource) => {
      recordSolarTelemetry({
        event: "solar_client_cache",
        sourceId,
        outcome: resource.cacheOutcome,
        durationMs: Math.round(performance.now() - startedAt),
        observationAgeMs: resource.observationAgeMs,
      });
      return resource;
    })
    .catch((error) => {
      recordSolarTelemetry({
        event: "solar_client_cache",
        sourceId,
        outcome:
          error instanceof SolarClientError &&
          error.body.error.code === "HARD_EXPIRED"
            ? "hard-expired"
            : "miss",
        durationMs: Math.round(performance.now() - startedAt),
      });
      throw error;
    })
    .finally(() => {
      inflight.delete(sourceId);
    });
  inflight.set(sourceId, request as Promise<SolarResource<unknown>>);
  return request;
}
