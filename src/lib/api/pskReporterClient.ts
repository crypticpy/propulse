/**
 * PSK Reporter Direct Client
 *
 * Fetches reception reports directly from the PSK Reporter query API
 * (https://retrieve.pskreporter.info/query) and returns typed spot objects
 * suitable for map overlays and decode panels.
 *
 * -- CORS Strategy --
 * The PSK Reporter retrieval endpoint does NOT set CORS headers, so direct
 * browser fetch() calls will be blocked in production. Two approaches are
 * supported:
 *
 *   1. **Proxy mode (default)** — Requests go through a same-origin proxy
 *      (Vercel Edge Function at `/api/spots/pskreporter` or Vite dev proxy)
 *      that forwards to retrieve.pskreporter.info and returns the result.
 *      See also `src/lib/api/pskreporter.ts` which uses the proxy path to
 *      return `LiveSpot[]` for the existing map layer.
 *
 *   2. **JSONP fallback** — PSK Reporter supports a `callback` query
 *      parameter that wraps the response in a JSONP callback. This avoids
 *      CORS but requires injecting a <script> tag — less secure and harder
 *      to manage. This module implements JSONP as a fallback when the proxy
 *      endpoint is unreachable.
 *
 * -- Rate Limiting --
 * PSK Reporter limits queries to approximately one request per 5 minutes per
 * IP address. This client enforces a minimum interval and caches the most
 * recent result to serve repeat requests without hitting the upstream API.
 *
 * -- Relationship to pskreporter.ts --
 * The existing `src/lib/api/pskreporter.ts` converts PSK Reporter data into
 * the LiveSpot format used by the map layer. This module provides a lower-
 * level, more flexible query interface that returns `PskReporterSpot[]`
 * objects with full lat/lon and SNR data, intended for the SDR Console's
 * FT8 decode enrichment and any future direct integrations.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A single spot returned by the PSK Reporter query API. */
export interface PskReporterSpot {
  /** Callsign of the transmitting station */
  senderCallsign: string;
  /** Maidenhead grid of the sender (if known) */
  senderGrid?: string;
  /** Callsign of the receiving/reporting station */
  receiverCallsign: string;
  /** Maidenhead grid of the receiver (if known) */
  receiverGrid?: string;
  /** RF frequency in Hz */
  frequency: number;
  /** Signal-to-noise ratio in dB (if available) */
  snr?: number;
  /** Mode string: FT8, FT4, CW, etc. */
  mode: string;
  /** ISO 8601 timestamp of the reception */
  timestamp: string;
  /** Sender latitude (from PSK Reporter geolocation, if available) */
  senderLat?: number;
  /** Sender longitude */
  senderLon?: number;
  /** Receiver latitude */
  receiverLat?: number;
  /** Receiver longitude */
  receiverLon?: number;
}

/** Options for fetchPskReporterSpots(). */
export interface PskReporterQueryOptions {
  /** Band center frequency in Hz for frequency range filtering */
  frequency?: number;
  /** Mode filter */
  mode?: "FT8" | "FT4" | string;
  /** Lookback window in minutes (default: 15, max: 1440) */
  timeWindowMin?: number;
  /** Filter by receiver grid locator */
  receiverGrid?: string;
  /** Filter by receiver callsign */
  receiverCallsign?: string;
  /** Filter by sender callsign */
  senderCallsign?: string;
  /**
   * Application contact email, required by PSK Reporter Terms of Service.
   * If omitted the request may be throttled or rejected.
   */
  appContact: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** PSK Reporter retrieval API base URL (proxied in production). */
const PSKREPORTER_QUERY_BASE = "https://retrieve.pskreporter.info/query";

/**
 * Same-origin proxy path used in both dev (Vite proxy) and production
 * (Vercel Edge Function). Matches the route used by the existing
 * `pskreporter.ts` client.
 */
const PROXY_ENDPOINT = "/api/spots/pskreporter";

/**
 * Minimum interval between upstream queries in milliseconds (5 minutes).
 * PSK Reporter enforces roughly this rate limit per IP.
 */
const MIN_QUERY_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Frequency range tolerance in Hz applied around the center frequency.
 * FT8/FT4 signals span roughly 0-3000 Hz above the dial frequency, so a
 * +/- 1500 Hz window from the nominal center captures the full passband.
 */
const FREQ_RANGE_HZ = 1500;

/** JSONP callback timeout in milliseconds. */
const JSONP_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Module-level cache
// ---------------------------------------------------------------------------

interface CacheEntry {
  key: string;
  spots: PskReporterSpot[];
  fetchedAt: number;
}

let lastQueryTime = 0;
let cachedResult: CacheEntry | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch recent PSK Reporter spots matching the given filters.
 *
 * Results are cached for the duration of the rate limit window. Repeated
 * calls with the same parameters will return the cached result until the
 * cache expires.
 *
 * @returns Array of PskReporterSpot, or empty array on error.
 */
export async function fetchPskReporterSpots(
  options: PskReporterQueryOptions,
): Promise<PskReporterSpot[]> {
  const timeWindowMin = Math.min(
    Math.max(options.timeWindowMin ?? 15, 1),
    1440,
  );
  const cacheKey = buildCacheKey(options, timeWindowMin);

  // Return cached result if still within the rate limit window.
  if (
    cachedResult &&
    cachedResult.key === cacheKey &&
    Date.now() - cachedResult.fetchedAt < MIN_QUERY_INTERVAL_MS
  ) {
    return cachedResult.spots;
  }

  // Enforce minimum interval between actual upstream requests.
  const elapsed = Date.now() - lastQueryTime;
  if (elapsed < MIN_QUERY_INTERVAL_MS) {
    // Too soon — return stale cache if available, otherwise empty.
    if (cachedResult) return cachedResult.spots;
    return [];
  }

  // -- Attempt 1: Proxy endpoint (preferred, avoids CORS) --
  try {
    const spots = await fetchViaProxy(options, timeWindowMin);
    lastQueryTime = Date.now();
    cachedResult = { key: cacheKey, spots, fetchedAt: Date.now() };
    return spots;
  } catch (proxyErr) {
    console.warn(
      "[PskReporterClient] Proxy fetch failed, trying JSONP fallback:",
      proxyErr,
    );
  }

  // -- Attempt 2: JSONP fallback (bypasses CORS via <script> injection) --
  try {
    const spots = await fetchViaJsonp(options, timeWindowMin);
    lastQueryTime = Date.now();
    cachedResult = { key: cacheKey, spots, fetchedAt: Date.now() };
    return spots;
  } catch (jsonpErr) {
    console.warn("[PskReporterClient] JSONP fetch also failed:", jsonpErr);
  }

  // Both strategies failed — return stale cache or empty.
  return cachedResult?.spots ?? [];
}

/**
 * Clear the internal result cache, forcing the next call to
 * `fetchPskReporterSpots` to make a fresh request (subject to rate limiting).
 */
export function clearPskReporterCache(): void {
  cachedResult = null;
}

// ---------------------------------------------------------------------------
// Fetch strategies
// ---------------------------------------------------------------------------

/**
 * Fetch via the same-origin proxy endpoint. The proxy forwards the request
 * to retrieve.pskreporter.info and returns the response with proper CORS
 * headers.
 */
async function fetchViaProxy(
  options: PskReporterQueryOptions,
  timeWindowMin: number,
): Promise<PskReporterSpot[]> {
  const params = buildQueryParams(options, timeWindowMin);
  const url = `${PROXY_ENDPOINT}?${params.toString()}`;

  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) {
    throw new Error(`Proxy returned HTTP ${response.status}`);
  }

  const text = await response.text();
  if (!text.trim()) return [];

  // The proxy may return JSON (Edge Function) or raw XML (dev Vite proxy).
  try {
    const json = JSON.parse(text);
    return parseJsonResponse(json);
  } catch {
    return parseXmlResponse(text);
  }
}

/**
 * Fetch via JSONP by injecting a <script> tag. PSK Reporter supports the
 * `callback` query parameter which wraps the XML in a JavaScript function
 * call, bypassing CORS restrictions.
 *
 * This is a security-sensitive fallback and should only be used when the
 * proxy is unavailable (e.g., during local development without Vite proxy).
 */
async function fetchViaJsonp(
  options: PskReporterQueryOptions,
  timeWindowMin: number,
): Promise<PskReporterSpot[]> {
  return new Promise<PskReporterSpot[]>((resolve, reject) => {
    const callbackName = `__pskr_cb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Register the global callback.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any)[callbackName] = (data: unknown) => {
      cleanup();
      try {
        const spots = parseJsonpPayload(data);
        resolve(spots);
      } catch (err) {
        reject(err);
      }
    };

    const params = buildQueryParams(options, timeWindowMin);
    params.set("callback", callbackName);

    const script = document.createElement("script");
    script.src = `${PSKREPORTER_QUERY_BASE}?${params.toString()}`;
    script.async = true;

    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error("JSONP request timed out"));
    }, JSONP_TIMEOUT_MS);

    script.onerror = () => {
      cleanup();
      reject(new Error("JSONP script load failed"));
    };

    function cleanup(): void {
      clearTimeout(timeoutId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any)[callbackName];
      script.remove();
    }

    document.head.appendChild(script);
  });
}

// ---------------------------------------------------------------------------
// Query parameter construction
// ---------------------------------------------------------------------------

function buildQueryParams(
  options: PskReporterQueryOptions,
  timeWindowMin: number,
): URLSearchParams {
  const params = new URLSearchParams();

  // Time window (seconds)
  params.set("flowStartSeconds", String(timeWindowMin * 60));

  // Frequency range filter
  if (options.frequency) {
    const lo = options.frequency - FREQ_RANGE_HZ;
    const hi = options.frequency + FREQ_RANGE_HZ;
    params.set("frange", `${lo}-${hi}`);
  }

  // Mode filter
  if (options.mode) {
    params.set("mode", options.mode);
  }

  // Callsign / grid filters
  if (options.receiverCallsign) {
    params.set("receiverCallsign", options.receiverCallsign);
  }
  if (options.senderCallsign) {
    params.set("senderCallsign", options.senderCallsign);
  }
  if (options.receiverGrid) {
    params.set("grid", options.receiverGrid);
  }

  // Reception reports only (no WSPR / beacon power reports)
  params.set("rronly", "1");

  // App contact (required by TOS)
  if (options.appContact) {
    params.set("appcontact", options.appContact);
  }

  // Limit to keep responses manageable
  params.set("noactive", "1");

  return params;
}

function buildCacheKey(
  options: PskReporterQueryOptions,
  timeWindowMin: number,
): string {
  return [
    options.frequency ?? "",
    options.mode ?? "",
    timeWindowMin,
    options.receiverCallsign ?? "",
    options.senderCallsign ?? "",
    options.receiverGrid ?? "",
  ].join("|");
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

/**
 * Parse a JSON response from the proxy Edge Function.
 * Expected shape: `{ spots: [...] }` or `{ receptionReport: [...] }`.
 */
function parseJsonResponse(json: unknown): PskReporterSpot[] {
  if (!json || typeof json !== "object") return [];

  const data = json as Record<string, unknown>;
  const reports = (data.spots ?? data.receptionReport ?? []) as unknown[];

  if (!Array.isArray(reports)) return [];

  return reports
    .map((r) => parseReportObject(r as Record<string, unknown>))
    .filter((s): s is PskReporterSpot => s !== null);
}

/**
 * Parse a JSONP callback payload. PSK Reporter JSONP wraps the data in a
 * function call; the callback receives a single argument which may be an
 * object with a `receptionReport` array or the raw array itself.
 */
function parseJsonpPayload(data: unknown): PskReporterSpot[] {
  if (Array.isArray(data)) {
    return data
      .map((r) => parseReportObject(r as Record<string, unknown>))
      .filter((s): s is PskReporterSpot => s !== null);
  }

  if (data && typeof data === "object") {
    return parseJsonResponse(data);
  }

  return [];
}

/**
 * Parse XML response text using the browser DOMParser.
 * Extracts `<receptionReport>` elements from the PSK Reporter XML schema.
 */
function parseXmlResponse(xml: string): PskReporterSpot[] {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "text/xml");

    // Check for parse errors
    const parseError = doc.querySelector("parsererror");
    if (parseError) return [];

    const elements = doc.querySelectorAll("receptionReport");
    if (elements.length === 0) return [];

    const spots: PskReporterSpot[] = [];
    for (const el of elements) {
      const spot = parseXmlElement(el);
      if (spot) spots.push(spot);
    }
    return spots;
  } catch {
    return [];
  }
}

/**
 * Convert a single JSON report object into a PskReporterSpot.
 * Handles the field naming conventions used by PSK Reporter's JSON output.
 */
function parseReportObject(
  obj: Record<string, unknown>,
): PskReporterSpot | null {
  const senderCallsign = asString(obj.senderCallsign);
  const receiverCallsign = asString(obj.receiverCallsign);
  const frequency = asNumber(obj.frequency);

  if (!senderCallsign || !receiverCallsign || frequency === undefined) {
    return null;
  }

  // flowStartSeconds is Unix epoch in some formats, ISO string in others
  let timestamp: string;
  const flowStart = obj.flowStartSeconds ?? obj.timestamp ?? obj.time;
  if (typeof flowStart === "number") {
    // Unix timestamp (seconds since epoch)
    timestamp = new Date(flowStart * 1000).toISOString();
  } else if (typeof flowStart === "string") {
    timestamp = flowStart;
  } else {
    timestamp = new Date().toISOString();
  }

  const snrVal = asNumber(obj.sNR ?? obj.snr);

  return {
    senderCallsign,
    senderGrid: asString(obj.senderLocator ?? obj.senderGrid),
    receiverCallsign,
    receiverGrid: asString(obj.receiverLocator ?? obj.receiverGrid),
    frequency,
    snr: snrVal,
    mode: asString(obj.mode) ?? "FT8",
    timestamp,
    senderLat: asNumber(obj.senderLat ?? obj.senderLatitude),
    senderLon: asNumber(obj.senderLon ?? obj.senderLongitude),
    receiverLat: asNumber(obj.receiverLat ?? obj.receiverLatitude),
    receiverLon: asNumber(obj.receiverLon ?? obj.receiverLongitude),
  };
}

/**
 * Parse a single `<receptionReport>` XML element into a PskReporterSpot.
 */
function parseXmlElement(el: Element): PskReporterSpot | null {
  const senderCallsign = el.getAttribute("senderCallsign");
  const receiverCallsign = el.getAttribute("receiverCallsign");
  const frequencyStr = el.getAttribute("frequency");

  if (!senderCallsign || !receiverCallsign || !frequencyStr) return null;

  const frequency = parseInt(frequencyStr, 10);
  if (isNaN(frequency)) return null;

  const flowStartStr = el.getAttribute("flowStartSeconds") ?? "0";
  const flowStartSec = parseInt(flowStartStr, 10);
  const timestamp = isNaN(flowStartSec)
    ? new Date().toISOString()
    : new Date(flowStartSec * 1000).toISOString();

  const snrStr = el.getAttribute("sNR");
  const snr =
    snrStr !== null && snrStr !== "" ? parseInt(snrStr, 10) : undefined;

  // PSK Reporter XML may include lat/lon attributes on sender/receiver
  const senderLat = parseFloatAttr(el, "senderDXCC")
    ? undefined
    : parseFloatAttr(el, "senderLatitude");
  const senderLon = parseFloatAttr(el, "senderLongitude");
  const receiverLat = parseFloatAttr(el, "receiverLatitude");
  const receiverLon = parseFloatAttr(el, "receiverLongitude");

  return {
    senderCallsign,
    senderGrid: el.getAttribute("senderLocator") ?? undefined,
    receiverCallsign,
    receiverGrid: el.getAttribute("receiverLocator") ?? undefined,
    frequency,
    snr: snr !== undefined && !isNaN(snr) ? snr : undefined,
    mode: el.getAttribute("mode") ?? "FT8",
    timestamp,
    senderLat,
    senderLon,
    receiverLat,
    receiverLon,
  };
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function asString(val: unknown): string | undefined {
  if (typeof val === "string" && val.length > 0) return val;
  return undefined;
}

function asNumber(val: unknown): number | undefined {
  if (typeof val === "number" && !isNaN(val)) return val;
  if (typeof val === "string") {
    const n = parseFloat(val);
    if (!isNaN(n)) return n;
  }
  return undefined;
}

function parseFloatAttr(el: Element, name: string): number | undefined {
  const val = el.getAttribute(name);
  if (val === null || val === "") return undefined;
  const n = parseFloat(val);
  return isNaN(n) ? undefined : n;
}
