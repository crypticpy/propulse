DO $$
DECLARE
  default_rate record;
  explicit_rate record;
  quantile record;
BEGIN
  IF to_regprocedure('public.lookup_path_recency_lags(timestamptz,text,text,text[],text,text)') IS NOT NULL
    OR to_regprocedure('public.lookup_path_recency_lags(timestamptz,text,text,text[],text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'migration created an ambiguous reader overload';
  END IF;

  -- Six supplied arguments must resolve through the seventh argument's
  -- deployed default, while an explicit rate call remains identical.
  SELECT * INTO STRICT default_rate FROM public.lookup_path_recency_lags(
    '2026-09-07T12:15:00Z', '20m', 'EM', ARRAY['FN'],
    'psk-rbn-field-recency-v2', 'field-recency-v2'
  );
  SELECT * INTO STRICT explicit_rate FROM public.lookup_path_recency_lags(
    '2026-09-07T12:15:00Z', '20m', 'EM', ARRAY['FN'],
    'psk-rbn-field-recency-v2', 'field-recency-v2', 'rate'
  );
  IF default_rate IS DISTINCT FROM explicit_rate
    OR default_rate.path_success_prev1 <> 0
    OR default_rate.path_prev1_available <> 0
    OR default_rate.path_success_prev2 <> 0.42
    OR default_rate.path_prev2_available <> 1 THEN
    RAISE EXCEPTION 'seven-argument default rate contract changed';
  END IF;

  SELECT * INTO STRICT quantile FROM public.lookup_path_recency_lags(
    '2026-09-07T12:15:00Z', '20m', 'EM', ARRAY['FN'],
    'psk-rbn-field-recency-v2', 'field-recency-v2', 'quantile'
  );
  IF quantile.path_success_prev1 <> 0
    OR quantile.path_prev1_available <> 0
    OR quantile.path_success_prev2 <> 0.24
    OR quantile.path_success_prev3 <> 0.13
    OR quantile.path_success_prev24 <> 0.04
    OR quantile.path_prev2_available <> 1 THEN
    RAISE EXCEPTION 'quantile selection or per-lag gap suppression changed';
  END IF;

  BEGIN
    PERFORM public.lookup_path_recency_lags(
      '2026-09-07T12:15:00Z', '20m', 'EM', ARRAY['FN'],
      'psk-rbn-field-recency-v2', 'field-recency-v2', 'median'
    );
    RAISE EXCEPTION 'invalid statistic accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'invalid statistic accepted' THEN RAISE; END IF;
  END;

  IF has_function_privilege('anon',
      'public.lookup_path_recency_lags(timestamptz,text,text,text[],text,text,text)', 'EXECUTE')
    OR has_function_privilege('authenticated',
      'public.lookup_path_recency_lags(timestamptz,text,text,text[],text,text,text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role',
      'public.lookup_path_recency_lags(timestamptz,text,text,text[],text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'seven-argument reader permissions changed';
  END IF;
END;
$$;

-- Exercise the exact catalog predicate used by the migration for its two
-- fail-closed states without installing either ambiguous state in production.
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
DO $$
BEGIN
  IF (to_regprocedure('public.lookup_path_recency_lags(timestamptz,text,text,text[],text,text)') IS NOT NULL)
     <> (to_regprocedure('public.lookup_path_recency_lags(timestamptz,text,text,text[],text,text,text)') IS NOT NULL) THEN
    RAISE EXCEPTION 'both-signature fixture did not reach the fail-closed state';
  END IF;
END;
$$;
DROP FUNCTION public.lookup_path_recency_lags(timestamptz,text,text,text[],text,text);
DROP FUNCTION public.lookup_path_recency_lags(timestamptz,text,text,text[],text,text,text);
DO $$
BEGIN
  IF (to_regprocedure('public.lookup_path_recency_lags(timestamptz,text,text,text[],text,text)') IS NOT NULL)
     <> (to_regprocedure('public.lookup_path_recency_lags(timestamptz,text,text,text[],text,text,text)') IS NOT NULL) THEN
    RAISE EXCEPTION 'no-signature fixture did not reach the fail-closed state';
  END IF;
END;
$$;
