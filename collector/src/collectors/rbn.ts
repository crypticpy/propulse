import type { SupabaseClient } from "@supabase/supabase-js";
import type { NormalizedSpot } from "../types.js";
import { frequencyToBand } from "../transforms/bands.js";
import { log } from "../logger.js";
import { reportHealth } from "../health.js";

const RBN_URL = "https://www.hamqth.com/rbn_data.php?data=1&age=900";

const USER_AGENT = "Propulse-Collector/1.0";

// ---------------------------------------------------------------------------
// Response shape from HamQTH RBN feed
// ---------------------------------------------------------------------------

interface RBNEntry {
  dxcall: string;
  freq: string; // e.g. "14 004.3"
  mode: string; // e.g. "CW", "RTTY", "PSK31"
  age: number; // seconds since last report
  lsn: Record<string, number>; // spotter callsign -> SNR
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

export async function collectRbn(db: SupabaseClient): Promise<void> {
  const start = Date.now();
  let count = 0;

  try {
    log("info", "RBN: fetching spots");

    const response = await fetch(RBN_URL, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const data: Record<string, RBNEntry> = await response.json();
    const now = Date.now();
    const spots: NormalizedSpot[] = [];

    for (const entry of Object.values(data)) {
      // Parse frequency: "14 004.3" -> 14004.3
      const freqKhz = parseFloat((entry.freq || "0").replace(/\s+/g, ""));
      if (isNaN(freqKhz) || freqKhz === 0) continue;

      const band = frequencyToBand(freqKhz);
      if (!band) continue; // Non-HF, skip

      // Compute spotted_at from age
      const ageMs = (entry.age || 0) * 1000;
      const spottedAt = new Date(now - ageMs).toISOString();

      const mode = entry.mode || "CW";

      // One row per spotter-DX pair
      if (!entry.lsn || typeof entry.lsn !== "object") continue;

      for (const [spotterCall, snr] of Object.entries(entry.lsn)) {
        spots.push({
          source: "rbn",
          spotted_at: spottedAt,
          tx_callsign: entry.dxcall || "",
          tx_grid: null,
          tx_lat: null,
          tx_lon: null,
          rx_callsign: spotterCall,
          rx_grid: null,
          rx_lat: null,
          rx_lon: null,
          frequency_khz: Math.round(freqKhz * 10) / 10,
          band,
          mode,
          snr: typeof snr === "number" ? snr : null,
          wpm: null,
          comment: null,
          dxcc: null,
          continent: null,
        });
      }
    }

    count = await insertSpots(db, spots);

    const durationMs = Date.now() - start;
    reportHealth("rbn", "ok", count);
    await reportToDb(db, "rbn", "ok", count, durationMs);
    log("info", "RBN: collection complete", { spots: count, durationMs });
  } catch (err) {
    const durationMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    reportHealth("rbn", "error", count);
    await reportToDb(db, "rbn", "error", count, durationMs, message);
    log("error", "RBN: collection failed", { error: message });
  }
}
