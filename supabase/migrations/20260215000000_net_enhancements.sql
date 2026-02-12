-- Net Enhancements: formality, protocol notes, newcomer-friendly, VoIP nodes, RSVPs
-- Phase 2A of Net Control Manager V2

-- Add columns to nets table
ALTER TABLE public.nets ADD COLUMN IF NOT EXISTS formality_level smallint CHECK (formality_level BETWEEN 1 AND 5);
ALTER TABLE public.nets ADD COLUMN IF NOT EXISTS protocol_notes text;
ALTER TABLE public.nets ADD COLUMN IF NOT EXISTS newcomer_friendly boolean NOT NULL DEFAULT true;
ALTER TABLE public.nets ADD COLUMN IF NOT EXISTS echolink_node text;
ALTER TABLE public.nets ADD COLUMN IF NOT EXISTS allstar_node text;
ALTER TABLE public.nets ADD COLUMN IF NOT EXISTS irlp_node text;

-- net_rsvps table
CREATE TABLE IF NOT EXISTS public.net_rsvps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  net_id uuid NOT NULL REFERENCES public.nets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(net_id, user_id, session_date)
);

-- RLS for net_rsvps
ALTER TABLE public.net_rsvps ENABLE ROW LEVEL SECURITY;

CREATE POLICY net_rsvps_select_all ON public.net_rsvps
  FOR SELECT USING (true);

CREATE POLICY net_rsvps_insert_own ON public.net_rsvps
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY net_rsvps_delete_own ON public.net_rsvps
  FOR DELETE USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS net_rsvps_net_date_idx ON public.net_rsvps (net_id, session_date);
CREATE INDEX IF NOT EXISTS net_rsvps_user_idx ON public.net_rsvps (user_id);
