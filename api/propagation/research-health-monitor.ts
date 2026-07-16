/** Authenticated off-M5 stale-heartbeat monitor and alert retry trigger. */

import {
  deliverPendingAlerts,
  researchHealthStoreConfig,
  supabaseJson,
} from "./research-health";

export const config = {
  runtime: "edge",
};

const SOURCE_KEY = "nowcast-research";
const STALE_SECONDS = 7200;

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function bearerMatches(header: string | null, secret: string): boolean {
  const provided = header?.startsWith("Bearer ") ? header.slice(7) : "";
  if (provided.length !== secret.length) return false;
  let mismatch = 0;
  for (let index = 0; index < secret.length; index += 1) {
    mismatch |= provided.charCodeAt(index) ^ secret.charCodeAt(index);
  }
  return mismatch === 0;
}

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  const monitorSecret = process.env.PROPULSE_RESEARCH_HEALTH_MONITOR_SECRET;
  if (!monitorSecret || monitorSecret.length < 32) {
    return jsonResponse({ error: "Server misconfiguration" }, 503);
  }
  if (!bearerMatches(request.headers.get("authorization"), monitorSecret)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  const store = researchHealthStoreConfig();
  if (!store) return jsonResponse({ error: "Server misconfiguration" }, 503);

  try {
    const result = await supabaseJson(
      store,
      `propagation_research_health?singleton_key=eq.${SOURCE_KEY}&select=reported_at&limit=1`,
      { method: "GET" },
    );
    const row = Array.isArray(result) ? result[0] : null;
    const reportedAt =
      row && typeof row === "object"
        ? String((row as Record<string, unknown>).reported_at ?? "")
        : "";
    const reportedAtMs = Date.parse(reportedAt);
    if (!Number.isFinite(reportedAtMs)) {
      return jsonResponse({ error: "No health heartbeat" }, 503);
    }

    const observedAt = new Date().toISOString();
    const heartbeatAgeSeconds = Math.max(
      0,
      Math.floor((Date.parse(observedAt) - reportedAtMs) / 1000),
    );
    let evaluated = true;
    let stateChanged = false;
    let heartbeatStale = heartbeatAgeSeconds > STALE_SECONDS;
    if (heartbeatStale) {
      const eventId = await sha256(`stale-heartbeat:${reportedAt}`);
      const monitorResult = await supabaseJson(
        store,
        "rpc/monitor_propagation_research_health",
        {
          method: "POST",
          body: JSON.stringify({
            p_event_id: eventId,
            p_observed_at: observedAt,
            p_stale_seconds: STALE_SECONDS,
          }),
        },
      );
      const monitorRow =
        Array.isArray(monitorResult) &&
        monitorResult[0] &&
        typeof monitorResult[0] === "object"
          ? (monitorResult[0] as Record<string, unknown>)
          : null;
      evaluated = Boolean(monitorRow?.evaluated);
      stateChanged = Boolean(monitorRow?.state_changed);
      heartbeatStale = Boolean(monitorRow?.heartbeat_stale);
    }
    const alertDelivery = await deliverPendingAlerts(store);
    return jsonResponse(
      {
        evaluated,
        heartbeatStale,
        stateChanged,
        heartbeatAgeSeconds,
        alertDelivery,
      },
      200,
    );
  } catch {
    return jsonResponse({ error: "Health monitor unavailable" }, 503);
  }
}
