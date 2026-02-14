-- Backfill by_gsm, xray_flux, dst_index, proton_flux_10mev into band_hourly_stats
-- from solar_snapshots. The original backfill (20260217) ran before these columns
-- were added, so historical rows have NULLs. Hour-by-hour loop to avoid temp disk.

SET statement_timeout = '1800s';

DO $$
DECLARE
  h timestamptz;
  h_end timestamptz;
  t_start timestamptz := '2026-02-10T00:00:00Z';
  t_end timestamptz := date_trunc('hour', now());
  hours_done int := 0;
BEGIN
  h := t_start;

  WHILE h < t_end LOOP
    h_end := h + interval '1 hour';

    UPDATE band_hourly_stats bhs
    SET
      by_gsm = sol.by_gsm,
      xray_flux = sol.xray_flux,
      dst_index = sol.dst_index,
      proton_flux_10mev = sol.proton_flux_10mev
    FROM (
      SELECT kp_index, by_gsm, xray_flux, dst_index, proton_flux_10mev
      FROM solar_snapshots
      WHERE captured_at >= h AND captured_at < h_end
      ORDER BY captured_at DESC
      LIMIT 1
    ) sol
    WHERE bhs.hour_utc = h
      AND (bhs.by_gsm IS NULL OR bhs.xray_flux IS NULL
           OR bhs.dst_index IS NULL OR bhs.proton_flux_10mev IS NULL);

    hours_done := hours_done + 1;
    IF hours_done % 24 = 0 THEN
      RAISE NOTICE 'Solar backfill progress: % hours', hours_done;
    END IF;

    h := h_end;
  END LOOP;

  RAISE NOTICE 'Solar backfill complete: % hours', hours_done;
END $$;

RESET statement_timeout;
