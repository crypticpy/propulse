-- Enforce the two-hour live-spots window.
--
-- spot_history exists only to feed the live spots map; the product keeps
-- a ~2h sliding cache and everything older must leave the system (the
-- durable aggregates band_hourly_stats / path_hourly_stats are kept and
-- are maintained by the collector from the recent window). The table had
-- accumulated 16.1M rows / 4.1 GB across 5 days.

-- 1. Retire the never-activated partitioned dual-write twin: its trigger
--    fires on every insert and would silently re-grow a second copy of
--    every spot if its control flag ever flipped.
DROP TRIGGER IF EXISTS spot_history_partitioned_dual_write ON public.spot_history;
DROP TABLE IF EXISTS public.spot_history_partitioned_v1 CASCADE;
DROP FUNCTION IF EXISTS public.dual_write_spot_history_partitioned_v1() CASCADE;

-- 2. One-time trim to the two-hour window.
DELETE FROM public.spot_history
WHERE spotted_at < now() - interval '2 hours';

-- 3. Keep it trimmed from inside the database, independent of any
--    collector deployment's env configuration.
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule(
  'spot_history_two_hour_window',
  '*/15 * * * *',
  $$DELETE FROM public.spot_history WHERE spotted_at < now() - interval '2 hours'$$
);

-- 4. Recreate the reader view the app queries (dropped by the cascade in
--    step 1): the cutover union is gone, so it reads the table directly.
CREATE OR REPLACE VIEW public.spot_history_live
WITH (security_invoker = true)
AS
SELECT * FROM public.spot_history;

GRANT SELECT ON public.spot_history_live TO anon, authenticated, service_role;
