import type { SupabaseClient } from "@supabase/supabase-js";
import type { NormalizedSpot } from "../types.js";
import { frequencyToBand } from "../transforms/bands.js";
import { gridToLatLon, isValidGrid } from "../transforms/grid.js";
import { log } from "../logger.js";
import { reportHealth } from "../health.js";
import { insertSpots, reportToDb } from "../lib/db-helpers.js";

const DXHEAT_URL = "https://dxheat.com/source/spots/?a=200";
const HAMQTH_URL = "https://www.hamqth.com/dxc_csv.php?limit=200";

const USER_AGENT = "Propulse-Collector/1.1 (contact@propulse.cloud)";

// A feed whose newest spot is older than this is considered stalled and the
// fallback source is tried (HamQTH has stalled for hours at a time).
const FRESHNESS_WINDOW_MS = 30 * 60 * 1000;

// ---------------------------------------------------------------------------
// Mode extraction from comment string
// ---------------------------------------------------------------------------

export function extractMode(comment: string): string | null {
  if (!comment) return null;
  // Tokenize on non-alphanumeric characters and match whole tokens only -
  // a substring check would false-positive "AM" inside "AMAZING" or "FM"
  // inside a callsign fragment.
  const tokens = new Set(
    comment
      .toUpperCase()
      .split(/[^A-Z0-9]+/)
      .filter(Boolean),
  );
  const modes = [
    "FT8",
    "FT4",
    "CW",
    "USB",
    "LSB",
    "SSB",
    "RTTY",
    "PSK31",
    "PSK63",
    "JT65",
    "JT9",
    "JS8",
    "DATA",
    "AM",
    "FM",
    "PHONE",
    "VOICE",
    "DV",
    "DSTAR",
    "DMR",
    "C4FM",
  ];
  for (const mode of modes) {
    if (tokens.has(mode)) return mode;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Time parsing: "HHMM YYYY-MM-DD" or "HHMM" (fallback to today UTC)
// ---------------------------------------------------------------------------

function parseHamQTHTime(timeDate: string): string {
  if (!timeDate || timeDate.trim().length === 0) {
    return new Date().toISOString();
  }

  const parts = timeDate.trim().split(/\s+/);

  if (parts.length >= 2) {
    const hhmm = parts[0];
    const dateStr = parts[1];
    const h = parseInt(hhmm.substring(0, 2), 10);
    const m = parseInt(hhmm.substring(2, 4), 10);

    if (!isNaN(h) && !isNaN(m) && dateStr.includes("-")) {
      const dateParts = dateStr.split("-");
      if (dateParts.length === 3) {
        const year = parseInt(dateParts[0], 10);
        const month = parseInt(dateParts[1], 10) - 1; // zero-indexed
        const day = parseInt(dateParts[2], 10);

        if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
          return new Date(Date.UTC(year, month, day, h, m, 0, 0)).toISOString();
        }
      }
    }
  }

  // Fallback: try HHMM only (no date part)
  if (parts.length >= 1 && /^\d{4}$/.test(parts[0])) {
    const now = new Date();
    const h = parseInt(parts[0].substring(0, 2), 10);
    const m = parseInt(parts[0].substring(2, 4), 10);
    const date = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        h,
        m,
        0,
        0,
      ),
    );
    // If parsed time is in the future, assume yesterday
    if (date.getTime() > now.getTime() + 60_000) {
      date.setUTCDate(date.getUTCDate() - 1);
    }
    return date.toISOString();
  }

  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// DXHeat time parsing: Time "19:32" + Date "20/07/26" (DD/MM/YY, UTC)
// ---------------------------------------------------------------------------

function parseDxHeatTime(time: string, date: string): string | null {
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(time?.trim() ?? "");
  const dateMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(date?.trim() ?? "");
  if (!timeMatch || !dateMatch) return null;

  const parsed = new Date(
    Date.UTC(
      2000 + parseInt(dateMatch[3], 10),
      parseInt(dateMatch[2], 10) - 1,
      parseInt(dateMatch[1], 10),
      parseInt(timeMatch[1], 10),
      parseInt(timeMatch[2], 10),
      0,
      0,
    ),
  );
  return isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

// ---------------------------------------------------------------------------
// Feed fetchers — each returns normalized spots (may be empty)
// ---------------------------------------------------------------------------

interface DxHeatSpot {
  Spotter?: string;
  Frequency?: string;
  DXCall?: string;
  Time?: string;
  Date?: string;
  Valid?: boolean;
  Comment?: string;
  Mode?: string;
  Continent_dx?: string;
  DXLocator?: string;
}

async function fetchDxHeat(): Promise<NormalizedSpot[]> {
  const response = await fetch(DXHEAT_URL, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    throw new Error(`DXHeat HTTP ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as DxHeatSpot[];
  if (!Array.isArray(payload)) {
    throw new Error("DXHeat: unexpected payload shape");
  }

  const spots: NormalizedSpot[] = [];

  for (const item of payload) {
    if (item.Valid === false) continue;

    const dx = item.DXCall?.trim();
    const spotter = item.Spotter?.trim();
    if (!dx || !spotter) continue;

    const frequencyKhz = parseFloat(item.Frequency ?? "0");
    if (isNaN(frequencyKhz) || frequencyKhz === 0) continue;

    const band = frequencyToBand(frequencyKhz);
    if (!band) continue; // Non-HF, skip

    const spottedAt = parseDxHeatTime(item.Time ?? "", item.Date ?? "");
    if (!spottedAt) continue;

    const grid = item.DXLocator?.trim().toUpperCase() || null;
    const hasGrid = grid !== null && isValidGrid(grid);
    const coords = hasGrid ? gridToLatLon(grid) : null;

    spots.push({
      source: "dxcluster",
      spotted_at: spottedAt,
      tx_callsign: dx,
      tx_grid: hasGrid ? grid : null,
      tx_lat: coords?.lat ?? null,
      tx_lon: coords?.lon ?? null,
      rx_callsign: spotter,
      rx_grid: null,
      rx_lat: null,
      rx_lon: null,
      frequency_khz: Math.round(frequencyKhz * 10) / 10,
      band,
      mode: item.Mode?.trim() || extractMode(item.Comment ?? ""),
      snr: null,
      wpm: null,
      comment: item.Comment?.trim() || null,
      dxcc: null,
      continent: item.Continent_dx?.trim() || null,
    });
  }

  return spots;
}

async function fetchHamQTH(): Promise<NormalizedSpot[]> {
  const response = await fetch(HAMQTH_URL, {
    headers: {
      Accept: "text/plain, text/csv;q=0.9",
      "User-Agent": USER_AGENT,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    throw new Error(`HamQTH HTTP ${response.status} ${response.statusText}`);
  }

  const csvText = await response.text();
  const lines = csvText.trim().split("\n");
  const spots: NormalizedSpot[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const fields = line.split("^");
    if (fields.length < 11) continue;

    const [
      spotter,
      freqStr,
      dx,
      comment,
      timeDate,
      _lotw,
      _eqsl,
      continent,
      _band,
      _country,
      dxccStr,
    ] = fields;

    // Skip header line
    if (spotter === "Spotter") continue;

    // H5: Skip rows with empty/whitespace-only callsigns
    if (!dx?.trim() || !spotter?.trim()) continue;

    const frequencyKhz = parseFloat(freqStr || "0");
    if (isNaN(frequencyKhz) || frequencyKhz === 0) continue;

    const band = frequencyToBand(frequencyKhz);
    if (!band) continue; // Non-HF, skip

    const spottedAt = parseHamQTHTime(timeDate || "");
    const mode = extractMode(comment || "");
    const dxcc = parseInt(dxccStr || "0", 10);

    spots.push({
      source: "dxcluster",
      spotted_at: spottedAt,
      tx_callsign: dx,
      tx_grid: null,
      tx_lat: null,
      tx_lon: null,
      rx_callsign: spotter,
      rx_grid: null,
      rx_lat: null,
      rx_lon: null,
      frequency_khz: Math.round(frequencyKhz * 10) / 10,
      band,
      mode,
      snr: null,
      wpm: null,
      comment: comment || null,
      dxcc: !isNaN(dxcc) && dxcc > 0 ? dxcc : null,
      continent: continent || null,
    });
  }

  return spots;
}

function newestSpotAge(spots: NormalizedSpot[]): number {
  let newest = 0;
  for (const spot of spots) {
    const t = Date.parse(spot.spotted_at);
    if (!isNaN(t) && t > newest) newest = t;
  }
  return newest === 0 ? Infinity : Date.now() - newest;
}

// ---------------------------------------------------------------------------
// Main collector — DXHeat primary, HamQTH fallback when the primary errors,
// returns nothing, or has silently stalled (newest spot outside the window).
// ---------------------------------------------------------------------------

export async function collectDxCluster(db: SupabaseClient): Promise<void> {
  const start = Date.now();
  let count = 0;

  try {
    log("info", "DXCluster: fetching spots");

    let spots: NormalizedSpot[] = [];
    let feed = "dxheat";
    try {
      spots = await fetchDxHeat();
    } catch (err) {
      log("warn", "DXCluster: DXHeat fetch failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    if (spots.length === 0 || newestSpotAge(spots) > FRESHNESS_WINDOW_MS) {
      try {
        const fallback = await fetchHamQTH();
        if (
          fallback.length > 0 &&
          newestSpotAge(fallback) < newestSpotAge(spots)
        ) {
          spots = fallback;
          feed = "hamqth";
        }
      } catch (err) {
        log("warn", "DXCluster: HamQTH fallback failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (spots.length === 0) {
      throw new Error("All DX cluster feeds returned no spots");
    }

    count = await insertSpots(db, spots, "dxcluster");

    const durationMs = Date.now() - start;
    reportHealth("dxcluster", "ok", count);
    await reportToDb(db, "dxcluster", "ok", count, durationMs);
    log("info", "DXCluster: collection complete", {
      spots: count,
      feed,
      durationMs,
    });
  } catch (err) {
    const durationMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    reportHealth("dxcluster", "error", count);
    await reportToDb(db, "dxcluster", "error", count, durationMs, message);
    log("error", "DXCluster: collection failed", { error: message });
  }
}
