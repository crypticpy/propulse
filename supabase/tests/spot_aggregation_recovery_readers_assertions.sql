DO $$
DECLARE
  fn record;
  jo record;
BEGIN
  SELECT * INTO STRICT fn
  FROM public.lookup_path_recency_lags(
    '2026-09-07T12:15:00Z', '20m', 'EM', ARRAY['FN'],
    'psk-rbn-field-recency-v2', 'field-recency-v2'
  );
  IF fn.path_success_prev1 <> 0 OR fn.path_prev1_available <> 0 THEN
    RAISE EXCEPTION 'known H-1 path gap served a pre-existing derived value';
  END IF;
  IF fn.path_success_prev2 <> 0.42 OR fn.path_prev2_available <> 1
    OR fn.path_success_prev3 <> 0.33 OR fn.path_prev3_available <> 1
    OR fn.path_success_prev24 <> 0.24 OR fn.path_prev24_available <> 1 THEN
    RAISE EXCEPTION 'gap suppression changed unaffected lag values';
  END IF;
  IF fn.source_watermark <> '2026-09-07T11:00:00Z'::timestamptz
    OR fn.available_at <> '2026-09-07T10:30:00Z'::timestamptz
    OR fn.provider <> 'field-recency-v2'
    OR fn.transform_version <> 'psk-rbn-field-recency-v2'
    OR fn.quality_flags <> '{}'::text[] THEN
    RAISE EXCEPTION 'gap suppression changed lookup metadata contract';
  END IF;

  SELECT * INTO STRICT jo
  FROM public.lookup_path_recency_lags(
    '2026-09-07T12:15:00Z', '20m', 'EM', ARRAY['JO'],
    'psk-rbn-field-recency-v2', 'field-recency-v2'
  );
  IF jo.path_success_prev1 <> 0 OR jo.path_prev1_available <> 0
    OR jo.path_success_prev2 <> 0.52 OR jo.path_prev2_available <> 1 THEN
    RAISE EXCEPTION 'gap must suppress every target at that source hour only';
  END IF;

  IF has_function_privilege('anon',
      'public.lookup_path_recency_lags(timestamptz,text,text,text[],text,text)',
      'EXECUTE')
    OR has_function_privilege('authenticated',
      'public.lookup_path_recency_lags(timestamptz,text,text,text[],text,text)',
      'EXECUTE')
    OR NOT has_function_privilege('service_role',
      'public.lookup_path_recency_lags(timestamptz,text,text,text[],text,text)',
      'EXECUTE') THEN
    RAISE EXCEPTION 'path recency reader permissions changed';
  END IF;
END;
$$;

-- Switch the same disposable database from the legacy contract to the
-- deployed model-owned contract, then apply the migration a second time.
DROP FUNCTION public.lookup_path_recency_lags(
  timestamptz, text, text, text[], text, text
);
CREATE FUNCTION public.lookup_path_recency_lags(
  p_issue_time timestamptz, p_band text, p_origin_field text,
  p_target_fields text[], p_transform_version text, p_provider text,
  p_statistic text DEFAULT 'rate'::text
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
  timestamptz, text, text, text[], text, text, text
) TO PUBLIC;
