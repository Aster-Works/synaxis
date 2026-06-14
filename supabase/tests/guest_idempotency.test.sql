-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ ゲスト作成の冪等キー（people.client_op_id）テスト（pgTAP）             ║
-- ║  - (church_id, client_op_id) の一意制約が存在する                     ║
-- ║  - 同一 (church_id, client_op_id) の二重作成は拒否（再送で重複しない） ║
-- ║  - client_op_id が NULL の行は複数共存できる（既存データ・移行に無害） ║
-- ╚══════════════════════════════════════════════════════════════════════╝

begin;
select plan(3);

insert into public.churches (id, name, slug) values
  ('33333333-3333-3333-3333-333333333333', 'Church C', 'church-c');

select has_index(
  'public', 'people', 'people_church_client_op_idx',
  '(church_id, client_op_id) の一意インデックスが存在する'
);

-- 同一 client_op_id の二重作成は一意違反で拒否される（＝再送で人物が重複しない）
insert into public.people (church_id, display_name, relationship_status, age_group, client_op_id)
values ('33333333-3333-3333-3333-333333333333', 'ゲスト', 'guest', 'adult',
        '99999999-9999-9999-9999-999999999999');

select throws_ok(
  $$ insert into public.people (church_id, display_name, relationship_status, age_group, client_op_id)
     values ('33333333-3333-3333-3333-333333333333', 'ゲスト(再送)', 'guest', 'adult',
             '99999999-9999-9999-9999-999999999999') $$,
  '23505', null,
  '同一 (church_id, client_op_id) の二重作成は拒否される'
);

-- client_op_id が NULL の行は複数共存できる
insert into public.people (church_id, display_name, relationship_status, age_group)
values ('33333333-3333-3333-3333-333333333333', '名無し1', 'guest', 'adult');
select lives_ok(
  $$ insert into public.people (church_id, display_name, relationship_status, age_group)
     values ('33333333-3333-3333-3333-333333333333', '名無し2', 'guest', 'adult') $$,
  'client_op_id が NULL の行は複数共存できる'
);

select * from finish();
rollback;
