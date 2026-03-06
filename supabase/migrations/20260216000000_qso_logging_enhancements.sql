-- =============================================================================
-- Propulse: QSO Logging Enhancements
-- Created: 2026-02-16
-- Description: Adds field-level versioning, sync conflict tracking,
--              and additional QSO fields for offline-first logging.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Extend log_entries with versioning and new QSO fields
-- -----------------------------------------------------------------------------

ALTER TABLE public.log_entries
  ADD COLUMN IF NOT EXISTS version        integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_device_id text,
  ADD COLUMN IF NOT EXISTS country        text,
  ADD COLUMN IF NOT EXISTS dxcc           integer,
  ADD COLUMN IF NOT EXISTS cq_zone        integer,
  ADD COLUMN IF NOT EXISTS itu_zone       integer,
  ADD COLUMN IF NOT EXISTS continent      text,
  ADD COLUMN IF NOT EXISTS tx_power       double precision,
  ADD COLUMN IF NOT EXISTS my_grid        text,
  ADD COLUMN IF NOT EXISTS my_rig         text,
  ADD COLUMN IF NOT EXISTS my_antenna     text,
  ADD COLUMN IF NOT EXISTS prop_mode      text,
  ADD COLUMN IF NOT EXISTS sat_name       text,
  ADD COLUMN IF NOT EXISTS sat_mode       text,
  ADD COLUMN IF NOT EXISTS my_sig         text,
  ADD COLUMN IF NOT EXISTS my_sig_info    text,
  ADD COLUMN IF NOT EXISTS sig            text,
  ADD COLUMN IF NOT EXISTS sig_info       text,
  ADD COLUMN IF NOT EXISTS contest_id     text,
  ADD COLUMN IF NOT EXISTS srx            text,
  ADD COLUMN IF NOT EXISTS stx            text,
  ADD COLUMN IF NOT EXISTS srx_string     text,
  ADD COLUMN IF NOT EXISTS stx_string     text,
  ADD COLUMN IF NOT EXISTS lotw_qsl_sent  text,
  ADD COLUMN IF NOT EXISTS lotw_qsl_rcvd  text,
  ADD COLUMN IF NOT EXISTS clublog_status text,
  ADD COLUMN IF NOT EXISTS qrzcom_status  text;

CREATE INDEX IF NOT EXISTS log_entries_user_version_idx
  ON public.log_entries (user_id, id, version);

CREATE INDEX IF NOT EXISTS log_entries_user_sig_idx
  ON public.log_entries (user_id, my_sig, my_sig_info)
  WHERE my_sig IS NOT NULL;

CREATE INDEX IF NOT EXISTS log_entries_user_contest_idx
  ON public.log_entries (user_id, contest_id)
  WHERE contest_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS log_entries_user_dxcc_idx
  ON public.log_entries (user_id, dxcc, band, mode)
  WHERE dxcc IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. Sync conflict log
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.sync_conflicts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  entry_id        uuid NOT NULL,
  local_version   integer NOT NULL,
  local_data      jsonb NOT NULL,
  remote_version  integer NOT NULL,
  remote_data     jsonb NOT NULL,
  conflicting_fields text[] NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'resolved_local', 'resolved_remote', 'resolved_merged')),
  resolved_data   jsonb,
  resolved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sync_conflicts_user_status_idx
  ON public.sync_conflicts (user_id, status);

CREATE INDEX IF NOT EXISTS sync_conflicts_entry_idx
  ON public.sync_conflicts (user_id, entry_id);

ALTER TABLE public.sync_conflicts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sync_conflicts_all_own ON public.sync_conflicts;
CREATE POLICY sync_conflicts_all_own ON public.sync_conflicts
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 3. Device registry
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_devices (
  id          text NOT NULL,
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name        text NOT NULL,
  platform    text,
  last_seen   timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_devices_all_own ON public.user_devices;
CREATE POLICY user_devices_all_own ON public.user_devices
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Custom trigger function for last_seen (user_devices has no updated_at column)
CREATE OR REPLACE FUNCTION public.update_last_seen()
RETURNS trigger AS $$
BEGIN
  NEW.last_seen = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS user_devices_last_seen ON public.user_devices;
CREATE TRIGGER user_devices_last_seen
  BEFORE UPDATE ON public.user_devices
  FOR EACH ROW EXECUTE FUNCTION public.update_last_seen();

-- -----------------------------------------------------------------------------
-- 4. QSO statistics function
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.compute_qso_stats(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  stats jsonb;
BEGIN
  -- Authorization check: only allow users to query their own stats
  IF auth.uid() != target_user_id THEN
    RAISE EXCEPTION 'Forbidden: cannot access stats for another user';
  END IF;

  SELECT jsonb_build_object(
    'totalQsos', COUNT(*),
    'uniqueCallsigns', COUNT(DISTINCT callsign),
    'uniqueDxcc', COUNT(DISTINCT dxcc),
    'uniqueGrids', COUNT(DISTINCT LEFT(grid, 4)),
    'bandBreakdown', (
      SELECT jsonb_object_agg(band, cnt)
      FROM (
        SELECT band, COUNT(*) as cnt
        FROM public.log_entries
        WHERE user_id = target_user_id AND deleted_at IS NULL AND band IS NOT NULL
        GROUP BY band
      ) sub
    ),
    'modeBreakdown', (
      SELECT jsonb_object_agg(mode, cnt)
      FROM (
        SELECT mode, COUNT(*) as cnt
        FROM public.log_entries
        WHERE user_id = target_user_id AND deleted_at IS NULL AND mode IS NOT NULL
        GROUP BY mode
      ) sub
    ),
    'dailyRate', (
      SELECT ROUND(COUNT(*)::numeric /
        GREATEST(1, EXTRACT(EPOCH FROM (now() - MIN(created_at))) / 86400), 1)
      FROM public.log_entries
      WHERE user_id = target_user_id AND deleted_at IS NULL
    ),
    'lastQso', (
      SELECT MAX(created_at)
      FROM public.log_entries
      WHERE user_id = target_user_id AND deleted_at IS NULL
    )
  ) INTO stats
  FROM public.log_entries
  WHERE user_id = target_user_id AND deleted_at IS NULL;

  RETURN stats;
END;
$$;
