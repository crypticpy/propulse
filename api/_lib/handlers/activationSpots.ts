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
  matchesRow: (row: unknown) => boolean;
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

const SOTA_CALLSIGN_KEYS = [
  "actCallsign",
  "CallSign",
  "activatorCallsign",
  "callsign",
] as const;
const SOTA_REFERENCE_KEYS = [
  "actSite",
  "WWFFID",
  "summitCode",
  "reference",
] as const;
const SOTA_FREQUENCY_KEYS = ["actFreq", "Freq", "frequency"] as const;
const SOTA_TIME_KEYS = [
  "actTime",
  "actDateTime",
  "spotTime",
  "dateTime",
  "timeStamp",
  "timestamp",
] as const;

const SOURCES: readonly SourceDefinition[] = [
  {
    program: "POTA",
    source: "Parks on the Air",
    sourceUrl: "https://pota.app/",
    feedUrl: "https://api.pota.app/spot/activator",
    matchesRow: matchesPotaRow,
    normalize: normalizePotaSpots,
  },
  {
    program: "SOTA",
    source: "ParksnPeaks syndication",
    sourceUrl: "https://www.parksnpeaks.org/",
    feedUrl: "https://www.parksnpeaks.org/api/SOTA",
    matchesRow: matchesSotaRow,
    normalize: normalizeSotaSpots,
  },
  {
    program: "WWFF",
    source: "WWFF Spotline",
    sourceUrl: "https://spots.wwff.co/",
    feedUrl: "https://spots.wwff.co/static/spots.json",
    matchesRow: matchesWwffRow,
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

function hasOwnKey(row: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(row, key);
}

function hasAnyOwnKey(
  row: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return keys.some((key) => hasOwnKey(row, key));
}

function matchesPotaRow(value: unknown): boolean {
  const row = objectRow(value);
  return (
    row !== null &&
    ["activator", "reference", "frequency", "spotTime"].every((key) =>
      hasOwnKey(row, key),
    )
  );
}

function matchesSotaRow(value: unknown): boolean {
  const row = objectRow(value);
  return (
    row !== null &&
    hasAnyOwnKey(row, SOTA_CALLSIGN_KEYS) &&
    hasAnyOwnKey(row, SOTA_REFERENCE_KEYS) &&
    (hasAnyOwnKey(row, SOTA_FREQUENCY_KEYS) ||
      hasOwnKey(row, "frequency_khz")) &&
    hasAnyOwnKey(row, SOTA_TIME_KEYS)
  );
}

function matchesWwffRow(value: unknown): boolean {
  const row = objectRow(value);
  return (
    row !== null &&
    ["activator", "reference", "frequency_khz"].every((key) =>
      hasOwnKey(row, key),
    ) &&
    (hasOwnKey(row, "spot_time") || hasOwnKey(row, "spot_time_formatted"))
  );
}

function cleanString(value: unknown, maxLength = 160): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function finiteNumber(value: unknown): number | null {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && value.trim() === "")
  ) {
    return null;
  }
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

function frequencyKHz(
  value: unknown,
  sourceUnit: "khz" | "mhz",
): number | null {
  const number = finiteNumber(value);
  if (number === null || number <= 0) return null;
  // Units are provider contracts, not safely inferable from magnitude: both
  // 472 kHz and 1296.1 MHz are valid amateur activation frequencies.
  const khz = sourceUnit === "mhz" ? number * 1_000 : number;
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

function isCurrentSpotTime(spottedAt: Date, nowMs: number): boolean {
  const age = nowMs - spottedAt.getTime();
  return age >= -FUTURE_TOLERANCE_MS && age <= MAX_SPOT_AGE_MS;
}

export function isTerminalStatus(comments: string): boolean {
  return /\b(?:QRT|TEST|IGNORE)\b/i.test(comments);
}

interface TerminalActivation {
  key: string;
  spottedAt: string;
}

function activationKey(
  program: ActivationProgram,
  callsign: string,
  reference: string,
): string {
  return `${program}:${callsign}:${reference}`;
}

function finishSpots(
  spots: ActivationSpot[],
  terminalActivations: TerminalActivation[],
): ActivationSpot[] {
  const newestByKey = new Map<
    string,
    { spottedAt: string; spot?: ActivationSpot }
  >();
  for (const spot of spots) {
    const key = activationKey(spot.program, spot.callsign, spot.reference);
    const previous = newestByKey.get(key);
    if (!previous || previous.spottedAt <= spot.spottedAt) {
      newestByKey.set(key, { spottedAt: spot.spottedAt, spot });
    }
  }
  // Status rows participate in newest-first selection. Filtering them before
  // deduplication would resurrect an older spot after an activator went QRT.
  for (const terminal of terminalActivations) {
    const previous = newestByKey.get(terminal.key);
    if (!previous || previous.spottedAt <= terminal.spottedAt) {
      newestByKey.set(terminal.key, { spottedAt: terminal.spottedAt });
    }
  }
  return [...newestByKey.values()]
    .sort((left, right) => right.spottedAt.localeCompare(left.spottedAt))
    .flatMap((entry) => (entry.spot ? [entry.spot] : []))
    .slice(0, MAX_ROWS_PER_SOURCE);
}

export function normalizePotaSpots(
  rows: unknown[],
  nowMs = Date.now(),
): ActivationSpot[] {
  const spots: ActivationSpot[] = [];
  const terminalActivations: TerminalActivation[] = [];
  for (const value of rows) {
    const row = objectRow(value);
    if (!row || row.invalid === true || row.invalid === 1) continue;
    const callsign = cleanString(row.activator, 32).toUpperCase();
    const reference = cleanString(row.reference, 32).toUpperCase();
    const spotted = parseSpotTime(row.spotTime);
    const comments = cleanString(row.comments, 240);
    if (!callsign || !reference || !spotted || !isCurrentSpotTime(spotted, nowMs)) {
      continue;
    }
    if (isTerminalStatus(comments)) {
      terminalActivations.push({
        key: activationKey("POTA", callsign, reference),
        spottedAt: spotted.toISOString(),
      });
      continue;
    }
    const frequency = frequencyKHz(row.frequency, "khz");
    if (frequency === null) continue;
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
  return finishSpots(spots, terminalActivations);
}

/** Normalize the documented ParksnPeaks JSON field variants defensively. */
export function normalizeSotaSpots(
  rows: unknown[],
  nowMs = Date.now(),
): ActivationSpot[] {
  const spots: ActivationSpot[] = [];
  const terminalActivations: TerminalActivation[] = [];
  for (const value of rows) {
    const row = objectRow(value);
    if (!row) continue;
    const callsign = cleanString(
      firstValue(row, SOTA_CALLSIGN_KEYS),
      32,
    ).toUpperCase();
    const reference = cleanString(
      firstValue(row, SOTA_REFERENCE_KEYS),
      32,
    ).toUpperCase();
    const spotted = parseSpotTime(firstValue(row, SOTA_TIME_KEYS));
    const comments = cleanString(
      firstValue(row, ["actComments", "Comments", "comments"]),
      240,
    );
    if (!callsign || !reference || !spotted || !isCurrentSpotTime(spotted, nowMs)) {
      continue;
    }
    if (isTerminalStatus(comments)) {
      terminalActivations.push({
        key: activationKey("SOTA", callsign, reference),
        spottedAt: spotted.toISOString(),
      });
      continue;
    }
    const frequency = hasOwnKey(row, "frequency_khz")
      ? frequencyKHz(row.frequency_khz, "khz")
      : frequencyKHz(firstValue(row, SOTA_FREQUENCY_KEYS), "mhz");
    if (frequency === null) continue;
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
  return finishSpots(spots, terminalActivations);
}

export function normalizeWwffSpots(
  rows: unknown[],
  nowMs = Date.now(),
): ActivationSpot[] {
  const spots: ActivationSpot[] = [];
  const terminalActivations: TerminalActivation[] = [];
  for (const value of rows) {
    const row = objectRow(value);
    if (!row) continue;
    const callsign = cleanString(row.activator, 32).toUpperCase();
    const reference = cleanString(row.reference, 32).toUpperCase();
    const spotted = parseSpotTime(row.spot_time ?? row.spot_time_formatted);
    const comments = cleanString(row.remarks, 240);
    if (!callsign || !reference || !spotted || !isCurrentSpotTime(spotted, nowMs)) {
      continue;
    }
    if (isTerminalStatus(comments)) {
      terminalActivations.push({
        key: activationKey("WWFF", callsign, reference),
        spottedAt: spotted.toISOString(),
      });
      continue;
    }
    const frequency = frequencyKHz(row.frequency_khz, "khz");
    if (frequency === null) continue;
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
  return finishSpots(spots, terminalActivations);
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
    if (payload.length > 0 && !payload.some(definition.matchesRow)) {
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
