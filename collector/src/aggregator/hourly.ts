import type { SupabaseClient } from "@supabase/supabase-js";
import { log } from "../logger.js";
import { HF_BANDS } from "../transforms/bands.js";

let lastComputedHour: string | null = null;

export async function computeHourlyStats(db: SupabaseClient): Promise<void> {
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
  const currentHourISO = currentHour.toISOString();

  // Skip if already computed this hour
  if (lastComputedHour === prevHourISO) return;

  try {
    // Get solar snapshot closest to mid-hour
    const { data: solarRow } = await db
      .from("solar_snapshots")
      .select(
        "kp_index, sfi, bz_gsm, by_gsm, bt, xray_flux, dst_index, proton_flux_10mev",
      )
      .gte("captured_at", prevHourISO)
      .lt("captured_at", currentHourISO)
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
          .select(
            "tx_callsign, rx_callsign, snr, mode, source, tx_grid, rx_grid",
          )
          .eq("band", band)
          .gte("spotted_at", prevHourISO)
          .lt("spotted_at", currentHourISO)
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

      const snrs = spots
        .map((s) => s.snr)
        .filter((v): v is number => v != null);
      snrs.sort((a, b) => a - b);

      const modeCounts: Record<string, number> = {};
      const sourceCounts: Record<string, number> = {};
      for (const spot of spots) {
        if (spot.mode) modeCounts[spot.mode] = (modeCounts[spot.mode] || 0) + 1;
        sourceCounts[spot.source] = (sourceCounts[spot.source] || 0) + 1;
      }

      const row = {
        hour_utc: prevHourISO,
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

    lastComputedHour = prevHourISO;
    log("info", "Hourly aggregation complete", {
      hour: prevHourISO,
      bandsProcessed,
    });
  } catch (err) {
    log("error", "Hourly aggregation failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
