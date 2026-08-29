/**
 * hourlyStats — readers for the durable propagation aggregates (M4 F0).
 *
 * `band_hourly_stats` and `path_hourly_stats` are the only durable spot data:
 * `spot_history` is a ~2h sliding window, so anything that trains, evaluates,
 * or explains a forecast reads these tables. Both are keyed by hour_utc
 * (UNIQUE(hour_utc, band) and UNIQUE(hour_utc, band, mode_class, tx_field,
 * rx_field) respectively) — there is no created_at column on either.
 *
 * The collector tables are not in the generated Database types, hence the
 * `as any` casts (same pattern as querySpotHistory and the sync modules).
 */

import { getSupabase } from "@/lib/supabase";

/** One band-hour aggregate from band_hourly_stats (UNIQUE(hour_utc, band)) */
export interface BandHourlyStatsRow {
  hour_utc: string;
  band: string;
  spot_count: number;
  unique_tx: number;
  unique_rx: number;
  avg_snr: number | null;
  min_snr: number | null;
  max_snr: number | null;
  median_snr: number | null;
  mode_counts: Record<string, number>;
  source_counts: Record<string, number>;
  unique_grids_tx: number;
  unique_grids_rx: number;
  kp_index: number | null;
  sfi: number | null;
  bz_gsm: number | null;
  by_gsm: number | null;
  bt: number | null;
  xray_flux: number | null;
  dst_index: number | null;
  proton_flux_10mev: number | null;
}

/**
 * One field-pair aggregate from path_hourly_stats
 * (UNIQUE(hour_utc, band, mode_class, tx_field, rx_field))
 */
export interface PathHourlyStatsRow {
  hour_utc: string;
  band: string;
  mode_class: string;
  tx_field: string;
  rx_field: string;
  spot_count: number;
  unique_tx: number;
  unique_rx: number;
  avg_snr: number | null;
  median_snr: number | null;
  backfilled_count: number;
}

/** Page size per PostgREST request — keeps each request under the 8s statement timeout */
export const HOURLY_STATS_PAGE_SIZE = 1000;

type PageResponse<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

/**
 * Drain a PostgREST query page by page. `buildPage` must construct a fresh
 * query for the given inclusive range (builders are single-use) with a
 * deterministic order so pages never skip or duplicate rows.
 */
async function fetchAllPages<T>(
  buildPage: (from: number, to: number) => PromiseLike<PageResponse<T>>,
  label: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += HOURLY_STATS_PAGE_SIZE) {
    const { data, error } = await buildPage(
      from,
      from + HOURLY_STATS_PAGE_SIZE - 1,
    );
    if (error) {
      throw new Error(`${label} query failed: ${error.message}`);
    }
    const page = data ?? [];
    rows.push(...page);
    if (page.length < HOURLY_STATS_PAGE_SIZE) {
      break;
    }
  }
  return rows;
}

/**
 * Query band_hourly_stats for a given band over a trailing window,
 * ordered oldest-first by hour_utc.
 *
 * @param band - Amateur band designation (e.g., "20m", "40m")
 * @param hours - Trailing window in hours (default 168 = 7 days)
 */
export async function queryBandHourlyStats(
  band: string,
  hours = 168,
): Promise<BandHourlyStatsRow[]> {
  const supabase = getSupabase();
  const since = new Date(Date.now() - hours * 3600_000).toISOString();

  return fetchAllPages<BandHourlyStatsRow>(
    (from, to) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("band_hourly_stats")
        .select("*")
        .eq("band", band)
        .gte("hour_utc", since)
        .order("hour_utc", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    "band_hourly_stats",
  );
}

export interface PathHourlyStatsQuery {
  /** Amateur band designation (e.g., "20m") */
  band: string;
  /** Trailing window in hours (default 24 — path rows fan out per field pair) */
  hours?: number;
  /** Optional mode class filter (e.g., "digital", "cw") */
  modeClass?: string;
  /** Optional 2-char Maidenhead field filter for the transmit end (e.g., "FN") */
  txField?: string;
  /** Optional 2-char Maidenhead field filter for the receive end */
  rxField?: string;
}

/**
 * Query path_hourly_stats over a trailing window, ordered oldest-first by
 * hour_utc. Field filters are normalized to the uppercase Maidenhead form
 * the collector stores.
 */
export async function queryPathHourlyStats(
  query: PathHourlyStatsQuery,
): Promise<PathHourlyStatsRow[]> {
  const supabase = getSupabase();
  const { band, hours = 24, modeClass, txField, rxField } = query;
  const since = new Date(Date.now() - hours * 3600_000).toISOString();

  return fetchAllPages<PathHourlyStatsRow>((from, to) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (supabase as any)
      .from("path_hourly_stats")
      .select("*")
      .eq("band", band)
      .gte("hour_utc", since);
    if (modeClass) {
      q = q.eq("mode_class", modeClass);
    }
    if (txField) {
      q = q.eq("tx_field", txField.toUpperCase());
    }
    if (rxField) {
      q = q.eq("rx_field", rxField.toUpperCase());
    }
    return q
      .order("hour_utc", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);
  }, "path_hourly_stats");
}
