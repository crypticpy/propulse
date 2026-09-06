-- #311: GFZ Hp60 on solar snapshots. Migrations are never auto-applied; run by hand.
ALTER TABLE public.solar_snapshots ADD COLUMN IF NOT EXISTS hp60 double precision;
COMMENT ON COLUMN public.solar_snapshots.hp60 IS 'GFZ Hp60 geomagnetic index (CC BY 4.0, https://kp.gfz.de) for the hour in source_observed_at.hp60; null when the fetch failed or the hour was not yet computed.';
