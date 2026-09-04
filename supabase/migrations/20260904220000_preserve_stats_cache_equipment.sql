-- Preserve profiles.stats_cache.equipment when logbook stats are rebuilt.
-- The previous function replaced the whole JSON blob, which wiped the public
-- shack summary written by profile push.

CREATE OR REPLACE FUNCTION public.update_profile_stats(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  stats jsonb;
BEGIN
  WITH base AS (
    SELECT band, mode, created_at
    FROM public.log_entries
    WHERE user_id = target_user_id AND deleted_at IS NULL
  ),
  band_rank AS (
    SELECT band, COUNT(*) as cnt,
      ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC) as rn
    FROM base WHERE band IS NOT NULL GROUP BY band
  ),
  mode_rank AS (
    SELECT mode, COUNT(*) as cnt,
      ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC) as rn
    FROM base WHERE mode IS NOT NULL GROUP BY mode
  )
  SELECT jsonb_build_object(
    'totalQsos', (SELECT COUNT(*) FROM base),
    'uniqueCallsigns', (SELECT COUNT(DISTINCT callsign) FROM public.log_entries WHERE user_id = target_user_id AND deleted_at IS NULL),
    'favoriteBand', (SELECT band FROM band_rank WHERE rn = 1),
    'favoriteMode', (SELECT mode FROM mode_rank WHERE rn = 1),
    'lastActive', (SELECT MAX(created_at) FROM base)
  ) INTO stats;

  UPDATE public.profiles
  SET stats_cache = COALESCE(stats_cache, '{}'::jsonb) || stats,
      updated_at = now()
  WHERE id = target_user_id;
END;
$$;
