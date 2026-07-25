-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 権限の不変条件テスト（pgTAP）                                          ║
-- ║                                                                        ║
-- ║ 個別オブジェクトの列挙ではなく「全件走査」で書く。                     ║
-- ║ 後から追加されたテーブル・関数が権限剥奪（harden 系 migration）を      ║
-- ║ すり抜けても、このテストが自動で検出する。                             ║
-- ║  - AGENTS.md 不変条件 2: anon に人物・出席データを許可しない           ║
-- ║  - public の全テーブルで RLS 有効                                      ║
-- ║  - anon が実行できる public 関数ゼロ                                   ║
-- ║  - anon / authenticated に TRUNCATE 可能なテーブルゼロ                 ║
-- ║                                                                        ║
-- ║ private スキーマの関数は検査しない: RLS ポリシー本体から呼ばれるため    ║
-- ║ PUBLIC への EXECUTE が必要で、anon は schema USAGE 側で止めている       ║
-- ║ （20260726050000_harden_table_privileges.sql のコメント参照）。         ║
-- ║                                                                        ║
-- ║ 実行: `npm run db:test`（= supabase test db）                          ║
-- ╚══════════════════════════════════════════════════════════════════════╝

begin;
select plan(5);

-- 1) public の全テーブルで RLS が有効
select is(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity),
  0,
  'public の全テーブルで RLS が有効である'
);

-- 2) anon がいかなる権限も持つ public テーブル・ビューが無い
--    （PUBLIC 経由の継承も has_table_privilege が拾う）
select is(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm')
      and (
        has_table_privilege('anon', c.oid, 'SELECT')
        or has_table_privilege('anon', c.oid, 'INSERT')
        or has_table_privilege('anon', c.oid, 'UPDATE')
        or has_table_privilege('anon', c.oid, 'DELETE')
        or has_table_privilege('anon', c.oid, 'TRUNCATE')
        or has_table_privilege('anon', c.oid, 'REFERENCES')
        or has_table_privilege('anon', c.oid, 'TRIGGER')
      )),
  0,
  'anon に権限のある public テーブルが存在しない'
);

-- 3) anon が実行できる public 関数が無い
select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and has_function_privilege('anon', p.oid, 'EXECUTE')),
  0,
  'anon が実行できる public 関数が存在しない'
);

-- 4) anon が実行できる private 関数が無い（多重防御。authenticated は明示 grant を持つ）
select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and has_function_privilege('anon', p.oid, 'EXECUTE')),
  0,
  'anon が実行できる private 関数が存在しない'
);

-- 5) authenticated に TRUNCATE 可能な public テーブルが無い
--    （TRUNCATE は RLS の外側で動くため、行レベル分離では防げない）
select is(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and has_table_privilege('authenticated', c.oid, 'TRUNCATE')),
  0,
  'authenticated に TRUNCATE 可能な public テーブルが存在しない'
);

select * from finish();
rollback;
