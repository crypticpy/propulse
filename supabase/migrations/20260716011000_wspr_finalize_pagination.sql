-- Keep bounded WSPR finalization on an ordered, hour-and-band-local keyset scan.
-- This avoids deep PostgREST OFFSET plans as the rolling table grows.

CREATE INDEX IF NOT EXISTS wspr_observations_finalize_idx
  ON public.wspr_observations_rolling (source, target_hour, band, id)
  INCLUDE (received_at);
