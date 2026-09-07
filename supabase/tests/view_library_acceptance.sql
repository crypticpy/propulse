-- SQL-only fixtures: API tests separately validate complete versioned configurations.
insert into auth.users(id) values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
insert into public.displays values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','token-a'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','token-b');
create function pg_temp.view_op(op_id text, doc text, rev bigint, doc_kind text default 'view') returns jsonb
language sql as $$ select jsonb_build_object('ownerId','11111111-1111-4111-8111-111111111111',
 'operationId',op_id,'kind',doc_kind,'id',doc,'expectedRevision',rev,
 'value',jsonb_build_object('kind',doc_kind,'data',jsonb_build_object('id',doc,'schemaVersion',1))); $$;

begin;
set local role service_role;
do $$
declare
 actor uuid := '11111111-1111-4111-8111-111111111111';
 op jsonb := pg_temp.view_op('create','station',0);
 first_result jsonb;
 answer jsonb;
begin
 first_result := public.commit_view_library(actor,op);
 if first_result->>'status' <> 'saved' then raise exception 'create failed'; end if;
 if public.commit_view_library(actor,op) <> first_result then raise exception 'receipt not idempotent'; end if;
 answer := public.commit_view_library(actor,op || jsonb_build_object('id','other'));
 if answer->>'status' <> 'invalid' then raise exception 'operation reuse accepted'; end if;
 answer := public.commit_view_library(actor,pg_temp.view_op('stale','station',0));
 if answer->>'status' <> 'conflict' or answer->'current'->>'revision' <> '1' then raise exception 'CAS conflict lost'; end if;
 answer := public.commit_view_library(actor,pg_temp.view_op('preset','station',0,'preset'));
 if answer->>'status' <> 'saved' then raise exception 'preset shares view revision'; end if;
 answer := public.commit_view_library(actor,pg_temp.view_op('delete','station',1) || jsonb_build_object('value',null));
 if answer->'record'->>'revision' <> '2' then raise exception 'tombstone revision lost'; end if;
 answer := public.commit_view_library(actor,pg_temp.view_op('resurrect','station',0));
 if answer->>'status' <> 'conflict' then raise exception 'stale create resurrected deletion'; end if;
 answer := public.commit_view_library(actor,pg_temp.view_op('restore','station',2));
 if answer->'record'->>'revision' <> '3' then raise exception 'explicit restore failed'; end if;
 answer := public.commit_view_library('22222222-2222-4222-8222-222222222222',op);
 if answer->>'status' <> 'forbidden' then raise exception 'foreign owner accepted'; end if;
 answer := public.commit_view_library(actor,pg_temp.view_op('bad','bad',9007199254740991));
 if answer->>'status' <> 'invalid' then raise exception 'unsafe revision accepted'; end if;
 answer := public.commit_view_library(actor,pg_temp.view_op('tv','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',0,'display'));
 if answer->>'status' <> 'saved' then raise exception 'owned publication failed'; end if;
 answer := public.commit_view_library(actor,pg_temp.view_op('foreign-tv','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',0,'display'));
 if answer->>'status' <> 'forbidden' then raise exception 'foreign display publication accepted'; end if;
 if public.read_view_display_assignment('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','token-b') is not null then raise exception 'cross-device token read'; end if;
 answer := public.read_view_display_assignment('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','token-a');
 if answer->'assignment'->>'revision' <> '1' then raise exception 'assignment snapshot absent'; end if;
 update public.displays set owner = null where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 answer := public.commit_view_library(actor,pg_temp.view_op('tv','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',0,'display'));
 if answer->>'status' <> 'forbidden' then raise exception 'replay bypassed unpair'; end if;
 answer := public.read_view_display_assignment('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','token-a');
 if answer->'assignment' <> 'null'::jsonb then raise exception 'unpaired display leaked assignment'; end if;
end $$;
reset role;
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$ begin
 if (select count(*) from public.view_library_records) <> 0 then raise exception 'RLS cross-owner read'; end if;
 begin
  perform public.commit_view_library('22222222-2222-4222-8222-222222222222','{}');
  raise exception 'authenticated invoked trusted RPC';
 exception when insufficient_privilege then null; end;
 begin
  delete from public.view_library_records;
  raise exception 'authenticated wrote library';
 exception when insufficient_privilege then null; end;
 begin
  perform * from public.view_library_receipts;
  raise exception 'authenticated read receipts';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$ begin
 if (select count(*) from public.view_library_records where kind='view') <> 1 then raise exception 'owner read missing'; end if;
end $$;
reset role;
rollback;

-- Real concurrent connections race an absent document; receipts and the record
-- must commit together. The disposable server exposes only its Unix socket.
create extension dblink with schema extensions;
do $$
declare a jsonb; b jsonb; op1 jsonb; op2 jsonb;
begin
 perform extensions.dblink_connect('view_a','host=/tmp user=postgres dbname=postgres');
 perform extensions.dblink_connect('view_b','host=/tmp user=postgres dbname=postgres');
 op1 := pg_temp.view_op('race-a','race',0);
 op2 := pg_temp.view_op('race-b','race',0);
 perform extensions.dblink_send_query('view_a',format('select public.commit_view_library(%L::uuid,%L::jsonb)',op1->>'ownerId',op1::text));
 perform extensions.dblink_send_query('view_b',format('select public.commit_view_library(%L::uuid,%L::jsonb)',op2->>'ownerId',op2::text));
 select result into a from extensions.dblink_get_result('view_a') as t(result jsonb);
 select result into b from extensions.dblink_get_result('view_b') as t(result jsonb);
 if not ((a->>'status'='saved' and b->>'status'='conflict') or (b->>'status'='saved' and a->>'status'='conflict')) then
  raise exception 'concurrent CAS failed: %, %', a,b;
 end if;
 -- Drain each async query before reusing its connection.
 perform * from extensions.dblink_get_result('view_a') as t(result jsonb);
 perform * from extensions.dblink_get_result('view_b') as t(result jsonb);
 op1 := pg_temp.view_op('same-operation','replay-race',0);
 perform extensions.dblink_send_query('view_a',format('select public.commit_view_library(%L::uuid,%L::jsonb)',op1->>'ownerId',op1::text));
 perform extensions.dblink_send_query('view_b',format('select public.commit_view_library(%L::uuid,%L::jsonb)',op1->>'ownerId',op1::text));
 select result into a from extensions.dblink_get_result('view_a') as t(result jsonb);
 select result into b from extensions.dblink_get_result('view_b') as t(result jsonb);
 if a is distinct from b or a->>'status' <> 'saved' or a->'record'->>'revision' <> '1' then
  raise exception 'concurrent operation replay failed: %, %', a,b;
 end if;
 perform extensions.dblink_disconnect('view_a'); perform extensions.dblink_disconnect('view_b');
end $$;
