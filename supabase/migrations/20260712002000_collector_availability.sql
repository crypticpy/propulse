-- Operational feature availability and explicit collector outage intervals.

ALTER TABLE public.spot_history
  ADD COLUMN IF NOT EXISTS available_at timestamptz;
UPDATE public.spot_history
SET available_at = ingested_at
WHERE available_at IS NULL;
ALTER TABLE public.spot_history
  ALTER COLUMN available_at SET DEFAULT now(),
  ALTER COLUMN available_at SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.collector_source_status (
  source text PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('ok', 'error', 'warning')),
  last_attempt_at timestamptz NOT NULL,
  last_success_at timestamptz,
  rows_last_run integer NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL DEFAULT 0,
  error_message text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.collector_outages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source text NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS collector_outages_one_open_idx
  ON public.collector_outages(source) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS collector_outages_source_time_idx
  ON public.collector_outages(source, started_at DESC);

-- Backfill status and outage windows from retained health events.
INSERT INTO public.collector_source_status (
  source, status, last_attempt_at, last_success_at, rows_last_run,
  duration_ms, error_message, updated_at
)
SELECT DISTINCT ON (source)
  source,
  status,
  reported_at,
  max(reported_at) FILTER (WHERE status = 'ok') OVER (PARTITION BY source),
  coalesce(spots_ingested, 0),
  coalesce(duration_ms, 0),
  error_message,
  reported_at
FROM public.collector_health
ORDER BY source, reported_at DESC
ON CONFLICT (source) DO NOTHING;

WITH ordered AS (
  SELECT *, lag(status) OVER (PARTITION BY source ORDER BY reported_at) AS prior_status
  FROM public.collector_health
), starts AS (
  SELECT source, reported_at AS started_at, error_message
  FROM ordered
  WHERE status = 'error' AND coalesce(prior_status, 'ok') <> 'error'
)
INSERT INTO public.collector_outages(source, started_at, ended_at, reason)
SELECT starts.source, starts.started_at,
       (
         SELECT min(health.reported_at)
         FROM public.collector_health health
         WHERE health.source = starts.source
           AND health.reported_at > starts.started_at
           AND health.status = 'ok'
       ),
       starts.error_message
FROM starts
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.record_collector_source_status(
  p_source text,
  p_status text,
  p_rows integer,
  p_duration_ms integer,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_status NOT IN ('ok', 'error', 'warning') THEN
    RAISE EXCEPTION 'invalid collector status';
  END IF;

  INSERT INTO public.collector_source_status (
    source, status, last_attempt_at, last_success_at, rows_last_run,
    duration_ms, error_message, updated_at
  ) VALUES (
    p_source, p_status, now(), CASE WHEN p_status = 'ok' THEN now() END,
    greatest(coalesce(p_rows, 0), 0), greatest(coalesce(p_duration_ms, 0), 0),
    p_error, now()
  )
  ON CONFLICT (source) DO UPDATE SET
    status = excluded.status,
    last_attempt_at = excluded.last_attempt_at,
    last_success_at = CASE
      WHEN excluded.status = 'ok' THEN excluded.last_attempt_at
      ELSE collector_source_status.last_success_at
    END,
    rows_last_run = excluded.rows_last_run,
    duration_ms = excluded.duration_ms,
    error_message = excluded.error_message,
    updated_at = now();

  IF p_status = 'error' THEN
    INSERT INTO public.collector_outages(source, started_at, reason)
    VALUES (p_source, now(), p_error)
    ON CONFLICT (source) WHERE ended_at IS NULL DO NOTHING;
  ELSIF p_status = 'ok' THEN
    UPDATE public.collector_outages
    SET ended_at = now()
    WHERE source = p_source AND ended_at IS NULL;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.record_collector_source_status(text, text, integer, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_collector_source_status(text, text, integer, integer, text)
  TO service_role;

ALTER TABLE public.collector_source_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collector_outages ENABLE ROW LEVEL SECURITY;
CREATE POLICY collector_source_status_public_read
  ON public.collector_source_status FOR SELECT USING (true);
CREATE POLICY collector_outages_public_read
  ON public.collector_outages FOR SELECT USING (true);

COMMENT ON COLUMN public.spot_history.available_at IS
  'First operational availability time; ML features must require available_at <= issue_time.';
