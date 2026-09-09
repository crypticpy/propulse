CREATE OR REPLACE FUNCTION public.compute_path_recency_hourly(
  p_hour timestamptz,
  p_transform_version text DEFAULT 'psk-rbn-field-recency-v2'
)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET statement_timeout='120s'
AS $$ BEGIN RETURN 42; END $$;
