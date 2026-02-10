import type { SupabaseClient } from "@supabase/supabase-js";
import type { NormalizedSpot } from "../types.js";
import { frequencyToBand } from "../transforms/bands.js";
import { resolveGrid } from "../transforms/normalize.js";
import { log } from "../logger.js";
import { reportHealth } from "../health.js";

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
// Batch insert with chunking
// ---------------------------------------------------------------------------

async function insertSpots(
  db: SupabaseClient,
  spots: NormalizedSpot[],
): Promise<number> {
  if (spots.length === 0) return 0;
  let inserted = 0;
  for (let i = 0; i < spots.length; i += 500) {
    const chunk = spots.slice(i, i + 500);
    const { error } = await db.from("spot_history").upsert(chunk, {
      onConflict: "source,tx_callsign,rx_callsign,frequency_khz,spotted_at",
      ignoreDuplicates: true,
    });
    if (error) throw new Error(`Insert failed: ${error.message}`);
    inserted += chunk.length;
  }
  return inserted;
}

// ---------------------------------------------------------------------------
// Health row (fire-and-forget)
// ---------------------------------------------------------------------------

async function reportToDb(
  db: SupabaseClient,
  source: string,
  status: string,
  spotsIngested: number,
  durationMs: number,
  errorMsg?: string,
): Promise<void> {
  await db
    .from("collector_health")
    .insert({
      source,
      status,
      spots_ingested: spotsIngested,
      duration_ms: durationMs,
      error_message: errorMsg || null,
    })
    .then(() => {}); // fire-and-forget
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

    count = await insertSpots(db, spots);

    const durationMs = Date.now() - start;
    reportHealth("pskreporter", "ok", count);
    await reportToDb(db, "pskreporter", "ok", count, durationMs);
    log("info", "PSKReporter: collection complete", {
      spots: count,
      durationMs,
    });
  } catch (err) {
    const durationMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    reportHealth("pskreporter", "error", count);
    await reportToDb(db, "pskreporter", "error", count, durationMs, message);
    log("error", "PSKReporter: collection failed", { error: message });
  }
}
