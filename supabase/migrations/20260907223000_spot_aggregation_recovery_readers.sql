-- Known raw-expiry gaps are authoritative for path-recency readers. Preserve
-- the existing RPC contract while making affected lags explicitly unavailable.
CREATE OR REPLACE FUNCTION public.lookup_path_recency_lags(
  p_issue_time timestamptz,
  p_band text,
  p_origin_field text,
  p_target_fields text[],
  p_transform_version text,
  p_provider text
)
RETURNS TABLE (
  target_field text,
  path_success_prev1 double precision,
  path_success_prev2 double precision,
  path_success_prev3 double precision,
  path_success_prev24 double precision,
  path_prev1_available smallint,
  path_prev2_available smallint,
  path_prev3_available smallint,
  path_prev24_available smallint,
  source_watermark timestamptz,
  available_at timestamptz,
  provider text,
  transform_version text,
  quality_flags text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_hour timestamptz;
BEGIN
  IF p_issue_time IS NULL THEN
    RAISE EXCEPTION 'issue time is required';
  END IF;
  IF p_band NOT IN (
    '160m', '80m', '60m', '40m', '30m',
    '20m', '17m', '15m', '12m', '10m'
  ) THEN
    RAISE EXCEPTION 'unsupported HF band';
  END IF;
  IF p_origin_field IS NULL OR p_origin_field !~ '^[A-R]{2}$' THEN
    RAISE EXCEPTION 'invalid origin field';
  END IF;
  IF coalesce(array_length(p_target_fields, 1), 0) NOT BETWEEN 1 AND 4096 THEN
    RAISE EXCEPTION 'target count must be between 1 and 4096';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_target_fields) AS target(value)
    WHERE value !~ '^[A-R]{2}$'
  ) THEN
    RAISE EXCEPTION 'invalid target field';
  END IF;
  IF p_transform_version IS NULL
    OR length(p_transform_version) NOT BETWEEN 1 AND 128 THEN
    RAISE EXCEPTION 'invalid transform version';
  END IF;
  IF p_provider IS NULL OR p_provider !~ '^[a-z0-9][a-z0-9_.:-]{0,63}$' THEN
    RAISE EXCEPTION 'invalid provider identifier';
  END IF;

  v_hour := date_trunc('hour', p_issue_time);

  RETURN QUERY
  WITH targets AS (
    SELECT DISTINCT value AS field
    FROM unnest(p_target_fields) AS target(value)
  ), lag_values(lag_hours) AS (
    VALUES (1), (2), (3), (24)
  ), cells AS (
    SELECT
      targets.field,
      lag_values.lag_hours,
      recency.recency_rate AS rate,
      recency.source_watermark AS watermark,
      recency.available_at AS readable_at
    FROM targets
    CROSS JOIN lag_values
    LEFT JOIN public.path_recency_hourly AS recency
      ON recency.hour_utc = v_hour
           - make_interval(hours => lag_values.lag_hours)
     AND recency.band = p_band
     AND recency.tx_field = p_origin_field
     AND recency.rx_field = targets.field
     AND recency.transform_version = p_transform_version
     AND recency.available_at <= p_issue_time
     AND recency.recency_rate IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.collector_aggregation_gaps AS gap
       WHERE gap.aggregation = 'path_hourly'
         AND recency.hour_utc BETWEEN gap.start_hour AND gap.end_hour
     )
  )
  SELECT
    cells.field,
    coalesce(
      max(cells.rate) FILTER (WHERE cells.lag_hours = 1),
      0::double precision
    ),
    coalesce(
      max(cells.rate) FILTER (WHERE cells.lag_hours = 2),
      0::double precision
    ),
    coalesce(
      max(cells.rate) FILTER (WHERE cells.lag_hours = 3),
      0::double precision
    ),
    coalesce(
      max(cells.rate) FILTER (WHERE cells.lag_hours = 24),
      0::double precision
    ),
    (CASE WHEN count(cells.rate) FILTER (WHERE cells.lag_hours = 1) > 0
          THEN 1 ELSE 0 END)::smallint,
    (CASE WHEN count(cells.rate) FILTER (WHERE cells.lag_hours = 2) > 0
          THEN 1 ELSE 0 END)::smallint,
    (CASE WHEN count(cells.rate) FILTER (WHERE cells.lag_hours = 3) > 0
          THEN 1 ELSE 0 END)::smallint,
    (CASE WHEN count(cells.rate) FILTER (WHERE cells.lag_hours = 24) > 0
          THEN 1 ELSE 0 END)::smallint,
    -- Newest coverage end among the lags that were actually readable. With
    -- nothing readable we report the H-24 bucket's coverage end, which makes
    -- the caller's freshness age ~23h and fails it closed to physics rather
    -- than dressing an empty answer up as current.
    coalesce(max(cells.watermark), v_hour - interval '23 hours'),
    coalesce(max(cells.readable_at), p_issue_time),
    p_provider,
    p_transform_version,
    '{}'::text[]
  FROM cells
  GROUP BY cells.field
  ORDER BY cells.field;
END;
$$;

COMMENT ON FUNCTION public.lookup_path_recency_lags(
  timestamptz, text, text, text[], text, text
) IS
  'Service-role-only causal H-1/H-2/H-3/H-24 field-grain recency lookup. Lags covered by a durable path_hourly raw-expiry gap are unavailable even if derived rows pre-exist.';

REVOKE EXECUTE ON FUNCTION public.lookup_path_recency_lags(
  timestamptz, text, text, text[], text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_path_recency_lags(
  timestamptz, text, text, text[], text, text
) TO service_role;

NOTIFY pgrst, 'reload schema';
