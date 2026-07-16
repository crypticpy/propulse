/** Private signed ingest and double-gated coarse view for NowCast research health. */

import { applyRateLimit } from "../_lib/rateLimit";
import {
  parseResearchHealthPayload,
  parseResearchAlertWebhookConfig,
  researchAlertWebhookBody,
  verifyResearchHealthSignature,
  type ResearchAlertEvent,
} from "../_lib/researchHealth";

export const config = {
  runtime: "edge",
};

const SOURCE_KEY = "nowcast-research";
const STALE_SECONDS = 7200;
export const MAX_RESEARCH_ALERT_ATTEMPTS = 8;

function allowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN || "https://propulse.vercel.app";
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": allowedOrigin(),
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, X-Propulse-Timestamp, X-Propulse-Signature",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export interface SupabaseConfig {
  baseUrl: string;
  serviceKey: string;
}

export function researchHealthStoreConfig(): SupabaseConfig | null {
  const dedicatedUrl = process.env.PROPULSE_RESEARCH_HEALTH_STORE_URL;
  const dedicatedKey = process.env.PROPULSE_RESEARCH_HEALTH_STORE_SERVICE_KEY;
  if (Boolean(dedicatedUrl) !== Boolean(dedicatedKey)) return null;
  const baseUrl = (dedicatedUrl ?? process.env.SUPABASE_URL)?.replace(/\/$/, "");
  const serviceKey = dedicatedKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  return baseUrl && serviceKey ? { baseUrl, serviceKey } : null;
}

function serviceHeaders(configValue: SupabaseConfig): Record<string, string> {
  return {
    apikey: configValue.serviceKey,
    Authorization: `Bearer ${configValue.serviceKey}`,
    "Content-Type": "application/json",
  };
}

export async function supabaseJson(
  configValue: SupabaseConfig,
  path: string,
  init: RequestInit,
): Promise<unknown> {
  const headers = new Headers(serviceHeaders(configValue));
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  const response = await fetch(`${configValue.baseUrl}/rest/v1/${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    throw new Error(`health store request failed with ${response.status}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

function asAlertEvents(value: unknown): ResearchAlertEvent[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is ResearchAlertEvent => {
    if (typeof row !== "object" || row === null) return false;
    const item = row as Record<string, unknown>;
    return (
      typeof item.event_id === "string" &&
      (item.decision === "healthy" || item.decision === "alert") &&
      Array.isArray(item.alert_names) &&
      item.alert_names.every((name) => typeof name === "string") &&
      typeof item.occurred_at === "string" &&
      Number.isInteger(item.attempts) &&
      Number(item.attempts) >= 0
    );
  });
}

async function patchAlertEvent(
  configValue: SupabaseConfig,
  event: ResearchAlertEvent,
  updates: Record<string, unknown>,
): Promise<void> {
  await supabaseJson(
    configValue,
    `propagation_research_alert_outbox?event_id=eq.${encodeURIComponent(event.event_id)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        attempts: event.attempts + 1,
        ...updates,
      }),
    },
  );
}

export async function deliverPendingAlerts(
  configValue: SupabaseConfig,
): Promise<{
  configured: boolean;
  pending: number;
  delivered: number;
  failed: number;
  exhausted: number;
}> {
  const webhook = parseResearchAlertWebhookConfig(process.env);
  if (!webhook) {
    return {
      configured: false,
      pending: 0,
      delivered: 0,
      failed: 0,
      exhausted: 0,
    };
  }
  const pending = asAlertEvents(
    await supabaseJson(
      configValue,
      `propagation_research_alert_outbox?delivered_at=is.null&attempts=lt.${MAX_RESEARCH_ALERT_ATTEMPTS}&order=created_at.asc&limit=5&select=event_id,decision,alert_names,occurred_at,attempts`,
      { method: "GET" },
    ),
  );
  let delivered = 0;
  let failed = 0;
  for (const event of pending) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (webhook.bearer) headers.Authorization = `Bearer ${webhook.bearer}`;
    if (webhook.kind === "generic") headers["Idempotency-Key"] = event.event_id;
    try {
      const response = await fetch(webhook.url, {
        method: "POST",
        headers,
        body: JSON.stringify(researchAlertWebhookBody(event, webhook.kind)),
        redirect: "error",
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        throw new Error(`webhook returned ${response.status}`);
      }
      await patchAlertEvent(configValue, event, {
        delivered_at: new Date().toISOString(),
        last_error: null,
      });
      delivered += 1;
    } catch (error) {
      const lastError =
        error instanceof Error && /^webhook returned \d{3}$/.test(error.message)
          ? error.message
          : error instanceof DOMException && error.name === "TimeoutError"
            ? "webhook timed out"
            : "webhook request failed";
      await patchAlertEvent(configValue, event, {
        last_error: lastError,
      });
      failed += 1;
    }
  }
  const exhaustedRows = await supabaseJson(
    configValue,
    `propagation_research_alert_outbox?delivered_at=is.null&attempts=gte.${MAX_RESEARCH_ALERT_ATTEMPTS}&limit=100&select=event_id`,
    { method: "GET" },
  );
  return {
    configured: true,
    pending: pending.length,
    delivered,
    failed,
    exhausted: Array.isArray(exhaustedRows) ? exhaustedRows.length : 0,
  };
}

async function postHealth(request: Request): Promise<Response> {
  const limited = applyRateLimit(request, "propagation/research-health-post", 10, 60);
  if (limited) return limited;
  const ingestSecret = process.env.PROPULSE_RESEARCH_HEALTH_INGEST_SECRET;
  const store = researchHealthStoreConfig();
  if (!ingestSecret || ingestSecret.length < 32 || !store) {
    return jsonResponse({ error: "Server misconfiguration" }, 503);
  }
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 16_384) {
    return jsonResponse({ error: "Payload too large" }, 413);
  }
  const rawBody = await request.text();
  const signatureValid = await verifyResearchHealthSignature(
    rawBody,
    request.headers.get("x-propulse-timestamp"),
    request.headers.get("x-propulse-signature"),
    ingestSecret,
  );
  if (!signatureValid) {
    return jsonResponse({ error: "Invalid signature" }, 401);
  }
  let payload;
  try {
    payload = parseResearchHealthPayload(rawBody);
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Invalid payload" },
      400,
    );
  }
  try {
    const result = await supabaseJson(
      store,
      "rpc/record_propagation_research_health",
      {
        method: "POST",
        body: JSON.stringify({
          p_event_id: payload.eventId,
          p_reported_at: payload.generatedAt,
          p_decision: payload.decision,
          p_last_completed_target_hour: payload.lastCompletedTargetHour,
          p_continuous_completed_hours: payload.continuousCompletedHours,
          p_completed_hours: payload.completedHours,
          p_required_hours: payload.requiredHours,
          p_missing_hours: payload.missingHours,
          p_freshness_seconds: payload.freshnessSeconds,
          p_alert_names: payload.alerts,
        }),
      },
    );
    const record =
      Array.isArray(result) &&
      typeof result[0] === "object" &&
      result[0] !== null
        ? (result[0] as Record<string, unknown>)
        : null;
    const alertDelivery = await deliverPendingAlerts(store);
    return jsonResponse(
      {
        accepted: Boolean(record?.accepted),
        stateChanged: Boolean(record?.state_changed),
        alertDelivery,
      },
      200,
    );
  } catch {
    return jsonResponse({ error: "Health persistence unavailable" }, 503);
  }
}

async function getHealth(request: Request): Promise<Response> {
  const limited = applyRateLimit(request, "propagation/research-health-get", 30, 60);
  if (limited) return limited;
  if (process.env.PROPULSE_RESEARCH_HEALTH_VIEW_ENABLED !== "true") {
    return jsonResponse({ error: "Not found" }, 404);
  }
  const store = researchHealthStoreConfig();
  if (!store) return jsonResponse({ error: "Server misconfiguration" }, 503);
  try {
    const result = await supabaseJson(
      store,
      `propagation_research_health?singleton_key=eq.${SOURCE_KEY}&select=reported_at,decision,last_completed_target_hour,continuous_completed_hours,completed_hours,required_hours,missing_hours,freshness_seconds&limit=1`,
      { method: "GET" },
    );
    const row = Array.isArray(result) ? result[0] : null;
    if (!row || typeof row !== "object") {
      return jsonResponse({ error: "No health heartbeat" }, 503);
    }
    const value = row as Record<string, unknown>;
    const reportedAt = String(value.reported_at ?? "");
    const reportedAtMs = Date.parse(reportedAt);
    if (!Number.isFinite(reportedAtMs)) {
      return jsonResponse({ error: "Health status unavailable" }, 503);
    }
    const heartbeatAgeSeconds = Math.max(
      0,
      Math.floor((Date.now() - reportedAtMs) / 1000),
    );
    const storedDecision = value.decision === "alert" ? "alert" : "healthy";
    const status =
      storedDecision === "alert"
        ? "alert"
        : heartbeatAgeSeconds > STALE_SECONDS
          ? "degraded"
          : "healthy";
    return jsonResponse(
      {
        schemaVersion: 1,
        status,
        reportedAt,
        lastCompletedAt: value.last_completed_target_hour ?? null,
        freshnessSeconds: value.freshness_seconds ?? null,
        progress: {
          continuousHours: value.continuous_completed_hours ?? 0,
          completedHours: value.completed_hours ?? 0,
          requiredHours: value.required_hours ?? 720,
          missingHours: value.missing_hours ?? 0,
        },
      },
      200,
    );
  } catch {
    return jsonResponse({ error: "Health status unavailable" }, 503);
  }
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": allowedOrigin(),
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, X-Propulse-Timestamp, X-Propulse-Signature",
        "Access-Control-Max-Age": "86400",
      },
    });
  }
  if (request.method === "POST") return postHealth(request);
  if (request.method === "GET") return getHealth(request);
  return jsonResponse({ error: "Method not allowed" }, 405);
}
