-- Synthetic prerequisite shape from the existing display service migration.
-- No live database is targeted by this fixture runner.
create table public.displays (
  id uuid primary key,
  owner uuid references auth.users(id),
  scene_config jsonb not null default '{}'::jsonb,
  device_token_hash text not null
);
grant all on public.displays to service_role;
