-- Off-machine stale-heartbeat transition for the private research-health path.
-- Preserve reported_at: it is the last source heartbeat, not monitor execution time.

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

REVOKE ALL ON FUNCTION public.monitor_propagation_research_health(
  text, timestamptz, integer
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.monitor_propagation_research_health(
  text, timestamptz, integer
) TO service_role;

COMMENT ON FUNCTION public.monitor_propagation_research_health(
  text, timestamptz, integer
) IS 'Service-role-only off-machine stale-heartbeat transition; preserves the last source report time.';
