import type { SupabaseClient } from "@supabase/supabase-js";
import type { CollectorConfig } from "../types.js";
import { log } from "../logger.js";
import { HF_BANDS } from "../transforms/bands.js";

let lastComputedHour: string | null = null;

/**
 * Compute aggregated band stats for a single hour bucket.
 * This is the core logic extracted so both catch-up and normal paths share it.
 */
async function computeStatsForHour(
  db: SupabaseClient,
  hourStart: Date,
): Promise<number> {
  const hourStartISO = hourStart.toISOString();
  const hourEndISO = new Date(hourStart.getTime() + 3_600_000).toISOString();

  // Get solar snapshot closest to mid-hour
  const { data: solarRow } = await db
    .from("solar_snapshots")
    .select(
      "kp_index, sfi, bz_gsm, by_gsm, bt, xray_flux, dst_index, proton_flux_10mev",
    )
    .gte("captured_at", hourStartISO)
    .lt("captured_at", hourEndISO)
    .order("captured_at", { ascending: false })
    .limit(1)
    .single();

  let bandsProcessed = 0;

  for (const band of HF_BANDS) {
    // Paginated fetch — PostgREST defaults to 1000 rows max per request.
    // Popular bands can have 5,000-50,000+ spots per hour, so we fetch
    // in batches of 10,000 and accumulate until we get a partial page.
    const PAGE_SIZE = 10_000;
    const spots: Array<{
      tx_callsign: string;
      rx_callsign: string;
      snr: number | null;
      mode: string | null;
      source: string;
      tx_grid: string | null;
      rx_grid: string | null;
    }> = [];
    let offset = 0;
    let fetchError: string | null = null;

    while (true) {
      const { data: page, error } = await db
        .from("spot_history")
        .select("tx_callsign, rx_callsign, snr, mode, source, tx_grid, rx_grid")
        .eq("band", band)
        .gte("spotted_at", hourStartISO)
        .lt("spotted_at", hourEndISO)
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) {
        fetchError = error.message;
        break;
      }

      if (page && page.length > 0) {
        spots.push(...page);
      }

      // Partial page (or empty) means we've fetched everything
      if (!page || page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    if (fetchError) {
      log("warn", `Aggregator query failed for ${band}`, {
        error: fetchError,
      });
      continue;
    }

    if (spots.length === 0) continue;

    log("debug", `Aggregator fetched spots for ${band}`, {
      band,
      spotCount: spots.length,
      pages: Math.ceil(spots.length / PAGE_SIZE),
    });

    // Compute stats
    const txSet = new Set(spots.map((s) => s.tx_callsign));
    const rxSet = new Set(spots.map((s) => s.rx_callsign));
    const txGrids = new Set(spots.map((s) => s.tx_grid).filter(Boolean));
    const rxGrids = new Set(spots.map((s) => s.rx_grid).filter(Boolean));

    const snrs = spots.map((s) => s.snr).filter((v): v is number => v != null);
    snrs.sort((a, b) => a - b);

    const modeCounts: Record<string, number> = {};
    const sourceCounts: Record<string, number> = {};
    for (const spot of spots) {
      if (spot.mode) modeCounts[spot.mode] = (modeCounts[spot.mode] || 0) + 1;
      sourceCounts[spot.source] = (sourceCounts[spot.source] || 0) + 1;
    }

    const row = {
      hour_utc: hourStartISO,
      band,
      spot_count: spots.length,
      unique_tx: txSet.size,
      unique_rx: rxSet.size,
      avg_snr:
        snrs.length > 0
          ? Math.round((snrs.reduce((a, b) => a + b, 0) / snrs.length) * 10) /
            10
          : null,
      min_snr: snrs.length > 0 ? snrs[0] : null,
      max_snr: snrs.length > 0 ? snrs[snrs.length - 1] : null,
      median_snr: snrs.length > 0 ? snrs[Math.floor(snrs.length / 2)] : null,
      mode_counts: modeCounts,
      source_counts: sourceCounts,
      unique_grids_tx: txGrids.size,
      unique_grids_rx: rxGrids.size,
      kp_index: solarRow?.kp_index ?? null,
      sfi: solarRow?.sfi ?? null,
      bz_gsm: solarRow?.bz_gsm ?? null,
      bt: solarRow?.bt ?? null,
      by_gsm: solarRow?.by_gsm ?? null,
      xray_flux: solarRow?.xray_flux ?? null,
      dst_index: solarRow?.dst_index ?? null,
      proton_flux_10mev: solarRow?.proton_flux_10mev ?? null,
    };

    const { error: upsertError } = await db
      .from("band_hourly_stats")
      .upsert(row, { onConflict: "hour_utc,band" });

    if (upsertError) {
      log("warn", `Aggregator upsert failed for ${band}`, {
        error: upsertError.message,
      });
    } else {
      bandsProcessed++;
    }
  }

  return bandsProcessed;
}

/**
 * Resolve the effective last-computed hour.
 * On first invocation (lastComputedHour is null), query the DB for the
 * most recent hour_utc in band_hourly_stats. Returns null if the table
 * is empty (fresh deployment).
 */
async function resolveLastComputedHour(
  db: SupabaseClient,
): Promise<string | null> {
  if (lastComputedHour !== null) return lastComputedHour;

  const { data, error } = await db
    .from("band_hourly_stats")
    .select("hour_utc")
    .order("hour_utc", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    log("info", "No existing hourly stats found — starting fresh");
    return null;
  }

  const resolved = data.hour_utc as string;
  log("info", "Resolved last computed hour from DB", { hour: resolved });
  return resolved;
}

export async function computeHourlyStats(
  db: SupabaseClient,
  config?: CollectorConfig,
): Promise<void> {
  // Catch-up window matches spot retention (default 7 days)
  const maxCatchupHours = (config?.retention.spots ?? 7) * 24;

  const now = new Date();
  const currentHour = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      now.getUTCHours(),
      0,
      0,
      0,
    ),
  );
  const prevHour = new Date(currentHour.getTime() - 3_600_000);
  const prevHourISO = prevHour.toISOString();

  // Fast path: already computed this hour within current process lifetime
  if (lastComputedHour === prevHourISO) return;

  try {
    // Determine starting point for catch-up
    const effectiveLast = await resolveLastComputedHour(db);

    // Build list of hours that need computation
    const hoursToCompute: Date[] = [];

    if (effectiveLast === null) {
      // Fresh start — just compute the previous hour
      hoursToCompute.push(prevHour);
    } else {
      const lastMs = new Date(effectiveLast).getTime();
      const prevMs = prevHour.getTime();

      // Walk from (lastComputed + 1h) through prevHour
      let cursor = lastMs + 3_600_000;

      // Bound catch-up to spot retention window
      const oldestAllowed = prevMs - maxCatchupHours * 3_600_000;
      if (cursor < oldestAllowed) {
        log("warn", "Catch-up window exceeds spot retention limit, clamping", {
          retentionDays: config?.retention.spots ?? 7,
          lastComputed: effectiveLast,
          skippedHours: Math.floor((oldestAllowed - cursor) / 3_600_000),
        });
        cursor = oldestAllowed;
      }

      while (cursor <= prevMs) {
        hoursToCompute.push(new Date(cursor));
        cursor += 3_600_000;
      }
    }

    if (hoursToCompute.length === 0) {
      // Edge case: lastComputed equals prevHour already
      lastComputedHour = prevHourISO;
      return;
    }

    const isCatchUp = hoursToCompute.length > 1;
    if (isCatchUp) {
      log("info", "Hourly aggregator catch-up started", {
        missingHours: hoursToCompute.length,
        from: hoursToCompute[0].toISOString(),
        to: hoursToCompute[hoursToCompute.length - 1].toISOString(),
      });
    }

    for (let i = 0; i < hoursToCompute.length; i++) {
      const hour = hoursToCompute[i];
      const hourISO = hour.toISOString();

      if (isCatchUp) {
        log("info", "Catching up: computing hour", {
          hour: hourISO,
          remaining: hoursToCompute.length - i,
        });
      }

      const bandsProcessed = await computeStatsForHour(db, hour);

      log("info", "Hourly aggregation complete", {
        hour: hourISO,
        bandsProcessed,
      });
    }

    lastComputedHour = prevHourISO;
  } catch (err) {
    log("error", "Hourly aggregation failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
