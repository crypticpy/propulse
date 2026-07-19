import { applyRateLimit } from "./rateLimit";
import { isErrorNamed } from "./runtimeError";
import {
  SOLAR_SCHEMA_VERSION,
  type SolarEnvelope,
  type SolarErrorBody,
  type SolarErrorCode,
  type SolarSourceId,
} from "../../src/lib/solar/contracts";
import type { AdaptedProduct } from "../../src/lib/solar/adapters";
import { SolarValidationError } from "../../src/lib/solar/normalization";
import {
  getSolarEdgeCacheTtlMs,
  getSolarSourcePolicy,
  type SolarSourcePolicy,
} from "../../src/lib/solar/sourcePolicies";

const USER_AGENT = "Propulse/2.0 (Solar Weather; contact via propulse.app)";

export class SolarUpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "SolarUpstreamError";
  }
}

export class SolarPayloadError extends Error {
  constructor(
    message: string,
    readonly code: "WRONG_CONTENT_TYPE" | "PAYLOAD_TOO_LARGE",
  ) {
    super(message);
    this.name = "SolarPayloadError";
  }
}

interface SolarHandlerOptions<T> {
  sourceId: SolarSourceId;
  load: (signal: AbortSignal, policy: SolarSourcePolicy) => Promise<unknown>;
  adapt: (input: unknown, policy: SolarSourcePolicy) => AdaptedProduct<T>;
}

export interface FetchUpstreamOptions {
  signal: AbortSignal;
  maxBytes: number;
  accept: "json" | "text" | "image";
}

function allowedOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  try {
    const requestUrl = new URL(request.url);
    const originUrl = new URL(origin);
    const configured = (process.env.ALLOWED_ORIGINS ?? process.env.ALLOWED_ORIGIN ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const sameHost = originUrl.host === requestUrl.host;
    const approvedPreview =
      originUrl.protocol === "https:" && originUrl.hostname.endsWith(".vercel.app");
    return sameHost || approvedPreview || configured.includes(origin) ? origin : null;
  } catch {
    return null;
  }
}

function corsHeaders(request: Request): HeadersInit {
  const origin = allowedOrigin(request);
  return origin
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Accept, Content-Type",
        Vary: "Origin",
      }
    : {};
}

function jsonResponse(
  request: Request,
  body: unknown,
  status: number,
  cacheControl: string,
  extra: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cacheControl,
      ...corsHeaders(request),
      ...extra,
    },
  });
}

function errorBody(
  code: SolarErrorCode,
  message: string,
  sourceId: SolarSourceId,
  retryable: boolean,
  upstreamStatus?: number,
): SolarErrorBody {
  return {
    error: { code, message, sourceId, retryable, upstreamStatus },
  };
}

function classifyFailure(error: unknown): {
  code: SolarErrorCode;
  status: number;
  message: string;
  retryable: boolean;
  upstreamStatus?: number;
} {
  if (error instanceof SolarPayloadError) {
    return { code: error.code, status: 502, message: error.message, retryable: true };
  }
  if (error instanceof SolarValidationError) {
    const empty = error.reason === "empty";
    return {
      code: empty ? "EMPTY_REQUIRED_DATA" : "SCHEMA_INVALID",
      status: 502,
      message: error.message,
      retryable: true,
    };
  }
  if (error instanceof SolarUpstreamError) {
    return {
      code: error.status === 429 ? "RATE_LIMITED" : "UPSTREAM_REJECTED",
      status: error.status === 429 ? 429 : 502,
      message: error.message,
      retryable: error.status === 429 || error.status >= 500,
      upstreamStatus: error.status,
    };
  }
  if (isErrorNamed(error, "AbortError", "TimeoutError")) {
    return {
      code: "TIMEOUT",
      status: 504,
      message: "The upstream solar product did not respond before its deadline",
      retryable: true,
    };
  }
  if (error instanceof TypeError) {
    return {
      code: "NETWORK_ERROR",
      status: 503,
      message: "The upstream solar product could not be reached",
      retryable: true,
    };
  }
  return {
    code: "INTERNAL_ERROR",
    status: 500,
    message: error instanceof Error ? error.message : "Unexpected solar endpoint failure",
    retryable: false,
  };
}

export async function fetchSolarUpstream(
  url: string,
  options: FetchUpstreamOptions,
): Promise<unknown> {
  const startedAt = Date.now();
  const parsedUrl = new URL(url);
  const safeProductPath = `${parsedUrl.hostname}${parsedUrl.pathname}`;
  const response = await fetch(url, {
    signal: options.signal,
    headers: {
      Accept:
        options.accept === "json"
          ? "application/json"
          : options.accept === "image"
            ? "image/*"
            : "text/plain",
      "User-Agent": USER_AGENT,
    },
  });
  if (!response.ok) {
    console.warn(JSON.stringify({
      event: "solar_upstream_response",
      productPath: safeProductPath,
      outcome: "http-error",
      status: response.status,
      durationMs: Date.now() - startedAt,
    }));
    throw new SolarUpstreamError(
      `Upstream provider returned HTTP ${response.status}`,
      response.status,
    );
  }

  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > options.maxBytes) {
    throw new SolarPayloadError(
      `Upstream payload exceeds the ${options.maxBytes}-byte budget`,
      "PAYLOAD_TOO_LARGE",
    );
  }
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  const expected =
    options.accept === "json"
      ? contentType.includes("json")
      : options.accept === "image"
        ? contentType.startsWith("image/")
        : contentType.includes("text") || contentType.includes("octet-stream");
  if (!expected) {
    console.warn(JSON.stringify({
      event: "solar_upstream_response",
      productPath: safeProductPath,
      outcome: "wrong-content-type",
      status: response.status,
      contentType: contentType || "unknown",
      durationMs: Date.now() - startedAt,
    }));
    throw new SolarPayloadError(
      `Upstream returned ${contentType || "an unknown media type"}`,
      "WRONG_CONTENT_TYPE",
    );
  }

  if (options.accept === "image") {
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > options.maxBytes) {
      throw new SolarPayloadError(
        `Upstream image exceeds the ${options.maxBytes}-byte budget`,
        "PAYLOAD_TOO_LARGE",
      );
    }
    console.info(JSON.stringify({
      event: "solar_upstream_response",
      productPath: safeProductPath,
      outcome: "success",
      status: response.status,
      contentType,
      bytes: bytes.byteLength,
      durationMs: Date.now() - startedAt,
    }));
    return { bytes, response };
  }

  const text = await response.text();
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > options.maxBytes) {
    throw new SolarPayloadError(
      `Upstream payload exceeds the ${options.maxBytes}-byte budget`,
      "PAYLOAD_TOO_LARGE",
    );
  }
  console.info(JSON.stringify({
    event: "solar_upstream_response",
    productPath: safeProductPath,
    outcome: "success",
    status: response.status,
    contentType,
    bytes,
    durationMs: Date.now() - startedAt,
  }));
  if (options.accept === "text") return text;
  try {
    return JSON.parse(text);
  } catch {
    throw new SolarValidationError("Upstream response is not valid JSON");
  }
}

export function createSolarHandler<T>(
  options: SolarHandlerOptions<T>,
): (request: Request) => Promise<Response> {
  const policy = getSolarSourcePolicy(options.sourceId);

  return async (request: Request): Promise<Response> => {
    const startedAt = Date.now();
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }
    if (request.method !== "GET") {
      return jsonResponse(
        request,
        errorBody(
          "METHOD_NOT_ALLOWED",
          "Only GET and OPTIONS are supported",
          options.sourceId,
          false,
        ),
        405,
        "no-store",
        { Allow: "GET, OPTIONS" },
      );
    }

    const limited = applyRateLimit(request, `solar/${options.sourceId}`, 60, 60);
    if (limited) return limited;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), policy.requestDeadlineMs);
    try {
      const raw = await options.load(controller.signal, policy);
      const adapted = options.adapt(raw, policy);
      const fetchedAt = new Date().toISOString();
      const envelope: SolarEnvelope<T> = {
        schemaVersion: SOLAR_SCHEMA_VERSION,
        sourceId: options.sourceId,
        provider: policy.provider,
        product: policy.product,
        data: adapted.data,
        observedAt: adapted.observedAt,
        fetchedAt,
        sourceUrl: adapted.sourceUrl ?? policy.sourceUrl,
        ...(adapted.warnings?.length ? { warnings: adapted.warnings } : {}),
      };
      const serialized = JSON.stringify(envelope);
      const responseBytes = new TextEncoder().encode(serialized).byteLength;
      if (responseBytes > policy.maxBytes) {
        throw new SolarPayloadError(
          `Normalized response exceeds the ${policy.maxBytes}-byte budget`,
          "PAYLOAD_TOO_LARGE",
        );
      }
      const cacheTtlMs = getSolarEdgeCacheTtlMs(policy);
      const cacheSeconds = Math.max(1, Math.floor(cacheTtlMs / 1_000));
      const staleSeconds = Math.max(
        1,
        Math.floor((policy.hardTtlMs - cacheTtlMs) / 1_000),
      );
      console.info(
        JSON.stringify({
          event: "solar_provider_fetch",
          sourceId: options.sourceId,
          outcome: "success",
          durationMs: Date.now() - startedAt,
          responseBytes,
          observationAgeMs: Math.max(0, Date.now() - Date.parse(adapted.observedAt)),
          validation: "valid",
        }),
      );
      return new Response(serialized, {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${staleSeconds}, stale-if-error=${staleSeconds}`,
          "X-Solar-Schema": String(SOLAR_SCHEMA_VERSION),
          "X-Solar-Source": options.sourceId,
          ...corsHeaders(request),
        },
      });
    } catch (error) {
      const failure = classifyFailure(error);
      console.warn(
        JSON.stringify({
          event: "solar_provider_fetch",
          sourceId: options.sourceId,
          outcome: failure.code,
          durationMs: Date.now() - startedAt,
          upstreamStatus: failure.upstreamStatus,
          validation: failure.code === "SCHEMA_INVALID" ? "invalid" : "not-run",
        }),
      );
      return jsonResponse(
        request,
        errorBody(
          failure.code,
          failure.message,
          options.sourceId,
          failure.retryable,
          failure.upstreamStatus,
        ),
        failure.status,
        "no-store, max-age=0",
      );
    } finally {
      clearTimeout(timeout);
    }
  };
}
