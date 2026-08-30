-- Band Health user feedback plumbing (BH4 groundwork, dev plan §8)
--
-- verdict_feedback: per-band thumbs up/down ("was this verdict right?")
-- with an optional note, keyed to the scope and ladder state the user was
-- shown. Append-only labeled data for the Phase G eval reports — feedback
-- is NEVER a live scoring input (§8 abuse containment): nothing in the
-- collector or the serving endpoints reads it at verdict time, and the
-- offline weighting (reporter agreement with objective outcomes) happens
-- in the eval pipeline under the service role.
--
-- Rate caps live in the database (BEFORE INSERT trigger) so no client or
-- edge path can bypass them, and created_at is forced server-side so a
-- spoofed timestamp cannot dodge the caps.

create table public.verdict_feedback (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  band text not null check (char_length(band) between 2 and 8),
  scope_type text not null check (scope_type in ('global', 'regional', 'dx')),
  scope_key text not null default '' check (char_length(scope_key) <= 16),
  state text not null
    check (state in ('closed', 'forecast', 'stirring', 'verified', 'hot')),
  agree boolean not null,
  note text check (char_length(note) <= 280),
  created_at timestamptz not null default now()
);

-- Serves both rate-cap lookups (max/count per user in a window) and
-- per-user history reads.
create index verdict_feedback_user_recent_idx
  on public.verdict_feedback (user_id, created_at desc);

-- Eval-window scans by time.
create index verdict_feedback_created_idx
  on public.verdict_feedback (created_at);

alter table public.verdict_feedback enable row level security;

-- Own rows only, append-only: no update/delete policies — feedback is
-- labeled data weighted by each reporter's historical agreement (§8), so
-- history cannot be laundered. A changed mind is a new row; the eval takes
-- the latest per user + scope offline.
create policy "verdict_feedback_insert_own" on public.verdict_feedback
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "verdict_feedback_select_own" on public.verdict_feedback
  for select to authenticated
  using (auth.uid() = user_id);

-- Rate caps: minimum 10 s between submissions, at most 30 per rolling
-- hour per user. SECURITY DEFINER so the window queries see the user's own
-- prior rows regardless of RLS; search_path pinned per convention.
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

revoke execute on function public.verdict_feedback_rate_cap() from public, anon, authenticated;

create trigger verdict_feedback_rate_cap
  before insert on public.verdict_feedback
  for each row execute function public.verdict_feedback_rate_cap();
