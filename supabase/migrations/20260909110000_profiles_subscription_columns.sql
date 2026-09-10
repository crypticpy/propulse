-- #866: the subscription columns the billing code has assumed all along.
--
-- api/billing/webhook.ts writes subscription_tier / subscription_status /
-- subscription_period_end keyed on stripe_customer_id, api/_lib/entitlements.ts
-- reads subscription_tier, src/lib/sync/modules/profileSync.ts reads all three,
-- and 20260909120000_operating_channel_realtime_policy.sql gates the operating
-- channel on subscription_tier = 'pro'. No migration ever created them, so
-- every one of those calls errored against the live schema and the realtime
-- policy migration could not apply. Timestamped before that policy so
-- `migration up` orders this first.
--
-- Additive and idempotent. Nobody becomes pro here: the tier defaults to
-- free and only the Stripe webhook (or the owner by hand) moves it.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_tier text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS subscription_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_subscription_tier_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_subscription_tier_check
      CHECK (subscription_tier IN ('free', 'pro'));
  END IF;
END $$;

-- The webhook resolves a profile by its Stripe customer; one customer maps to
-- one profile.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_stripe_customer_id_key
  ON public.profiles (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- Codex on PR #867: `profiles_update_own` (20260210020000_rls_performance.sql)
-- lets a signed-in client update every column of its own row, so without a
-- guard any account could set its own tier to 'pro' and both
-- hasProEntitlement and the operating-channel policy would believe it.
-- Only the service role (the Stripe webhook) and direct database sessions may
-- move these four columns; PostgREST runs client requests as `authenticated`
-- or `anon`, so those two roles are rejected when any of them changes.
CREATE OR REPLACE FUNCTION public.profiles_guard_subscription_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') AND (
       NEW.subscription_tier       IS DISTINCT FROM OLD.subscription_tier
    OR NEW.subscription_status     IS DISTINCT FROM OLD.subscription_status
    OR NEW.subscription_period_end IS DISTINCT FROM OLD.subscription_period_end
    OR NEW.stripe_customer_id      IS DISTINCT FROM OLD.stripe_customer_id
  ) THEN
    RAISE EXCEPTION 'subscription columns are managed by billing'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_subscription_columns ON public.profiles;
CREATE TRIGGER profiles_guard_subscription_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_guard_subscription_columns();
