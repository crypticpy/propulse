import type { SpotStoreResult } from "./spotStore";

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
  return {
    "Cache-Control":
      result.status === "ok"
        ? "s-maxage=30, stale-while-revalidate=300, stale-if-error=86400"
        : "s-maxage=15, stale-while-revalidate=60",
    "X-Propulse-Spot-Status": result.status,
    ...(result.observedAt
      ? { "X-Propulse-Spot-Observed-At": result.observedAt }
      : {}),
  };
}
