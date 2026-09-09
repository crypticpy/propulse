-- Make every existing path-recency producer fail closed on a known source gap
-- without replaying a stale copy of the evolving recency algorithm. Patch only
-- one of the two reviewed function bodies and preserve its complete definition.
DO $$
DECLARE
  target_oid oid;
  body text;
  definition text;
  body_hash text;
  assignment_anchor constant text := 'v_hour := date_trunc(''hour'', p_hour);';
  delete_anchor constant text := '  DELETE FROM public.path_recency_hourly';
  guard_sql constant text := $guard$  IF p_hour IS NULL OR NOT isfinite(p_hour)
    OR p_hour IS DISTINCT FROM date_trunc('hour', p_hour, 'UTC') THEN
    RAISE EXCEPTION 'path recency hour must be a finite UTC-aligned whole hour';
  END IF;
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'path recency recovery requires read committed isolation';
  END IF;

  -- Serialize the evidence check and derived write against new gap records.
  -- The following query receives a fresh READ COMMITTED snapshot after a wait.
  PERFORM pg_advisory_xact_lock_shared(584, 5);
  IF EXISTS (
    SELECT 1
    FROM public.collector_aggregation_gaps AS gap
    WHERE gap.aggregation = 'path_hourly'
      AND gap.start_hour <= v_hour
      AND gap.end_hour >= v_hour
  ) THEN
    RAISE EXCEPTION 'path recency source hour is a known aggregation gap';
  END IF;

$guard$;
BEGIN
  SELECT function_row.oid, function_row.prosrc
  INTO target_oid, body
  FROM pg_catalog.pg_proc AS function_row
  JOIN pg_catalog.pg_namespace AS namespace_row
    ON namespace_row.oid = function_row.pronamespace
  WHERE namespace_row.nspname = 'public'
    AND function_row.proname = 'compute_path_recency_hourly'
    AND function_row.prokind = 'f'
    AND function_row.proargtypes = '1184 25'::oidvector;

  IF target_oid IS NULL THEN
    RAISE EXCEPTION 'compute_path_recency_hourly(timestamptz,text) was not found';
  END IF;

  body_hash := md5(body);
  IF body_hash NOT IN (
    'eae214dfb5eacdda241b1b576308220f',
    '911af8084d008079ae493ec16c1141d2'
  ) THEN
    RAISE EXCEPTION 'unsupported compute_path_recency_hourly body hash: %', body_hash;
  END IF;

  definition := pg_catalog.pg_get_functiondef(target_oid);
  IF (length(definition) - length(replace(definition, assignment_anchor, '')))
       / length(assignment_anchor) <> 1 THEN
    RAISE EXCEPTION 'compute_path_recency_hourly UTC assignment anchor is not unique';
  END IF;
  IF (length(definition) - length(replace(definition, delete_anchor, '')))
       / length(delete_anchor) <> 1 THEN
    RAISE EXCEPTION 'compute_path_recency_hourly mutation anchor is not unique';
  END IF;

  definition := replace(
    definition,
    assignment_anchor,
    'v_hour := date_trunc(''hour'', p_hour, ''UTC'');'
  );
  definition := replace(definition, delete_anchor, guard_sql || delete_anchor);
  EXECUTE definition;
END;
$$;

NOTIFY pgrst, 'reload schema';
