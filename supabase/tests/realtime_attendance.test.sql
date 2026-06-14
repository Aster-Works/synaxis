-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ Realtime 配信設定テスト（pgTAP）                                       ║
-- ║  - attendance_records が supabase_realtime publication に含まれる      ║
-- ║  - REPLICA IDENTITY FULL（UPDATE の old を充実させる）                 ║
-- ║  配信可否は RLS(attendance_select=is_member) が最終判定するため、      ║
-- ║  教会間分離は rls_isolation.test.sql でカバー。ここは配信設定の回帰。   ║
-- ╚══════════════════════════════════════════════════════════════════════╝

begin;
select plan(2);

select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'attendance_records'
  ),
  'attendance_records は supabase_realtime publication に含まれる'
);

select is(
  (select relreplident::text from pg_class where oid = 'public.attendance_records'::regclass),
  'f',
  'attendance_records は REPLICA IDENTITY FULL'
);

select * from finish();
rollback;
