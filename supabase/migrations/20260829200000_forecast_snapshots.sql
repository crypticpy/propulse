-- M4 F1: forecast snapshot logging.
--
-- Every hour the collector records what each forecast source claimed about
-- each band, so F2 can score forecasts against the band_hourly_stats ground
-- truth later. Log-don't-reconstruct: predictions are only trustworthy for
-- evaluation if they were written down before the outcome was known.
--
--   source        'physics' (client P.533 engine port), 'nowcast' or
--                 'futurecast' (Railway model service)
--   horizon_hours 0 for physics/nowcast; hours ahead for futurecast rows
--                 (the row's hour_utc is the TARGET hour being predicted)
--   p_open        probability the band is open, [0, 1]
--   meta          model version, solar inputs used, etc.

CREATE TABLE IF NOT EXISTS public.forecast_snapshots (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hour_utc       timestamptz NOT NULL,
  band           text NOT NULL,
  source         text NOT NULL CHECK (source IN ('physics', 'nowcast', 'futurecast')),
  horizon_hours  smallint NOT NULL DEFAULT 0 CHECK (horizon_hours BETWEEN 0 AND 168),
  p_open         real NOT NULL CHECK (p_open >= 0 AND p_open <= 1),
  meta           jsonb NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now(),

  UNIQUE (hour_utc, band, source, horizon_hours)
);

COMMENT ON TABLE public.forecast_snapshots IS
  'Hourly per-band forecast log (M4 F1). One row per (target hour, band, source, horizon). Written by the collector; evaluated against band_hourly_stats by the F2 eval harness.';

-- RLS: anyone can read, only service role can write (matches collector tables)
ALTER TABLE public.forecast_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON public.forecast_snapshots FOR SELECT USING (true);
CREATE POLICY "Service role insert" ON public.forecast_snapshots FOR INSERT WITH CHECK (false);

GRANT SELECT ON public.forecast_snapshots TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.forecast_snapshots TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.forecast_snapshots_id_seq TO service_role;

-- Retention: 13 months (one full seasonal cycle plus a month of slack),
-- pruned daily. Well under the ~$25/mo budget: ~5 sources×horizons ×
-- 11 bands × 24h × 395d ≈ 0.5M small rows.
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule(
  'forecast_snapshots_retention',
  '45 2 * * *',
  $$DELETE FROM public.forecast_snapshots WHERE hour_utc < now() - interval '13 months'$$
);
