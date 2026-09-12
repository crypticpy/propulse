-- Hard-delete shack gear tombstones older than 90 days (#1078).
-- Tombstones remain visible to delta sync until this prune runs; the client
-- ack-on-absent path tolerates rows that have already been purged (#326).

CREATE OR REPLACE FUNCTION public.prune_gear_deletion_tombstones()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.user_radios
  WHERE deleted_at IS NOT NULL
    AND deleted_at < now() - interval '90 days';

  DELETE FROM public.antennas
  WHERE deleted_at IS NOT NULL
    AND deleted_at < now() - interval '90 days';

  DELETE FROM public.feedlines
  WHERE deleted_at IS NOT NULL
    AND deleted_at < now() - interval '90 days';

  DELETE FROM public.accessories
  WHERE deleted_at IS NOT NULL
    AND deleted_at < now() - interval '90 days';

  DELETE FROM public.station_presets
  WHERE deleted_at IS NOT NULL
    AND deleted_at < now() - interval '90 days';

  DELETE FROM public.inline_components
  WHERE deleted_at IS NOT NULL
    AND deleted_at < now() - interval '90 days';

  DELETE FROM public.station_chains
  WHERE deleted_at IS NOT NULL
    AND deleted_at < now() - interval '90 days';

  DELETE FROM public.custom_radios
  WHERE deleted_at IS NOT NULL
    AND deleted_at < now() - interval '90 days';
$$;

CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule(
  'gear_tombstone_90d_prune',
  '30 3 * * *',
  $$SELECT public.prune_gear_deletion_tombstones()$$
);
