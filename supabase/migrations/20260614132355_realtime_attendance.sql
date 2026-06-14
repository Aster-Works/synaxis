-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 0005 realtime_attendance                                               ║
-- ║ attendance_records を Realtime（Postgres Changes）配信対象にする。     ║
-- ║ 追加型・冪等。既存データ・RLS には一切手を入れない。                   ║
-- ║                                                                        ║
-- ║ 方針:                                                                  ║
-- ║  - supabase_realtime publication に attendance_records を追加。        ║
-- ║  - 配信は RLS を尊重する: attendance_select = private.is_member(...)。 ║
-- ║    → 同一教会メンバーにのみ届く。anon は GRANT も無く届かない。        ║
-- ║  - REPLICA IDENTITY FULL: UPDATE の old レコードを充実させる。         ║
-- ║ ロールバック:                                                          ║
-- ║   alter publication supabase_realtime drop table public.attendance_records; ║
-- ║   alter table public.attendance_records replica identity default;      ║
-- ╚══════════════════════════════════════════════════════════════════════╝

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'attendance_records'
  ) then
    alter publication supabase_realtime add table public.attendance_records;
  end if;
end $$;

alter table public.attendance_records replica identity full;
