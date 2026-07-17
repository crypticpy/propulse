-- Make StationCast beta telemetry hour boundaries independent of session time zone.

ALTER TABLE public.propagation_beta_telemetry_hourly
  DROP CONSTRAINT propagation_beta_telemetry_bucket_hour_check;
ALTER TABLE public.propagation_beta_telemetry_hourly
  ADD CONSTRAINT propagation_beta_telemetry_bucket_hour_check CHECK (
    bucket_start = date_trunc('hour', bucket_start, 'UTC')
  );

CREATE OR REPLACE FUNCTION public.record_propagation_beta_telemetry(
  p_protocol_version text,
  p_observed_at timestamptz,
  p_counts jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  allowed_keys constant text[] := ARRAY[
    'requests',
    'errors',
    'integrity_errors',
    'privacy_events',
    'consent_errors',
    'subject_binding_errors',
    'stale_profile_events',
    'equipment_math_events',
    'unsupported_support_events',
    'high_confidence_overprediction_events',
    'geographic_regression_events'
  ]::text[];
  supplied_keys text[];
BEGIN
  SELECT coalesce(array_agg(key ORDER BY key), ARRAY[]::text[])
  INTO supplied_keys
  FROM jsonb_object_keys(coalesce(p_counts, '{}'::jsonb)) AS item(key);

  IF p_protocol_version IS NULL
     OR p_protocol_version !~ '^propagation-v4[.]2-stationcast-beta-[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     OR p_observed_at IS NULL
     OR jsonb_typeof(p_counts) <> 'object'
     OR cardinality(supplied_keys) < 1
     OR NOT supplied_keys <@ allowed_keys
     OR EXISTS (
       SELECT 1
       FROM jsonb_each(p_counts) AS item(key, value)
       WHERE jsonb_typeof(value) <> 'number'
          OR value::text !~ '^[0-9]+$'
          OR (value::text)::numeric > 1000000
     ) THEN
    RAISE EXCEPTION 'invalid aggregate beta telemetry increment';
  END IF;

  INSERT INTO public.propagation_beta_telemetry_hourly AS telemetry (
    protocol_version,
    bucket_start,
    requests,
    errors,
    integrity_errors,
    privacy_events,
    consent_errors,
    subject_binding_errors,
    stale_profile_events,
    equipment_math_events,
    unsupported_support_events,
    high_confidence_overprediction_events,
    geographic_regression_events,
    updated_at
  ) VALUES (
    p_protocol_version,
    date_trunc('hour', p_observed_at, 'UTC'),
    coalesce((p_counts ->> 'requests')::bigint, 0),
    coalesce((p_counts ->> 'errors')::bigint, 0),
    coalesce((p_counts ->> 'integrity_errors')::bigint, 0),
    coalesce((p_counts ->> 'privacy_events')::bigint, 0),
    coalesce((p_counts ->> 'consent_errors')::bigint, 0),
    coalesce((p_counts ->> 'subject_binding_errors')::bigint, 0),
    coalesce((p_counts ->> 'stale_profile_events')::bigint, 0),
    coalesce((p_counts ->> 'equipment_math_events')::bigint, 0),
    coalesce((p_counts ->> 'unsupported_support_events')::bigint, 0),
    coalesce((p_counts ->> 'high_confidence_overprediction_events')::bigint, 0),
    coalesce((p_counts ->> 'geographic_regression_events')::bigint, 0),
    p_observed_at
  )
  ON CONFLICT (protocol_version, bucket_start) DO UPDATE SET
    requests = telemetry.requests + excluded.requests,
    errors = telemetry.errors + excluded.errors,
    integrity_errors = telemetry.integrity_errors + excluded.integrity_errors,
    privacy_events = telemetry.privacy_events + excluded.privacy_events,
    consent_errors = telemetry.consent_errors + excluded.consent_errors,
    subject_binding_errors = telemetry.subject_binding_errors + excluded.subject_binding_errors,
    stale_profile_events = telemetry.stale_profile_events + excluded.stale_profile_events,
    equipment_math_events = telemetry.equipment_math_events + excluded.equipment_math_events,
    unsupported_support_events = telemetry.unsupported_support_events + excluded.unsupported_support_events,
    high_confidence_overprediction_events = (
      telemetry.high_confidence_overprediction_events
      + excluded.high_confidence_overprediction_events
    ),
    geographic_regression_events = (
      telemetry.geographic_regression_events
      + excluded.geographic_regression_events
    ),
    updated_at = greatest(telemetry.updated_at, excluded.updated_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_propagation_beta_api_telemetry(
  p_protocol_version text,
  p_window_start timestamptz,
  p_window_end timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF p_protocol_version IS NULL OR btrim(p_protocol_version) = ''
     OR p_window_start IS NULL OR p_window_end IS NULL
     OR p_window_end <= p_window_start
     OR p_window_end - p_window_start > interval '180 days'
     OR p_window_start <> date_trunc('hour', p_window_start, 'UTC')
     OR p_window_end <> date_trunc('hour', p_window_end, 'UTC') THEN
    RAISE EXCEPTION 'invalid aggregate beta telemetry window';
  END IF;

  SELECT jsonb_build_object(
    'schema_version', 1,
    'scope', 'stationcast_beta_api_telemetry',
    'protocol_version', p_protocol_version,
    'window', jsonb_build_object(
      'start', p_window_start,
      'end', p_window_end
    ),
    'counts', jsonb_build_object(
      'requests', coalesce(sum(requests), 0),
      'errors', coalesce(sum(errors), 0),
      'integrity_errors', coalesce(sum(integrity_errors), 0),
      'privacy_events', coalesce(sum(privacy_events), 0),
      'consent_errors', coalesce(sum(consent_errors), 0),
      'subject_binding_errors', coalesce(sum(subject_binding_errors), 0),
      'stale_profile_events', coalesce(sum(stale_profile_events), 0),
      'equipment_math_events', coalesce(sum(equipment_math_events), 0),
      'unsupported_support_events', coalesce(sum(unsupported_support_events), 0),
      'high_confidence_overprediction_events',
        coalesce(sum(high_confidence_overprediction_events), 0),
      'geographic_regression_events', coalesce(sum(geographic_regression_events), 0)
    ),
    'participant_data_present', false
  )
  INTO result
  FROM public.propagation_beta_telemetry_hourly
  WHERE protocol_version = p_protocol_version
    AND bucket_start >= p_window_start
    AND bucket_start < p_window_end;

  RETURN result;
END;
$$;
