-- =============================================================================
-- Calendar Tokens: Long-lived opaque tokens for calendar feed authentication
-- Created: 2026-02-14
-- Description: Allows calendar apps (Google, Apple, Outlook) to authenticate
--              ICS feed requests without Bearer tokens or cookies.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.calendar_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token       text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

-- Fast token lookup for edge function validation
CREATE INDEX IF NOT EXISTS calendar_tokens_token_idx ON public.calendar_tokens (token);

-- User lookup (enforce one token per user via application logic)
CREATE INDEX IF NOT EXISTS calendar_tokens_user_id_idx ON public.calendar_tokens (user_id);

-- RLS
ALTER TABLE public.calendar_tokens ENABLE ROW LEVEL SECURITY;

-- Users can read their own tokens
CREATE POLICY calendar_tokens_select_own ON public.calendar_tokens
  FOR SELECT USING (auth.uid() = user_id);

-- Users can create their own tokens
CREATE POLICY calendar_tokens_insert_own ON public.calendar_tokens
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can delete their own tokens (for regeneration)
CREATE POLICY calendar_tokens_delete_own ON public.calendar_tokens
  FOR DELETE USING (auth.uid() = user_id);
