-- =============================================================================
-- Fix auth_rls_initplan: wrap auth.uid() in (select auth.uid())
-- Fix multiple_permissive_policies: consolidate SELECT policies
-- =============================================================================

-- -------------------------------------------------------
-- 1. Simple FOR ALL policies — drop + recreate with (select auth.uid())
-- -------------------------------------------------------

-- contest_sessions
DROP POLICY IF EXISTS contest_sessions_all_own ON public.contest_sessions;
CREATE POLICY contest_sessions_all_own ON public.contest_sessions
  FOR ALL USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- contest_qsos
DROP POLICY IF EXISTS contest_qsos_all_own ON public.contest_qsos;
CREATE POLICY contest_qsos_all_own ON public.contest_qsos
  FOR ALL USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- user_radios
DROP POLICY IF EXISTS user_radios_all_own ON public.user_radios;
CREATE POLICY user_radios_all_own ON public.user_radios
  FOR ALL USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- antennas
DROP POLICY IF EXISTS antennas_all_own ON public.antennas;
CREATE POLICY antennas_all_own ON public.antennas
  FOR ALL USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- feedlines
DROP POLICY IF EXISTS feedlines_all_own ON public.feedlines;
CREATE POLICY feedlines_all_own ON public.feedlines
  FOR ALL USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- accessories
DROP POLICY IF EXISTS accessories_all_own ON public.accessories;
CREATE POLICY accessories_all_own ON public.accessories
  FOR ALL USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- station_presets
DROP POLICY IF EXISTS station_presets_all_own ON public.station_presets;
CREATE POLICY station_presets_all_own ON public.station_presets
  FOR ALL USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- watches
DROP POLICY IF EXISTS watches_all_own ON public.watches;
CREATE POLICY watches_all_own ON public.watches
  FOR ALL USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- map_pins
DROP POLICY IF EXISTS map_pins_all_own ON public.map_pins;
CREATE POLICY map_pins_all_own ON public.map_pins
  FOR ALL USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- skeds
DROP POLICY IF EXISTS skeds_all_own ON public.skeds;
CREATE POLICY skeds_all_own ON public.skeds
  FOR ALL USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- alert_rules
DROP POLICY IF EXISTS alert_rules_all_own ON public.alert_rules;
CREATE POLICY alert_rules_all_own ON public.alert_rules
  FOR ALL USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- saved_targets
DROP POLICY IF EXISTS saved_targets_all_own ON public.saved_targets;
CREATE POLICY saved_targets_all_own ON public.saved_targets
  FOR ALL USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- saved_locations
DROP POLICY IF EXISTS saved_locations_all_own ON public.saved_locations;
CREATE POLICY saved_locations_all_own ON public.saved_locations
  FOR ALL USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- user_preferences
DROP POLICY IF EXISTS user_preferences_all_own ON public.user_preferences;
CREATE POLICY user_preferences_all_own ON public.user_preferences
  FOR ALL USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- log_entries
DROP POLICY IF EXISTS log_entries_all_own ON public.log_entries;
CREATE POLICY log_entries_all_own ON public.log_entries
  FOR ALL USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- -------------------------------------------------------
-- 2. Per-operation policies — drop + recreate with (select auth.uid())
-- -------------------------------------------------------

-- equipment_history
DROP POLICY IF EXISTS "Users can read own equipment history" ON public.equipment_history;
DROP POLICY IF EXISTS "Users can insert own equipment history" ON public.equipment_history;
DROP POLICY IF EXISTS "Users can update own equipment history" ON public.equipment_history;
DROP POLICY IF EXISTS "Users can delete own equipment history" ON public.equipment_history;

CREATE POLICY "Users can read own equipment history"
  ON public.equipment_history FOR SELECT
  USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can insert own equipment history"
  ON public.equipment_history FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can update own equipment history"
  ON public.equipment_history FOR UPDATE
  USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can delete own equipment history"
  ON public.equipment_history FOR DELETE
  USING ((select auth.uid()) = user_id);

-- custom_radios
DROP POLICY IF EXISTS "Users can read own custom radios" ON public.custom_radios;
DROP POLICY IF EXISTS "Users can insert own custom radios" ON public.custom_radios;
DROP POLICY IF EXISTS "Users can update own custom radios" ON public.custom_radios;
DROP POLICY IF EXISTS "Users can delete own custom radios" ON public.custom_radios;

CREATE POLICY "Users can read own custom radios"
  ON public.custom_radios FOR SELECT
  USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can insert own custom radios"
  ON public.custom_radios FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can update own custom radios"
  ON public.custom_radios FOR UPDATE
  USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can delete own custom radios"
  ON public.custom_radios FOR DELETE
  USING ((select auth.uid()) = user_id);

-- user_images
DROP POLICY IF EXISTS "Users manage own images" ON public.user_images;
CREATE POLICY "Users manage own images"
  ON public.user_images FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- inline_components
DROP POLICY IF EXISTS "Users can read own inline components" ON public.inline_components;
DROP POLICY IF EXISTS "Users can insert own inline components" ON public.inline_components;
DROP POLICY IF EXISTS "Users can update own inline components" ON public.inline_components;
DROP POLICY IF EXISTS "Users can delete own inline components" ON public.inline_components;

CREATE POLICY "Users can read own inline components"
  ON public.inline_components FOR SELECT
  USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can insert own inline components"
  ON public.inline_components FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can update own inline components"
  ON public.inline_components FOR UPDATE
  USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can delete own inline components"
  ON public.inline_components FOR DELETE
  USING ((select auth.uid()) = user_id);

-- station_chains
DROP POLICY IF EXISTS "Users can read own station chains" ON public.station_chains;
DROP POLICY IF EXISTS "Users can insert own station chains" ON public.station_chains;
DROP POLICY IF EXISTS "Users can update own station chains" ON public.station_chains;
DROP POLICY IF EXISTS "Users can delete own station chains" ON public.station_chains;

CREATE POLICY "Users can read own station chains"
  ON public.station_chains FOR SELECT
  USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can insert own station chains"
  ON public.station_chains FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can update own station chains"
  ON public.station_chains FOR UPDATE
  USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can delete own station chains"
  ON public.station_chains FOR DELETE
  USING ((select auth.uid()) = user_id);

-- dxcc_worked
DROP POLICY IF EXISTS "Users can read own DXCC entries" ON public.dxcc_worked;
DROP POLICY IF EXISTS "Users can insert own DXCC entries" ON public.dxcc_worked;
DROP POLICY IF EXISTS "Users can update own DXCC entries" ON public.dxcc_worked;
DROP POLICY IF EXISTS "Users can delete own DXCC entries" ON public.dxcc_worked;

CREATE POLICY "Users can read own DXCC entries"
  ON public.dxcc_worked FOR SELECT
  USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can insert own DXCC entries"
  ON public.dxcc_worked FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can update own DXCC entries"
  ON public.dxcc_worked FOR UPDATE
  USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can delete own DXCC entries"
  ON public.dxcc_worked FOR DELETE
  USING ((select auth.uid()) = user_id);

-- follows
DROP POLICY IF EXISTS follows_select_own ON public.follows;
DROP POLICY IF EXISTS follows_insert_own ON public.follows;
DROP POLICY IF EXISTS follows_delete_own ON public.follows;

CREATE POLICY follows_select_own ON public.follows
  FOR SELECT USING ((select auth.uid()) = follower_id OR (select auth.uid()) = following_id);
CREATE POLICY follows_insert_own ON public.follows
  FOR INSERT WITH CHECK ((select auth.uid()) = follower_id);
CREATE POLICY follows_delete_own ON public.follows
  FOR DELETE USING ((select auth.uid()) = follower_id);

-- -------------------------------------------------------
-- 3. Consolidated SELECT + auth.uid() fix for multi-policy tables
-- -------------------------------------------------------

-- profiles: merge 3 SELECT policies into 1, fix write policies
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
DROP POLICY IF EXISTS profiles_select_public ON public.profiles;
DROP POLICY IF EXISTS profiles_select_friends ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;

CREATE POLICY profiles_select ON public.profiles
  FOR SELECT USING (
    (select auth.uid()) = id
    OR visibility_settings->>'profile' = 'public'
    OR (
      visibility_settings->>'profile' = 'friends'
      AND EXISTS (
        SELECT 1 FROM public.follows
        WHERE follower_id = (select auth.uid()) AND following_id = profiles.id
      )
    )
  );

CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE USING ((select auth.uid()) = id);

CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT WITH CHECK ((select auth.uid()) = id);

-- achievements: merge 3 SELECT policies into 1 (insert/update service policies use false, no fix needed)
DROP POLICY IF EXISTS achievements_select_own ON public.achievements;
DROP POLICY IF EXISTS achievements_select_public ON public.achievements;
DROP POLICY IF EXISTS achievements_select_friends ON public.achievements;

CREATE POLICY achievements_select ON public.achievements
  FOR SELECT USING (
    (select auth.uid()) = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = achievements.user_id
        AND visibility_settings->>'profile' = 'public'
    )
    OR (
      EXISTS (
        SELECT 1 FROM public.follows
        WHERE follower_id = (select auth.uid()) AND following_id = achievements.user_id
      )
      AND EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = achievements.user_id
          AND visibility_settings->>'profile' IN ('public', 'friends')
      )
    )
  );

-- activity_feed: merge 3 SELECT policies into 1 (insert_blocked uses false, no fix needed)
DROP POLICY IF EXISTS activity_feed_select_own ON public.activity_feed;
DROP POLICY IF EXISTS activity_feed_select_public ON public.activity_feed;
DROP POLICY IF EXISTS activity_feed_select_friends ON public.activity_feed;

CREATE POLICY activity_feed_select ON public.activity_feed
  FOR SELECT USING (
    (select auth.uid()) = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = activity_feed.user_id
        AND visibility_settings->>'profile' = 'public'
    )
    OR (
      EXISTS (
        SELECT 1 FROM public.follows
        WHERE follower_id = (select auth.uid()) AND following_id = activity_feed.user_id
      )
      AND EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = activity_feed.user_id
          AND visibility_settings->>'profile' IN ('public', 'friends')
      )
    )
  );
