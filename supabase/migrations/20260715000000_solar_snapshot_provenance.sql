-- Preserve source observation time and operational fields needed by the open
-- propagation core. captured_at remains the collector receipt time.

ALTER TABLE public.solar_snapshots
  ADD COLUMN IF NOT EXISTS bx_gsm real,
  ADD COLUMN IF NOT EXISTS solar_wind_temperature real,
  ADD COLUMN IF NOT EXISTS source_observed_at jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS source_status jsonb NOT NULL DEFAULT '{}'::jsonb;
