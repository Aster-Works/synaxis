-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 0004 audit_log_triggers                                                ║
-- ║ 主要テーブルの変更を audit_logs へ自動記録する。                       ║
-- ║                                                                        ║
-- ║  - security definer なので RLS をバイパスして書き込める（改ざん耐性）。║
-- ║  - actor は auth.uid()。秘密情報は記録しない（before/after は行データ）║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- id + church_id を持つテーブル用（people / service_events / attendance_records）
create or replace function public.write_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ch        uuid;
  rec_id    uuid;
  before_j  jsonb;
  after_j   jsonb;
begin
  if (tg_op = 'DELETE') then
    ch := old.church_id; rec_id := old.id; before_j := to_jsonb(old); after_j := null;
  elsif (tg_op = 'UPDATE') then
    ch := new.church_id; rec_id := new.id; before_j := to_jsonb(old); after_j := to_jsonb(new);
  else
    ch := new.church_id; rec_id := new.id; before_j := null;          after_j := to_jsonb(new);
  end if;

  insert into public.audit_logs
    (church_id, actor_user_id, action, entity_type, entity_id, before, after)
  values
    (ch, (select auth.uid()), tg_op, tg_table_name, rec_id, before_j, after_j);

  return null; -- AFTER トリガー
end;
$$;

create trigger trg_audit_people
  after insert or update or delete on public.people
  for each row execute function public.write_audit();

create trigger trg_audit_service_events
  after insert or update or delete on public.service_events
  for each row execute function public.write_audit();

create trigger trg_audit_attendance
  after insert or update or delete on public.attendance_records
  for each row execute function public.write_audit();

-- church_memberships は複合PK（id 列なし）。専用関数で user_id を entity_id に。
create or replace function public.write_membership_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ch       uuid;
  rec_id   uuid;
  before_j jsonb;
  after_j  jsonb;
begin
  if (tg_op = 'DELETE') then
    ch := old.church_id; rec_id := old.user_id; before_j := to_jsonb(old); after_j := null;
  elsif (tg_op = 'UPDATE') then
    ch := new.church_id; rec_id := new.user_id; before_j := to_jsonb(old); after_j := to_jsonb(new);
  else
    ch := new.church_id; rec_id := new.user_id; before_j := null;          after_j := to_jsonb(new);
  end if;

  insert into public.audit_logs
    (church_id, actor_user_id, action, entity_type, entity_id, before, after)
  values
    (ch, (select auth.uid()), tg_op, 'church_memberships', rec_id, before_j, after_j);

  return null;
end;
$$;

create trigger trg_audit_memberships
  after insert or update or delete on public.church_memberships
  for each row execute function public.write_membership_audit();
