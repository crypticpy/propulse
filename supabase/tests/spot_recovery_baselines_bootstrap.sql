CREATE EXTENSION IF NOT EXISTS dblink;

CREATE TABLE public.collector_aggregation_gaps (
  aggregation text NOT NULL,
  start_hour timestamptz NOT NULL,
  end_hour timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (aggregation, start_hour)
);
REVOKE ALL ON public.collector_aggregation_gaps FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.collector_aggregation_gaps TO service_role;

CREATE TABLE public.band_hourly_stats (band text, hour_utc timestamptz, spot_count integer);
CREATE TABLE public.region_hourly_stats (band text, continent text, hour_utc timestamptz, spot_count integer);
GRANT SELECT ON public.band_hourly_stats, public.region_hourly_stats TO anon, authenticated, service_role;
CREATE TABLE public.band_activity_climatology (
  band text, hour_of_day smallint, p25 real, p50 real, p75 real, p95 real,
  sample_count integer, computed_at timestamptz, PRIMARY KEY (band, hour_of_day)
);
CREATE TABLE public.region_activity_climatology (
  band text, continent text, hour_of_day smallint, p25 real, p50 real, p75 real, p95 real,
  sample_count integer, computed_at timestamptz, PRIMARY KEY (band, continent, hour_of_day)
);
CREATE TABLE public.callsign_fields (callsign text PRIMARY KEY, field text);
CREATE TABLE public.spot_history (
  id bigint PRIMARY KEY, band text, source text, mode text, tx_callsign text,
  rx_callsign text, spotted_at timestamptz, tx_lat double precision,
  tx_lon double precision, rx_lat double precision, rx_lon double precision,
  tx_grid text, rx_grid text, continent text
);

CREATE FUNCTION public.mode_class_of(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'DIGITAL'::text $$;
CREATE FUNCTION public.continent_for_latlon(double precision, double precision) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT NULL::text $$;
CREATE FUNCTION public.continent_for_field(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT NULL::text $$;

CREATE FUNCTION public.compute_band_activity_climatology(integer DEFAULT 90) RETURNS integer LANGUAGE sql AS $$ SELECT 0 $$;
CREATE FUNCTION public.compute_region_activity_climatology(integer DEFAULT 90) RETURNS integer LANGUAGE sql AS $$ SELECT 0 $$;
CREATE FUNCTION public.band_activity_counts() RETURNS TABLE (
  band text, count_60m integer, obs_20m integer, reporters_20m integer,
  count_10m_recent integer, count_10m_prior integer, source_counts_60m jsonb,
  mode_obs_20m jsonb, p25 real, p50 real, p75 real, p95 real, sample_count integer
) LANGUAGE sql STABLE AS $$ SELECT NULL::text, 0, 0, 0, 0, 0, '{}'::jsonb, '{}'::jsonb, NULL::real, NULL::real, NULL::real, NULL::real, 0 WHERE false $$;
CREATE FUNCTION public.region_activity_counts(text DEFAULT NULL) RETURNS TABLE (
  continent text, band text, count_60m integer, obs_20m integer, reporters_20m integer,
  count_10m_recent integer, count_10m_prior integer, source_counts_60m jsonb,
  mode_obs_20m jsonb, p25 real, p50 real, p75 real, p95 real, sample_count integer
) LANGUAGE sql STABLE AS $$ SELECT NULL::text, NULL::text, 0, 0, 0, 0, 0, '{}'::jsonb, '{}'::jsonb, NULL::real, NULL::real, NULL::real, NULL::real, 0 WHERE false $$;

REVOKE ALL ON FUNCTION public.compute_band_activity_climatology(integer), public.compute_region_activity_climatology(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_band_activity_climatology(integer), public.compute_region_activity_climatology(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.band_activity_counts(), public.region_activity_counts(text) TO anon, authenticated, service_role;
