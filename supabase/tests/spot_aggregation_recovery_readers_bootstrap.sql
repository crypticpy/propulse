CREATE TABLE public.collector_aggregation_gaps (
  aggregation text NOT NULL,
  start_hour timestamptz NOT NULL,
  end_hour timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.path_recency_hourly (
  hour_utc timestamptz NOT NULL,
  band text NOT NULL,
  tx_field text NOT NULL,
  rx_field text NOT NULL,
  recency_rate double precision,
  recency_quantile double precision,
  transform_version text NOT NULL,
  source_watermark timestamptz NOT NULL,
  available_at timestamptz NOT NULL
);

CREATE FUNCTION public.lookup_path_recency_lags(
  timestamptz, text, text, text[], text, text
) RETURNS TABLE (
  target_field text, path_success_prev1 double precision,
  path_success_prev2 double precision, path_success_prev3 double precision,
  path_success_prev24 double precision, path_prev1_available smallint,
  path_prev2_available smallint, path_prev3_available smallint,
  path_prev24_available smallint, source_watermark timestamptz,
  available_at timestamptz, provider text, transform_version text,
  quality_flags text[]
) LANGUAGE sql AS $$ SELECT NULL::text, 0::double precision, 0::double precision,
  0::double precision, 0::double precision, 0::smallint, 0::smallint,
  0::smallint, 0::smallint, now(), now(), ''::text, ''::text, '{}'::text[]
  WHERE false $$;

GRANT EXECUTE ON FUNCTION public.lookup_path_recency_lags(
  timestamptz, text, text, text[], text, text
) TO PUBLIC;

INSERT INTO public.path_recency_hourly
  (hour_utc, band, tx_field, rx_field, recency_rate, recency_quantile, transform_version,
   source_watermark, available_at)
VALUES
  ('2026-09-07T11:00:00Z', '20m', 'EM', 'FN', 0.91, 0.19, 'psk-rbn-field-recency-v2', '2026-09-07T12:00:00Z', '2026-09-07T11:30:00Z'),
  ('2026-09-07T10:00:00Z', '20m', 'EM', 'FN', 0.42, 0.24, 'psk-rbn-field-recency-v2', '2026-09-07T11:00:00Z', '2026-09-07T10:30:00Z'),
  ('2026-09-07T09:00:00Z', '20m', 'EM', 'FN', 0.33, 0.13, 'psk-rbn-field-recency-v2', '2026-09-07T10:00:00Z', '2026-09-07T09:30:00Z'),
  ('2026-09-06T12:00:00Z', '20m', 'EM', 'FN', 0.24, 0.04, 'psk-rbn-field-recency-v2', '2026-09-06T13:00:00Z', '2026-09-06T12:30:00Z'),
  ('2026-09-07T11:00:00Z', '20m', 'EM', 'JO', 0.81, 0.18, 'psk-rbn-field-recency-v2', '2026-09-07T12:00:00Z', '2026-09-07T11:30:00Z'),
  ('2026-09-07T10:00:00Z', '20m', 'EM', 'JO', 0.52, 0.25, 'psk-rbn-field-recency-v2', '2026-09-07T11:00:00Z', '2026-09-07T10:30:00Z');

INSERT INTO public.collector_aggregation_gaps
  (aggregation, start_hour, end_hour)
VALUES
  ('path_hourly', '2026-09-07T11:00:00Z', '2026-09-07T11:00:00Z'),
  ('band_hourly', '2026-09-07T10:00:00Z', '2026-09-07T10:00:00Z'),
  ('path_hourly', '2026-09-01T00:00:00Z', '2026-09-01T02:00:00Z');
