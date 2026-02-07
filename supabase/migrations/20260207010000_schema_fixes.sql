-- =============================================================================
-- Propulse: Schema Fixes Migration
-- Created: 2026-02-07
-- Description: Fixes critical issues found in the initial schema migration.
--   - CRITICAL-1: Add SET search_path = '' to update_profile_stats()
--   - CRITICAL-2: Replace misleading totalDxcc with uniqueCallsigns, use single-pass CTE
--   - CRITICAL-4: Remove duplicate UNIQUE constraint on profiles.callsign
--   - Add missing last_active_at column to profiles
--   - Add missing visibility index for social queries
--   - Fix antennas table: gain_dbi type + missing columns
--   - Fix feedlines table: connectors type
--   - Add achievements table
--   - Rename misleading activity_feed_insert_service policy
--   - Add contest_qsos FK to contest_sessions
-- =============================================================================

-- =============================================================================
-- CRITICAL-1 + CRITICAL-2: Replace update_profile_stats()
-- Adds SET search_path = '' for SECURITY DEFINER safety.
-- Replaces misleading totalDxcc with uniqueCallsigns.
-- Uses single-pass CTE instead of 3 separate scans.
-- =============================================================================
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
  SET stats_cache = stats, updated_at = now()
  WHERE id = target_user_id;
END;
$$;

-- =============================================================================
-- CRITICAL-4: Remove duplicate UNIQUE constraint on profiles.callsign
-- The column-level UNIQUE creates a full unique index, but we already have
-- a partial unique index (profiles_callsign_idx) that only enforces uniqueness
-- on non-null values. Drop the column-level constraint to avoid conflicts.
-- =============================================================================
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_callsign_key;

-- =============================================================================
-- Add missing last_active_at column to profiles
-- Written by client heartbeat for online status feature.
-- =============================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_active_at timestamptz;

-- =============================================================================
-- Add missing visibility index for social queries
-- Speeds up lookups for public/friends profile visibility.
-- =============================================================================
CREATE INDEX IF NOT EXISTS profiles_visibility_idx
  ON public.profiles ((visibility_settings->>'profile'))
  WHERE visibility_settings->>'profile' IN ('public', 'friends');

-- =============================================================================
-- Fix antennas table: change gain_dbi from double precision to jsonb,
-- add missing columns required by Shack PRD.
-- =============================================================================

-- Change gain_dbi from double precision to jsonb (stores per-band gain like {"20m": 8.5, "15m": 9.2})
ALTER TABLE public.antennas
  ALTER COLUMN gain_dbi TYPE jsonb USING to_jsonb(gain_dbi);

-- Add missing columns
ALTER TABLE public.antennas
  ADD COLUMN IF NOT EXISTS front_to_back_db double precision,
  ADD COLUMN IF NOT EXISTS beamwidth_deg double precision,
  ADD COLUMN IF NOT EXISTS is_rotatable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS radial_count integer,
  ADD COLUMN IF NOT EXISTS radial_length_m double precision;

-- =============================================================================
-- Fix feedlines table: change connectors from text to jsonb
-- Stores structured data like {"type": "PL259", "count": 2}
-- =============================================================================
ALTER TABLE public.feedlines
  ALTER COLUMN connectors TYPE jsonb USING
    CASE
      WHEN connectors IS NOT NULL THEN to_jsonb(connectors)
      ELSE NULL
    END;

-- =============================================================================
-- Add achievements table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.achievements (
  id          text NOT NULL,
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  badge_id    text NOT NULL,
  tier        text NOT NULL DEFAULT 'bronze',
  progress    double precision NOT NULL DEFAULT 0,
  earned_at   timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS achievements_user_badge_idx
  ON public.achievements (user_id, badge_id);

ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY achievements_select_own ON public.achievements
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY achievements_select_public ON public.achievements
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = achievements.user_id
        AND visibility_settings->>'profile' = 'public'
    )
  );

CREATE POLICY achievements_select_friends ON public.achievements
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.follows
      WHERE follower_id = auth.uid() AND following_id = achievements.user_id
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = achievements.user_id
        AND visibility_settings->>'profile' IN ('public', 'friends')
    )
  );

-- Only service role can write achievements (computed by Edge Function)
CREATE POLICY achievements_insert_service ON public.achievements
  FOR INSERT WITH CHECK (false);

CREATE POLICY achievements_update_service ON public.achievements
  FOR UPDATE USING (false);

-- Auto-update updated_at trigger for achievements
CREATE TRIGGER achievements_updated_at
  BEFORE UPDATE ON public.achievements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =============================================================================
-- Rename misleading activity_feed_insert_service policy
-- The name suggests the service role CAN insert, but the policy blocks all
-- inserts (WITH CHECK (false)). Rename to clarify intent.
-- =============================================================================

-- Drop the old misleadingly-named policy
DROP POLICY IF EXISTS activity_feed_insert_service ON public.activity_feed;

-- Recreate with accurate name — blocked means no client-side inserts allowed
-- (service role bypasses RLS anyway, so this policy correctly blocks only client inserts)
CREATE POLICY activity_feed_insert_blocked ON public.activity_feed
  FOR INSERT WITH CHECK (false);

-- =============================================================================
-- Add contest_qsos FK to contest_sessions
-- Ensures contest QSOs reference a valid session.
-- =============================================================================
ALTER TABLE public.contest_qsos
  ADD CONSTRAINT contest_qsos_session_fk
    FOREIGN KEY (user_id, session_id)
    REFERENCES public.contest_sessions(user_id, id)
    ON DELETE CASCADE;

-- =============================================================================
-- END OF FIXES MIGRATION
-- =============================================================================
