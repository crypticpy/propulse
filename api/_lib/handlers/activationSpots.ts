/**
 * Read-only live activation feed aggregator for HamClock.
 *
 * POTA and WWFF expose public spot feeds. SOTA's own API now requires prior
 * approval for AI-authored clients, so this handler deliberately uses the
 * documented ParksnPeaks read-only syndication feed instead of contacting
 * SOTA infrastructure. Each provider is bounded, normalized, and degraded
 * independently so one volunteer service cannot blank the other two tabs.
 */

import { applyRateLimit } from "../rateLimit";
import type {
  ActivationProgram,
  ActivationSourceStatus,
  ActivationSpot,
} from "../../../src/types/activationSpots";

interface SourceDefinition {
  program: ActivationProgram;
  source: string;
  sourceUrl: string;
  feedUrl: string;
  normalize: (rows: unknown[], nowMs?: number) => ActivationSpot[];
}

interface SourceResult {
  program: ActivationProgram;
  status: ActivationSourceStatus;
  source: string;
  sourceUrl: string;
  count: number;
  spots: ActivationSpot[];
}

const MAX_BODY_BYTES = 1_500_000;
const MAX_ROWS_PER_SOURCE = 100;
const MAX_SPOT_AGE_MS = 2 * 60 * 60 * 1000;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

const SOURCES: readonly SourceDefinition[] = [
  {
    program: "POTA",
    source: "Parks on the Air",
    sourceUrl: "https://pota.app/",
    feedUrl: "https://api.pota.app/spot/activator",
    normalize: normalizePotaSpots,
  },
  {
    program: "SOTA",
    source: "ParksnPeaks syndication",
    sourceUrl: "https://www.parksnpeaks.org/",
    feedUrl: "https://www.parksnpeaks.org/api/SOTA",
    normalize: normalizeSotaSpots,
  },
  {
    program: "WWFF",
    source: "WWFF Spotline",
    sourceUrl: "https://spots.wwff.co/",
    feedUrl: "https://spots.wwff.co/static/spots.json",
    normalize: normalizeWwffSpots,
  },
] as const;

function getAllowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN || "https://propulse.vercel.app";
}

function corsHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": getAllowedOrigin(),
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function objectRow(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstValue(
  row: Record<string, unknown>,
  keys: readonly string[],
): unknown {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
  }
  return undefined;
}

function cleanString(value: unknown, maxLength = 160): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function finiteNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function coordinate(
  value: unknown,
  min: number,
  max: number,
): number | undefined {
  const number = finiteNumber(value);
  return number !== null && number >= min && number <= max
    ? number
    : undefined;
}

function frequencyKHz(value: unknown): number | null {
  const number = finiteNumber(value);
  if (number === null || number <= 0) return null;
  // Syndication feeds commonly publish MHz while POTA/WWFF publish kHz.
  const khz =
    number < 1_000
      ? number * 1_000
      : number > 1_500_000
        ? number / 1_000
        : number;
  return khz >= 100 && khz <= 1_500_000 ? Math.round(khz * 10) / 10 : null;
}

function parseSpotTime(value: unknown): Date | null {
  if (typeof value === "number") {
    const milliseconds = value < 10_000_000_000 ? value * 1_000 : value;
    const date = new Date(milliseconds);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  const text = cleanString(value, 64);
  if (!text) return null;
  if (/^\d+(?:\.\d+)?$/.test(text)) return parseSpotTime(Number(text));
  // Provider timestamps without a zone are documented/displayed as UTC.
  const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)
    ? text
    : `${text.replace(" ", "T")}Z`;
  const date = new Date(zoned);
  return Number.isFinite(date.getTime()) ? date : null;
}

function isLiveSpot(
  spottedAt: Date,
  comments: string,
  nowMs: number,
): boolean {
  const age = nowMs - spottedAt.getTime();
  return (
    age >= -FUTURE_TOLERANCE_MS &&
    age <= MAX_SPOT_AGE_MS &&
    !/\b(?:QRT|TEST|IGNORE)\b/i.test(comments)
  );
}

function finishSpots(spots: ActivationSpot[]): ActivationSpot[] {
  const newestByKey = new Map<string, ActivationSpot>();
  for (const spot of spots) {
    const key = `${spot.program}:${spot.callsign}:${spot.reference}:${spot.frequencyKHz}`;
    const previous = newestByKey.get(key);
    if (!previous || previous.spottedAt < spot.spottedAt) {
      newestByKey.set(key, spot);
    }
  }
  return [...newestByKey.values()]
    .sort((left, right) => right.spottedAt.localeCompare(left.spottedAt))
    .slice(0, MAX_ROWS_PER_SOURCE);
}

export function normalizePotaSpots(
  rows: unknown[],
  nowMs = Date.now(),
): ActivationSpot[] {
  const spots: ActivationSpot[] = [];
  for (const value of rows) {
    const row = objectRow(value);
    if (!row || row.invalid === true || row.invalid === 1) continue;
    const callsign = cleanString(row.activator, 32).toUpperCase();
    const reference = cleanString(row.reference, 32).toUpperCase();
    const frequency = frequencyKHz(row.frequency);
    const spotted = parseSpotTime(row.spotTime);
    const comments = cleanString(row.comments, 240);
    if (
      !callsign ||
      !reference ||
      frequency === null ||
      !spotted ||
      !isLiveSpot(spotted, comments, nowMs)
    ) {
      continue;
    }
    const latitude = coordinate(row.latitude, -90, 90);
    const longitude = coordinate(row.longitude, -180, 180);
    spots.push({
      id: `pota-${cleanString(row.spotId, 48) || `${callsign}-${spotted.getTime()}`}`,
      program: "POTA",
      callsign,
      reference,
      referenceName: cleanString(row.name ?? row.parkName, 160),
      frequencyKHz: frequency,
      mode: cleanString(row.mode, 24).toUpperCase() || "UNKNOWN",
      comments,
      spotter: cleanString(row.spotter, 32).toUpperCase(),
      spottedAt: spotted.toISOString(),
      ...(latitude !== undefined && longitude !== undefined
        ? { latitude, longitude }
        : {}),
      ...(cleanString(row.grid6 ?? row.grid4, 8)
        ? { grid: cleanString(row.grid6 ?? row.grid4, 8).toUpperCase() }
        : {}),
    });
  }
  return finishSpots(spots);
}

/** Normalize the documented ParksnPeaks JSON field variants defensively. */
export function normalizeSotaSpots(
  rows: unknown[],
  nowMs = Date.now(),
): ActivationSpot[] {
  const spots: ActivationSpot[] = [];
  for (const value of rows) {
    const row = objectRow(value);
    if (!row) continue;
    const callsign = cleanString(
      firstValue(row, [
        "actCallsign",
        "CallSign",
        "activatorCallsign",
        "callsign",
      ]),
      32,
    ).toUpperCase();
    const reference = cleanString(
      firstValue(row, ["actSite", "WWFFID", "summitCode", "reference"]),
      32,
    ).toUpperCase();
    const frequency = frequencyKHz(
      firstValue(row, ["actFreq", "Freq", "frequency", "frequency_khz"]),
    );
    const spotted = parseSpotTime(
      firstValue(row, [
        "actTime",
        "actDateTime",
        "spotTime",
        "dateTime",
        "timeStamp",
        "timestamp",
      ]),
    );
    const comments = cleanString(
      firstValue(row, ["actComments", "Comments", "comments"]),
      240,
    );
    if (
      !callsign ||
      !reference ||
      frequency === null ||
      !spotted ||
      !isLiveSpot(spotted, comments, nowMs)
    ) {
      continue;
    }
    const latitude = coordinate(
      firstValue(row, ["Latitude", "latitude", "lat"]),
      -90,
      90,
    );
    const longitude = coordinate(
      firstValue(row, ["Longitude", "longitude", "lon"]),
      -180,
      180,
    );
    spots.push({
      id: `sota-${
        cleanString(firstValue(row, ["actID", "id", "spotId"]), 48) ||
        `${callsign}-${spotted.getTime()}`
      }`,
      program: "SOTA",
      callsign,
      reference,
      referenceName: cleanString(
        firstValue(row, [
          "actLocation",
          "Location",
          "summitDetails",
          "reference_name",
        ]),
        160,
      ),
      frequencyKHz: frequency,
      mode:
        cleanString(firstValue(row, ["actMode", "MODE", "mode"]), 24).toUpperCase() ||
        "UNKNOWN",
      comments,
      spotter: cleanString(
        firstValue(row, ["actSpoter", "spotter", "poster"]),
        32,
      ).toUpperCase(),
      spottedAt: spotted.toISOString(),
      ...(latitude !== undefined && longitude !== undefined
        ? { latitude, longitude }
        : {}),
      ...(cleanString(firstValue(row, ["grid", "grid6"]), 8)
        ? {
            grid: cleanString(
              firstValue(row, ["grid", "grid6"]),
              8,
            ).toUpperCase(),
          }
        : {}),
    });
  }
  return finishSpots(spots);
}

export function normalizeWwffSpots(
  rows: unknown[],
  nowMs = Date.now(),
): ActivationSpot[] {
  const spots: ActivationSpot[] = [];
  for (const value of rows) {
    const row = objectRow(value);
    if (!row) continue;
    const callsign = cleanString(row.activator, 32).toUpperCase();
    const reference = cleanString(row.reference, 32).toUpperCase();
    const frequency = frequencyKHz(row.frequency_khz);
    const spotted = parseSpotTime(row.spot_time ?? row.spot_time_formatted);
    const comments = cleanString(row.remarks, 240);
    if (
      !callsign ||
      !reference ||
      frequency === null ||
      !spotted ||
      !isLiveSpot(spotted, comments, nowMs)
    ) {
      continue;
    }
    const latitude = coordinate(row.latitude, -90, 90);
    const longitude = coordinate(row.longitude, -180, 180);
    spots.push({
      id: `wwff-${cleanString(row.id, 48) || `${callsign}-${spotted.getTime()}`}`,
      program: "WWFF",
      callsign,
      reference,
      referenceName: cleanString(row.reference_name, 160),
      frequencyKHz: frequency,
      mode: cleanString(row.mode, 24).toUpperCase() || "UNKNOWN",
      comments,
      spotter: cleanString(row.spotter, 32).toUpperCase(),
      spottedAt: spotted.toISOString(),
      ...(latitude !== undefined && longitude !== undefined
        ? { latitude, longitude }
        : {}),
    });
  }
  return finishSpots(spots);
}

class ActivationFeedTooLargeError extends Error {}

async function readCappedJson(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) throw new ActivationFeedTooLargeError();
  const reader = response.body?.getReader();
  if (!reader) return [];
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new ActivationFeedTooLargeError();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function fetchSource(definition: SourceDefinition): Promise<SourceResult> {
  try {
    const response = await fetch(definition.feedUrl, {
      signal: AbortSignal.timeout(10_000),
      headers: {
        Accept: "application/json",
        "User-Agent": "Propulse/1.0 (read-only activation feed)",
      },
    });
    if (!response.ok) throw new Error(`upstream ${response.status}`);
    const payload = await readCappedJson(response);
    if (!Array.isArray(payload)) {
      return { ...definition, status: "invalid", count: 0, spots: [] };
    }
    const spots = definition.normalize(payload);
    return { ...definition, status: "ok", count: spots.length, spots };
  } catch (error) {
    return {
      ...definition,
      status:
        error instanceof SyntaxError || error instanceof ActivationFeedTooLargeError
          ? "invalid"
          : "unavailable",
      count: 0,
      spots: [],
    };
  }
}

export async function handleActivationSpots(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: corsHeaders(),
    });
  }

  const limited = applyRateLimit(request, "activation/spots", 12, 60);
  if (limited) return limited;

  const results = await Promise.all(SOURCES.map(fetchSource));
  const spots = results
    .flatMap((result) => result.spots)
    .sort((left, right) => right.spottedAt.localeCompare(left.spottedAt));

  return new Response(
    JSON.stringify({
      fetchedAt: new Date().toISOString(),
      spots,
      sources: results.map((result) => ({
        program: result.program,
        status: result.status,
        source: result.source,
        sourceUrl: result.sourceUrl,
        count: result.count,
      })),
    }),
    {
      status: 200,
      headers: {
        ...corsHeaders(),
        "Cache-Control": "s-maxage=30, stale-while-revalidate=90",
      },
    },
  );
}
