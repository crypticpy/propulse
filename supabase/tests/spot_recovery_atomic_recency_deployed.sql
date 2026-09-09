ALTER TABLE public.path_recency_hourly ADD COLUMN recency_quantile double precision;
CREATE OR REPLACE FUNCTION public.compute_path_recency_hourly(p_hour timestamp with time zone, p_transform_version text DEFAULT 'psk-rbn-field-recency-v2'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '120s'
AS $function$
DECLARE
  v_hour timestamptz;
  v_written integer;
BEGIN
  IF p_hour IS NULL THEN
    RAISE EXCEPTION 'hour is required';
  END IF;
  IF p_transform_version IS NULL
    OR length(p_transform_version) NOT BETWEEN 1 AND 128 THEN
    RAISE EXCEPTION 'invalid transform version';
  END IF;

  v_hour := date_trunc('hour', p_hour);

  -- available_at must be >= hour_utc + 1h (see the table CHECK): refuse the
  -- in-progress hour instead of failing halfway through the insert.
  IF v_hour + interval '1 hour' > now() THEN
    RAISE EXCEPTION 'hour % is not complete yet', v_hour;
  END IF;

  DELETE FROM public.path_recency_hourly
  WHERE hour_utc = v_hour
    AND transform_version = p_transform_version;

  WITH pairs AS (
    SELECT
      stats.band,
      stats.tx_field,
      stats.rx_field,
      sum(stats.spot_count)::integer AS spots,
      coalesce(
        (sum(stats.spot_count) FILTER (WHERE stats.mode_class = 'digital')),
        0
      )::integer AS digital_spots
    FROM public.path_hourly_stats AS stats
    WHERE stats.hour_utc = v_hour
      AND stats.band IN (
        '160m', '80m', '60m', '40m', '30m',
        '20m', '17m', '15m', '12m', '10m'
      )
      AND stats.tx_field ~ '^[A-R]{2}$'
      AND stats.rx_field ~ '^[A-R]{2}$'
    GROUP BY stats.band, stats.tx_field, stats.rx_field
  ), receiver_exposure AS (
    -- One row per (band, rx_field): how many distinct tx fields anyone in
    -- rx_field heard this hour. `pairs` is already distinct per tx field,
    -- so count(*) is that distinct count.
    SELECT
      pairs.band,
      pairs.rx_field,
      count(*)::integer AS exposure,
      (count(*) FILTER (WHERE pairs.digital_spots > 0))::integer
        AS digital_exposure,
      sum(pairs.spots)::bigint AS rx_spots
    FROM pairs
    GROUP BY pairs.band, pairs.rx_field
  ), rated AS (
    SELECT
      pairs.band,
      pairs.tx_field,
      pairs.rx_field,
      1 AS heard,
      receiver_exposure.exposure,
      1::double precision / receiver_exposure.exposure AS recency_rate,
      CASE WHEN pairs.digital_spots > 0 THEN 1 ELSE 0 END AS digital_heard,
      receiver_exposure.digital_exposure,
      pairs.spots,
      receiver_exposure.rx_spots
    FROM pairs
    JOIN receiver_exposure
      ON receiver_exposure.band = pairs.band
     AND receiver_exposure.rx_field = pairs.rx_field
  ), quantiled AS (
    SELECT
      rated.*,
      percent_rank() OVER (
        PARTITION BY rated.band ORDER BY rated.recency_rate
      ) AS recency_quantile
    FROM rated
  )
  INSERT INTO public.path_recency_hourly (
    hour_utc, band, tx_field, rx_field, heard, exposure, recency_rate,
    transform_version, source_watermark, available_at,
    digital_heard, digital_exposure, spots, rx_spots, recency_quantile
  )
  SELECT
    v_hour,
    quantiled.band,
    quantiled.tx_field,
    quantiled.rx_field,
    quantiled.heard,
    quantiled.exposure,
    quantiled.recency_rate,
    p_transform_version,
    v_hour + interval '1 hour',
    now(),
    quantiled.digital_heard,
    quantiled.digital_exposure,
    quantiled.spots,
    quantiled.rx_spots,
    quantiled.recency_quantile
  FROM quantiled;

  GET DIAGNOSTICS v_written = ROW_COUNT;
  RETURN v_written;
END;
$function$

;
TRUNCATE public.recency_function_before;
INSERT INTO public.recency_function_before
SELECT p.proowner, p.proacl, p.proconfig, p.proargdefaults::text AS proargdefaults, p.pronargdefaults
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='compute_path_recency_hourly'
  AND p.proargtypes='1184 25'::oidvector;
