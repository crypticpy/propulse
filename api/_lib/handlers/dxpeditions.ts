/**
 * Vercel Edge Function: DXpeditions Tracker Proxy
 * Scrapes NG3K's "Announced DX Operations" (ADXO) table to avoid CORS and
 * to normalize a fragile, hand-maintained HTML table into a stable JSON
 * contract. The page has no public API/RSS with structured fields, so this
 * is a defensive HTML scraper: rows that don't match the expected shape are
 * skipped individually rather than failing the whole response, and the
 * upstream read is capped so a redesigned/oversized page can't blow up the
 * function.
 *
 * Source: https://www.ng3k.com/adxo.html
 * Cache: 6 hours with 6-hour stale-while-revalidate (the page updates at
 * most a few times a day; the cache is expected to absorb nearly all load)
 */

import { applyRateLimit } from "../rateLimit";

/**
 * Get the allowed CORS origin based on environment.
 * Never returns wildcard "*" to prevent security issues.
 */
function getAllowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN || "https://propulse.vercel.app";
}

// www.ng3k.com/adxo.html is only a meta-refresh stub (an HTML-level
// redirect fetch can't follow) — the table lives at /Misc/adxo.html
const ADXO_URL = "https://ng3k.com/Misc/adxo.html";
const MAX_BODY_BYTES = 2 * 1024 * 1024;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DxpeditionEntry {
  callsign: string;
  entity: string;
  startDate: string; // ISO yyyy-mm-dd
  endDate: string; // ISO yyyy-mm-dd
  bands: string; // best-effort, as published in the info text
  modes: string; // best-effort, as published in the info text
  qslInfo: string;
  info: string;
  source: "NG3K ADXO";
}

// ─── HTML parsing (regex-based — the edge runtime has no DOMParser) ─────────

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text.replace(
    /&(#x?[0-9a-f]+|[a-z]+);/gi,
    (whole, entity: string) => {
      const lower = entity.toLowerCase();
      if (lower.startsWith("#x")) {
        const code = parseInt(lower.slice(2), 16);
        return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
      }
      if (lower.startsWith("#")) {
        const code = parseInt(lower.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
      }
      return NAMED_ENTITIES[lower] ?? whole;
    },
  );
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

const MONTHS: Record<string, string> = {
  Jan: "01",
  Feb: "02",
  Mar: "03",
  Apr: "04",
  May: "05",
  Jun: "06",
  Jul: "07",
  Aug: "08",
  Sep: "09",
  Oct: "10",
  Nov: "11",
  Dec: "12",
};

/** Parses ADXO's "YYYY Mon<DD>" date cells (no space before the day). */
export function parseAdxoDate(raw: string): string | null {
  const text = stripTags(raw);
  const match = /^(\d{4})\s+([A-Za-z]{3})(\d{1,2})$/.exec(text);
  if (!match) return null;
  const [, year, monthAbbrRaw, day] = match;
  const monthKey =
    monthAbbrRaw.slice(0, 1).toUpperCase() + monthAbbrRaw.slice(1).toLowerCase();
  const month = MONTHS[monthKey];
  if (!month) return null;
  const dayNum = Number(day);
  if (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > 31) return null;
  return `${year}-${month}-${day.padStart(2, "0")}`;
}

/** Best-effort band-plan extraction (e.g. "160-6m", "40 20 15 10m"). */
function extractBands(info: string): string {
  const match = /\b\d{1,3}(?:[\s-]\d{1,3})*m\b/.exec(info);
  return match ? match[0] : "";
}

// AM/FM are matched case-sensitively (uppercase only): NG3K's info text
// commonly uses lowercase "fm"/"am" as shorthand for "from"/"at", which
// would otherwise be misread as the voice modes.
const MODE_TOKENS_CASE_INSENSITIVE = [
  "CW",
  "SSB",
  "FT8",
  "FT4",
  "RTTY",
  "PSK31",
  "PSK",
  "SSTV",
];
const MODE_TOKENS_CASE_SENSITIVE = ["AM", "FM"];
const MODES_CI_RE = new RegExp(
  `\\b(${MODE_TOKENS_CASE_INSENSITIVE.join("|")})\\b`,
  "gi",
);
const MODES_CS_RE = new RegExp(
  `\\b(${MODE_TOKENS_CASE_SENSITIVE.join("|")})\\b`,
  "g",
);

/** Best-effort mode extraction from the free-text info cell. */
function extractModes(info: string): string {
  const matches: { index: number; mode: string }[] = [];
  for (const match of info.matchAll(MODES_CI_RE)) {
    matches.push({ index: match.index ?? 0, mode: match[0].toUpperCase() });
  }
  for (const match of info.matchAll(MODES_CS_RE)) {
    matches.push({ index: match.index ?? 0, mode: match[0] });
  }
  matches.sort((a, b) => a.index - b.index);
  const found: string[] = [];
  for (const { mode } of matches) {
    if (!found.includes(mode)) found.push(mode);
  }
  return found.join(" ");
}

function firstTagContent(row: string, className: string): string | null {
  const match = new RegExp(
    `<td class="${className}"[^>]*>([\\s\\S]*?)</td>`,
    "i",
  ).exec(row);
  return match ? match[1] : null;
}

const ROW_RE = /<tr class="adxoitem"[^>]*>([\s\S]*?)<\/tr>/gi;
const DATE_CELL_RE = /<td class="date"[^>]*>([\s\S]*?)<\/td>/gi;
const CALL_SPAN_RE = /<span class="call"[^>]*>([\s\S]*?)<\/span>/i;

/**
 * Parses the ADXO HTML table into normalized entries. Malformed rows are
 * skipped individually; a row is only kept if it has both dates, an entity
 * name, and a callsign. Bands/modes are best-effort extractions from the
 * free-text info cell since ADXO has no dedicated columns for them.
 */
export function parseAdxoHtml(html: string): DxpeditionEntry[] {
  if (typeof html !== "string" || html.length === 0) return [];

  const entries: DxpeditionEntry[] = [];
  let rowMatch: RegExpExecArray | null;
  ROW_RE.lastIndex = 0;

  while ((rowMatch = ROW_RE.exec(html)) !== null) {
    const row = rowMatch[1];
    try {
      const dateCells = [...row.matchAll(DATE_CELL_RE)];
      if (dateCells.length < 2) continue;

      const startDate = parseAdxoDate(dateCells[0][1]);
      const endDate = parseAdxoDate(dateCells[1][1]);
      if (!startDate || !endDate) continue;

      const entityRaw = firstTagContent(row, "cty");
      const entity = entityRaw ? stripTags(entityRaw) : "";
      if (!entity) continue;

      const callSpanMatch = CALL_SPAN_RE.exec(row);
      const callsign = callSpanMatch ? stripTags(callSpanMatch[1]) : "";
      if (!callsign) continue;

      const qslRaw = firstTagContent(row, "qsl");
      const qslInfo = qslRaw ? stripTags(qslRaw) : "";

      const infoRaw = firstTagContent(row, "info");
      const info = infoRaw ? stripTags(infoRaw) : "";

      entries.push({
        callsign,
        entity,
        startDate,
        endDate,
        bands: extractBands(info),
        modes: extractModes(info),
        qslInfo,
        info,
        source: "NG3K ADXO",
      });
    } catch {
      // Skip malformed rows rather than failing the whole response.
      continue;
    }
  }

  return entries;
}

/** Drops entries whose end date has already passed, sorts by start date. */
export function filterAndSortDxpeditions(
  entries: DxpeditionEntry[],
  todayIso: string,
): DxpeditionEntry[] {
  return entries
    .filter((entry) => entry.endDate >= todayIso)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

// ─── Fetch with capped body ──────────────────────────────────────────────────

class DxpeditionPageTooLargeError extends Error {}

async function readCapped(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) throw new DxpeditionPageTooLargeError();
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new DxpeditionPageTooLargeError();
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8").decode(merged);
}

// ─── GET /api/dx/dxpeditions ─────────────────────────────────────────────────

function degradedResponse(
  corsHeaders: Record<string, string>,
  status: "unreachable" | "too_large" | "empty",
): Response {
  return new Response(JSON.stringify({ status, dxpeditions: [] }), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
    },
  });
}

export async function handleDxDxpeditions(request: Request): Promise<Response> {
  const origin = getAllowedOrigin();
  const corsHeaders = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const limited = applyRateLimit(request, "dx/dxpeditions", 6, 600);
  if (limited) return limited;

  try {
    const response = await fetch(ADXO_URL, {
      signal: AbortSignal.timeout(15_000),
      headers: {
        Accept: "text/html",
        "User-Agent": "Propulse/1.0 (Ham Radio Dashboard)",
      },
    });

    if (!response.ok) {
      return degradedResponse(corsHeaders, "unreachable");
    }

    const html = await readCapped(response);
    const parsed = parseAdxoHtml(html);
    const todayIso = new Date().toISOString().slice(0, 10);
    const dxpeditions = filterAndSortDxpeditions(parsed, todayIso);

    if (dxpeditions.length === 0) {
      return degradedResponse(corsHeaders, "empty");
    }

    return new Response(JSON.stringify({ status: "ok", dxpeditions }), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "s-maxage=21600, stale-while-revalidate=21600",
      },
    });
  } catch (error) {
    if (error instanceof DxpeditionPageTooLargeError) {
      return degradedResponse(corsHeaders, "too_large");
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`DXpeditions fetch failed: ${message}`);
    return degradedResponse(corsHeaders, "unreachable");
  }
}
