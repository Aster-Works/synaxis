-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ Google 連携トークンの隔離テスト（pgTAP）                              ║
-- ║  - private.google_integrations を authenticated/anon が直接読めない    ║
-- ║  - save/read RPC は owner/admin のみ・他教会/未認証は不可              ║
-- ║  - 暗号化ラウンドトリップ（正しい鍵で復号・誤鍵で失敗）               ║
-- ╚══════════════════════════════════════════════════════════════════════╝

begin;
select plan(8);

create function pg_temp.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
end; $$;
create function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
end; $$;
create function pg_temp.as_postgres() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claims','',true); end; $$;

insert into auth.users (id, aud, role, email) values
  ('a0000000-0000-0000-0000-000000000001','authenticated','authenticated','ownerA@t.dev'),
  ('a0000000-0000-0000-0000-000000000002','authenticated','authenticated','recepA@t.dev'),
  ('b0000000-0000-0000-0000-000000000001','authenticated','authenticated','ownerB@t.dev');
insert into public.churches (id,name,slug) values
  ('11111111-1111-1111-1111-111111111111','Church A','c-a'),
  ('22222222-2222-2222-2222-222222222222','Church B','c-b');
insert into public.church_memberships (church_id,user_id,role) values
  ('11111111-1111-1111-1111-111111111111','a0000000-0000-0000-0000-000000000001','owner'),
  ('11111111-1111-1111-1111-111111111111','a0000000-0000-0000-0000-000000000002','receptionist'),
  ('22222222-2222-2222-2222-222222222222','b0000000-0000-0000-0000-000000000001','owner');

-- 1) authenticated は private テーブルを直接 SELECT できない（permission denied）
select pg_temp.login('a0000000-0000-0000-0000-000000000001');
select throws_ok(
  $$ select count(*) from private.google_integrations $$,
  '42501', null,
  'authenticated は private.google_integrations を直接読めない'
);

-- 2) ownerA は保存できる
select lives_ok(
  $$ select public.save_google_integration(
       '11111111-1111-1111-1111-111111111111', 'refresh-token-A', 'a@example.com', 'enckey-123') $$,
  'ownerA は Google 連携を保存できる'
);

-- 3) 正しい鍵で refresh_token を復号できる
select is(
  (select public.read_google_refresh_token('11111111-1111-1111-1111-111111111111','enckey-123')),
  'refresh-token-A',
  '正しい鍵で refresh_token を復号できる'
);

-- 4) 誤った鍵では復号に失敗（例外）
select throws_ok(
  $$ select public.read_google_refresh_token('11111111-1111-1111-1111-111111111111','wrong-key') $$,
  null,
  '誤った鍵では復号できない'
);

-- 5) receptionistA は保存できない
select pg_temp.as_postgres();
select pg_temp.login('a0000000-0000-0000-0000-000000000002');
select throws_ok(
  $$ select public.save_google_integration(
       '11111111-1111-1111-1111-111111111111','x','x@e.com','k') $$,
  'P0001', null,
  'receptionistA は Google 連携を保存できない'
);

-- 6) receptionistA は read もできない
select throws_ok(
  $$ select public.read_google_refresh_token('11111111-1111-1111-1111-111111111111','enckey-123') $$,
  'P0001', null,
  'receptionistA は refresh_token を読めない'
);

-- 7) 教会B の owner は 教会A のトークンを読めない（越境不可）
select pg_temp.as_postgres();
select pg_temp.login('b0000000-0000-0000-0000-000000000001');
select throws_ok(
  $$ select public.read_google_refresh_token('11111111-1111-1111-1111-111111111111','enckey-123') $$,
  'P0001', null,
  'ownerB は教会A のトークンを読めない'
);

-- 8) anon は RPC を実行できない（permission denied）
select pg_temp.as_anon();
select throws_ok(
  $$ select public.get_google_integration_status('11111111-1111-1111-1111-111111111111') $$,
  '42501', null,
  'anon は Google 連携 RPC を実行できない'
);

select * from finish();
rollback;
