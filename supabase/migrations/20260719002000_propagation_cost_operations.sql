-- Durable weekly cost forecasts tied to source storage reports and manifests.

CREATE TABLE IF NOT EXISTS public.propagation_cost_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_storage_report_id uuid NOT NULL
    REFERENCES public.propagation_storage_reports(id),
  pricing_as_of date NOT NULL,
  scale_factor numeric NOT NULL CHECK (scale_factor >= 1 AND scale_factor <= 100),
  forecast jsonb NOT NULL CHECK (jsonb_typeof(forecast) = 'object'),
  assumptions jsonb NOT NULL CHECK (jsonb_typeof(assumptions) = 'object'),
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS propagation_cost_forecasts_captured_idx
  ON public.propagation_cost_forecasts(captured_at DESC);

CREATE OR REPLACE FUNCTION public.record_propagation_cost_forecast(
  p_source_storage_report_id uuid,
  p_pricing_as_of date,
  p_scale_factor numeric,
  p_forecast jsonb,
  p_assumptions jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  receipt_id uuid;
BEGIN
  IF p_source_storage_report_id IS NULL OR p_pricing_as_of IS NULL
    OR p_scale_factor < 1 OR p_scale_factor > 100
    OR jsonb_typeof(p_forecast) <> 'object'
    OR jsonb_typeof(p_assumptions) <> 'object'
    OR NOT (p_forecast ? 'current' AND p_forecast ? 'scaled')
  THEN
    RAISE EXCEPTION 'invalid propagation cost forecast';
  END IF;
  INSERT INTO public.propagation_cost_forecasts(
    source_storage_report_id, pricing_as_of, scale_factor, forecast, assumptions
  ) VALUES (
    p_source_storage_report_id, p_pricing_as_of, p_scale_factor,
    p_forecast, p_assumptions
  ) RETURNING id INTO receipt_id;
  RETURN receipt_id;
END;
$$;

ALTER TABLE public.propagation_cost_forecasts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.propagation_cost_forecasts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.propagation_cost_forecasts TO service_role;
REVOKE ALL ON FUNCTION public.record_propagation_cost_forecast(
  uuid, date, numeric, jsonb, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_propagation_cost_forecast(
  uuid, date, numeric, jsonb, jsonb
) TO service_role;

COMMENT ON TABLE public.propagation_cost_forecasts IS
  'Service-role-only weekly storage forecast receipts; pricing and assumptions are versioned inputs, not live billing truth.';
