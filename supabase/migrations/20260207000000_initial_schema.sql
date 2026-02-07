-- =============================================================================
-- Propulse: Initial Supabase Schema Migration
-- Created: 2026-02-07
-- Description: Creates all tables, indexes, RLS policies, triggers, functions,
--              and storage buckets for the Propulse ham radio dashboard.
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- SECTION 1: UTILITY FUNCTIONS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- update_updated_at() — Auto-set updated_at on row modification
-- Applied to all tables with an updated_at column.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- handle_new_user() — Auto-create profile + preferences on signup
-- Fires after INSERT on auth.users via trigger.
-- SECURITY DEFINER with empty search_path to prevent search_path injection.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, created_at, updated_at)
  VALUES (new.id, now(), now());

  INSERT INTO public.user_preferences (user_id, preferences, version, updated_at)
  VALUES (new.id, '{}'::jsonb, 1, now());

  RETURN new;
END;
$$;

-- -----------------------------------------------------------------------------
-- update_profile_stats() — Recompute profile stats_cache from logbook
-- Called by pg_cron every 15 minutes and by compute-achievements Edge Function.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_profile_stats(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  stats jsonb;
BEGIN
  SELECT jsonb_build_object(
    'totalQsos', COUNT(*),
    'totalDxcc', COUNT(DISTINCT
      CASE WHEN band IS NOT NULL THEN callsign END
    ),
    'favoriteBand', (
      SELECT band FROM public.log_entries
      WHERE user_id = target_user_id AND deleted_at IS NULL AND band IS NOT NULL
      GROUP BY band ORDER BY COUNT(*) DESC LIMIT 1
    ),
    'favoriteMode', (
      SELECT mode FROM public.log_entries
      WHERE user_id = target_user_id AND deleted_at IS NULL AND mode IS NOT NULL
      GROUP BY mode ORDER BY COUNT(*) DESC LIMIT 1
    ),
    'lastActive', MAX(created_at)
  ) INTO stats
  FROM public.log_entries
  WHERE user_id = target_user_id AND deleted_at IS NULL;

  UPDATE public.profiles
  SET stats_cache = stats, updated_at = now()
  WHERE id = target_user_id;
END;
$$;

-- =============================================================================
-- SECTION 2: CORE USER TABLES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- profiles — Canonical user profile, auto-created on signup
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id                  uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  callsign            text UNIQUE,
  callsign_verified   boolean NOT NULL DEFAULT false,
  operator_name       text,
  bio                 text CHECK (length(bio) <= 500),
  avatar_url          text,
  grid                text,
  lat                 double precision,
  lon                 double precision,
  home_location_id    text,
  active_location_id  text,
  timezone            text,
  license             jsonb,
  social_links        jsonb DEFAULT '[]'::jsonb,
  visibility_settings jsonb NOT NULL DEFAULT '{"profile":"private","onlineStatus":false}'::jsonb,
  stats_cache         jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Partial unique index on callsign (only non-null values must be unique)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_callsign_idx
  ON public.profiles (callsign)
  WHERE callsign IS NOT NULL;

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles RLS policies
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY profiles_select_public ON public.profiles
  FOR SELECT USING (visibility_settings->>'profile' = 'public');

-- NOTE: profiles_select_friends policy is created after the follows table (Section 5)

CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Auto-update updated_at trigger
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- -----------------------------------------------------------------------------
-- saved_locations — Operating locations (home, portable, POTA, SOTA, etc.)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.saved_locations (
  id             text NOT NULL,
  user_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name           text NOT NULL,
  grid           text NOT NULL,
  lat            double precision NOT NULL,
  lon            double precision NOT NULL,
  timezone       text,
  type           text NOT NULL DEFAULT 'home',
  activation_ref text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

ALTER TABLE public.saved_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY saved_locations_all_own ON public.saved_locations
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- user_preferences — Single JSONB blob per user for all app preferences
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id     uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  version     integer NOT NULL DEFAULT 1,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_preferences_all_own ON public.user_preferences
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Auto-update updated_at trigger
CREATE TRIGGER user_preferences_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =============================================================================
-- SECTION 3: LOGBOOK TABLES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- log_entries — QSO logbook (largest table, primary bandwidth driver)
-- Supports soft delete via deleted_at, delta sync via (user_id, updated_at).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.log_entries (
  id                  uuid PRIMARY KEY,
  user_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  callsign            text NOT NULL,
  frequency           double precision,
  mode                text,
  band                text,
  date                text NOT NULL,
  time_on             text NOT NULL,
  time_off            text,
  rst_sent            text,
  rst_rcvd            text,
  grid                text,
  name                text,
  qth                 text,
  notes               text,
  qsl_sent            text,
  qsl_rcvd            text,
  lotw_status         boolean,
  eqsl_status         boolean,
  station_callsign    text,
  operator_callsign   text,
  is_guest_entry      boolean NOT NULL DEFAULT false,
  guest_session_id    text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);

-- Primary query pattern: logbook view sorted by date
CREATE INDEX IF NOT EXISTS log_entries_user_date_idx
  ON public.log_entries (user_id, date DESC);

-- Callsign search
CREATE INDEX IF NOT EXISTS log_entries_user_callsign_idx
  ON public.log_entries (user_id, callsign);

-- Band filtering
CREATE INDEX IF NOT EXISTS log_entries_user_band_idx
  ON public.log_entries (user_id, band);

-- Delta sync: "give me everything changed since X" — most important index
CREATE INDEX IF NOT EXISTS log_entries_user_updated_idx
  ON public.log_entries (user_id, updated_at);

-- Partial index for propagating soft deletes
CREATE INDEX IF NOT EXISTS log_entries_user_deleted_idx
  ON public.log_entries (user_id, deleted_at)
  WHERE deleted_at IS NOT NULL;

ALTER TABLE public.log_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY log_entries_all_own ON public.log_entries
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Auto-update updated_at trigger
CREATE TRIGGER log_entries_updated_at
  BEFORE UPDATE ON public.log_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =============================================================================
-- SECTION 4: CONTEST TABLES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- contest_sessions — Completed contest sessions (only synced after session ends)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contest_sessions (
  id                text NOT NULL,
  user_id           uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  contest_id        text NOT NULL,
  my_exchange       text NOT NULL,
  categories        jsonb NOT NULL,
  start_time        timestamptz NOT NULL,
  end_time          timestamptz,
  is_active         boolean NOT NULL DEFAULT false,
  current_serial    integer NOT NULL DEFAULT 0,
  total_points      integer NOT NULL DEFAULT 0,
  total_multipliers integer NOT NULL DEFAULT 0,
  total_score       integer NOT NULL DEFAULT 0,
  cabrillo_meta     jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

ALTER TABLE public.contest_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY contest_sessions_all_own ON public.contest_sessions
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Auto-update updated_at trigger
CREATE TRIGGER contest_sessions_updated_at
  BEFORE UPDATE ON public.contest_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- -----------------------------------------------------------------------------
-- contest_qsos — Individual QSOs within a contest session
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contest_qsos (
  id                text NOT NULL,
  session_id        text NOT NULL,
  user_id           uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  callsign          text NOT NULL,
  frequency_khz     double precision,
  band              text NOT NULL,
  mode              text NOT NULL,
  rst_sent          text NOT NULL,
  rst_received      text NOT NULL,
  exchange_sent     text NOT NULL,
  exchange_received text NOT NULL,
  serial_sent       integer,
  serial_received   integer,
  timestamp         timestamptz NOT NULL,
  is_dupe           boolean NOT NULL DEFAULT false,
  points            integer NOT NULL DEFAULT 0,
  is_multiplier     boolean NOT NULL DEFAULT false,
  multiplier_value  text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, session_id, id)
);

-- Fetch all QSOs for a session
CREATE INDEX IF NOT EXISTS contest_qsos_session_idx
  ON public.contest_qsos (user_id, session_id);

ALTER TABLE public.contest_qsos ENABLE ROW LEVEL SECURITY;

CREATE POLICY contest_qsos_all_own ON public.contest_qsos
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- =============================================================================
-- SECTION 5: EQUIPMENT TABLES (Shack Builder)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- user_radios — Radio equipment instances owned by the user
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_radios (
  instance_id      text NOT NULL,
  user_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  equipment_id     text NOT NULL,
  nickname         text,
  purchase_date    text,
  serial_number    text,
  firmware_version text,
  tx_power_setting integer,
  notes            text,
  wiring           text,
  specs_override   jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, instance_id)
);

ALTER TABLE public.user_radios ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_radios_all_own ON public.user_radios
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Auto-update updated_at trigger
CREATE TRIGGER user_radios_updated_at
  BEFORE UPDATE ON public.user_radios
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- -----------------------------------------------------------------------------
-- antennas — Antenna inventory with real-world parameters for signal chain modeling
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.antennas (
  id                  text NOT NULL,
  user_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name                text NOT NULL,
  type                text NOT NULL,
  manufacturer        text,
  bands               text[] NOT NULL DEFAULT '{}',
  height_agl          double precision,
  azimuth             double precision,
  gain_dbi            double precision,
  polarization        text,
  mounting            text,
  feedpoint_impedance double precision,
  swr_data            jsonb,
  installation_date   text,
  notes               text,
  is_portable         boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

ALTER TABLE public.antennas ENABLE ROW LEVEL SECURITY;

CREATE POLICY antennas_all_own ON public.antennas
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Auto-update updated_at trigger
CREATE TRIGGER antennas_updated_at
  BEFORE UPDATE ON public.antennas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- -----------------------------------------------------------------------------
-- feedlines — Feedline/transmission line inventory for loss calculations
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.feedlines (
  id                text NOT NULL,
  user_id           uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type              text NOT NULL,
  length_meters     double precision NOT NULL,
  connectors        text,
  manufacturer      text,
  installation_date text,
  condition         text DEFAULT 'good',
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

ALTER TABLE public.feedlines ENABLE ROW LEVEL SECURITY;

CREATE POLICY feedlines_all_own ON public.feedlines
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Auto-update updated_at trigger
CREATE TRIGGER feedlines_updated_at
  BEFORE UPDATE ON public.feedlines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- -----------------------------------------------------------------------------
-- accessories — Amplifiers, tuners, filters, switches, PSU, grounding
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accessories (
  id           text NOT NULL,
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category     text NOT NULL,
  model        text NOT NULL,
  manufacturer text,
  specs        jsonb,
  bands        text[] NOT NULL DEFAULT '{}',
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

ALTER TABLE public.accessories ENABLE ROW LEVEL SECURITY;

CREATE POLICY accessories_all_own ON public.accessories
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Auto-update updated_at trigger
CREATE TRIGGER accessories_updated_at
  BEFORE UPDATE ON public.accessories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- -----------------------------------------------------------------------------
-- station_presets — Named equipment configurations (radio + antenna + feedline chain)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.station_presets (
  id                 text NOT NULL,
  user_id            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name               text NOT NULL,
  description        text,
  radio_instance_id  text,
  antenna_id         text,
  feedline_id        text,
  accessory_ids      text[] NOT NULL DEFAULT '{}',
  linked_location_id text,
  is_active          boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

ALTER TABLE public.station_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY station_presets_all_own ON public.station_presets
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Auto-update updated_at trigger
CREATE TRIGGER station_presets_updated_at
  BEFORE UPDATE ON public.station_presets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =============================================================================
-- SECTION 6: SOCIAL TABLES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- follows — Directional follow relationships between users
-- Mutual follows indicate friendship.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.follows (
  follower_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id != following_id)
);

-- "Who follows me" query
CREATE INDEX IF NOT EXISTS follows_following_idx
  ON public.follows (following_id);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- Users can see their own follow relationships (either direction)
CREATE POLICY follows_select_own ON public.follows
  FOR SELECT USING (auth.uid() = follower_id OR auth.uid() = following_id);

-- Users can only follow as themselves
CREATE POLICY follows_insert_own ON public.follows
  FOR INSERT WITH CHECK (auth.uid() = follower_id);

-- Users can only unfollow their own follows
CREATE POLICY follows_delete_own ON public.follows
  FOR DELETE USING (auth.uid() = follower_id);

-- Deferred from Section 2: profiles_select_friends depends on follows table
CREATE POLICY profiles_select_friends ON public.profiles
  FOR SELECT USING (
    visibility_settings->>'profile' = 'friends'
    AND EXISTS (
      SELECT 1 FROM public.follows
      WHERE follower_id = auth.uid() AND following_id = profiles.id
    )
  );

-- -----------------------------------------------------------------------------
-- activity_feed — Friend activity events (achievements, milestones)
-- Write-only from server-side triggers/functions. Clients read paginated subsets.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activity_feed (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Paginated feed query
CREATE INDEX IF NOT EXISTS activity_feed_user_created_idx
  ON public.activity_feed (user_id, created_at DESC);

ALTER TABLE public.activity_feed ENABLE ROW LEVEL SECURITY;

-- Users can always see their own activity
CREATE POLICY activity_feed_select_own ON public.activity_feed
  FOR SELECT USING (auth.uid() = user_id);

-- Anyone can see activity from public profiles
CREATE POLICY activity_feed_select_public ON public.activity_feed
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = activity_feed.user_id
        AND visibility_settings->>'profile' = 'public'
    )
  );

-- Friends can see activity from friends-visible profiles
CREATE POLICY activity_feed_select_friends ON public.activity_feed
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.follows
      WHERE follower_id = auth.uid() AND following_id = activity_feed.user_id
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = activity_feed.user_id
        AND visibility_settings->>'profile' IN ('public', 'friends')
    )
  );

-- Only service role can insert activity feed events (not client-insertable)
CREATE POLICY activity_feed_insert_service ON public.activity_feed
  FOR INSERT WITH CHECK (false);

-- =============================================================================
-- SECTION 7: CONFIGURATION TABLES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- watches — DX watch items (callsign, grid, entity patterns)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.watches (
  id             text NOT NULL,
  user_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type           text NOT NULL,
  pattern        text NOT NULL,
  name           text,
  is_active      boolean NOT NULL DEFAULT false,
  activity_count integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

ALTER TABLE public.watches ENABLE ROW LEVEL SECURITY;

CREATE POLICY watches_all_own ON public.watches
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- map_pins — Globe location bookmarks
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.map_pins (
  id         text NOT NULL,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lat        double precision NOT NULL,
  lon        double precision NOT NULL,
  grid       text NOT NULL,
  name       text,
  color      text,
  category   text NOT NULL DEFAULT 'custom',
  notes      text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

ALTER TABLE public.map_pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY map_pins_all_own ON public.map_pins
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- skeds — QSO scheduling entries
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.skeds (
  id                    text NOT NULL,
  user_id               uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_callsign       text NOT NULL,
  target_lat            double precision,
  target_lon            double precision,
  preferred_band        text NOT NULL,
  preferred_mode        text NOT NULL,
  date_range            jsonb NOT NULL,
  recommended_windows   jsonb NOT NULL DEFAULT '[]'::jsonb,
  status                text NOT NULL DEFAULT 'active',
  notes                 text,
  reminder_fired        boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

ALTER TABLE public.skeds ENABLE ROW LEVEL SECURITY;

CREATE POLICY skeds_all_own ON public.skeds
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- alert_rules — DX alert rule definitions
-- Alert history stays local (24h transient data).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alert_rules (
  id           text NOT NULL,
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name         text NOT NULL,
  enabled      boolean NOT NULL DEFAULT true,
  conditions   jsonb NOT NULL,
  notification jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

ALTER TABLE public.alert_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY alert_rules_all_own ON public.alert_rules
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- saved_targets — DX Wizard saved analysis targets (max ~10 per user)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.saved_targets (
  id         text NOT NULL,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  callsign   text NOT NULL,
  grid       text,
  lat        double precision,
  lon        double precision,
  name       text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

ALTER TABLE public.saved_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY saved_targets_all_own ON public.saved_targets
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- =============================================================================
-- SECTION 8: AUTH TRIGGER
-- =============================================================================

-- Trigger to auto-create profile + preferences when a new auth user is created
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- SECTION 9: STORAGE BUCKETS
-- =============================================================================

-- Avatars bucket — profile photos (max 500KB, image/jpeg, image/png, image/webp)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  false,
  524288,  -- 500KB in bytes
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Shack photos bucket — equipment photos (max 2MB)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'shack-photos',
  'shack-photos',
  false,
  2097152,  -- 2MB in bytes
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Share cards bucket — generated PNG share images (max 1MB, public read)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'share-cards',
  'share-cards',
  true,
  1048576,  -- 1MB in bytes
  ARRAY['image/png']
)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- SECTION 10: STORAGE POLICIES
-- =============================================================================

-- ---- Avatars policies ----

-- Owner can upload/update their own avatar
CREATE POLICY avatars_insert_own ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY avatars_update_own ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Owner can always read their own avatar
CREATE POLICY avatars_select_own ON storage.objects
  FOR SELECT USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Public profiles: anyone can read avatar
CREATE POLICY avatars_select_public ON storage.objects
  FOR SELECT USING (
    bucket_id = 'avatars'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id::text = (storage.foldername(name))[1]
        AND visibility_settings->>'profile' = 'public'
    )
  );

-- Friends can read avatars of friend-visible profiles
CREATE POLICY avatars_select_friends ON storage.objects
  FOR SELECT USING (
    bucket_id = 'avatars'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id::text = (storage.foldername(name))[1]
        AND visibility_settings->>'profile' = 'friends'
    )
    AND EXISTS (
      SELECT 1 FROM public.follows
      WHERE follower_id = auth.uid()
        AND following_id::text = (storage.foldername(name))[1]
    )
  );

-- Owner can delete their own avatar
CREATE POLICY avatars_delete_own ON storage.objects
  FOR DELETE USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ---- Shack photos policies ----

-- Owner can upload shack photos
CREATE POLICY shack_photos_insert_own ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'shack-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY shack_photos_update_own ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'shack-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Owner can always read their own photos
CREATE POLICY shack_photos_select_own ON storage.objects
  FOR SELECT USING (
    bucket_id = 'shack-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Public profiles: anyone can read shack photos
CREATE POLICY shack_photos_select_public ON storage.objects
  FOR SELECT USING (
    bucket_id = 'shack-photos'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id::text = (storage.foldername(name))[1]
        AND visibility_settings->>'profile' = 'public'
    )
  );

-- Friends can read shack photos of friend-visible profiles
CREATE POLICY shack_photos_select_friends ON storage.objects
  FOR SELECT USING (
    bucket_id = 'shack-photos'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id::text = (storage.foldername(name))[1]
        AND visibility_settings->>'profile' = 'friends'
    )
    AND EXISTS (
      SELECT 1 FROM public.follows
      WHERE follower_id = auth.uid()
        AND following_id::text = (storage.foldername(name))[1]
    )
  );

-- Owner can delete their own shack photos
CREATE POLICY shack_photos_delete_own ON storage.objects
  FOR DELETE USING (
    bucket_id = 'shack-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ---- Share cards policies ----
-- Share cards bucket is public (public: true), so SELECT is open by default.

-- Owner can upload their own share cards
CREATE POLICY share_cards_insert_own ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'share-cards'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Owner can delete their own share cards
CREATE POLICY share_cards_delete_own ON storage.objects
  FOR DELETE USING (
    bucket_id = 'share-cards'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- =============================================================================
-- SECTION 11: CRON JOBS (pg_cron)
-- These require the pg_cron extension enabled in the Supabase dashboard.
-- They will fail silently if pg_cron is not available; enable it before
-- running this section in production.
-- =============================================================================

-- Clean up activity feed entries older than 90 days (daily at 03:00 UTC)
-- SELECT cron.schedule(
--   'cleanup-activity-feed',
--   '0 3 * * *',
--   $$DELETE FROM public.activity_feed WHERE created_at < now() - interval '90 days'$$
-- );

-- Clean up share card storage files older than 7 days (daily at 04:00 UTC)
-- Note: This requires a custom function to list and delete from storage.
-- Implement via Edge Function or pg_cron with storage API calls.
-- SELECT cron.schedule(
--   'cleanup-share-cards',
--   '0 4 * * *',
--   $$SELECT public.cleanup_expired_share_cards()$$
-- );

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
