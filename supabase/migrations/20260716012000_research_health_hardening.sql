-- Harden the already-deployed private research-health boundary and serialize
-- alert delivery with short, renewable-by-reclaim leases.

CREATE OR REPLACE FUNCTION public.propagation_research_alert_names_valid(
  p_names text[]
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT coalesce(
    p_names IS NOT NULL
    AND pg_catalog.cardinality(p_names) <= 32
    AND pg_catalog.array_position(p_names, NULL) IS NULL
    AND pg_catalog.cardinality(p_names) = (
      SELECT count(DISTINCT item.alert_name)
      FROM pg_catalog.unnest(p_names) AS item(alert_name)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.unnest(p_names) AS item(alert_name)
      WHERE NOT item.alert_name = ANY (ARRAY[
        'health_record_parseable',
        'health_status_healthy',
        'zero_consecutive_failures',
        'health_record_recent',
        'latest_settled_hour_complete',
        'source_freshness_within_limit',
        'receipt_continuity_positive',
        'target_hour_utc_aligned',
        'runtime_storage_bounded',
        'worker_job_loaded',
        'worker_job_clean_or_running',
        'shadow_rollup_operational_healthy'
      ]::text[])
    ),
    false
  );
$$;

ALTER TABLE public.propagation_research_alert_outbox
  ADD COLUMN IF NOT EXISTS lease_token uuid,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;

ALTER TABLE public.propagation_research_health
  DROP CONSTRAINT IF EXISTS propagation_research_health_alert_names_valid,
  DROP CONSTRAINT IF EXISTS propagation_research_health_decision_alerts_match,
  DROP CONSTRAINT IF EXISTS propagation_research_health_counter_bounds;
ALTER TABLE public.propagation_research_health
  ADD CONSTRAINT propagation_research_health_alert_names_valid
    CHECK (public.propagation_research_alert_names_valid(alert_names)),
  ADD CONSTRAINT propagation_research_health_decision_alerts_match CHECK (
    (decision = 'healthy' AND pg_catalog.cardinality(alert_names) = 0)
    OR (decision = 'alert' AND pg_catalog.cardinality(alert_names) > 0)
  ),
  ADD CONSTRAINT propagation_research_health_counter_bounds CHECK (
    continuous_completed_hours BETWEEN 0 AND 100000
    AND completed_hours BETWEEN 0 AND 100000
    AND required_hours BETWEEN 720 AND 100000
    AND missing_hours BETWEEN 0 AND 100000
    AND (freshness_seconds IS NULL OR freshness_seconds BETWEEN 0 AND 604800)
  );

ALTER TABLE public.propagation_research_alert_outbox
  DROP CONSTRAINT IF EXISTS propagation_research_outbox_alert_names_valid,
  DROP CONSTRAINT IF EXISTS propagation_research_outbox_decision_alerts_match,
  DROP CONSTRAINT IF EXISTS propagation_research_outbox_lease_pair,
  DROP CONSTRAINT IF EXISTS propagation_research_outbox_attempt_bounds,
  DROP CONSTRAINT IF EXISTS propagation_research_outbox_error_bounds;
ALTER TABLE public.propagation_research_alert_outbox
  ADD CONSTRAINT propagation_research_outbox_alert_names_valid
    CHECK (public.propagation_research_alert_names_valid(alert_names)),
  ADD CONSTRAINT propagation_research_outbox_decision_alerts_match CHECK (
    (decision = 'healthy' AND pg_catalog.cardinality(alert_names) = 0)
    OR (decision = 'alert' AND pg_catalog.cardinality(alert_names) > 0)
  ),
  ADD CONSTRAINT propagation_research_outbox_lease_pair CHECK (
    (lease_token IS NULL) = (lease_expires_at IS NULL)
    AND (delivered_at IS NULL OR lease_token IS NULL)
  ),
  ADD CONSTRAINT propagation_research_outbox_attempt_bounds
    CHECK (attempts BETWEEN 0 AND 100000),
  ADD CONSTRAINT propagation_research_outbox_error_bounds
    CHECK (last_error IS NULL OR length(last_error) <= 128);

CREATE OR REPLACE FUNCTION public.record_propagation_research_health(
  p_event_id text,
  p_reported_at timestamptz,
  p_decision text,
  p_last_completed_target_hour timestamptz,
  p_continuous_completed_hours integer,
  p_completed_hours integer,
  p_required_hours integer,
  p_missing_hours integer,
  p_freshness_seconds integer,
  p_alert_names text[]
)
RETURNS TABLE (accepted boolean, state_changed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  previous_decision text;
  previous_reported_at timestamptz;
  changed boolean;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('propagation-research-health')
  );
  IF p_event_id !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid research health event id';
  END IF;
  IF p_decision NOT IN ('healthy', 'alert') THEN
    RAISE EXCEPTION 'invalid research health decision';
  END IF;
  IF p_reported_at < now() - interval '10 minutes'
     OR p_reported_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'research health timestamp outside acceptance window';
  END IF;
  IF p_continuous_completed_hours < 0
     OR p_continuous_completed_hours > 100000
     OR p_completed_hours < 0
     OR p_completed_hours > 100000
     OR p_required_hours < 720
     OR p_required_hours > 100000
     OR p_missing_hours < 0
     OR p_missing_hours > 100000
     OR p_continuous_completed_hours > p_completed_hours
     OR (p_freshness_seconds IS NOT NULL
         AND (p_freshness_seconds < 0 OR p_freshness_seconds > 604800)) THEN
    RAISE EXCEPTION 'invalid research health counters';
  END IF;
  IF NOT public.propagation_research_alert_names_valid(
    coalesce(p_alert_names, '{}')
  ) OR (
    p_decision = 'healthy'
    AND pg_catalog.cardinality(coalesce(p_alert_names, '{}')) <> 0
  ) OR (
    p_decision = 'alert'
    AND pg_catalog.cardinality(coalesce(p_alert_names, '{}')) = 0
  ) THEN
    RAISE EXCEPTION 'invalid research health alerts';
  END IF;

  SELECT health.decision, health.reported_at
  INTO previous_decision, previous_reported_at
  FROM public.propagation_research_health AS health
  WHERE health.singleton_key = 'nowcast-research'
  FOR UPDATE;

  IF previous_reported_at IS NOT NULL AND p_reported_at <= previous_reported_at THEN
    RETURN QUERY SELECT false, false;
    RETURN;
  END IF;

  changed := previous_decision IS NULL OR previous_decision IS DISTINCT FROM p_decision;

  INSERT INTO public.propagation_research_health (
    singleton_key,
    reported_at,
    decision,
    last_completed_target_hour,
    continuous_completed_hours,
    completed_hours,
    required_hours,
    missing_hours,
    freshness_seconds,
    alert_names,
    updated_at
  ) VALUES (
    'nowcast-research',
    p_reported_at,
    p_decision,
    p_last_completed_target_hour,
    p_continuous_completed_hours,
    p_completed_hours,
    p_required_hours,
    p_missing_hours,
    p_freshness_seconds,
    coalesce(p_alert_names, '{}'),
    now()
  )
  ON CONFLICT (singleton_key) DO UPDATE SET
    reported_at = excluded.reported_at,
    decision = excluded.decision,
    last_completed_target_hour = excluded.last_completed_target_hour,
    continuous_completed_hours = excluded.continuous_completed_hours,
    completed_hours = excluded.completed_hours,
    required_hours = excluded.required_hours,
    missing_hours = excluded.missing_hours,
    freshness_seconds = excluded.freshness_seconds,
    alert_names = excluded.alert_names,
    updated_at = now();

  IF changed AND (previous_decision IS NOT NULL OR p_decision = 'alert') THEN
    INSERT INTO public.propagation_research_alert_outbox (
      event_id,
      decision,
      alert_names,
      occurred_at
    ) VALUES (
      p_event_id,
      p_decision,
      coalesce(p_alert_names, '{}'),
      p_reported_at
    );
  END IF;

  RETURN QUERY SELECT true, changed;
END;
$$;

CREATE OR REPLACE FUNCTION public.monitor_propagation_research_health(
  p_event_id text,
  p_observed_at timestamptz,
  p_stale_seconds integer
)
RETURNS TABLE (
  evaluated boolean,
  state_changed boolean,
  heartbeat_stale boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  previous_decision text;
  source_reported_at timestamptz;
  changed boolean;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('propagation-research-health')
  );
  IF p_event_id !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid research health monitor event id';
  END IF;
  IF p_observed_at < now() - interval '10 minutes'
     OR p_observed_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'research health monitor timestamp outside acceptance window';
  END IF;
  IF p_stale_seconds < 900 OR p_stale_seconds > 86400 THEN
    RAISE EXCEPTION 'invalid research health stale boundary';
  END IF;

  SELECT health.decision, health.reported_at
  INTO previous_decision, source_reported_at
  FROM public.propagation_research_health AS health
  WHERE health.singleton_key = 'nowcast-research'
  FOR UPDATE;

  IF source_reported_at IS NULL THEN
    evaluated := false;
    state_changed := false;
    heartbeat_stale := false;
    RETURN NEXT;
    RETURN;
  END IF;

  evaluated := true;
  heartbeat_stale := p_observed_at - source_reported_at
    > pg_catalog.make_interval(secs => p_stale_seconds);
  changed := heartbeat_stale AND previous_decision IS DISTINCT FROM 'alert';
  state_changed := changed;

  IF changed THEN
    UPDATE public.propagation_research_health
    SET decision = 'alert',
        freshness_seconds = GREATEST(
          0,
          FLOOR(EXTRACT(epoch FROM p_observed_at - source_reported_at))::integer
        ),
        alert_names = ARRAY['health_record_recent']::text[],
        updated_at = now()
    WHERE singleton_key = 'nowcast-research';

    INSERT INTO public.propagation_research_alert_outbox (
      event_id,
      decision,
      alert_names,
      occurred_at
    ) VALUES (
      p_event_id,
      'alert',
      ARRAY['health_record_recent']::text[],
      p_observed_at
    );
  END IF;

  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_propagation_research_alerts(
  p_limit integer,
  p_max_attempts integer,
  p_lease_seconds integer,
  p_lease_token uuid
)
RETURNS TABLE (
  event_id text,
  decision text,
  alert_names text[],
  occurred_at timestamptz,
  attempts integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_limit < 1 OR p_limit > 5
     OR p_max_attempts < 1 OR p_max_attempts > 100
     OR p_lease_seconds < 15 OR p_lease_seconds > 120
     OR p_lease_token IS NULL THEN
    RAISE EXCEPTION 'invalid research alert claim';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT candidate.event_id
    FROM public.propagation_research_alert_outbox AS candidate
    WHERE candidate.delivered_at IS NULL
      AND candidate.attempts < p_max_attempts
      AND (
        candidate.lease_expires_at IS NULL
        OR candidate.lease_expires_at <= now()
      )
    ORDER BY candidate.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  ), claimed AS (
    UPDATE public.propagation_research_alert_outbox AS outbox
    SET lease_token = p_lease_token,
        lease_expires_at = now() + pg_catalog.make_interval(secs => p_lease_seconds)
    FROM candidates
    WHERE outbox.event_id = candidates.event_id
    RETURNING
      outbox.event_id,
      outbox.decision,
      outbox.alert_names,
      outbox.occurred_at,
      outbox.attempts
  )
  SELECT
    claimed.event_id,
    claimed.decision,
    claimed.alert_names,
    claimed.occurred_at,
    claimed.attempts
  FROM claimed;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_propagation_research_alert_attempt(
  p_event_id text,
  p_lease_token uuid,
  p_delivered_at timestamptz,
  p_last_error text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  updated_rows integer;
BEGIN
  IF p_event_id !~ '^[0-9a-f]{64}$' OR p_lease_token IS NULL THEN
    RAISE EXCEPTION 'invalid research alert completion identity';
  END IF;
  IF (p_delivered_at IS NULL) = (p_last_error IS NULL) THEN
    RAISE EXCEPTION 'research alert completion must be success or failure';
  END IF;
  IF p_delivered_at IS NOT NULL AND (
    p_delivered_at < now() - interval '10 minutes'
    OR p_delivered_at > now() + interval '5 minutes'
  ) THEN
    RAISE EXCEPTION 'research alert delivery timestamp outside acceptance window';
  END IF;
  IF p_last_error IS NOT NULL AND NOT (
    p_last_error IN ('webhook timed out', 'webhook request failed')
    OR p_last_error ~ '^webhook returned [0-9]{3}$'
  ) THEN
    RAISE EXCEPTION 'invalid research alert delivery error';
  END IF;

  UPDATE public.propagation_research_alert_outbox
  SET attempts = attempts + 1,
      delivered_at = p_delivered_at,
      last_error = p_last_error,
      lease_token = NULL,
      lease_expires_at = NULL
  WHERE event_id = p_event_id
    AND delivered_at IS NULL
    AND lease_token = p_lease_token
    AND lease_expires_at > now();
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  RETURN updated_rows = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.propagation_research_alert_names_valid(text[])
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_propagation_research_health(
  text, timestamptz, text, timestamptz, integer, integer, integer, integer,
  integer, text[]
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.monitor_propagation_research_health(
  text, timestamptz, integer
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_propagation_research_alerts(
  integer, integer, integer, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_propagation_research_alert_attempt(
  text, uuid, timestamptz, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.propagation_research_alert_names_valid(text[])
  TO service_role;
GRANT EXECUTE ON FUNCTION public.record_propagation_research_health(
  text, timestamptz, text, timestamptz, integer, integer, integer, integer,
  integer, text[]
) TO service_role;
GRANT EXECUTE ON FUNCTION public.monitor_propagation_research_health(
  text, timestamptz, integer
) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_propagation_research_alerts(
  integer, integer, integer, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_propagation_research_alert_attempt(
  text, uuid, timestamptz, text
) TO service_role;

COMMENT ON FUNCTION public.claim_propagation_research_alerts(
  integer, integer, integer, uuid
) IS 'Atomically leases pending aggregate research alerts with SKIP LOCKED.';
COMMENT ON FUNCTION public.complete_propagation_research_alert_attempt(
  text, uuid, timestamptz, text
) IS 'Completes one leased research-alert attempt without stale-worker overwrite.';
