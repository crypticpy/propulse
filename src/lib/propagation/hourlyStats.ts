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

/**
 * Row cap for a single-request read, matching `max_rows = 1000` in
 * supabase/config.toml. A larger cap would be clipped by PostgREST and the
 * clipped answer would look complete.
 */
export const PATH_COVERAGE_ROW_CAP = 1000;

/** The window start for a trailing query measured back from the read instant. */
function windowStart(hours: number): string {
  return new Date(Date.now() - hours * 3600_000).toISOString();
}

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
 * Query gap-filtered band_hourly_stats_readable for a trailing window,
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
        .from("band_hourly_stats_readable")
        .select("*")
        .eq("band", band)
        .gte("hour_utc", since)
        .order("hour_utc", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    "band_hourly_stats_readable",
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
  const since = windowStart(hours);

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

/**
 * One row of the coverage question: was anybody heard at this receiving field
 * on this band-hour, whatever the transmitting field?
 *
 * The row also carries the counting columns, because the rows for one
 * transmitting field are exactly the pair rows for that path. Deriving them
 * from this read instead of issuing a second query is what keeps a verdict on
 * one snapshot: two requests can straddle a collector commit, and a report
 * present in the coverage answer but missing from a separate pair answer
 * would be cached as a silent hour.
 */
export interface PathCoverageHourRow {
  hour_utc: string;
  mode_class: string;
  tx_field: string;
  spot_count: number;
  unique_tx: number;
  unique_rx: number;
  backfilled_count: number;
}

/**
 * The result of one coverage read.
 *
 * `truncated` says the cap was reached, so rows exist that this answer does
 * not contain. Paging for them would be a second request and therefore a
 * second snapshot: `compute_retained_spot_hour` replaces a whole
 * `path_hourly_stats` hour in one commit, so a page taken after it can drop
 * the pair while earlier pages still show a watched, quiet window, and the
 * verdict would be a cached zero over rows that no longer exist. One request
 * and an honest "there is more" beats two requests and a confident wrong
 * answer.
 */
export interface PathCoverageRead {
  rows: PathCoverageHourRow[];
  truncated: boolean;
}

export interface PathCoverageHoursQuery {
  band: string;
  /** 2-char Maidenhead field of the receiving end; normalized to uppercase. */
  rxField: string;
  /** Trailing window in hours (default 6, the observed-activity default). */
  hours?: number;
  /** Explicit window start (ISO-8601), pinned by the caller's issuance. */
  since?: string;
}

/**
 * Query `path_hourly_stats` for every transmitting field that reached a given
 * receiving field, so a caller can tell "nobody was listening there" from
 * "somebody was listening and heard nothing", and count its own pair out of
 * the same rows.
 *
 * The select stays narrow. This query fans over every `tx_field` for a busy
 * receiving field, so `*` would multiply the page count against the 8 s
 * statement timeout, and it would pull in the aggregate SNR columns, which no
 * consumer of this reader is allowed to use.
 */
export async function queryPathCoverageHours(
  query: PathCoverageHoursQuery,
): Promise<PathCoverageRead> {
  const supabase = getSupabase();
  const { band, rxField, hours = 6 } = query;
  const since = query.since ?? windowStart(hours);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const table = (supabase as any).from("path_hourly_stats");
  const { data, error } = await table
    .select(
      "hour_utc,mode_class,tx_field,spot_count,unique_tx,unique_rx,backfilled_count",
    )
    .eq("band", band)
    .eq("rx_field", rxField.toUpperCase())
    .gte("hour_utc", since)
    .order("hour_utc", { ascending: true })
    .order("id", { ascending: true })
    .range(0, PATH_COVERAGE_ROW_CAP - 1);

  if (error) {
    throw new Error(`path_hourly_stats query failed: ${error.message}`);
  }
  const rows = (data ?? []) as PathCoverageHourRow[];
  return { rows, truncated: rows.length >= PATH_COVERAGE_ROW_CAP };
}

/** One readable band-hour; the only column the gap witness needs. */
export interface ReadableBandHourRow {
  hour_utc: string;
}

export interface ReadableBandHoursQuery {
  band: string;
  /** Trailing window in hours (default 6). */
  hours?: number;
  /** Explicit window start (ISO-8601), pinned by the caller's issuance. */
  since?: string;
}

/**
 * Query the gap-filtered `band_hourly_stats_readable` view for the hours it
 * exposes on a band.
 *
 * This is the client's only witness of an aggregation gap.
 * `spot_aggregation_hour_readable` returns false for `'path_hourly'` by
 * construction and `collector_aggregation_gaps` grants SELECT to
 * `service_role` only, so there is no path-grain readable view to ask. Since
 * `compute_retained_spot_hour` records a gap per aggregation off the same
 * two-hour `spot_history` prune, a band-hour gap and a path-hour gap for one
 * hour come from the same event, which makes the presence of a row here the
 * honest available proxy — an approximation, not an equivalence.
 */
export async function queryReadableBandHours(
  query: ReadableBandHoursQuery,
): Promise<ReadableBandHourRow[]> {
  const supabase = getSupabase();
  const { band, hours = 6 } = query;
  const since = query.since ?? windowStart(hours);

  return fetchAllPages<ReadableBandHourRow>(
    (from, to) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("band_hourly_stats_readable")
        .select("hour_utc")
        .eq("band", band)
        .gte("hour_utc", since)
        .order("hour_utc", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    "band_hourly_stats_readable",
  );
}
