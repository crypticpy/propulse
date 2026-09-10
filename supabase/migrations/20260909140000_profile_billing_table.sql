-- #866 / PR #867 Codex round 2: move billing state off `public.profiles`.
--
-- 20260909110000_profiles_subscription_columns.sql put subscription_tier,
-- subscription_status, subscription_period_end and stripe_customer_id on
-- `profiles` and guarded them with a BEFORE UPDATE trigger. That file is
-- already applied, so this migration moves forward from it rather than
-- editing it. Two findings forced the move:
--
--   P1: api/billing/create-checkout.ts wrote stripe_customer_id through a
--   PostgREST client carrying the caller's JWT, so the write ran as
--   `authenticated` and the guard trigger raised. Every first-time subscriber
--   got a 500 *after* an orphan Stripe customer had been created. A trigger
--   that has to distinguish "the app writing on your behalf" from "you" is the
--   wrong shape; the table split makes the role boundary structural.
--
--   P2: `profiles_select` (20260210020000_rls_performance.sql) exposes any row
--   whose visibility_settings->>'profile' is 'public', and
--   src/pages/ProfilePage.tsx selects `*`. Tier, status, period end and the
--   Stripe customer id were readable by anyone looking at a public profile.
--
-- `public.profile_billing` fixes both: no client role can write it at all (no
-- INSERT/UPDATE/DELETE policy and no grant), and the single SELECT policy is
-- own-row only, so a public profile lookup cannot reach it.
--
-- Idempotent throughout, and ordered so the realtime policies never reference
-- a column that has already been dropped.

CREATE TABLE IF NOT EXISTS public.profile_billing (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  subscription_tier text NOT NULL DEFAULT 'free'
    CHECK (subscription_tier IN ('free', 'pro')),
  subscription_status text NOT NULL DEFAULT 'inactive',
  subscription_period_end timestamptz,
  stripe_customer_id text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- The webhook resolves a billing row by its Stripe customer; one customer maps
-- to one account.
CREATE UNIQUE INDEX IF NOT EXISTS profile_billing_stripe_customer_id_key
  ON public.profile_billing (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

DROP TRIGGER IF EXISTS profile_billing_updated_at ON public.profile_billing;
CREATE TRIGGER profile_billing_updated_at
  BEFORE UPDATE ON public.profile_billing
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.profile_billing ENABLE ROW LEVEL SECURITY;

-- Only the service role (the Stripe webhook and the checkout endpoint) and
-- direct database sessions may write. `authenticated` gets SELECT alone, which
-- is what the realtime policies below and profileSync's own-row read need.
REVOKE ALL ON public.profile_billing FROM public, anon, authenticated;
GRANT SELECT ON public.profile_billing TO authenticated;
GRANT ALL ON public.profile_billing TO service_role;

DROP POLICY IF EXISTS profile_billing_select_own ON public.profile_billing;
CREATE POLICY profile_billing_select_own ON public.profile_billing
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- Carry whatever the applied columns hold. Guarded on the columns still being
-- present so a re-run after the DROP below is a no-op rather than an error.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'subscription_tier'
  ) THEN
    EXECUTE $migrate$
      INSERT INTO public.profile_billing (
        user_id,
        subscription_tier,
        subscription_status,
        subscription_period_end,
        stripe_customer_id
      )
      SELECT
        id,
        subscription_tier,
        subscription_status,
        subscription_period_end,
        stripe_customer_id
      FROM public.profiles
      ON CONFLICT (user_id) DO NOTHING
    $migrate$;
  END IF;
END $$;

-- Repoint the operating-channel policies before the columns go away; a policy
-- expression depends on the column it reads, so DROP COLUMN would otherwise
-- fail (or cascade the policy away).
--
-- Bodies copied verbatim from
-- 20260909120000_operating_channel_realtime_policy.sql except for the
-- entitlement subquery. The paid-tier predicate below must be kept in lockstep
-- with api/_lib/entitlements.ts's `hasProEntitlement` — if that function's tier
-- check ever changes (a distinct `sync` add-on, a new column, etc.), update
-- both policies here to match in the same change.

DROP POLICY IF EXISTS operating_channel_select_own ON realtime.messages;
CREATE POLICY operating_channel_select_own ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    extension = 'broadcast'
    AND realtime.topic() LIKE 'operating:%'
    AND split_part(realtime.topic(), ':', 2) = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.profile_billing b
      WHERE b.user_id = auth.uid()
        AND b.subscription_tier = 'pro'
    )
  );

DROP POLICY IF EXISTS operating_channel_insert_own ON realtime.messages;
CREATE POLICY operating_channel_insert_own ON realtime.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    extension = 'broadcast'
    AND realtime.topic() LIKE 'operating:%'
    AND split_part(realtime.topic(), ':', 2) = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.profile_billing b
      WHERE b.user_id = auth.uid()
        AND b.subscription_tier = 'pro'
    )
  );

-- The guard trigger existed only because the columns shared a table with
-- client-writable profile fields. Nothing on `profile_billing` is writable by
-- a client role, so it has nothing left to protect.
DROP TRIGGER IF EXISTS profiles_guard_subscription_columns ON public.profiles;
DROP FUNCTION IF EXISTS public.profiles_guard_subscription_columns();

-- Drops the CHECK constraint and the partial unique index with them.
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS subscription_tier,
  DROP COLUMN IF EXISTS subscription_status,
  DROP COLUMN IF EXISTS subscription_period_end,
  DROP COLUMN IF EXISTS stripe_customer_id;

-- PostgREST reloads its schema cache asynchronously; without this a
-- checkout.session.completed arriving right after this migration applies can
-- hit a stale cache that doesn't know profile_billing yet.
NOTIFY pgrst, 'reload schema';
