import type { SupabaseClient } from "@supabase/supabase-js";
import type { NormalizedSpot } from "../types.js";
import { frequencyToBand } from "../transforms/bands.js";
import { log } from "../logger.js";
import { reportHealth } from "../health.js";
import { insertSpots, reportToDb } from "../lib/db-helpers.js";

const DXC_URL = "https://www.hamqth.com/dxc_csv.php?limit=200";

const USER_AGENT = "Propulse-Collector/1.0";

// ---------------------------------------------------------------------------
// Mode extraction from comment string
// ---------------------------------------------------------------------------

function extractMode(comment: string): string | null {
  if (!comment) return null;
  const upper = comment.toUpperCase();
  const modes = [
    "FT8",
    "FT4",
    "CW",
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
  ];
  for (const mode of modes) {
    if (upper.includes(mode)) return mode;
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
// Main collector
// ---------------------------------------------------------------------------

export async function collectDxCluster(db: SupabaseClient): Promise<void> {
  const start = Date.now();
  let count = 0;

  try {
    log("info", "DXCluster: fetching spots");

    const response = await fetch(DXC_URL, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
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

    count = await insertSpots(db, spots, "dxcluster");

    const durationMs = Date.now() - start;
    reportHealth("dxcluster", "ok", count);
    reportToDb(db, "dxcluster", "ok", count, durationMs);
    log("info", "DXCluster: collection complete", {
      spots: count,
      durationMs,
    });
  } catch (err) {
    const durationMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    reportHealth("dxcluster", "error", count);
    reportToDb(db, "dxcluster", "error", count, durationMs, message);
    log("error", "DXCluster: collection failed", { error: message });
  }
}
