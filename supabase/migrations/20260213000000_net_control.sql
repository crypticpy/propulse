-- =============================================================================
-- Net Control Manager: Nets, Sessions, Checkins, Subscriptions, Managers
-- Created: 2026-02-13
-- Description: Creates all tables, enum types, RLS policies, triggers, and
--              functions for the Net Control Manager feature. Nets are shared
--              resources with role-based management (owner, manager, NCS).
-- =============================================================================

-- =============================================================================
-- SECTION 1: ENUM TYPES
-- =============================================================================

CREATE TYPE public.net_type AS ENUM (
  'ragchew', 'traffic', 'swap', 'ares', 'dx',
  'training', 'skywarn', 'club', 'specialty'
);

CREATE TYPE public.net_visibility AS ENUM (
  'public', 'unlisted', 'private'
);

CREATE TYPE public.net_manager_role AS ENUM (
  'owner', 'manager', 'ncs'
);

CREATE TYPE public.session_status AS ENUM (
  'scheduled', 'live', 'completed', 'cancelled'
);

CREATE TYPE public.checkin_status AS ENUM (
  'checked_in', 'had_turn', 'completed', 'skipped'
);

-- =============================================================================
-- SECTION 2: TRIGGER FUNCTIONS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_net_subscriber_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.nets
    SET subscriber_count = subscriber_count + 1
    WHERE id = NEW.net_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.nets
    SET subscriber_count = subscriber_count - 1
    WHERE id = OLD.net_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_checkin_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NEW.user_id IS NULL AND NEW.callsign IS NOT NULL THEN
    SELECT id INTO NEW.user_id
    FROM public.profiles
    WHERE UPPER(callsign) = UPPER(NEW.callsign)
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_session_checkin_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.net_sessions
    SET checkin_count = checkin_count + 1
    WHERE id = NEW.session_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.net_sessions
    SET checkin_count = checkin_count - 1
    WHERE id = OLD.session_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.nets_update_search_vector()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  NEW.search_vector :=
    to_tsvector('english', coalesce(NEW.name, '') || ' ' || coalesce(NEW.description, '') || ' ' || coalesce(array_to_string(NEW.tags, ' '), ''));
  RETURN NEW;
END;
$$;

-- =============================================================================
-- SECTION 3: ALL TABLES (created before any RLS policies)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.nets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  type              public.net_type NOT NULL DEFAULT 'ragchew',
  description       text,
  frequency         text NOT NULL,
  alt_frequency     text,
  mode              text NOT NULL,
  band              text NOT NULL,
  schedule          jsonb,
  duration_minutes  int,
  region            text,
  repeater_info     jsonb,
  preamble_template text,
  tags              text[] DEFAULT '{}',
  visibility        public.net_visibility NOT NULL DEFAULT 'public',
  website_url       text,
  subscriber_count  int NOT NULL DEFAULT 0,
  created_by        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  search_vector     tsvector
);

CREATE TABLE IF NOT EXISTS public.net_managers (
  net_id     uuid NOT NULL REFERENCES public.nets(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role       public.net_manager_role NOT NULL DEFAULT 'ncs',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (net_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.net_subscriptions (
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  net_id          uuid NOT NULL REFERENCES public.nets(id) ON DELETE CASCADE,
  alert_10min     boolean NOT NULL DEFAULT false,
  alert_5min      boolean NOT NULL DEFAULT false,
  alert_3min      boolean NOT NULL DEFAULT false,
  show_on_profile boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, net_id)
);

CREATE TABLE IF NOT EXISTS public.net_sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  net_id         uuid NOT NULL REFERENCES public.nets(id) ON DELETE CASCADE,
  ncs_user_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ncs_callsign   text,
  started_at     timestamptz NOT NULL DEFAULT now(),
  ended_at       timestamptz,
  status         public.session_status NOT NULL DEFAULT 'scheduled',
  checkin_count  int NOT NULL DEFAULT 0,
  notes          text,
  summary        jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.net_checkins (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL REFERENCES public.net_sessions(id) ON DELETE CASCADE,
  callsign        text NOT NULL,
  user_id         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  checked_in_at   timestamptz NOT NULL DEFAULT now(),
  status          public.checkin_status NOT NULL DEFAULT 'checked_in',
  is_relay        boolean NOT NULL DEFAULT false,
  relay_via       text,
  traffic_notes   text,
  queue_position  int,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- SECTION 4: INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS nets_type_idx ON public.nets (type);
CREATE INDEX IF NOT EXISTS nets_band_idx ON public.nets (band);
CREATE INDEX IF NOT EXISTS nets_mode_idx ON public.nets (mode);
CREATE INDEX IF NOT EXISTS nets_visibility_public_idx ON public.nets (visibility) WHERE visibility = 'public';
CREATE INDEX IF NOT EXISTS nets_created_by_idx ON public.nets (created_by);
CREATE INDEX IF NOT EXISTS nets_fulltext_idx ON public.nets USING GIN (search_vector);

CREATE INDEX IF NOT EXISTS net_sessions_net_id_idx ON public.net_sessions (net_id, started_at DESC);
CREATE INDEX IF NOT EXISTS net_sessions_ncs_user_idx ON public.net_sessions (ncs_user_id);
CREATE INDEX IF NOT EXISTS net_sessions_status_idx ON public.net_sessions (status) WHERE status IN ('scheduled', 'live');

CREATE INDEX IF NOT EXISTS net_checkins_session_idx ON public.net_checkins (session_id, queue_position);
CREATE INDEX IF NOT EXISTS net_checkins_user_idx ON public.net_checkins (user_id) WHERE user_id IS NOT NULL;

-- =============================================================================
-- SECTION 5: RLS POLICIES (all tables exist now)
-- =============================================================================

-- ── nets ────────────────────────────────────────────────────────────────────

ALTER TABLE public.nets ENABLE ROW LEVEL SECURITY;

CREATE POLICY nets_select_public ON public.nets
  FOR SELECT USING (visibility IN ('public', 'unlisted'));

CREATE POLICY nets_select_private_creator ON public.nets
  FOR SELECT USING (
    visibility = 'private' AND created_by = auth.uid()
  );

CREATE POLICY nets_select_private_manager ON public.nets
  FOR SELECT USING (
    visibility = 'private'
    AND EXISTS (
      SELECT 1 FROM public.net_managers
      WHERE net_id = nets.id AND user_id = auth.uid()
    )
  );

CREATE POLICY nets_select_private_subscriber ON public.nets
  FOR SELECT USING (
    visibility = 'private'
    AND EXISTS (
      SELECT 1 FROM public.net_subscriptions
      WHERE net_id = nets.id AND user_id = auth.uid()
    )
  );

CREATE POLICY nets_insert_own ON public.nets
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY nets_update_creator ON public.nets
  FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY nets_update_manager ON public.nets
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.net_managers
      WHERE net_id = nets.id AND user_id = auth.uid() AND role IN ('owner', 'manager')
    )
  );

CREATE POLICY nets_delete_creator ON public.nets
  FOR DELETE USING (auth.uid() = created_by);

-- ── net_managers ────────────────────────────────────────────────────────────

ALTER TABLE public.net_managers ENABLE ROW LEVEL SECURITY;

CREATE POLICY net_managers_select_all ON public.net_managers
  FOR SELECT USING (true);

CREATE POLICY net_managers_insert_authorized ON public.net_managers
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.nets WHERE id = net_id AND created_by = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.net_managers AS nm
      WHERE nm.net_id = net_managers.net_id AND nm.user_id = auth.uid() AND nm.role = 'owner'
    )
  );

CREATE POLICY net_managers_delete_authorized ON public.net_managers
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.nets WHERE id = net_id AND created_by = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.net_managers AS nm
      WHERE nm.net_id = net_managers.net_id AND nm.user_id = auth.uid() AND nm.role = 'owner'
    )
  );

-- ── net_subscriptions ───────────────────────────────────────────────────────

ALTER TABLE public.net_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY net_subscriptions_all_own ON public.net_subscriptions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── net_sessions ────────────────────────────────────────────────────────────

ALTER TABLE public.net_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY net_sessions_select_all ON public.net_sessions
  FOR SELECT USING (true);

CREATE POLICY net_sessions_insert_manager ON public.net_sessions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.nets WHERE id = net_id AND created_by = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.net_managers
      WHERE net_managers.net_id = net_sessions.net_id AND net_managers.user_id = auth.uid()
    )
  );

CREATE POLICY net_sessions_update_ncs ON public.net_sessions
  FOR UPDATE USING (auth.uid() = ncs_user_id);

CREATE POLICY net_sessions_update_creator ON public.net_sessions
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.nets WHERE id = net_id AND created_by = auth.uid())
  );

-- ── net_checkins ────────────────────────────────────────────────────────────

ALTER TABLE public.net_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY net_checkins_select_all ON public.net_checkins
  FOR SELECT USING (true);

CREATE POLICY net_checkins_insert_manager ON public.net_checkins
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.net_sessions ns
      JOIN public.nets n ON n.id = ns.net_id
      WHERE ns.id = session_id
        AND (n.created_by = auth.uid() OR ns.ncs_user_id = auth.uid()
             OR EXISTS (SELECT 1 FROM public.net_managers nm WHERE nm.net_id = n.id AND nm.user_id = auth.uid()))
    )
  );

CREATE POLICY net_checkins_update_manager ON public.net_checkins
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.net_sessions ns
      JOIN public.nets n ON n.id = ns.net_id
      WHERE ns.id = session_id
        AND (n.created_by = auth.uid() OR ns.ncs_user_id = auth.uid()
             OR EXISTS (SELECT 1 FROM public.net_managers nm WHERE nm.net_id = n.id AND nm.user_id = auth.uid()))
    )
  );

CREATE POLICY net_checkins_delete_manager ON public.net_checkins
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.net_sessions ns
      JOIN public.nets n ON n.id = ns.net_id
      WHERE ns.id = session_id
        AND (n.created_by = auth.uid() OR ns.ncs_user_id = auth.uid()
             OR EXISTS (SELECT 1 FROM public.net_managers nm WHERE nm.net_id = n.id AND nm.user_id = auth.uid()))
    )
  );

-- =============================================================================
-- SECTION 6: TRIGGERS
-- =============================================================================

CREATE TRIGGER nets_search_vector_trigger
  BEFORE INSERT OR UPDATE OF name, description, tags
  ON public.nets FOR EACH ROW
  EXECUTE FUNCTION public.nets_update_search_vector();

CREATE TRIGGER nets_updated_at
  BEFORE UPDATE ON public.nets FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER net_subscriptions_count
  AFTER INSERT OR DELETE ON public.net_subscriptions FOR EACH ROW
  EXECUTE FUNCTION public.update_net_subscriber_count();

CREATE TRIGGER net_sessions_updated_at
  BEFORE UPDATE ON public.net_sessions FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER net_checkins_resolve_user
  BEFORE INSERT ON public.net_checkins FOR EACH ROW
  EXECUTE FUNCTION public.resolve_checkin_user();

CREATE TRIGGER net_checkins_count
  AFTER INSERT OR DELETE ON public.net_checkins FOR EACH ROW
  EXECUTE FUNCTION public.update_session_checkin_count();

CREATE TRIGGER net_checkins_updated_at
  BEFORE UPDATE ON public.net_checkins FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- =============================================================================
-- SECTION 7: REALTIME
-- =============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.net_checkins;
ALTER PUBLICATION supabase_realtime ADD TABLE public.net_sessions;

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
