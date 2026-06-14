-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 人物統合 merge_person RPC テスト（pgTAP）                              ║
-- ║ PRODUCT_SPEC §6.3 / §7.3                                              ║
-- ║  - 衝突出席の二重計上回避（lunch=max・checked_in_at=min）              ║
-- ║  - 非衝突行の付け替え／source の論理削除                               ║
-- ║  - authz: owner/admin のみ・同一教会のみ・anon 不可                    ║
-- ║  - 冪等（再実行安全）／監査 MERGE_PERSON                              ║
-- ╚══════════════════════════════════════════════════════════════════════╝

begin;
select plan(16);

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
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
end; $$;
create function pg_temp.as_postgres() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end; $$;

-- ── フィクスチャ ───────────────────────────────────────────────────────
insert into auth.users (id, aud, role, email) values
  ('a0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ownerA@t.dev'),
  ('a0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'recepA@t.dev'),
  ('a0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'viewerA@t.dev'),
  ('b0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ownerB@t.dev');

insert into public.churches (id, name, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Church A', 'church-a'),
  ('22222222-2222-2222-2222-222222222222', 'Church B', 'church-b');

insert into public.church_memberships (church_id, user_id, role) values
  ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'owner'),
  ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000002', 'receptionist'),
  ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000003', 'viewer'),
  ('22222222-2222-2222-2222-222222222222', 'b0000000-0000-0000-0000-000000000001', 'owner');

-- A1=target, A2=source（統合対象）, A3/A4=権限テスト用, B1=別教会
insert into public.people (id, church_id, display_name, relationship_status, age_group) values
  ('aa000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 'A1-target', 'member', 'adult'),
  ('aa000000-0000-0000-0000-0000000000a2', '11111111-1111-1111-1111-111111111111', 'A2-source', 'guest',  'adult'),
  ('aa000000-0000-0000-0000-0000000000a3', '11111111-1111-1111-1111-111111111111', 'A3',        'guest',  'adult'),
  ('aa000000-0000-0000-0000-0000000000a4', '11111111-1111-1111-1111-111111111111', 'A4',        'member', 'adult'),
  ('bb000000-0000-0000-0000-0000000000b1', '22222222-2222-2222-2222-222222222222', 'B1', 'member', 'adult');

insert into public.service_events (id, church_id, kind, name, starts_at, status) values
  ('aa000000-0000-0000-0000-0000000000e1', '11111111-1111-1111-1111-111111111111', 'morning_worship', 'A朝礼拝1', now(), 'completed'),
  ('aa000000-0000-0000-0000-0000000000e2', '11111111-1111-1111-1111-111111111111', 'morning_worship', 'A朝礼拝2', now(), 'completed');

-- eventA1: A1(lunch1, 01:00) と A2(lunch3, 02:00) が両方出席（＝衝突）
-- eventA2: A2 のみ出席（lunch0）＝非衝突
insert into public.attendance_records (church_id, service_event_id, person_id, lunch_quantity, checked_in_at) values
  ('11111111-1111-1111-1111-111111111111', 'aa000000-0000-0000-0000-0000000000e1', 'aa000000-0000-0000-0000-0000000000a1', 1, '2026-06-14T01:00:00Z'),
  ('11111111-1111-1111-1111-111111111111', 'aa000000-0000-0000-0000-0000000000e1', 'aa000000-0000-0000-0000-0000000000a2', 3, '2026-06-14T02:00:00Z'),
  ('11111111-1111-1111-1111-111111111111', 'aa000000-0000-0000-0000-0000000000e2', 'aa000000-0000-0000-0000-0000000000a2', 0, '2026-06-14T02:30:00Z');

-- ════════════════════════════════════════════════════════════════════════
-- 1) ownerA が A2 を A1 へ統合できる
select pg_temp.login('a0000000-0000-0000-0000-000000000001');
select lives_ok(
  $$ select public.merge_person('aa000000-0000-0000-0000-0000000000a2','aa000000-0000-0000-0000-0000000000a1') $$,
  'ownerA は A2 を A1 へ統合できる'
);

-- 2) 衝突 eventA1: A1 の行は1件のみ・lunch=greatest(1,3)=3
select is(
  (select lunch_quantity::int from public.attendance_records
   where person_id = 'aa000000-0000-0000-0000-0000000000a1'
     and service_event_id = 'aa000000-0000-0000-0000-0000000000e1'),
  3,
  '衝突: lunch は max(1,3)=3 に統合'
);

-- 3) checked_in_at は早い方(01:00)を保持
select is(
  (select checked_in_at from public.attendance_records
   where person_id = 'aa000000-0000-0000-0000-0000000000a1'
     and service_event_id = 'aa000000-0000-0000-0000-0000000000e1'),
  '2026-06-14T01:00:00Z'::timestamptz,
  'checked_in_at は早い方を保持'
);

-- 4) A2 の出席行は0件（衝突は削除・非衝突は付け替え）
select is(
  (select count(*)::int from public.attendance_records where person_id = 'aa000000-0000-0000-0000-0000000000a2'),
  0,
  'source(A2) の出席行は残らない'
);

-- 5) A2 は archived 済み
select isnt(
  (select archived_at from public.people where id = 'aa000000-0000-0000-0000-0000000000a2'),
  null,
  'source(A2) は archived される'
);

-- 6) 非衝突 eventA2 の行は A1 へ付け替え（A1 が eventA2 に1件）
select is(
  (select count(*)::int from public.attendance_records
   where person_id = 'aa000000-0000-0000-0000-0000000000a1'
     and service_event_id = 'aa000000-0000-0000-0000-0000000000e2'),
  1,
  '非衝突行は target へ付け替え'
);

-- 7) 監査に MERGE_PERSON が1件（actor=ownerA, entity=target）
select is(
  (select count(*)::int from public.audit_logs
   where action = 'MERGE_PERSON'
     and entity_id = 'aa000000-0000-0000-0000-0000000000a1'
     and actor_user_id = 'a0000000-0000-0000-0000-000000000001'),
  1,
  '監査に MERGE_PERSON が記録される'
);

-- 8) 冪等: 再実行しても成功（no-op）
select lives_ok(
  $$ select public.merge_person('aa000000-0000-0000-0000-0000000000a2','aa000000-0000-0000-0000-0000000000a1') $$,
  '冪等: 再実行しても成功'
);

-- 9) 再実行後も lunch は 3 のまま（壊れない）
select is(
  (select lunch_quantity::int from public.attendance_records
   where person_id = 'aa000000-0000-0000-0000-0000000000a1'
     and service_event_id = 'aa000000-0000-0000-0000-0000000000e1'),
  3,
  '再実行で集計が壊れない'
);

-- 10) receptionistA は統合できない
select pg_temp.as_postgres();
select pg_temp.login('a0000000-0000-0000-0000-000000000002');
select throws_ok(
  $$ select public.merge_person('aa000000-0000-0000-0000-0000000000a3','aa000000-0000-0000-0000-0000000000a4') $$,
  'P0001', null,
  'receptionistA は統合できない'
);

-- 11) viewerA は統合できない
select pg_temp.as_postgres();
select pg_temp.login('a0000000-0000-0000-0000-000000000003');
select throws_ok(
  $$ select public.merge_person('aa000000-0000-0000-0000-0000000000a3','aa000000-0000-0000-0000-0000000000a4') $$,
  'P0001', null,
  'viewerA は統合できない'
);

-- 12) ownerB は教会A の人物を統合できない（権限なし）
select pg_temp.as_postgres();
select pg_temp.login('b0000000-0000-0000-0000-000000000001');
select throws_ok(
  $$ select public.merge_person('aa000000-0000-0000-0000-0000000000a3','aa000000-0000-0000-0000-0000000000a4') $$,
  'P0001', null,
  'ownerB は教会A の人物を統合できない'
);

-- 13) 越境統合は禁止（ownerA が A の人物を B の人物へ）
select pg_temp.as_postgres();
select pg_temp.login('a0000000-0000-0000-0000-000000000001');
select throws_ok(
  $$ select public.merge_person('aa000000-0000-0000-0000-0000000000a3','bb000000-0000-0000-0000-0000000000b1') $$,
  'P0001', null,
  '異なる教会の人物は統合できない'
);

-- 14) 同一人物の統合は不可
select throws_ok(
  $$ select public.merge_person('aa000000-0000-0000-0000-0000000000a4','aa000000-0000-0000-0000-0000000000a4') $$,
  'P0001', null,
  '同一人物は統合できない'
);

-- 15) anon は実行できない（permission denied）
select pg_temp.as_anon();
select throws_ok(
  $$ select public.merge_person('aa000000-0000-0000-0000-0000000000a3','aa000000-0000-0000-0000-0000000000a4') $$,
  '42501', null,
  'anon は merge_person を実行できない'
);

-- 16) アーカイブ済みの人物は統合先にできない（出席が集計から消えるのを防ぐ）
select pg_temp.as_postgres();
update public.people set archived_at = now() where id = 'aa000000-0000-0000-0000-0000000000a4';
select pg_temp.login('a0000000-0000-0000-0000-000000000001');
select throws_ok(
  $$ select public.merge_person('aa000000-0000-0000-0000-0000000000a3','aa000000-0000-0000-0000-0000000000a4') $$,
  'P0001', null,
  'アーカイブ済みの人物は統合先にできない'
);

select * from finish();
rollback;
