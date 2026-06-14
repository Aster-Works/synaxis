-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ RLS 教会間データ分離テスト（pgTAP）                                    ║
-- ║ docs/PRODUCT_SPEC.md §9.4 セキュリティ必須テスト                       ║
-- ║                                                                        ║
-- ║  - 教会Aの全ロールから教会Bのデータを読み書きできない。                ║
-- ║  - receptionist は教会設定・ユーザーロールを変更できない。             ║
-- ║  - 未認証(anon)は人物・出席データを取得できない。                      ║
-- ║  - church_id 整合トリガーが越境出席を防ぐ。                            ║
-- ║                                                                        ║
-- ║ 実行: `npm run db:test`（= supabase test db）                          ║
-- ╚══════════════════════════════════════════════════════════════════════╝

begin;
select plan(13);

-- ── 認証切替ヘルパー（pg_temp に作成）──────────────────────────────────
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

-- ── 固定 UUID ──────────────────────────────────────────────────────────
-- churchA = 111…1, churchB = 222…2
-- ownerA = a…01, receptionistA = a…02, viewerA = a…03, ownerB = b…01
-- personA1/A2 = aa…a1/a2, personB1 = bb…b1, eventA = aa…e1, eventB = bb…e1

-- ── フィクスチャ（postgres = RLS バイパス）────────────────────────────
insert into auth.users (id, aud, role, email) values
  ('a0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ownerA@test.dev'),
  ('a0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'receptionistA@test.dev'),
  ('a0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'viewerA@test.dev'),
  ('b0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ownerB@test.dev');

insert into public.churches (id, name, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Church A', 'church-a'),
  ('22222222-2222-2222-2222-222222222222', 'Church B', 'church-b');

insert into public.church_memberships (church_id, user_id, role) values
  ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'owner'),
  ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000002', 'receptionist'),
  ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000003', 'viewer'),
  ('22222222-2222-2222-2222-222222222222', 'b0000000-0000-0000-0000-000000000001', 'owner');

insert into public.people (id, church_id, display_name, relationship_status, age_group) values
  ('aa000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 'A-Member',  'member', 'adult'),
  ('aa000000-0000-0000-0000-0000000000a2', '11111111-1111-1111-1111-111111111111', 'A-Child',   'member', 'child'),
  ('bb000000-0000-0000-0000-0000000000b1', '22222222-2222-2222-2222-222222222222', 'B-Member',  'member', 'adult');

insert into public.service_events (id, church_id, kind, name, starts_at, status) values
  ('aa000000-0000-0000-0000-0000000000e1', '11111111-1111-1111-1111-111111111111', 'morning_worship', 'A朝礼拝', now(), 'open'),
  ('bb000000-0000-0000-0000-0000000000e1', '22222222-2222-2222-2222-222222222222', 'morning_worship', 'B朝礼拝', now(), 'open');

-- ════════════════════════════════════════════════════════════════════════
-- 1) 未認証(anon)は人物を一切取得できない（テーブル権限なし＝permission denied）
select pg_temp.as_anon();
select throws_ok(
  $$ select count(*) from public.people $$,
  '42501',
  null,
  'anon は people を取得できない（permission denied）'
);

-- 2) ownerA は自教会の人物（2名）を見られる
select pg_temp.as_postgres();
select pg_temp.login('a0000000-0000-0000-0000-000000000001');
select is(
  (select count(*)::int from public.people),
  2,
  'ownerA は自教会の people を見られる(2)'
);

-- 3) ownerA は教会Bの人物を見られない
select is(
  (select count(*)::int from public.people where church_id = '22222222-2222-2222-2222-222222222222'),
  0,
  'ownerA は教会Bの people を見られない'
);

-- 4) ownerB は自教会の人物（1名）のみ
select pg_temp.as_postgres();
select pg_temp.login('b0000000-0000-0000-0000-000000000001');
select is(
  (select count(*)::int from public.people),
  1,
  'ownerB は自教会の people のみ(1)'
);

-- 5) receptionistA は自教会にゲスト(person)を追加できる
select pg_temp.as_postgres();
select pg_temp.login('a0000000-0000-0000-0000-000000000002');
select lives_ok(
  $$ insert into public.people (church_id, display_name, relationship_status, age_group)
     values ('11111111-1111-1111-1111-111111111111', 'A-Guest', 'guest', 'adult') $$,
  'receptionistA は自教会に人物を追加できる'
);

-- 6) receptionistA は教会Bへ人物を追加できない（RLS check 違反）
select throws_ok(
  $$ insert into public.people (church_id, display_name, relationship_status, age_group)
     values ('22222222-2222-2222-2222-222222222222', 'X', 'guest', 'adult') $$,
  '42501',
  null,
  'receptionistA は教会Bへ人物を追加できない'
);

-- 7) receptionistA は教会設定（名称）を変更できない（USING 不一致で 0 件・改変なし）
select lives_ok(
  $$ update public.churches set name = 'HACKED' where id = '11111111-1111-1111-1111-111111111111' $$,
  'receptionist の churches UPDATE はエラーにはならない'
);
select is(
  (select name from public.churches where id = '11111111-1111-1111-1111-111111111111'),
  'Church A',
  'receptionistA は教会名を変更できない（実際に変わっていない）'
);

-- 8) receptionistA はメンバー（ロール）を追加できない（owner 専用）
select throws_ok(
  $$ insert into public.church_memberships (church_id, user_id, role)
     values ('11111111-1111-1111-1111-111111111111', 'b0000000-0000-0000-0000-000000000001', 'admin') $$,
  '42501',
  null,
  'receptionistA はメンバーを追加できない'
);

-- 9) viewerA は出席を作成できない（読み取り専用）
select pg_temp.as_postgres();
select pg_temp.login('a0000000-0000-0000-0000-000000000003');
select throws_ok(
  $$ insert into public.attendance_records (church_id, service_event_id, person_id)
     values ('11111111-1111-1111-1111-111111111111',
             'aa000000-0000-0000-0000-0000000000e1',
             'aa000000-0000-0000-0000-0000000000a1') $$,
  '42501',
  null,
  'viewerA は出席を作成できない'
);

-- 10) ownerA は教会Bのイベントへ出席を作成できない（越境・RLS check 違反）
select pg_temp.as_postgres();
select pg_temp.login('a0000000-0000-0000-0000-000000000001');
select throws_ok(
  $$ insert into public.attendance_records (church_id, service_event_id, person_id)
     values ('22222222-2222-2222-2222-222222222222',
             'bb000000-0000-0000-0000-0000000000e1',
             'bb000000-0000-0000-0000-0000000000b1') $$,
  '42501',
  null,
  'ownerA は教会Bのイベントへ出席を作成できない'
);

-- 11) church_id 整合トリガー: 教会をまたいだ出席は postgres でも拒否
select pg_temp.as_postgres();
select throws_ok(
  $$ insert into public.attendance_records (church_id, service_event_id, person_id)
     values ('11111111-1111-1111-1111-111111111111',
             'aa000000-0000-0000-0000-0000000000e1',
             'bb000000-0000-0000-0000-0000000000b1') $$,
  null,
  'church_id 整合トリガー: A のイベントへ B の人物を出席させられない'
);

-- 12) ownerA は自教会で正しく出席を作成できる
select pg_temp.login('a0000000-0000-0000-0000-000000000001');
select lives_ok(
  $$ insert into public.attendance_records (church_id, service_event_id, person_id, lunch_quantity)
     values ('11111111-1111-1111-1111-111111111111',
             'aa000000-0000-0000-0000-0000000000e1',
             'aa000000-0000-0000-0000-0000000000a1', 1) $$,
  'ownerA は自教会で出席を作成できる'
);

select * from finish();
rollback;
