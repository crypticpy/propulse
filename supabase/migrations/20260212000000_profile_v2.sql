-- Profile V2: Interest tags, On Air status, sked availability, favorite frequencies
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS interests        jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS on_air_status    jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS sked_availability text NOT NULL DEFAULT 'offline',
  ADD COLUMN IF NOT EXISTS favorite_freqs   jsonb DEFAULT '[]'::jsonb;

-- Index for On Air status queries (find who's on air)
CREATE INDEX IF NOT EXISTS idx_profiles_on_air
  ON public.profiles ((on_air_status->>'status'))
  WHERE on_air_status IS NOT NULL AND on_air_status->>'status' != 'offline';
