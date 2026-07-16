export const RESEARCH_HEALTH_ALERT_NAMES = [
  "health_record_parseable",
  "health_status_healthy",
  "zero_consecutive_failures",
  "health_record_recent",
  "latest_settled_hour_complete",
  "source_freshness_within_limit",
  "receipt_continuity_positive",
  "target_hour_utc_aligned",
  "runtime_storage_bounded",
  "worker_job_loaded",
  "worker_job_clean_or_running",
  "shadow_rollup_operational_healthy",
] as const;

const ALERT_NAMES = new Set<string>(RESEARCH_HEALTH_ALERT_NAMES);
const PAYLOAD_KEYS = new Set([
  "schemaVersion",
  "eventId",
  "generatedAt",
  "decision",
  "researchOnly",
  "alerts",
  "lastCompletedTargetHour",
  "continuousCompletedHours",
  "completedHours",
  "requiredHours",
  "missingHours",
  "freshnessSeconds",
]);

export interface ResearchHealthPayload {
  schemaVersion: 1;
  eventId: string;
  generatedAt: string;
  decision: "healthy" | "alert";
  researchOnly: true;
  alerts: string[];
  lastCompletedTargetHour: string | null;
  continuousCompletedHours: number;
  completedHours: number;
  requiredHours: number;
  missingHours: number;
  freshnessSeconds: number | null;
}

export interface ResearchAlertEvent {
  event_id: string;
  decision: "healthy" | "alert";
  alert_names: string[];
  occurred_at: string;
  attempts: number;
}

export type ResearchAlertWebhookKind = "generic" | "slack" | "discord";

export interface ResearchAlertWebhookConfig {
  url: string;
  kind: ResearchAlertWebhookKind;
  bearer: string | null;
}

type AlertWebhookEnvironment = Record<string, string | undefined>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function integerInRange(
  value: unknown,
  minimum: number,
  maximum: number,
  name: string,
): number {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`${name} is outside its accepted range`);
  }
  return value as number;
}

function isoTimestamp(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.endsWith("Z") && !/[+-]\d\d:\d\d$/.test(value)) {
    throw new Error(`${name} must be an explicit ISO-8601 timestamp`);
  }
  if (!Number.isFinite(Date.parse(value))) {
    throw new Error(`${name} is invalid`);
  }
  return value;
}

export function parseResearchHealthPayload(
  rawBody: string,
  nowMs = Date.now(),
): ResearchHealthPayload {
  if (new TextEncoder().encode(rawBody).byteLength > 16_384) {
    throw new Error("research health payload is too large");
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(rawBody);
  } catch {
    throw new Error("research health payload is not valid JSON");
  }
  if (!isRecord(decoded)) {
    throw new Error("research health payload must be an object");
  }
  const keys = Object.keys(decoded);
  if (keys.length !== PAYLOAD_KEYS.size || keys.some((key) => !PAYLOAD_KEYS.has(key))) {
    throw new Error("research health payload has unknown or missing fields");
  }
  if (decoded.schemaVersion !== 1 || decoded.researchOnly !== true) {
    throw new Error("research-only schema contract is required");
  }
  if (typeof decoded.eventId !== "string" || !/^[0-9a-f]{64}$/.test(decoded.eventId)) {
    throw new Error("eventId must be a lowercase SHA-256 digest");
  }
  if (decoded.decision !== "healthy" && decoded.decision !== "alert") {
    throw new Error("decision is invalid");
  }
  const generatedAt = isoTimestamp(decoded.generatedAt, "generatedAt");
  const generatedMs = Date.parse(generatedAt);
  if (generatedMs < nowMs - 10 * 60_000 || generatedMs > nowMs + 5 * 60_000) {
    throw new Error("generatedAt is outside the acceptance window");
  }
  if (!Array.isArray(decoded.alerts) || decoded.alerts.length > 32) {
    throw new Error("alerts must be a bounded array");
  }
  const alerts = decoded.alerts.map((value) => {
    if (typeof value !== "string" || !ALERT_NAMES.has(value)) {
      throw new Error("alerts contains an unknown gate name");
    }
    return value;
  });
  if (new Set(alerts).size !== alerts.length) {
    throw new Error("alerts contains duplicates");
  }
  if ((decoded.decision === "healthy") !== (alerts.length === 0)) {
    throw new Error("decision and alerts disagree");
  }
  let lastCompletedTargetHour: string | null = null;
  if (decoded.lastCompletedTargetHour !== null) {
    lastCompletedTargetHour = isoTimestamp(
      decoded.lastCompletedTargetHour,
      "lastCompletedTargetHour",
    );
    if (Date.parse(lastCompletedTargetHour) > generatedMs) {
      throw new Error("lastCompletedTargetHour cannot be in the future");
    }
  }
  const continuousCompletedHours = integerInRange(
    decoded.continuousCompletedHours,
    0,
    100_000,
    "continuousCompletedHours",
  );
  const completedHours = integerInRange(
    decoded.completedHours,
    0,
    100_000,
    "completedHours",
  );
  const requiredHours = integerInRange(
    decoded.requiredHours,
    720,
    100_000,
    "requiredHours",
  );
  const missingHours = integerInRange(
    decoded.missingHours,
    0,
    100_000,
    "missingHours",
  );
  if (continuousCompletedHours > completedHours) {
    throw new Error("continuousCompletedHours exceeds completedHours");
  }
  const freshnessSeconds =
    decoded.freshnessSeconds === null
      ? null
      : integerInRange(
          decoded.freshnessSeconds,
          0,
          7 * 24 * 3600,
          "freshnessSeconds",
        );
  return {
    schemaVersion: 1,
    eventId: decoded.eventId,
    generatedAt,
    decision: decoded.decision,
    researchOnly: true,
    alerts,
    lastCompletedTargetHour,
    continuousCompletedHours,
    completedHours,
    requiredHours,
    missingHours,
    freshnessSeconds,
  };
}

function bytesToHex(value: ArrayBuffer): string {
  return Array.from(new Uint8Array(value))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function signResearchHealthBody(
  rawBody: string,
  timestamp: string,
  secret: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(`${timestamp}.${rawBody}`),
    ),
  );
}

export async function verifyResearchHealthSignature(
  rawBody: string,
  timestamp: string | null,
  signatureHeader: string | null,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!timestamp || !/^\d{10}$/.test(timestamp) || !signatureHeader) return false;
  const timestampNumber = Number(timestamp);
  if (Math.abs(nowSeconds - timestampNumber) > 300) return false;
  const signature = signatureHeader.startsWith("v1=")
    ? signatureHeader.slice(3)
    : "";
  if (!/^[0-9a-f]{64}$/.test(signature)) return false;
  const expected = await signResearchHealthBody(rawBody, timestamp, secret);
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
  }
  return mismatch === 0;
}

function genericWebhookHostIsUnsafe(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.includes(":")
  ) {
    return true;
  }
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }
  const [first, second] = parts;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && (second === 0 || second === 168)) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

export function parseResearchAlertWebhookConfig(
  environment: AlertWebhookEnvironment,
): ResearchAlertWebhookConfig | null {
  const rawUrl = environment.PROPULSE_RESEARCH_ALERT_WEBHOOK_URL;
  if (!rawUrl) return null;
  const rawKind = environment.PROPULSE_RESEARCH_ALERT_WEBHOOK_KIND ?? "generic";
  if (rawKind !== "generic" && rawKind !== "slack" && rawKind !== "discord") {
    throw new Error("alert webhook kind is invalid");
  }
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("alert webhook URL is invalid");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    (parsed.port && parsed.port !== "443") ||
    parsed.hash
  ) {
    throw new Error("alert webhook URL violates the HTTPS destination contract");
  }
  const hostname = parsed.hostname.toLowerCase();
  if (rawKind === "slack") {
    const slackHost = hostname === "hooks.slack.com" || hostname === "hooks.slack-gov.com";
    if (!slackHost || !parsed.pathname.startsWith("/services/")) {
      throw new Error("Slack alert webhook destination is invalid");
    }
  } else if (rawKind === "discord") {
    const discordHost = hostname === "discord.com" || hostname === "discordapp.com";
    if (!discordHost || !parsed.pathname.startsWith("/api/webhooks/")) {
      throw new Error("Discord alert webhook destination is invalid");
    }
  } else {
    const allowedHost = environment.PROPULSE_RESEARCH_ALERT_WEBHOOK_ALLOWED_HOST
      ?.trim()
      .toLowerCase();
    if (!allowedHost || allowedHost !== hostname || genericWebhookHostIsUnsafe(hostname)) {
      throw new Error("generic alert webhook host is not explicitly allowed");
    }
  }
  const bearer = environment.PROPULSE_RESEARCH_ALERT_WEBHOOK_BEARER?.trim() || null;
  if (bearer && rawKind !== "generic") {
    throw new Error("alert webhook bearer is only valid for generic destinations");
  }
  return { url: parsed.toString(), kind: rawKind, bearer };
}

export function researchAlertWebhookBody(
  event: ResearchAlertEvent,
  kind: ResearchAlertWebhookKind,
): Record<string, unknown> {
  const message =
    event.decision === "healthy"
      ? "Propulse NowCast research pipeline recovered"
      : `Propulse NowCast research pipeline alert: ${event.alert_names.join(", ")}`;
  if (kind === "slack") return { text: message };
  if (kind === "discord") return { content: message };
  return {
    eventId: event.event_id,
    decision: event.decision,
    alerts: event.alert_names,
    occurredAt: event.occurred_at,
    message,
  };
}
