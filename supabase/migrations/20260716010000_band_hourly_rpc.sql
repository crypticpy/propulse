-- Compute one settled band-hour entirely inside PostgreSQL. The collector used
-- to page every raw spot through Node, which was slower and memory-heavy.

CREATE TABLE IF NOT EXISTS public.collector_aggregation_watermarks (
  aggregation text PRIMARY KEY
    CHECK (aggregation IN ('band_hourly', 'path_hourly')),
  hour_utc timestamptz NOT NULL,
  rows_written integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.collector_aggregation_watermarks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.collector_aggregation_watermarks
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.collector_aggregation_watermarks
  TO service_role;

CREATE OR REPLACE FUNCTION public.record_collector_aggregation_watermark(
  p_aggregation text,
  p_hour_utc timestamptz,
  p_rows integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_aggregation NOT IN ('band_hourly', 'path_hourly') THEN
    RAISE EXCEPTION 'invalid aggregation';
  END IF;

  INSERT INTO public.collector_aggregation_watermarks AS current_watermark (
    aggregation, hour_utc, rows_written, available_at, updated_at
  ) VALUES (
    p_aggregation,
    date_trunc('hour', p_hour_utc),
    greatest(coalesce(p_rows, 0), 0),
    now(),
    now()
  )
  ON CONFLICT (aggregation) DO UPDATE SET
    hour_utc = excluded.hour_utc,
    rows_written = excluded.rows_written,
    available_at = excluded.available_at,
    updated_at = excluded.updated_at
  WHERE excluded.hour_utc >= current_watermark.hour_utc;
END;
$$;

REVOKE ALL ON FUNCTION public.record_collector_aggregation_watermark(
  text, timestamptz, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_collector_aggregation_watermark(
  text, timestamptz, integer
) TO service_role;

CREATE OR REPLACE FUNCTION public.compute_band_hourly_stats(
  hour_start timestamptz
)
RETURNS integer
LANGUAGE sql
SET statement_timeout = '120s'
AS $$
  WITH spot_base AS (
    SELECT *
    FROM public.spot_history
    WHERE spotted_at >= date_trunc('hour', hour_start)
      AND spotted_at < date_trunc('hour', hour_start) + interval '1 hour'
  ),
  core AS (
    SELECT
      band,
      count(*)::integer AS spot_count,
      count(DISTINCT tx_callsign)::integer AS unique_tx,
      count(DISTINCT rx_callsign)::integer AS unique_rx,
      round(avg(snr)::numeric, 1)::real AS avg_snr,
      min(snr)::smallint AS min_snr,
      max(snr)::smallint AS max_snr,
      (percentile_cont(0.5) WITHIN GROUP (ORDER BY snr))::real AS median_snr,
      count(DISTINCT tx_grid) FILTER (WHERE tx_grid IS NOT NULL)::integer
        AS unique_grids_tx,
      count(DISTINCT rx_grid) FILTER (WHERE rx_grid IS NOT NULL)::integer
        AS unique_grids_rx
    FROM spot_base
    GROUP BY band
  ),
  mode_counts AS (
    SELECT band, jsonb_object_agg(mode, count) AS counts
    FROM (
      SELECT band, mode, count(*)::integer AS count
      FROM spot_base
      WHERE mode IS NOT NULL
      GROUP BY band, mode
    ) grouped
    GROUP BY band
  ),
  source_counts AS (
    SELECT band, jsonb_object_agg(source, count) AS counts
    FROM (
      SELECT band, source, count(*)::integer AS count
      FROM spot_base
      GROUP BY band, source
    ) grouped
    GROUP BY band
  ),
  solar AS (
    SELECT
      kp_index, sfi, bz_gsm, bt, by_gsm, xray_flux, dst_index,
      proton_flux_10mev
    FROM public.solar_snapshots
    WHERE captured_at >= date_trunc('hour', hour_start)
      AND captured_at < date_trunc('hour', hour_start) + interval '1 hour'
    ORDER BY captured_at DESC
    LIMIT 1
  ),
  ins AS (
    INSERT INTO public.band_hourly_stats (
      hour_utc, band, spot_count, unique_tx, unique_rx,
      avg_snr, min_snr, max_snr, median_snr,
      mode_counts, source_counts, unique_grids_tx, unique_grids_rx,
      kp_index, sfi, bz_gsm, bt, by_gsm, xray_flux, dst_index,
      proton_flux_10mev
    )
    SELECT
      date_trunc('hour', hour_start),
      core.band,
      core.spot_count,
      core.unique_tx,
      core.unique_rx,
      core.avg_snr,
      core.min_snr,
      core.max_snr,
      core.median_snr,
      coalesce(mode_counts.counts, '{}'::jsonb),
      coalesce(source_counts.counts, '{}'::jsonb),
      core.unique_grids_tx,
      core.unique_grids_rx,
      solar.kp_index,
      solar.sfi,
      solar.bz_gsm,
      solar.bt,
      solar.by_gsm,
      solar.xray_flux,
      solar.dst_index,
      solar.proton_flux_10mev
    FROM core
    LEFT JOIN mode_counts USING (band)
    LEFT JOIN source_counts USING (band)
    LEFT JOIN solar ON true
    ON CONFLICT (hour_utc, band) DO UPDATE SET
      spot_count = excluded.spot_count,
      unique_tx = excluded.unique_tx,
      unique_rx = excluded.unique_rx,
      avg_snr = excluded.avg_snr,
      min_snr = excluded.min_snr,
      max_snr = excluded.max_snr,
      median_snr = excluded.median_snr,
      mode_counts = excluded.mode_counts,
      source_counts = excluded.source_counts,
      unique_grids_tx = excluded.unique_grids_tx,
      unique_grids_rx = excluded.unique_grids_rx,
      kp_index = excluded.kp_index,
      sfi = excluded.sfi,
      bz_gsm = excluded.bz_gsm,
      bt = excluded.bt,
      by_gsm = excluded.by_gsm,
      xray_flux = excluded.xray_flux,
      dst_index = excluded.dst_index,
      proton_flux_10mev = excluded.proton_flux_10mev
    RETURNING 1
  )
  SELECT count(*)::integer FROM ins;
$$;

REVOKE EXECUTE ON FUNCTION public.compute_band_hourly_stats(timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_band_hourly_stats(timestamptz)
  TO service_role;

COMMENT ON FUNCTION public.compute_band_hourly_stats(timestamptz) IS
  'Idempotently aggregates one settled UTC hour without moving raw spots through the collector.';
