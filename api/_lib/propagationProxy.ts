import { z } from "zod";
import { verifyAuth } from "./auth";
import { checkRateLimit, getClientIP } from "./rateLimit";

export type PropagationProxyRoute =
  | "path"
  | "surface"
  | "capabilities"
  | "models"
  | "health";

interface ServiceConfig {
  baseUrl: string;
  token: string;
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
}

export interface PropagationProxyDependencies {
  authenticate(request: Request): Promise<{ id: string } | Response>;
  fetcher(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  rateLimiter(
    endpoint: string,
    identifier: string,
    limit: number,
    windowSeconds: number,
  ): RateLimitResult;
  serviceConfig(): ServiceConfig | null;
  traceId(): string;
}

const GRID4_PATTERN = /^[A-R]{2}[0-9]{2}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const MAX_PATH_BODY_BYTES = 128 * 1024;
const MAX_SURFACE_BODY_BYTES = 4 * 1024 * 1024;
const MAX_PATH_RESPONSE_BYTES = 256 * 1024;
const MAX_SURFACE_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_METADATA_RESPONSE_BYTES = 512 * 1024;
export const MAX_SURFACE_CELLS = 4096;

const shortString = z.string().min(1).max(256);
const timestamp = z.string().datetime({ offset: true });
const finiteNumber = z.number().finite();
const nonnegativeNumber = finiteNumber.nonnegative();
const stringList = z.array(z.string().max(256)).max(64);

const stationEnvelopeSchema = z.object({
  featureContract: z.literal("station-chain-v1"),
  chainFingerprint: z.string().min(1).max(256),
  band: z.string().min(1).max(16),
  frequencyMHz: finiteNumber.positive(),
  mode: z.string().min(1).max(32),
  requestedPowerWatts: nonnegativeNumber,
  conductedPowerWatts: nonnegativeNumber,
  powerAtAntennaWatts: nonnegativeNumber,
  eirpWatts: nonnegativeNumber,
  erpWatts: nonnegativeNumber,
  totalPassiveLossDb: nonnegativeNumber,
  feedlineLossDb: nonnegativeNumber,
  inlineLossDb: nonnegativeNumber,
  amplifierGainDb: nonnegativeNumber,
  antennaGainTowardPathDbi: finiteNumber,
  targetBearingDeg: finiteNumber.nullable(),
  takeoffAngleDeg: finiteNumber.nullable(),
  receiverNoiseFloorDbm: finiteNumber.nullable(),
  receiverEvidence: z.string().max(64),
  receiverEvidenceIsRelative: z.boolean(),
  localSystemNoiseFloorDbm: finiteNumber.nullable(),
  modeBandwidthHz: finiteNumber.positive(),
  modeSnrThresholdDb: finiteNumber,
  supported: z.boolean(),
  warningCodes: stringList,
  assumptions: stringList,
}).strict();

const featureValuesSchema = z.record(
  z.string().min(1).max(128),
  finiteNumber.nullable(),
).superRefine((value, context) => {
  if (Object.keys(value).length > 128) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "too many feature values",
    });
  }
});

const pathFeaturesSchema = z.object({
  target_grid4: z.string().regex(GRID4_PATTERN),
  values: featureValuesSchema,
  station: stationEnvelopeSchema.optional(),
}).strict();

const researchSubjectBindingSchema = z.object({
  schema_version: z.literal("propagation-research-subject-v1"),
  expires_at: timestamp,
  hmac_sha256: z.string().regex(SHA256_PATTERN),
}).strict();

const dataFreshnessSchema = z.record(
  z.string().min(1).max(128),
  z.number().int().nonnegative().max(366 * 24 * 60 * 60),
).superRefine((value, context) => {
  if (Object.keys(value).length > 32) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "too many freshness values",
    });
  }
});

const commonRequestFields = {
  origin_grid4: z.string().regex(GRID4_PATTERN),
  issue_time: timestamp,
  valid_time: timestamp,
  band: z.string().min(1).max(16),
  mode: z.string().min(1).max(32),
  declared_power_watts: finiteNumber.positive().max(1_000_000),
  station: stationEnvelopeSchema.optional(),
  data_freshness_seconds: dataFreshnessSchema.optional(),
  research_subject_binding: researchSubjectBindingSchema.optional(),
};

function validTimeIsNotBeforeIssueTime(
  value: { issue_time: string; valid_time: string },
  context: z.RefinementCtx,
) {
  if (Date.parse(value.valid_time) < Date.parse(value.issue_time)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["valid_time"],
      message: "valid_time must not precede issue_time",
    });
  }
}

const pathRequestSchema = z.object({
  ...commonRequestFields,
  features: pathFeaturesSchema,
}).strict().superRefine(validTimeIsNotBeforeIssueTime);

const surfaceRequestSchema = z.object({
  ...commonRequestFields,
  cells: z.array(pathFeaturesSchema).min(1).max(MAX_SURFACE_CELLS),
}).strict().superRefine(validTimeIsNotBeforeIssueTime);

const signedResearchReceiptSchema = z.object({
  signed_payload: z.string().min(1).max(16 * 1024),
  hmac_sha256: z.string().regex(SHA256_PATTERN),
}).strict();

const predictionSchema = z.object({
  model_version: shortString,
  feature_contract: shortString,
  issue_time: timestamp,
  valid_time: timestamp,
  band: z.string().min(1).max(16),
  mode: z.string().min(1).max(32),
  target_grid4: z.string().regex(GRID4_PATTERN),
  core_probability: finiteNumber.min(0).max(1),
  personalized_probability: finiteNumber.min(0).max(1),
  confidence: finiteNumber.min(0).max(1),
  ood_flags: stringList,
  data_freshness: dataFreshnessSchema,
  top_factors: stringList,
  assumptions: stringList,
  profile: z.string().min(1).max(64),
  research_receipt: signedResearchReceiptSchema.optional(),
}).strict();

const surfaceResponseSchema = z.object({
  origin_grid4: z.string().regex(GRID4_PATTERN),
  issue_time: timestamp,
  valid_time: timestamp,
  band: z.string().min(1).max(16),
  mode: z.string().min(1).max(32),
  cells: z.array(predictionSchema).min(1).max(MAX_SURFACE_CELLS),
}).strict();

const capabilityStatusSchema = z.object({
  internal_available: z.boolean(),
  released_eligible: z.boolean(),
}).strict();

const capabilitiesSchema = z.object({
  schema_version: z.literal("propagation-capabilities-v1"),
  inference_mode: z.enum(["disabled", "shadow", "active"]),
  service_execution_enabled: z.boolean(),
  model_loaded: z.boolean(),
  loaded_profiles: z.array(z.string().max(64)).max(16),
  runtime_activation_valid: z.boolean(),
  runtime_activation_errors: stringList,
  beta_collection_enabled: z.boolean(),
  modes: z.object({
    system_health_view: capabilityStatusSchema,
    beta_collection: capabilityStatusSchema,
    core_nowcast: capabilityStatusSchema,
    stationcast_deterministic: capabilityStatusSchema,
    stationcast_learned: capabilityStatusSchema,
    futurecast: capabilityStatusSchema.extend({
      released_horizons_hours: z.array(z.union([
        z.literal(3),
        z.literal(6),
        z.literal(12),
        z.literal(24),
      ])).max(4),
    }).strict(),
    six_meter: capabilityStatusSchema,
  }).strict(),
}).strict().superRefine((value, context) => {
  const horizons = value.modes.futurecast.released_horizons_hours;
  const sorted = horizons.every((item, index) => index === 0 || item > horizons[index - 1]);
  if (new Set(horizons).size !== horizons.length || !sorted) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["modes", "futurecast", "released_horizons_hours"],
      message: "FutureCast horizons must be unique and sorted",
    });
  }
  if (value.modes.futurecast.released_eligible !== (horizons.length > 0)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["modes", "futurecast", "released_eligible"],
      message: "FutureCast eligibility must match released horizons",
    });
  }
});

const modelSchema = z.object({
  model_version: shortString,
  release_stage: shortString,
  feature_contract: shortString,
  core_feature_contract: shortString,
  profiles: z.array(z.string().max(64)).max(16),
  profile_kinds: z.record(z.string().max(64), z.enum(["single", "weighted_ensemble"])),
  runtime_policy: z.object({
    path_history_stale_after_seconds: z.number().int().nonnegative(),
    xgboost_prediction_threads: z.number().int().min(1).max(64),
    xgboost_prediction_threads_source: z.enum(["manifest", "environment"]),
  }).strict(),
}).strict();

const modelsSchema = z.object({
  models: z.array(modelSchema).max(16),
}).strict();

const healthCommon = {
  checked_at: timestamp,
  inference_mode: z.enum(["disabled", "shadow", "active"]),
  activated_runtime_modes: z.array(z.string().max(64)).max(16),
  telemetry_schema_version: shortString,
  research_receipt_schema_version: shortString,
  research_receipts_enabled: z.boolean(),
  beta_collection_activated: z.boolean(),
  service_auth_enabled: z.boolean(),
  beta_stop_event_telemetry_configured: z.boolean(),
  path_history_provider: shortString,
  path_history_transform_version: shortString,
  operational_weather_provider: shortString,
};

const healthSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    model_version: shortString,
    release_stage: shortString,
    profiles: z.array(z.string().max(64)).max(16),
    core_feature_contract: shortString,
    xgboost_prediction_threads: z.number().int().min(1).max(64),
    xgboost_prediction_threads_source: z.enum(["manifest", "environment"]),
    ...healthCommon,
  }).strict(),
  z.object({
    status: z.literal("unavailable"),
    reason: z.string().min(1).max(256),
    ...healthCommon,
  }).strict(),
]);

const upstreamErrorSchema = z.object({
  detail: z.string().min(1).max(256),
}).strict();

const ROUTE_POLICY: Record<PropagationProxyRoute, {
  method: "GET" | "POST";
  requestBytes: number;
  responseBytes: number;
  timeoutMs: number;
  userLimit: number;
  ipLimit: number;
}> = {
  path: {
    method: "POST",
    requestBytes: MAX_PATH_BODY_BYTES,
    responseBytes: MAX_PATH_RESPONSE_BYTES,
    timeoutMs: 8_000,
    userLimit: 120,
    ipLimit: 240,
  },
  surface: {
    method: "POST",
    requestBytes: MAX_SURFACE_BODY_BYTES,
    responseBytes: MAX_SURFACE_RESPONSE_BYTES,
    timeoutMs: 20_000,
    userLimit: 10,
    ipLimit: 30,
  },
  capabilities: {
    method: "GET",
    requestBytes: 0,
    responseBytes: MAX_METADATA_RESPONSE_BYTES,
    timeoutMs: 5_000,
    userLimit: 120,
    ipLimit: 240,
  },
  models: {
    method: "GET",
    requestBytes: 0,
    responseBytes: MAX_METADATA_RESPONSE_BYTES,
    timeoutMs: 5_000,
    userLimit: 120,
    ipLimit: 240,
  },
  health: {
    method: "GET",
    requestBytes: 0,
    responseBytes: MAX_METADATA_RESPONSE_BYTES,
    timeoutMs: 5_000,
    userLimit: 120,
    ipLimit: 240,
  },
};

function jsonResponse(body: unknown, status: number, traceId?: string): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (traceId) headers["X-Propulse-Trace-Id"] = traceId;
  return new Response(JSON.stringify(body), { status, headers });
}

function methodNotAllowed(method: string): Response {
  return new Response(null, {
    status: 405,
    headers: {
      Allow: method,
      "Cache-Control": "no-store",
    },
  });
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function configuredService(): ServiceConfig | null {
  const rawUrl = process.env.PROPULSE_INFERENCE_URL?.trim();
  const token = process.env.PROPULSE_SERVICE_TOKEN?.trim();
  if (!rawUrl || !token || token.length < 32) return null;
  try {
    const url = new URL(rawUrl);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.pathname !== "/" && url.pathname !== "") ||
      url.search ||
      url.hash
    ) return null;
    return { baseUrl: url.origin, token };
  } catch {
    return null;
  }
}

const DEFAULT_DEPENDENCIES: PropagationProxyDependencies = {
  async authenticate(request) {
    const productionRuntime =
      process.env.NODE_ENV === "production" ||
      Boolean(process.env.VERCEL_ENV);
    if (
      productionRuntime &&
      (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY)
    ) {
      return jsonResponse({ error: "Authentication service unavailable" }, 503);
    }
    const result = await verifyAuth(request);
    return result instanceof Response ? result : { id: result.user.id };
  },
  fetcher: fetch,
  rateLimiter: checkRateLimit,
  serviceConfig: configuredService,
  traceId: () => crypto.randomUUID(),
};

async function readBoundedText(
  body: ReadableStream<Uint8Array> | null,
  declaredLength: string | null,
  maxBytes: number,
): Promise<string> {
  if (declaredLength) {
    if (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maxBytes) {
      throw new RangeError("body exceeds byte limit");
    }
  }
  if (!body) return "";
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new RangeError("body exceeds byte limit");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function parseRequest(route: PropagationProxyRoute, value: unknown): unknown {
  if (route === "path") return pathRequestSchema.parse(value);
  if (route === "surface") return surfaceRequestSchema.parse(value);
  return undefined;
}

function responseMatchesRequest(
  route: PropagationProxyRoute,
  response: unknown,
  requestPayload: unknown,
): boolean {
  if (route === "path") {
    const parsedResponse = predictionSchema.parse(response);
    const parsedRequest = pathRequestSchema.parse(requestPayload);
    return (
      Date.parse(parsedResponse.issue_time) === Date.parse(parsedRequest.issue_time) &&
      Date.parse(parsedResponse.valid_time) === Date.parse(parsedRequest.valid_time) &&
      parsedResponse.band === parsedRequest.band &&
      parsedResponse.mode === parsedRequest.mode &&
      parsedResponse.target_grid4 === parsedRequest.features.target_grid4
    );
  }
  if (route === "surface") {
    const parsedResponse = surfaceResponseSchema.parse(response);
    const parsedRequest = surfaceRequestSchema.parse(requestPayload);
    return (
      parsedResponse.origin_grid4 === parsedRequest.origin_grid4 &&
      Date.parse(parsedResponse.issue_time) === Date.parse(parsedRequest.issue_time) &&
      Date.parse(parsedResponse.valid_time) === Date.parse(parsedRequest.valid_time) &&
      parsedResponse.band === parsedRequest.band &&
      parsedResponse.mode === parsedRequest.mode &&
      parsedResponse.cells.length === parsedRequest.cells.length &&
      parsedResponse.cells.every(
        (cell, index) => cell.target_grid4 === parsedRequest.cells[index].target_grid4,
      )
    );
  }
  if (route === "capabilities") {
    capabilitiesSchema.parse(response);
    return true;
  }
  if (route === "models") {
    modelsSchema.parse(response);
    return true;
  }
  healthSchema.parse(response);
  return true;
}

function throttled(
  dependencies: PropagationProxyDependencies,
  request: Request,
  route: PropagationProxyRoute,
  userId: string,
): RateLimitResult | null {
  const policy = ROUTE_POLICY[route];
  const userResult = dependencies.rateLimiter(
    `propagation/${route}/user`,
    userId,
    policy.userLimit,
    60,
  );
  if (!userResult.success) return userResult;
  const ipResult = dependencies.rateLimiter(
    `propagation/${route}/ip`,
    getClientIP(request),
    policy.ipLimit,
    60,
  );
  return ipResult.success ? null : ipResult;
}

function timeoutFailure(error: unknown): boolean {
  return (
    error instanceof DOMException && error.name === "TimeoutError"
  ) || (
    error instanceof Error && error.name === "TimeoutError"
  );
}

export async function handlePropagationProxy(
  request: Request,
  route: PropagationProxyRoute,
  overrides: Partial<PropagationProxyDependencies> = {},
): Promise<Response> {
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  const policy = ROUTE_POLICY[route];
  if (!sameOrigin(request)) {
    return jsonResponse({ error: "Cross-origin request rejected" }, 403);
  }
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }
  if (request.method !== policy.method) return methodNotAllowed(policy.method);

  const auth = await dependencies.authenticate(request);
  if (auth instanceof Response) {
    auth.headers.set("Cache-Control", "no-store");
    auth.headers.set("X-Content-Type-Options", "nosniff");
    return auth;
  }
  const rateLimit = throttled(dependencies, request, route, auth.id);
  if (rateLimit) {
    const response = jsonResponse({ error: "Too many requests" }, 429);
    response.headers.set("Retry-After", String(rateLimit.reset));
    return response;
  }

  const config = dependencies.serviceConfig();
  if (!config) {
    return jsonResponse({ error: "Propagation service unavailable" }, 503);
  }

  let requestPayload: unknown;
  let requestBody: string | undefined;
  if (policy.method === "POST") {
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      return jsonResponse({ error: "Content-Type must be application/json" }, 415);
    }
    try {
      requestBody = await readBoundedText(
        request.body,
        request.headers.get("content-length"),
        policy.requestBytes,
      );
      requestPayload = parseRequest(route, JSON.parse(requestBody));
      requestBody = JSON.stringify(requestPayload);
    } catch (error) {
      if (error instanceof RangeError) {
        return jsonResponse({ error: "Payload too large" }, 413);
      }
      return jsonResponse({ error: "Invalid propagation request" }, 400);
    }
  }

  const traceId = dependencies.traceId();
  let upstream: Response;
  try {
    upstream = await dependencies.fetcher(
      `${config.baseUrl}/v1/propagation/${route}`,
      {
        method: policy.method,
        headers: {
          Authorization: `Bearer ${config.token}`,
          ...(policy.method === "POST" ? { "Content-Type": "application/json" } : {}),
          "X-Propulse-Trace-Id": traceId,
        },
        body: requestBody,
        redirect: "error",
        signal: AbortSignal.timeout(policy.timeoutMs),
      },
    );
  } catch (error) {
    return jsonResponse(
      { error: timeoutFailure(error) ? "Propagation request timed out" : "Propagation service unavailable" },
      timeoutFailure(error) ? 504 : 502,
      traceId,
    );
  }

  let responseText: string;
  try {
    responseText = await readBoundedText(
      upstream.body,
      upstream.headers.get("content-length"),
      policy.responseBytes,
    );
  } catch {
    return jsonResponse({ error: "Invalid propagation service response" }, 502, traceId);
  }

  let responseValue: unknown;
  try {
    responseValue = JSON.parse(responseText);
  } catch {
    return jsonResponse({ error: "Invalid propagation service response" }, 502, traceId);
  }

  if (!upstream.ok) {
    const upstreamError = upstreamErrorSchema.safeParse(responseValue);
    if (upstream.status === 400 || upstream.status === 422) {
      return jsonResponse({ error: "Invalid propagation request" }, 400, traceId);
    }
    if (upstream.status === 503) {
      return jsonResponse(
        { error: upstreamError.success ? upstreamError.data.detail : "Propagation service unavailable" },
        503,
        traceId,
      );
    }
    return jsonResponse({ error: "Propagation service unavailable" }, 502, traceId);
  }

  try {
    if (!responseMatchesRequest(route, responseValue, requestPayload)) {
      throw new Error("response/request contract mismatch");
    }
  } catch {
    return jsonResponse({ error: "Invalid propagation service response" }, 502, traceId);
  }
  return jsonResponse(responseValue, 200, traceId);
}
