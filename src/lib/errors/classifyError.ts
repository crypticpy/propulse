/**
 * Error Classification Engine
 *
 * Transforms raw errors into user-understandable messages with category,
 * source attribution, and retry guidance. Designed to shield users from
 * cryptic upstream API failures and network issues.
 */

import type { DataSourceId, DataSourceEntry } from "../dataSourceRegistry";
import {
  DATA_SOURCE_REGISTRY,
  findSourceByEndpoint,
} from "../dataSourceRegistry";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ErrorCategory =
  | "network"
  | "upstream"
  | "data-gap"
  | "rate-limited"
  | "timeout"
  | "parse-error"
  | "auth"
  | "unknown";

export type StalenessLevel = "fresh" | "stale" | "very-stale";

export interface ClassifiedError {
  /** High-level error category */
  category: ErrorCategory;
  /** Matched data source ID, if identifiable */
  sourceId: DataSourceId | null;
  /** Full data source entry from the registry */
  source: DataSourceEntry | null;
  /** Friendly message suitable for display in a panel or toast */
  userMessage: string;
  /** Brief 2-4 word summary for compact indicators (e.g. health bar) */
  shortMessage: string;
  /** True when the error originates from an external service, not Propulse */
  isUpstream: boolean;
  /** HTTP status code extracted from the error, if available */
  httpStatus: number | null;
  /** The original error value, preserved for logging */
  originalError: unknown;
  /** Epoch ms when the error was classified */
  timestamp: number;
  /** Recommended delay before retrying (ms), or null if no retry suggested */
  suggestedRetryMs: number | null;
}

export interface StalenessResult {
  level: StalenessLevel;
  ageMs: number;
  message: string;
}

// ---------------------------------------------------------------------------
// Suggested retry delays per category (ms)
// ---------------------------------------------------------------------------

const RETRY_MS: Record<ErrorCategory, number | null> = {
  network: 10_000,
  upstream: 60_000,
  "data-gap": 30_000,
  "rate-limited": 30_000,
  timeout: 15_000,
  "parse-error": 60_000,
  auth: 120_000,
  unknown: 30_000,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Safely extract the HTTP status code from an error-shaped value.
 * Checks `error.status` first, then `error.cause.status`.
 */
function extractHttpStatus(error: unknown): number | null {
  if (error != null && typeof error === "object") {
    const e = error as Record<string, unknown>;
    if (typeof e.status === "number") return e.status;
    if (
      e.cause != null &&
      typeof e.cause === "object" &&
      typeof (e.cause as Record<string, unknown>).status === "number"
    ) {
      return (e.cause as Record<string, unknown>).status as number;
    }
  }
  return null;
}

/**
 * Safely extract an endpoint string from the error object.
 */
function extractEndpoint(error: unknown): string | undefined {
  if (error != null && typeof error === "object") {
    const e = error as Record<string, unknown>;
    if (typeof e.endpoint === "string") return e.endpoint;
  }
  return undefined;
}

/**
 * Extract a human-readable message string from an error value.
 */
function extractMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return String(error);
}

/**
 * Test a message against a list of case-insensitive substrings.
 */
function messageContains(msg: string, needles: string[]): boolean {
  const lower = msg.toLowerCase();
  return needles.some((n) => lower.includes(n.toLowerCase()));
}

/**
 * Get the error name (e.g. "AbortError", "TypeError") if available.
 */
function getErrorName(error: unknown): string | undefined {
  if (error instanceof Error) return error.name;
  return undefined;
}

// ---------------------------------------------------------------------------
// Category detection
// ---------------------------------------------------------------------------

function detectCategory(
  error: unknown,
  message: string,
  httpStatus: number | null,
): ErrorCategory {
  const name = getErrorName(error);

  // 1. Network errors
  if (
    name === "TypeError" &&
    messageContains(message, ["fetch", "failed to fetch"])
  ) {
    return "network";
  }
  if (name === "NetworkError" || messageContains(message, ["networkerror"])) {
    return "network";
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return "network";
  }

  // 2. Abort / timeout
  if (
    name === "AbortError" ||
    messageContains(message, ["timeout", "aborted"])
  ) {
    return "timeout";
  }

  // 3. Rate limited
  if (httpStatus === 429 || messageContains(message, ["too many requests"])) {
    return "rate-limited";
  }

  // 4. Auth
  if (httpStatus === 401 || httpStatus === 403) {
    return "auth";
  }

  // 5. Upstream server errors (5xx)
  if (httpStatus !== null && httpStatus >= 500 && httpStatus < 600) {
    return "upstream";
  }

  // 6. Data gaps
  if (
    messageContains(message, [
      "no valid",
      "no probability data",
      "no data available",
      "empty",
    ])
  ) {
    return "data-gap";
  }

  // 7. Parse errors
  if (
    messageContains(message, [
      "json",
      "unexpected token",
      "headers do not match",
    ])
  ) {
    return "parse-error";
  }

  // 8. Other client-side upstream errors (4xx)
  if (httpStatus !== null && httpStatus >= 400 && httpStatus < 500) {
    return "upstream";
  }

  // 9. Provider name mentions imply upstream
  if (messageContains(message, ["noaa", "nasa", "donki", "swpc"])) {
    return "upstream";
  }

  // 10. Fallback
  return "unknown";
}

// ---------------------------------------------------------------------------
// Message generation
// ---------------------------------------------------------------------------

const UPSTREAM_CATEGORIES: Set<ErrorCategory> = new Set([
  "upstream",
  "data-gap",
  "timeout",
  "parse-error",
]);

function buildUserMessage(
  category: ErrorCategory,
  label: string,
  provider: string,
  httpStatus: number | null,
): string {
  const statusSuffix = httpStatus ? ` (HTTP ${httpStatus})` : "";

  switch (category) {
    case "network":
      return `Unable to reach ${provider}. Check your internet connection \u2014 ${label} data will resume automatically when connectivity is restored.`;
    case "upstream":
      return `${provider}'s ${label} service is temporarily unavailable${statusSuffix}. This is an issue with ${provider}, not Propulse. Data will update automatically when the service recovers.`;
    case "data-gap":
      return `${provider} returned an empty or incomplete response for ${label}. This typically happens during scheduled maintenance or satellite data gaps. The feed usually recovers within minutes.`;
    case "rate-limited":
      return `Request rate limit reached for ${label}. Propulse will automatically retry in a moment. No action needed.`;
    case "timeout":
      return `${provider}'s ${label} feed is responding slowly. This usually resolves on its own \u2014 Propulse will keep retrying.`;
    case "parse-error":
      return `Received an unexpected data format from ${provider} for ${label}. This can happen when the upstream API changes format. Retrying automatically.`;
    case "auth":
      return `Authentication issue with ${provider} for ${label}. This may be a temporary API key issue.`;
    case "unknown":
    default:
      return `${label} data is temporarily unavailable. Propulse will retry automatically.`;
  }
}

function buildShortMessage(category: ErrorCategory): string {
  switch (category) {
    case "network":
      return "Offline";
    case "upstream":
      return "Service down";
    case "data-gap":
      return "No data";
    case "rate-limited":
      return "Rate limited";
    case "timeout":
      return "Slow response";
    case "parse-error":
      return "Bad format";
    case "auth":
      return "Auth issue";
    case "unknown":
    default:
      return "Unavailable";
  }
}

// ---------------------------------------------------------------------------
// Main classifier
// ---------------------------------------------------------------------------

/**
 * Classify a raw error into a structured, user-friendly representation.
 *
 * @param error       - The caught error value (Error, string, or unknown)
 * @param endpointHint - Optional endpoint string to help identify the source
 *                        (falls back to `error.endpoint` if not provided)
 * @returns A fully populated ClassifiedError
 */
export function classifyError(
  error: unknown,
  endpointHint?: string,
): ClassifiedError {
  const httpStatus = extractHttpStatus(error);
  const endpoint = endpointHint ?? extractEndpoint(error);
  const message = extractMessage(error);

  // Identify the data source from the registry
  const sourceMatch = endpoint ? findSourceByEndpoint(endpoint) : null;
  const sourceId = sourceMatch?.id ?? null;
  const source = sourceMatch ?? null;

  const label = source?.label ?? "Data feed";
  const provider = source?.provider ?? "the upstream service";

  const category = detectCategory(error, message, httpStatus);

  return {
    category,
    sourceId,
    source,
    userMessage: buildUserMessage(category, label, provider, httpStatus),
    shortMessage: buildShortMessage(category),
    isUpstream: UPSTREAM_CATEGORIES.has(category),
    httpStatus,
    originalError: error,
    timestamp: Date.now(),
    suggestedRetryMs: RETRY_MS[category],
  };
}

// ---------------------------------------------------------------------------
// Staleness evaluation
// ---------------------------------------------------------------------------

/**
 * Format a millisecond duration into a compact human-readable age string.
 *
 * - < 60 min  → "Xm"
 * - < 24 h    → "Xh Ym"
 * - otherwise → "Xd Yh"
 */
export function formatAge(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);

  if (totalMinutes < 60) {
    return `${Math.max(1, totalMinutes)}m`;
  }

  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;

  if (totalHours < 24) {
    return remainingMinutes > 0
      ? `${totalHours}h ${remainingMinutes}m`
      : `${totalHours}h`;
  }

  const days = Math.floor(totalHours / 24);
  const remainingHours = totalHours % 24;

  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

/**
 * Evaluate how stale a data source's last-known data is relative to its
 * expected freshness and critical staleness thresholds defined in the registry.
 *
 * @param sourceId      - Registry key for the data source
 * @param dataUpdatedAt - Epoch ms of the most recent data point
 * @returns Staleness level, age in ms, and a human-readable message
 */
export function evaluateStaleness(
  sourceId: DataSourceId,
  dataUpdatedAt: number | undefined,
): StalenessResult {
  const source = DATA_SOURCE_REGISTRY[sourceId];
  const label = source?.label ?? "Data feed";

  if (dataUpdatedAt == null) {
    return {
      level: "very-stale",
      ageMs: Infinity,
      message: `${label} has no recent data available.`,
    };
  }

  const ageMs = Date.now() - dataUpdatedAt;

  if (source) {
    if (ageMs >= source.criticalStalenessMs) {
      return {
        level: "very-stale",
        ageMs,
        message: `${label} data is delayed \u2014 showing last known values from ${formatAge(ageMs)} ago.`,
      };
    }

    if (ageMs >= source.expectedFreshnessMs) {
      return {
        level: "stale",
        ageMs,
        message: `${label} data is delayed \u2014 showing last known values from ${formatAge(ageMs)} ago.`,
      };
    }
  }

  return {
    level: "fresh",
    ageMs,
    message: "",
  };
}
