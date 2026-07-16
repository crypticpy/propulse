-- Private operational health for the research-only NowCast feature pipeline.
-- No source observations, station identities, paths, or credentials belong here.

CREATE TABLE IF NOT EXISTS public.propagation_research_health (
  singleton_key text PRIMARY KEY DEFAULT 'nowcast-research'
    CHECK (singleton_key = 'nowcast-research'),
  reported_at timestamptz NOT NULL,
  decision text NOT NULL CHECK (decision IN ('healthy', 'alert')),
  last_completed_target_hour timestamptz,
  continuous_completed_hours integer NOT NULL DEFAULT 0
    CHECK (continuous_completed_hours >= 0),
  completed_hours integer NOT NULL DEFAULT 0 CHECK (completed_hours >= 0),
  required_hours integer NOT NULL CHECK (required_hours >= 720),
  missing_hours integer NOT NULL DEFAULT 0 CHECK (missing_hours >= 0),
  freshness_seconds integer CHECK (freshness_seconds IS NULL OR freshness_seconds >= 0),
  alert_names text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (continuous_completed_hours <= completed_hours),
  CHECK (last_completed_target_hour IS NULL OR last_completed_target_hour <= reported_at)
);

CREATE TABLE IF NOT EXISTS public.propagation_research_alert_outbox (
  event_id text PRIMARY KEY CHECK (event_id ~ '^[0-9a-f]{64}$'),
  decision text NOT NULL CHECK (decision IN ('healthy', 'alert')),
  alert_names text[] NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
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
     OR p_completed_hours < 0
     OR p_required_hours < 720
     OR p_missing_hours < 0
     OR p_continuous_completed_hours > p_completed_hours
     OR (p_freshness_seconds IS NOT NULL AND p_freshness_seconds < 0) THEN
    RAISE EXCEPTION 'invalid research health counters';
  END IF;
  IF cardinality(coalesce(p_alert_names, '{}')) > 32 THEN
    RAISE EXCEPTION 'too many research health alerts';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.unnest(coalesce(p_alert_names, '{}')) AS alert_value(alert_name)
    WHERE alert_name !~ '^[a-z0-9_]{1,64}$'
  ) THEN
    RAISE EXCEPTION 'invalid research health alert name';
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
    )
    ON CONFLICT (event_id) DO NOTHING;
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

GRANT SELECT, INSERT, UPDATE ON public.propagation_research_health TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.propagation_research_alert_outbox TO service_role;
GRANT EXECUTE ON FUNCTION public.record_propagation_research_health(
  text, timestamptz, text, timestamptz, integer, integer, integer, integer,
  integer, text[]
) TO service_role;

COMMENT ON TABLE public.propagation_research_health IS
  'Service-role-only aggregate health for the research NowCast pipeline; contains no station or path data.';
COMMENT ON TABLE public.propagation_research_alert_outbox IS
  'Retryable aggregate alert transitions for the research NowCast pipeline.';
