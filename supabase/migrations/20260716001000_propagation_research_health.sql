-- Private operational health for the research-only NowCast feature pipeline.
-- No source observations, station identities, paths, or credentials belong here.

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

CREATE TABLE IF NOT EXISTS public.propagation_research_health (
  singleton_key text PRIMARY KEY DEFAULT 'nowcast-research'
    CHECK (singleton_key = 'nowcast-research'),
  reported_at timestamptz NOT NULL,
  decision text NOT NULL CHECK (decision IN ('healthy', 'alert')),
  last_completed_target_hour timestamptz,
  continuous_completed_hours integer NOT NULL DEFAULT 0
    CHECK (continuous_completed_hours BETWEEN 0 AND 100000),
  completed_hours integer NOT NULL DEFAULT 0
    CHECK (completed_hours BETWEEN 0 AND 100000),
  required_hours integer NOT NULL CHECK (required_hours BETWEEN 720 AND 100000),
  missing_hours integer NOT NULL DEFAULT 0
    CHECK (missing_hours BETWEEN 0 AND 100000),
  freshness_seconds integer
    CHECK (freshness_seconds IS NULL OR freshness_seconds BETWEEN 0 AND 604800),
  alert_names text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (continuous_completed_hours <= completed_hours),
  CHECK (last_completed_target_hour IS NULL OR last_completed_target_hour <= reported_at),
  CONSTRAINT propagation_research_health_alert_names_valid
    CHECK (public.propagation_research_alert_names_valid(alert_names)),
  CONSTRAINT propagation_research_health_decision_alerts_match CHECK (
    (decision = 'healthy' AND pg_catalog.cardinality(alert_names) = 0)
    OR (decision = 'alert' AND pg_catalog.cardinality(alert_names) > 0)
  )
);

CREATE TABLE IF NOT EXISTS public.propagation_research_alert_outbox (
  event_id text PRIMARY KEY CHECK (event_id ~ '^[0-9a-f]{64}$'),
  decision text NOT NULL CHECK (decision IN ('healthy', 'alert')),
  alert_names text[] NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 100000),
  delivered_at timestamptz,
  last_error text CHECK (last_error IS NULL OR length(last_error) <= 128),
  lease_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT propagation_research_outbox_alert_names_valid
    CHECK (public.propagation_research_alert_names_valid(alert_names)),
  CONSTRAINT propagation_research_outbox_decision_alerts_match CHECK (
    (decision = 'healthy' AND pg_catalog.cardinality(alert_names) = 0)
    OR (decision = 'alert' AND pg_catalog.cardinality(alert_names) > 0)
  ),
  CONSTRAINT propagation_research_outbox_lease_pair CHECK (
    (lease_token IS NULL) = (lease_expires_at IS NULL)
    AND (delivered_at IS NULL OR lease_token IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS propagation_research_alert_pending_idx
  ON public.propagation_research_alert_outbox (created_at)
  WHERE delivered_at IS NULL;

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

ALTER TABLE public.propagation_research_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propagation_research_alert_outbox ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.propagation_research_health
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.propagation_research_alert_outbox
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_propagation_research_health(
  text, timestamptz, text, timestamptz, integer, integer, integer, integer,
  integer, text[]
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.propagation_research_alert_names_valid(text[])
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON public.propagation_research_health TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.propagation_research_alert_outbox TO service_role;
GRANT EXECUTE ON FUNCTION public.record_propagation_research_health(
  text, timestamptz, text, timestamptz, integer, integer, integer, integer,
  integer, text[]
) TO service_role;
GRANT EXECUTE ON FUNCTION public.propagation_research_alert_names_valid(text[])
  TO service_role;

COMMENT ON TABLE public.propagation_research_health IS
  'Service-role-only aggregate health for the research NowCast pipeline; contains no station or path data.';
COMMENT ON TABLE public.propagation_research_alert_outbox IS
  'Retryable aggregate alert transitions for the research NowCast pipeline.';
