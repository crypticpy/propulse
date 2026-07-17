-- Immutable forecast issuances for leakage-safe FutureCast training.

CREATE TABLE IF NOT EXISTS public.space_weather_forecast_payloads (
  payload_sha256 text PRIMARY KEY CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  source text NOT NULL,
  product text NOT NULL,
  issued_at timestamptz NOT NULL,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  parser_version text NOT NULL,
  source_url text NOT NULL,
  raw_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS forecast_payload_product_issue_idx
  ON public.space_weather_forecast_payloads (product, issued_at DESC);

CREATE TABLE IF NOT EXISTS public.space_weather_forecast_values (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  payload_sha256 text NOT NULL REFERENCES public.space_weather_forecast_payloads(payload_sha256) ON DELETE CASCADE,
  source text NOT NULL,
  product text NOT NULL,
  issued_at timestamptz NOT NULL,
  valid_at timestamptz NOT NULL,
  available_at timestamptz NOT NULL,
  lead_minutes integer NOT NULL CHECK (lead_minutes >= 0),
  metric text NOT NULL,
  value double precision NOT NULL,
  unit text,
  quality text NOT NULL DEFAULT 'forecast',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payload_sha256, valid_at, metric)
);

CREATE INDEX IF NOT EXISTS forecast_values_lookup_idx
  ON public.space_weather_forecast_values (product, metric, valid_at, issued_at DESC);
CREATE INDEX IF NOT EXISTS forecast_values_available_idx
  ON public.space_weather_forecast_values (available_at, valid_at);

ALTER TABLE public.space_weather_forecast_payloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.space_weather_forecast_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read forecast payload metadata" ON public.space_weather_forecast_payloads;
CREATE POLICY "Public read forecast payload metadata"
  ON public.space_weather_forecast_payloads FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Public read forecast values" ON public.space_weather_forecast_values;
CREATE POLICY "Public read forecast values"
  ON public.space_weather_forecast_values FOR SELECT
  USING (true);

-- Authenticated/browser roles are read-only. The service role bypasses RLS.
GRANT SELECT ON public.space_weather_forecast_payloads TO anon, authenticated;
GRANT SELECT ON public.space_weather_forecast_values TO anon, authenticated;

COMMENT ON TABLE public.space_weather_forecast_payloads IS
  'Immutable raw NOAA/GFZ forecast issuances keyed by payload SHA-256.';
COMMENT ON TABLE public.space_weather_forecast_values IS
  'Parsed forecast values with distinct issue, availability, and validity times for leakage-safe ML joins.';
