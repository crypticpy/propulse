-- #296: model forecast snapshots + mode class.
--
-- Migrations are never auto-applied to this project's Supabase instance —
-- someone must run this by hand. Every statement below is written to be
-- safe to re-run (DROP ... IF EXISTS before each re-add).
--
-- Adds two new `forecast_snapshots.source` values so the Railway inference
-- service's per-band predictions can be logged next to the existing
-- 'physics' rows (collector/src/collectors/modelSnapshot.ts):
--   'model_physics'  every path in the tick's batch used the model's
--                     physics-feature profile
--   'model_nowcast'  every path used the nowcast profile, OR a mixed batch
--                     (meta.mixed_profiles = true records the split)
--
-- Also adds `mode_class` (WSPR-calibrated model rows log 'digital'; every
-- pre-existing physics row keeps the 'all' default) and widens the
-- uniqueness key so a (hour, band, source, horizon) slot can carry one row
-- per mode class instead of exactly one row.

-- ─── source: widen the CHECK to include the model sources ─────────────────

ALTER TABLE public.forecast_snapshots
  DROP CONSTRAINT IF EXISTS forecast_snapshots_source_check;

ALTER TABLE public.forecast_snapshots
  ADD CONSTRAINT forecast_snapshots_source_check
  CHECK (source IN ('physics', 'nowcast', 'futurecast', 'model_physics', 'model_nowcast'));

-- ─── mode_class ─────────────────────────────────────────────────────────────

ALTER TABLE public.forecast_snapshots
  ADD COLUMN IF NOT EXISTS mode_class text NOT NULL DEFAULT 'all'
  CHECK (mode_class IN ('all', 'cw', 'digital', 'phone'));

COMMENT ON COLUMN public.forecast_snapshots.mode_class IS
  'Mode the row''s p_open applies to. ''all'' for the mode-agnostic physics/nowcast/futurecast rows; model rows log ''digital'' (the current model is WSPR-calibrated). Frozen per-mode station envelopes land with #303.';

COMMENT ON CONSTRAINT forecast_snapshots_source_check ON public.forecast_snapshots IS
  'physics/nowcast/futurecast = client and legacy Railway sources; model_physics/model_nowcast = the #296 reference-surface writer, keyed by the profile(s) the inference service actually used for that tick''s batch.';

-- ─── uniqueness key: (hour, band, source, horizon) -> (..., mode_class) ───

ALTER TABLE public.forecast_snapshots
  DROP CONSTRAINT IF EXISTS forecast_snapshots_hour_utc_band_source_horizon_hours_key;

ALTER TABLE public.forecast_snapshots
  DROP CONSTRAINT IF EXISTS forecast_snapshots_hour_band_source_horizon_mode_key;

ALTER TABLE public.forecast_snapshots
  ADD CONSTRAINT forecast_snapshots_hour_band_source_horizon_mode_key
  UNIQUE (hour_utc, band, source, horizon_hours, mode_class);
