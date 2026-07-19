import type { SpotStoreResult } from "./spotStore.js";

function allowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN || "https://propulse.cloud";
}

export function spotJsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": allowedOrigin(),
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

export function spotOptionsResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": allowedOrigin(),
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export function spotCacheHeaders(result: SpotStoreResult): Record<string, string> {
  const fetchedMs = Date.parse(result.fetchedAt);
  const observedMs = result.observedAt ? Date.parse(result.observedAt) : Number.NaN;
  const remainingSeconds =
    result.status === "ok" && Number.isFinite(fetchedMs) && Number.isFinite(observedMs)
      ? Math.max(
          0,
          Math.floor(
            (observedMs + result.staleAfterSeconds * 1_000 - fetchedMs) / 1_000,
          ),
        )
      : 0;
  const sharedMaxAge = Math.min(30, remainingSeconds);
  const allowedStaleSeconds = Math.max(0, remainingSeconds - sharedMaxAge);
  return {
    "Cache-Control":
      result.status === "ok"
        ? `s-maxage=${sharedMaxAge}, stale-while-revalidate=${Math.min(
            300,
            allowedStaleSeconds,
          )}, stale-if-error=${allowedStaleSeconds}`
        : "s-maxage=15, stale-while-revalidate=60",
    "X-Propulse-Spot-Status": result.status,
    ...(result.failureReason
      ? { "X-Propulse-Spot-Failure": result.failureReason }
      : {}),
    ...(result.upstreamStatus !== null
      ? { "X-Propulse-Spot-Upstream-Status": String(result.upstreamStatus) }
      : {}),
    ...(result.observedAt
      ? { "X-Propulse-Spot-Observed-At": result.observedAt }
      : {}),
  };
}
