-- GEAR04: owner-scoped soft deletes for legacy shack gear tables.
-- Tombstoned rows stay addressable for delta sync; resurrection is blocked server-side.

ALTER TABLE public.user_radios
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.antennas
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.feedlines
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.accessories
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.station_presets
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.inline_components
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.station_chains
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.custom_radios
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_user_radios_user_deleted_updated
  ON public.user_radios (user_id, updated_at)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_antennas_user_deleted_updated
  ON public.antennas (user_id, updated_at)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_feedlines_user_deleted_updated
  ON public.feedlines (user_id, updated_at)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_accessories_user_deleted_updated
  ON public.accessories (user_id, updated_at)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_station_presets_user_deleted_updated
  ON public.station_presets (user_id, updated_at)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inline_components_user_deleted_updated
  ON public.inline_components (user_id, updated_at)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_station_chains_user_deleted_updated
  ON public.station_chains (user_id, updated_at)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_custom_radios_user_deleted_updated
  ON public.custom_radios (user_id, updated_at)
  WHERE deleted_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.reject_gear_tombstone_resurrection()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.deleted_at IS NOT NULL
     AND NEW.deleted_at IS NULL THEN
    RAISE EXCEPTION 'Cannot resurrect deleted gear row in %', TG_TABLE_NAME
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  gear_table text;
BEGIN
  FOREACH gear_table IN ARRAY ARRAY[
    'user_radios',
    'antennas',
    'feedlines',
    'accessories',
    'station_presets',
    'inline_components',
    'station_chains',
    'custom_radios'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_reject_resurrection ON public.%I', gear_table, gear_table);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_reject_resurrection
         BEFORE UPDATE ON public.%I
         FOR EACH ROW
         EXECUTE FUNCTION public.reject_gear_tombstone_resurrection()',
      gear_table,
      gear_table
    );
  END LOOP;
END
$$;
