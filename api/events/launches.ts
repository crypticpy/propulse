/**
 * Vercel Edge Function: upcoming orbital launches.
 *
 * Proxies Launch Library 2 (thespacedevs). The free tier is 15 requests per
 * hour, so this handler caches 15 minutes at the CDN (`s-maxage=900`) with
 * a long stale-while-revalidate, keeps the last good payload in isolate
 * memory, and never issues more than one upstream fetch per invocation.
 * A 429 from upstream is served from that last-good payload with `stale: true`
 * rather than as an empty error.
 *
 * Source: https://ll.thespacedevs.com/2.3.0/launches/upcoming/
 * Docs: https://thespacedevs.com/llapi
 */

import { applyRateLimit } from "../_lib/rateLimit";

export const config = {
  runtime: "edge",
};

const UPSTREAM =
  "https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=10";
const MAX_RESPONSE_BYTES = 1_500_000;
const CACHE_SECONDS = 900;
const STALE_WHILE_REVALIDATE_SECONDS = 3600;
const FRESH_CACHE_MS = CACHE_SECONDS * 1000;
const USER_AGENT =
  "Propulse/1.0 (https://propulse.vercel.app; ham radio dashboard)";

function getAllowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN || "https://propulse.vercel.app";
}

export type LaunchTimePrecision =
  | "second"
  | "minute"
  | "hour"
  | "day"
  | "coarser"
  | "unknown";

export interface LaunchRecord {
  id: string;
  name: string;
  provider: string;
  providerAbbrev: string;
  pad: string;
  location: string;
  net: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  status: string;
  statusName: string;
  precision: LaunchTimePrecision;
  webcastLive: boolean;
  sourceUpdatedAt: string | null;
}

export interface LaunchesPayload {
  status: "ok" | "stale" | "unavailable";
  stale: boolean;
  retrievedAt: string;
  launches: LaunchRecord[];
}

export type UpstreamResult =
  | { kind: "ok"; raw: unknown }
  | { kind: "rate_limited" }
  | { kind: "error" };

interface CachedLaunches {
  payload: LaunchesPayload;
  storedAt: number;
}

let lastGood: CachedLaunches | null = null;

export function resetLaunchCacheForTests(): void {
  lastGood = null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asIso(value: unknown): string | null {
  const text = asString(value);
  if (!text) return null;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function parseTimePrecision(raw: unknown): LaunchTimePrecision {
  if (!isRecord(raw)) return "unknown";
  const abbrev = asString(raw.abbrev)?.toUpperCase() ?? "";
  const name = asString(raw.name)?.toLowerCase() ?? "";
  if (abbrev === "SEC" || name === "second") return "second";
  if (abbrev === "MIN" || name === "minute") return "minute";
  if (abbrev === "HR" || name === "hour") return "hour";
  if (abbrev === "DAY" || name === "day") return "day";
  if (
    abbrev === "MON" ||
    abbrev === "MONTH" ||
    name === "month" ||
    abbrev === "QTR" ||
    name.includes("quarter") ||
    abbrev === "HALF" ||
    name.includes("half") ||
    abbrev === "YR" ||
    abbrev === "YEAR" ||
    name === "year"
  ) {
    return "coarser";
  }
  return "unknown";
}

function nestedName(value: unknown, ...keys: string[]): string {
  let current: unknown = value;
  for (const key of keys) {
    if (!isRecord(current)) return "";
    current = current[key];
  }
  return asString(current) ?? "";
}

export function normalizeUpcomingLaunches(raw: unknown): LaunchRecord[] {
  if (!isRecord(raw) || !Array.isArray(raw.results)) return [];

  const launches: LaunchRecord[] = [];
  for (const entry of raw.results) {
    if (!isRecord(entry)) continue;
    const id = asString(entry.id);
    const name = asString(entry.name);
    if (!id || !name) continue;

    const providerBlock =
      entry.launch_service_provider ?? entry.lsp ?? null;
    const padBlock = isRecord(entry.pad) ? entry.pad : null;
    const statusBlock = isRecord(entry.status) ? entry.status : null;

    launches.push({
      id,
      name,
      provider: nestedName(providerBlock, "name"),
      providerAbbrev: nestedName(providerBlock, "abbrev"),
      pad: nestedName(padBlock, "name"),
      location: nestedName(padBlock, "location", "name"),
      net: asIso(entry.net),
      windowStart: asIso(entry.window_start),
      windowEnd: asIso(entry.window_end),
      status: asString(statusBlock?.abbrev) ?? asString(statusBlock?.name) ?? "",
      statusName: asString(statusBlock?.name) ?? "",
      precision: parseTimePrecision(entry.net_precision),
      webcastLive: entry.webcast_live === true,
      sourceUpdatedAt: asIso(entry.last_updated),
    });
  }
  return launches.slice(0, 10);
}

export function resolveLaunchesPayload(
  upstream: UpstreamResult,
  cached: LaunchesPayload | null,
  nowMs: number,
): { payload: LaunchesPayload; remember: boolean } {
  const retrievedAt = new Date(nowMs).toISOString();
  const bodyOk =
    upstream.kind === "ok" &&
    isRecord(upstream.raw) &&
    Array.isArray(upstream.raw.results);

  if (bodyOk && upstream.kind === "ok") {
    const launches = normalizeUpcomingLaunches(upstream.raw);
    return {
      payload: { status: "ok", stale: false, retrievedAt, launches },
      remember: true,
    };
  }

  if (cached) {
    return {
      payload: {
        ...cached,
        status: "stale",
        stale: true,
      },
      remember: false,
    };
  }

  return {
    payload: {
      status: "unavailable",
      stale: false,
      retrievedAt,
      launches: [],
    },
    remember: false,
  };
}

function jsonResponse(
  payload: LaunchesPayload,
  corsHeaders: Record<string, string>,
  cacheControl: string,
): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": cacheControl,
    },
  });
}

async function readCappedJson(response: Response): Promise<unknown | null> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > MAX_RESPONSE_BYTES) return null;
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(merged));
  } catch {
    return null;
  }
}

async function fetchUpstream(): Promise<UpstreamResult> {
  try {
    const response = await fetch(UPSTREAM, {
      signal: AbortSignal.timeout(10_000),
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
    });
    if (response.status === 429) return { kind: "rate_limited" };
    if (!response.ok) return { kind: "error" };
    const raw = await readCappedJson(response);
    if (raw === null) return { kind: "error" };
    return { kind: "ok", raw };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Launch Library 2 fetch failed: ${message}`);
    return { kind: "error" };
  }
}

export async function handleEventsLaunches(
  request: Request,
): Promise<Response> {
  const origin = getAllowedOrigin();
  const corsHeaders = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const limited = applyRateLimit(request, "events/launches", 20, 60);
  if (limited) return limited;

  const now = Date.now();
  const cached = lastGood?.payload ?? null;
  const cacheIsFresh =
    lastGood !== null && now - lastGood.storedAt < FRESH_CACHE_MS;

  let upstream: UpstreamResult;
  if (cacheIsFresh && cached) {
    return jsonResponse(
      cached,
      corsHeaders,
      `s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${STALE_WHILE_REVALIDATE_SECONDS}`,
    );
  } else {
    upstream = await fetchUpstream();
  }

  const { payload, remember } = resolveLaunchesPayload(upstream, cached, now);
  if (remember) {
    lastGood = { payload, storedAt: now };
  }

  const cacheControl =
    payload.status === "ok"
      ? `s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${STALE_WHILE_REVALIDATE_SECONDS}`
      : "s-maxage=60, stale-while-revalidate=120";

  return jsonResponse(payload, corsHeaders, cacheControl);
}

export default handleEventsLaunches;
