import type { SupabaseClient } from "@supabase/supabase-js";
import type { NormalizedSpot } from "../types.js";
import { frequencyToBand } from "../transforms/bands.js";
import { log } from "../logger.js";
import { reportHealth } from "../health.js";
import { insertSpots, reportToDb } from "../lib/db-helpers.js";

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
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const data: Record<string, RBNEntry> = await response.json();
    const now = Date.now();
    const spots: NormalizedSpot[] = [];

    for (const entry of Object.values(data)) {
      // H4: Skip entries with empty/whitespace-only dxcall
      if (!entry.dxcall?.trim()) continue;

      // Parse frequency: "14 004.3" -> 14004.3
      const freqKhz = parseFloat((entry.freq || "0").replace(/\s+/g, ""));
      if (isNaN(freqKhz) || freqKhz === 0) continue;

      const band = frequencyToBand(freqKhz);
      if (!band) continue; // Non-HF, skip

      // H3: Round spotted_at to nearest 15s to stabilize across overlapping fetches
      const ageMs = (entry.age || 0) * 1000;
      const rawTs = now - ageMs;
      const roundedTs = Math.round(rawTs / 15000) * 15000;
      const spottedAt = new Date(roundedTs).toISOString();

      const mode = entry.mode || "CW";

      // One row per spotter-DX pair
      if (!entry.lsn || typeof entry.lsn !== "object") continue;

      for (const [spotterCall, snr] of Object.entries(entry.lsn)) {
        spots.push({
          source: "rbn",
          spotted_at: spottedAt,
          tx_callsign: entry.dxcall,
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

    count = await insertSpots(db, spots, "rbn");

    const durationMs = Date.now() - start;
    reportHealth("rbn", "ok", count);
    reportToDb(db, "rbn", "ok", count, durationMs);
    log("info", "RBN: collection complete", { spots: count, durationMs });
  } catch (err) {
    const durationMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    reportHealth("rbn", "error", count);
    reportToDb(db, "rbn", "error", count, durationMs, message);
    log("error", "RBN: collection failed", { error: message });
  }
}
