-- SP-02: authenticated server writes only. RLS clients may read their library.
-- Full versioned payload validation occurs in the service API; SQL independently
-- enforces identity, size, revisions, idempotency and display ownership.
create table public.view_library_records (
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('view', 'preset', 'display')),
  id text not null check (id ~ '^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,127}$'),
  revision bigint not null check (revision between 1 and 9007199254740991),
  value jsonb,
  display_id uuid generated always as (case when kind = 'display' then id::uuid else null end) stored
    references public.displays(id) on delete cascade,
  primary key (owner_id, kind, id),
  check (value is null or (jsonb_typeof(value) = 'object' and value->>'kind' = kind
    and octet_length(value::text) <= 1048576)),
  check (kind <> 'display' or value is not null)
);
create table public.view_library_receipts (
  owner_id uuid not null references auth.users(id) on delete cascade,
  operation_id text not null check (operation_id ~ '^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,127}$'),
  operation jsonb not null check (octet_length(operation::text) <= 1048576),
  result jsonb not null check (octet_length(result::text) <= 1048576),
  primary key (owner_id, operation_id)
);
alter table public.view_library_records enable row level security;
alter table public.view_library_receipts enable row level security;
revoke all on public.view_library_records, public.view_library_receipts from public, anon, authenticated;
grant select on public.view_library_records to authenticated;
grant all on public.view_library_records, public.view_library_receipts to service_role;
create policy view_library_owner_read on public.view_library_records for select to authenticated
  using (owner_id = auth.uid());

create function public.commit_view_library(actor uuid, op jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  doc_kind text := op->>'kind';
  doc_id text := op->>'id';
  op_id text := op->>'operationId';
  expected bigint;
  payload jsonb := nullif(op->'value', 'null'::jsonb);
  prior public.view_library_receipts%rowtype;
  current_row public.view_library_records%rowtype;
  current_json jsonb;
  answer jsonb;
  display_owner uuid;
begin
  if actor is null or jsonb_typeof(op) is distinct from 'object'
    or op->>'ownerId' is distinct from actor::text then
    return jsonb_build_object('status','forbidden','message','Owner mismatch');
  end if;
  if doc_kind is null or doc_kind not in ('view','preset','display')
    or doc_id is null or doc_id !~ '^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,127}$'
    or op_id is null or op_id !~ '^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,127}$'
    or jsonb_typeof(op->'expectedRevision') is distinct from 'number'
    or (op->>'expectedRevision') !~ '^[0-9]{1,16}$'
    or not (op ? 'value') or octet_length(op::text) > 1048576 then
    return jsonb_build_object('status','invalid','message','Invalid library operation');
  end if;
  expected := (op->>'expectedRevision')::bigint;
  if expected > 9007199254740990 or (payload is null and (doc_kind = 'display' or expected = 0))
    or (payload is not null and (jsonb_typeof(payload) is distinct from 'object'
      or payload->>'kind' is distinct from doc_kind
      or jsonb_typeof(payload->'data') is distinct from 'object'
      or (doc_kind <> 'display' and payload->'data'->>'id' is distinct from doc_id))) then
    return jsonb_build_object('status','invalid','message','Invalid library payload');
  end if;
  -- Recheck ownership even for a replay after a display has been unpaired/reassigned.
  if doc_kind = 'display' then
    if doc_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return jsonb_build_object('status','invalid','message','Invalid display identity');
    end if;
    select owner into display_owner from public.displays where id = doc_id::uuid for update;
    if display_owner is distinct from actor then
      return jsonb_build_object('status','forbidden','message','Display is not owned by this account');
    end if;
  end if;
  -- Locks serialize absent-row creates as well as updates. Hash collisions only
  -- cause extra serialization; identity/CAS checks still use complete keys.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('view-op:' || actor::text || ':' || op_id, 0));
  select * into prior from public.view_library_receipts where owner_id = actor and operation_id = op_id;
  if found then
    if prior.operation = op then return prior.result; end if;
    return jsonb_build_object('status','invalid','message','Operation ID reused with different content');
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('view-doc:' || actor::text || ':' || doc_kind || ':' || doc_id, 0));
  select * into current_row from public.view_library_records where owner_id = actor and kind = doc_kind and id = doc_id;
  if found then
    current_json := jsonb_build_object('ownerId',actor,'kind',doc_kind,'id',doc_id,'revision',current_row.revision,'value',current_row.value);
  end if;
  if coalesce(current_row.revision, 0) <> expected then
    answer := jsonb_build_object('status','conflict','current',current_json);
  else
    insert into public.view_library_records(owner_id,kind,id,revision,value)
      values(actor,doc_kind,doc_id,expected+1,payload)
      on conflict (owner_id,kind,id) do update set revision = excluded.revision, value = excluded.value;
    answer := jsonb_build_object('status','saved','record',jsonb_build_object(
      'ownerId',actor,'kind',doc_kind,'id',doc_id,'revision',expected+1,'value',payload));
  end if;
  insert into public.view_library_receipts(owner_id,operation_id,operation,result) values(actor,op_id,op,answer);
  return answer;
end;
$$;
revoke all on function public.commit_view_library(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.commit_view_library(uuid,jsonb) to service_role;

-- One statement binds token, display and current owner to the complete snapshot.
-- This endpoint does not expose account libraries or device credentials.
create function public.read_view_display_assignment(display_uuid uuid, token_hash text) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('paired',d.owner is not null,'assignment',
    case when r.value is null then null else r.value->'data' || jsonb_build_object('revision',r.revision) end)
  from public.displays d left join public.view_library_records r
    on r.owner_id = d.owner and r.kind = 'display' and r.id = d.id::text
  where d.id = display_uuid and d.device_token_hash = token_hash;
$$;
revoke all on function public.read_view_display_assignment(uuid,text) from public, anon, authenticated;
grant execute on function public.read_view_display_assignment(uuid,text) to service_role;
