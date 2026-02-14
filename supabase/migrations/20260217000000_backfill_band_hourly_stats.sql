-- Backfill band_hourly_stats with accurate counts from spot_history.
-- Processes one hour at a time to avoid exhausting temp disk on large tables.
-- Safe to re-run (idempotent via ON CONFLICT ... DO UPDATE).

SET statement_timeout = '1800s'; -- 30 min for full backfill

DO $$
DECLARE
  h_start timestamptz;
  h_end   timestamptz;
  t_start timestamptz := '2026-02-10T00:00:00Z';
  t_end   timestamptz := date_trunc('hour', now());
  hours_done int := 0;
BEGIN
  h_start := t_start;

  WHILE h_start < t_end LOOP
    h_end := h_start + interval '1 hour';

    -- Aggregate spots for this single hour across all bands
    INSERT INTO band_hourly_stats (
      hour_utc, band, spot_count, unique_tx, unique_rx,
      avg_snr, min_snr, max_snr, median_snr,
      mode_counts, source_counts,
      unique_grids_tx, unique_grids_rx,
      kp_index, sfi, bz_gsm, bt
    )
    SELECT
      h_start,
      s.band,
      s.spot_count,
      s.unique_tx,
      s.unique_rx,
      s.avg_snr,
      s.min_snr,
      s.max_snr,
      s.median_snr,
      COALESCE(m.mode_counts, '{}'::jsonb),
      COALESCE(sc.source_counts, '{}'::jsonb),
      s.unique_grids_tx,
      s.unique_grids_rx,
      sol.kp_index,
      sol.sfi,
      sol.bz_gsm,
      sol.bt
    FROM (
      -- Core spot aggregation for this hour
      SELECT
        band,
        count(*)::integer AS spot_count,
        count(DISTINCT tx_callsign)::integer AS unique_tx,
        count(DISTINCT rx_callsign)::integer AS unique_rx,
        round(avg(snr)::numeric, 1)::real AS avg_snr,
        min(snr)::smallint AS min_snr,
        max(snr)::smallint AS max_snr,
        (percentile_cont(0.5) WITHIN GROUP (ORDER BY snr))::real AS median_snr,
        count(DISTINCT tx_grid) FILTER (WHERE tx_grid IS NOT NULL)::integer AS unique_grids_tx,
        count(DISTINCT rx_grid) FILTER (WHERE rx_grid IS NOT NULL)::integer AS unique_grids_rx
      FROM spot_history
      WHERE spotted_at >= h_start AND spotted_at < h_end
      GROUP BY band
    ) s
    LEFT JOIN LATERAL (
      -- Mode breakdown for this band+hour
      SELECT jsonb_object_agg(sub.mode, sub.cnt) AS mode_counts
      FROM (
        SELECT mode, count(*)::integer AS cnt
        FROM spot_history
        WHERE spotted_at >= h_start AND spotted_at < h_end
          AND band = s.band AND mode IS NOT NULL
        GROUP BY mode
      ) sub
    ) m ON true
    LEFT JOIN LATERAL (
      -- Source breakdown for this band+hour
      SELECT jsonb_object_agg(sub.source, sub.cnt) AS source_counts
      FROM (
        SELECT source, count(*)::integer AS cnt
        FROM spot_history
        WHERE spotted_at >= h_start AND spotted_at < h_end
          AND band = s.band
        GROUP BY source
      ) sub
    ) sc ON true
    CROSS JOIN LATERAL (
      -- Solar snapshot closest to end of hour
      SELECT
        COALESCE(snap.kp_index, NULL) AS kp_index,
        COALESCE(snap.sfi, NULL) AS sfi,
        COALESCE(snap.bz_gsm, NULL) AS bz_gsm,
        COALESCE(snap.bt, NULL) AS bt
      FROM (
        SELECT kp_index, sfi, bz_gsm, bt
        FROM solar_snapshots
        WHERE captured_at >= h_start AND captured_at < h_end
        ORDER BY captured_at DESC
        LIMIT 1
      ) snap
      UNION ALL
      SELECT NULL, NULL, NULL, NULL
      LIMIT 1
    ) sol
    ON CONFLICT (hour_utc, band) DO UPDATE SET
      spot_count = EXCLUDED.spot_count,
      unique_tx = EXCLUDED.unique_tx,
      unique_rx = EXCLUDED.unique_rx,
      avg_snr = EXCLUDED.avg_snr,
      min_snr = EXCLUDED.min_snr,
      max_snr = EXCLUDED.max_snr,
      median_snr = EXCLUDED.median_snr,
      mode_counts = EXCLUDED.mode_counts,
      source_counts = EXCLUDED.source_counts,
      unique_grids_tx = EXCLUDED.unique_grids_tx,
      unique_grids_rx = EXCLUDED.unique_grids_rx,
      kp_index = EXCLUDED.kp_index,
      sfi = EXCLUDED.sfi,
      bz_gsm = EXCLUDED.bz_gsm,
      bt = EXCLUDED.bt;

    hours_done := hours_done + 1;
    -- Progress logging every 24 hours processed
    IF hours_done % 24 = 0 THEN
      RAISE NOTICE 'Backfill progress: % hours done, current: %', hours_done, h_start;
    END IF;

    h_start := h_end;
  END LOOP;

  RAISE NOTICE 'Backfill complete: % hours processed', hours_done;
END $$;

RESET statement_timeout;
