-- Band Health feedback hardening (bot review on PR #70)
--
-- 1) Constrain band to the canonical ladder set and make scope_type /
--    scope_key shapes mutually consistent — free-form labels would enter
--    the offline eval dataset without ever joining to verdict data.
-- 2) RLS predicates use the repo's (select auth.uid()) init-plan form
--    (standardized in 20260210020000_rls_performance.sql).
-- 3) Rate-cap trigger: check identity before any privileged lookup (a
--    SECURITY DEFINER BEFORE trigger fires ahead of RLS WITH CHECK, so a
--    client submitting another user's uuid could otherwise probe that
--    user's rate-cap state from the exception), and take a per-user
--    transaction advisory lock so concurrent inserts cannot all read the
--    same window and pass the caps together.

alter table public.verdict_feedback
  drop constraint if exists verdict_feedback_band_check;

alter table public.verdict_feedback
  add constraint verdict_feedback_band_canonical check (
    band in ('160m', '80m', '60m', '40m', '30m', '20m',
             '17m', '15m', '12m', '10m', '6m')
  );

-- global uses '', regional uses a continent code, dx a non-empty pair key
-- (length already capped at 16 by the column check).
alter table public.verdict_feedback
  add constraint verdict_feedback_scope_shape check (
    (scope_type = 'global' and scope_key = '')
    or (scope_type = 'regional' and scope_key ~ '^[A-Z]{2}$')
    or (scope_type = 'dx' and scope_key <> '')
  );

alter policy "verdict_feedback_insert_own" on public.verdict_feedback
  with check ((select auth.uid()) = user_id);

alter policy "verdict_feedback_select_own" on public.verdict_feedback
  using ((select auth.uid()) = user_id);

create or replace function public.verdict_feedback_rate_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  last_at timestamptz;
  hour_count integer;
begin
  -- Identity before any privileged read: never leak another user's
  -- rate-cap state. Service-role inserts (no JWT) remain allowed.
  if auth.uid() is not null and new.user_id <> auth.uid() then
    raise exception 'user_id must match the authenticated user';
  end if;

  -- Serialize per user: without this, concurrent transactions all read
  -- the same max/count before any sibling commits and every one passes.
  perform pg_advisory_xact_lock(
    hashtextextended('verdict_feedback:' || new.user_id::text, 0)
  );

  -- Never trust a client-supplied timestamp — both caps key off it.
  new.created_at := now();

  select max(created_at) into last_at
  from public.verdict_feedback
  where user_id = new.user_id;
  if last_at is not null and new.created_at - last_at < interval '10 seconds' then
    raise exception 'feedback rate cap: minimum 10 seconds between submissions';
  end if;

  select count(*) into hour_count
  from public.verdict_feedback
  where user_id = new.user_id
    and created_at > new.created_at - interval '1 hour';
  if hour_count >= 30 then
    raise exception 'feedback rate cap: hourly limit reached';
  end if;

  return new;
end
$$;
