-- Display Wall baseline (E3, dev plan §3)
--
-- Two tables:
--   displays              — one row per paired wall display. Owner manages it
--                           client-side under RLS; the device itself never
--                           touches PostgREST — it authenticates to the
--                           displays edge functions with a bearer token whose
--                           sha256 hash lives in device_token_hash (checked
--                           under the service role).
--   display_pairing_codes — short-lived 6-char codes minted at registration.
--                           Service-role only (RLS enabled, no policies).

create table public.displays (
  id uuid primary key default gen_random_uuid(),
  owner uuid references auth.users (id) on delete cascade,
  name text not null default 'New display',
  scene_config jsonb not null default '{}'::jsonb,
  device_token_hash text not null,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index displays_owner_idx on public.displays (owner);

create table public.display_pairing_codes (
  code text primary key,
  display_id uuid not null references public.displays (id) on delete cascade,
  expires_at timestamptz not null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.displays enable row level security;
alter table public.display_pairing_codes enable row level security;

-- Owner-only read/update/delete. No insert policy: rows are created by the
-- pairing edge function under the service role (owner is null until claimed).
create policy "displays_owner_select" on public.displays
  for select using (auth.uid() = owner);

create policy "displays_owner_update" on public.displays
  for update using (auth.uid() = owner) with check (auth.uid() = owner);

create policy "displays_owner_delete" on public.displays
  for delete using (auth.uid() = owner);

-- updated_at tracks content changes only (scene/name/owner), NOT the
-- last_seen_at heartbeat the state endpoint writes on every device poll —
-- devices compare updated_at to decide whether to re-render.
create or replace function public.touch_displays_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.scene_config is distinct from old.scene_config
     or new.name is distinct from old.name
     or new.owner is distinct from old.owner then
    new.updated_at := now();
  end if;
  return new;
end
$$;

create trigger displays_touch_updated_at
  before update on public.displays
  for each row execute function public.touch_displays_updated_at();
