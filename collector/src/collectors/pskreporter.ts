import type { SupabaseClient } from "@supabase/supabase-js";
import type { NormalizedSpot } from "../types.js";
import { frequencyToBand } from "../transforms/bands.js";
import { resolveGrid } from "../transforms/normalize.js";
import { log } from "../logger.js";
import { reportHealth } from "../health.js";
import { insertSpots, reportToDb } from "../lib/db-helpers.js";

const PSK_URL =
  "https://retrieve.pskreporter.info/query?flowStartSeconds=-900&rronly=1&noactive=1";

const USER_AGENT = "Propulse-Collector/1.0";

// ---------------------------------------------------------------------------
// XML attribute parser (no DOM parser in lean Node service)
// ---------------------------------------------------------------------------

function getAttr(element: string, name: string): string | undefined {
  const regex = new RegExp(`${name}=["']([^"']*)["']`);
  const match = element.match(regex);
  return match ? match[1] : undefined;
}

// ---------------------------------------------------------------------------
// Main collector
// ---------------------------------------------------------------------------

export async function collectPskReporter(db: SupabaseClient): Promise<void> {
  const start = Date.now();
  let count = 0;

  try {
    log("info", "PSKReporter: fetching spots");

    const response = await fetch(PSK_URL, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const xml = await response.text();

    // Match all <receptionReport ... /> elements
    const elementRegex = /<receptionReport\s+([^>]*)\/?>/gi;
    const spots: NormalizedSpot[] = [];
    let match: RegExpExecArray | null;

    while ((match = elementRegex.exec(xml)) !== null) {
      const attrs = match[0];

      const senderCallsign = getAttr(attrs, "senderCallsign");
      const receiverCallsign = getAttr(attrs, "receiverCallsign");
      const frequencyStr = getAttr(attrs, "frequency");
      const flowStartStr = getAttr(attrs, "flowStartSeconds");

      if (!senderCallsign || !receiverCallsign || !frequencyStr) continue;

      const frequencyHz = parseInt(frequencyStr, 10);
      if (isNaN(frequencyHz)) continue;

      const frequencyKhz = frequencyHz / 1000;
      const band = frequencyToBand(frequencyKhz);
      if (!band) continue; // Non-HF, skip

      const flowStart = parseInt(flowStartStr || "0", 10);
      const spottedAt =
        isNaN(flowStart) || flowStart === 0
          ? new Date().toISOString()
          : new Date(flowStart * 1000).toISOString();

      const snrStr = getAttr(attrs, "sNR");
      const snr =
        snrStr !== undefined && snrStr !== "" ? parseInt(snrStr, 10) : null;

      const txGrid = resolveGrid(getAttr(attrs, "senderLocator"));
      const rxGrid = resolveGrid(getAttr(attrs, "receiverLocator"));

      spots.push({
        source: "pskreporter",
        spotted_at: spottedAt,
        tx_callsign: senderCallsign,
        tx_grid: txGrid.grid,
        tx_lat: txGrid.lat,
        tx_lon: txGrid.lon,
        rx_callsign: receiverCallsign,
        rx_grid: rxGrid.grid,
        rx_lat: rxGrid.lat,
        rx_lon: rxGrid.lon,
        frequency_khz: Math.round(frequencyKhz * 10) / 10,
        band,
        mode: getAttr(attrs, "mode") || "FT8",
        snr: snr !== null && !isNaN(snr) ? snr : null,
        wpm: null,
        comment: null,
        dxcc: null,
        continent: null,
      });
    }

    count = await insertSpots(db, spots, "pskreporter");

    const durationMs = Date.now() - start;
    reportHealth("pskreporter", "ok", count);
    reportToDb(db, "pskreporter", "ok", count, durationMs);
    log("info", "PSKReporter: collection complete", {
      spots: count,
      durationMs,
    });
  } catch (err) {
    const durationMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    reportHealth("pskreporter", "error", count);
    reportToDb(db, "pskreporter", "error", count, durationMs, message);
    log("error", "PSKReporter: collection failed", { error: message });
  }
}
