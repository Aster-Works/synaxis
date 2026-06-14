-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 0003 security_helpers_and_rls                                          ║
-- ║ 認可ヘルパー（非公開スキーマ）＋ 全公開テーブルの RLS（4ロール）       ║
-- ║                                                                        ║
-- ║ 不変条件:                                                              ║
-- ║  - anon に人物・出席データを許可しない（ポリシーは TO authenticated）。║
-- ║  - 認可は church_memberships を正とする。                              ║
-- ║  - ヘルパーは private スキーマ + security definer + 固定 search_path。 ║
-- ║    （church_memberships を RLS 越しに参照させず再帰を防ぐ）            ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- ── 認可ヘルパー（非公開スキーマ）──────────────────────────────────────
create schema if not exists private;
grant usage on schema private to authenticated;

-- 現在ユーザーが対象教会の所属か
create or replace function private.is_member(target_church uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.church_memberships m
    where m.church_id = target_church
      and m.user_id = (select auth.uid())
  );
$$;

-- 現在ユーザーの対象教会内ロールが指定集合に含まれるか
create or replace function private.has_role(target_church uuid, roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.church_memberships m
    where m.church_id = target_church
      and m.user_id = (select auth.uid())
      and m.role = any(roles)
  );
$$;

-- 現在ユーザーと対象ユーザーが同じ教会を共有するか（profiles 参照用）
create or replace function private.shares_church(other_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.church_memberships me
    join public.church_memberships them on them.church_id = me.church_id
    where me.user_id = (select auth.uid())
      and them.user_id = other_user
  );
$$;

grant execute on function private.is_member(uuid)            to authenticated;
grant execute on function private.has_role(uuid, text[])     to authenticated;
grant execute on function private.shares_church(uuid)        to authenticated;

-- ── RLS 有効化 ─────────────────────────────────────────────────────────
alter table public.churches           enable row level security;
alter table public.profiles           enable row level security;
alter table public.church_memberships enable row level security;
alter table public.people             enable row level security;
alter table public.service_events     enable row level security;
alter table public.service_templates  enable row level security;
alter table public.attendance_records enable row level security;
alter table public.audit_logs         enable row level security;

-- ════════════════════════════════════════════════════════════════════════
-- churches: 所属教会のみ閲覧。設定変更は owner のみ。作成は create_church RPC。
-- ════════════════════════════════════════════════════════════════════════
create policy churches_select on public.churches
  for select to authenticated
  using (private.is_member(id));

create policy churches_update on public.churches
  for update to authenticated
  using (private.has_role(id, array['owner']))
  with check (private.has_role(id, array['owner']));

-- ════════════════════════════════════════════════════════════════════════
-- profiles: 自分、または教会を共有する相手のみ閲覧。更新は自分のみ。
-- ════════════════════════════════════════════════════════════════════════
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or private.shares_church(id));

create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ════════════════════════════════════════════════════════════════════════
-- church_memberships: 所属教会の一覧は閲覧可。変更は owner のみ。
-- ════════════════════════════════════════════════════════════════════════
create policy memberships_select on public.church_memberships
  for select to authenticated
  using (private.is_member(church_id));

create policy memberships_insert on public.church_memberships
  for insert to authenticated
  with check (private.has_role(church_id, array['owner']));

create policy memberships_update on public.church_memberships
  for update to authenticated
  using (private.has_role(church_id, array['owner']))
  with check (private.has_role(church_id, array['owner']));

create policy memberships_delete on public.church_memberships
  for delete to authenticated
  using (private.has_role(church_id, array['owner']));

-- ════════════════════════════════════════════════════════════════════════
-- people: 所属教会で閲覧可。ゲスト追加（insert）は受付以上。編集は admin 以上。
-- ════════════════════════════════════════════════════════════════════════
create policy people_select on public.people
  for select to authenticated
  using (private.is_member(church_id));

create policy people_insert on public.people
  for insert to authenticated
  with check (private.has_role(church_id, array['owner','admin','receptionist']));

create policy people_update on public.people
  for update to authenticated
  using (private.has_role(church_id, array['owner','admin']))
  with check (private.has_role(church_id, array['owner','admin']));

create policy people_delete on public.people
  for delete to authenticated
  using (private.has_role(church_id, array['owner','admin']));

-- ════════════════════════════════════════════════════════════════════════
-- service_events / service_templates: 閲覧は所属教会。変更は admin 以上。
-- （受付は読み取りのみ。礼拝の作成・編集は owner/admin）
-- ════════════════════════════════════════════════════════════════════════
create policy events_select on public.service_events
  for select to authenticated
  using (private.is_member(church_id));

create policy events_insert on public.service_events
  for insert to authenticated
  with check (private.has_role(church_id, array['owner','admin']));

create policy events_update on public.service_events
  for update to authenticated
  using (private.has_role(church_id, array['owner','admin']))
  with check (private.has_role(church_id, array['owner','admin']));

create policy events_delete on public.service_events
  for delete to authenticated
  using (private.has_role(church_id, array['owner','admin']));

create policy templates_select on public.service_templates
  for select to authenticated
  using (private.is_member(church_id));

create policy templates_write on public.service_templates
  for all to authenticated
  using (private.has_role(church_id, array['owner','admin']))
  with check (private.has_role(church_id, array['owner','admin']));

-- ════════════════════════════════════════════════════════════════════════
-- attendance_records: 閲覧は所属教会。出席の作成・更新・削除は受付以上。
-- （viewer は読み取りのみ）
-- ════════════════════════════════════════════════════════════════════════
create policy attendance_select on public.attendance_records
  for select to authenticated
  using (private.is_member(church_id));

create policy attendance_insert on public.attendance_records
  for insert to authenticated
  with check (private.has_role(church_id, array['owner','admin','receptionist']));

create policy attendance_update on public.attendance_records
  for update to authenticated
  using (private.has_role(church_id, array['owner','admin','receptionist']))
  with check (private.has_role(church_id, array['owner','admin','receptionist']));

create policy attendance_delete on public.attendance_records
  for delete to authenticated
  using (private.has_role(church_id, array['owner','admin','receptionist']));

-- ════════════════════════════════════════════════════════════════════════
-- audit_logs: 閲覧は admin 以上のみ。書き込みは security definer トリガー
-- （0004）が行うため、authenticated への insert/update/delete ポリシーは作らない。
-- ════════════════════════════════════════════════════════════════════════
create policy audit_select on public.audit_logs
  for select to authenticated
  using (private.has_role(church_id, array['owner','admin']));

-- ════════════════════════════════════════════════════════════════════════
-- テーブル権限（GRANT）
--   RLS は「行」を絞るが、まず「テーブルへのアクセス権」が必要。
--   authenticated にのみ必要な操作権を与え、行レベルの可否は上記 RLS が判定する。
--   anon には人物・出席を含む一切のテーブル権限を与えない（§9.2）。
--   ＝ 未認証では permission denied となり、データを取得できない。
-- ════════════════════════════════════════════════════════════════════════
grant select, update                 on public.churches           to authenticated;
grant select, insert, update         on public.profiles           to authenticated;
grant select, insert, update, delete on public.church_memberships to authenticated;
grant select, insert, update, delete on public.people             to authenticated;
grant select, insert, update, delete on public.service_events     to authenticated;
grant select, insert, update, delete on public.service_templates  to authenticated;
grant select, insert, update, delete on public.attendance_records to authenticated;
grant select                         on public.audit_logs         to authenticated;

-- 念のため anon から明示的に剥奪（既定でも付与されていないが、意図を明確化）。
revoke all on public.churches, public.profiles, public.church_memberships,
  public.people, public.service_events, public.service_templates,
  public.attendance_records, public.audit_logs from anon;

-- service_role（管理用・RLS バイパス）には全権を付与する（Supabase 既定に合わせる）。
-- 通常のアプリ処理では service_role を使わない。scripts/ の管理スクリプト専用。
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all routines  in schema public to service_role;
