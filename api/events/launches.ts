/**
 * Vercel Edge Function: upcoming orbital launches.
 *
 * Proxies Launch Library 2 (thespacedevs). The free tier is 15 requests per
 * hour, so this handler caches 15 minutes at the CDN (`s-maxage=900`) with
 * a long stale-while-revalidate, keeps the last good payload in isolate
 * memory and in `caches.default` (so a cold isolate can still serve stale),
 * and never issues more than one upstream fetch per invocation.
 * A 429 from upstream is served from that last-good payload with `stale: true`
 * rather than as an empty error. Last-good older than six hours is discarded.
 *
 * Default (normal) mode is used on purpose: LL2 `mode=list` omits pad,
 * provider, and `webcast_live`, which the tile and report need. The extra
 * bytes are worth that payload.
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
export const LAST_GOOD_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const LAST_GOOD_CACHE_MAX_AGE_SECONDS = 21_600;
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

export interface CachedLaunches {
  payload: LaunchesPayload;
  storedAt: number;
}

let lastGood: CachedLaunches | null = null;

export function resetLaunchCacheForTests(): void {
  lastGood = null;
}

export function seedLastGoodForTests(entry: CachedLaunches | null): void {
  lastGood = entry;
}

function lastGoodCacheUrl(request: Request): string {
  return new URL("/api/events/launches/last-good", request.url).toString();
}

function runtimeCache(): Cache | undefined {
  const stores = (globalThis as { caches?: { default?: Cache } }).caches;
  return stores?.default;
}

function isCachedLaunches(value: unknown): value is CachedLaunches {
  if (!isRecord(value) || typeof value.storedAt !== "number") return false;
  if (!Number.isFinite(value.storedAt)) return false;
  const payload = value.payload;
  return (
    isRecord(payload) &&
    (payload.status === "ok" ||
      payload.status === "stale" ||
      payload.status === "unavailable") &&
    typeof payload.retrievedAt === "string" &&
    Array.isArray(payload.launches)
  );
}

async function readRuntimeLastGood(request: Request): Promise<CachedLaunches | null> {
  try {
    const cache = runtimeCache();
    if (!cache) return null;
    const hit = await cache.match(lastGoodCacheUrl(request));
    if (!hit) return null;
    const parsed: unknown = await hit.json();
    return isCachedLaunches(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function writeRuntimeLastGood(
  request: Request,
  entry: CachedLaunches,
): Promise<void> {
  try {
    const cache = runtimeCache();
    if (!cache) return;
    await cache.put(
      lastGoodCacheUrl(request),
      new Response(JSON.stringify(entry), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `max-age=${LAST_GOOD_CACHE_MAX_AGE_SECONDS}`,
        },
      }),
    );
  } catch {
    // Isolate memory still holds last-good for this instance.
  }
}

function stillUsable(entry: CachedLaunches | null, now: number): CachedLaunches | null {
  if (!entry) return null;
  if (now - entry.storedAt > LAST_GOOD_MAX_AGE_MS) return null;
  return entry;
}

async function loadLastGood(request: Request, now: number): Promise<CachedLaunches | null> {
  const memory = stillUsable(lastGood, now);
  if (memory) return memory;
  lastGood = null;
  const stored = stillUsable(await readRuntimeLastGood(request), now);
  if (stored) lastGood = stored;
  return stored;
}

async function rememberLastGood(
  request: Request,
  entry: CachedLaunches,
): Promise<void> {
  lastGood = entry;
  await writeRuntimeLastGood(request, entry);
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

  if (request.method !== "GET") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: {
        ...corsHeaders,
        Allow: "GET, OPTIONS",
      },
    });
  }

  const limited = applyRateLimit(request, "events/launches", 20, 60);
  if (limited) return limited;

  const now = Date.now();
  const cachedEntry = await loadLastGood(request, now);
  const cached = cachedEntry?.payload ?? null;
  const ageMs = cachedEntry ? now - cachedEntry.storedAt : Number.POSITIVE_INFINITY;

  if (cachedEntry && ageMs < FRESH_CACHE_MS) {
    const remaining = Math.max(
      1,
      Math.ceil((FRESH_CACHE_MS - ageMs) / 1000),
    );
    return jsonResponse(
      cachedEntry.payload,
      corsHeaders,
      `s-maxage=${remaining}, stale-while-revalidate=${STALE_WHILE_REVALIDATE_SECONDS}`,
    );
  }

  const upstream = await fetchUpstream();
  const { payload, remember } = resolveLaunchesPayload(upstream, cached, now);
  if (remember) {
    await rememberLastGood(request, { payload, storedAt: now });
  }

  const cacheControl =
    payload.status === "ok"
      ? `s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${STALE_WHILE_REVALIDATE_SECONDS}`
      : "s-maxage=60, stale-while-revalidate=120";

  return jsonResponse(payload, corsHeaders, cacheControl);
}

export default handleEventsLaunches;
