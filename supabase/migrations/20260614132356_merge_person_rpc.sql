-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 0006 merge_person_rpc                                                   ║
-- ║ 重複人物の統合（出席履歴を保持）。PRODUCT_SPEC §6.3 / §7.3            ║
-- ║                                                                        ║
-- ║ 方針（create_church と同じ public + security definer + 固定search_path）║
-- ║  - authz: 呼び出し元が両者と同一 church の owner/admin。両者同一church。║
-- ║  - 出席を source→target へ再割当。衝突は二重計上せず lunch=max・        ║
-- ║    checked_in_at=min。重複 source 行は削除。                            ║
-- ║  - source を archived_at で論理削除。冪等（再実行安全）。               ║
-- ║  - 監査は既存 write_audit トリガーが行変更を記録。加えて操作意味を      ║
-- ║    action='MERGE_PERSON' で audit_logs に明示。                        ║
-- ║  - 追加型 migration。既存データを破壊しない。                          ║
-- ║ ロールバック: drop function public.merge_person(uuid,uuid);            ║
-- ╚══════════════════════════════════════════════════════════════════════╝

create or replace function public.merge_person(p_source uuid, p_target uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid          uuid := (select auth.uid());
  src_church   uuid;
  tgt_church   uuid;
  src_archived timestamptz;
  tgt_archived timestamptz;
begin
  if p_source is null or p_target is null then
    raise exception 'source と target は必須です';
  end if;
  if p_source = p_target then
    raise exception 'source と target が同一です';
  end if;
  if uid is null then
    raise exception '認証が必要です';
  end if;

  select church_id, archived_at into src_church, src_archived
    from public.people where id = p_source;
  select church_id, archived_at into tgt_church, tgt_archived
    from public.people where id = p_target;

  if src_church is null or tgt_church is null then
    raise exception '対象の人物が見つかりません';
  end if;

  -- 越境統合の禁止（同一教会のみ）
  if src_church <> tgt_church then
    raise exception '異なる教会の人物は統合できません';
  end if;

  -- 統合先が archived だと、付け替えた出席が archived 行にぶら下がり
  -- 集計（archived_at is null で除外）から消える。これを防ぐ。
  if tgt_archived is not null then
    raise exception 'アーカイブ済みの人物は統合先にできません';
  end if;

  -- authz: 呼び出し元がその教会の owner/admin であること
  if not private.has_role(src_church, array['owner', 'admin']) then
    raise exception '統合する権限がありません（owner/admin のみ）';
  end if;

  -- 冪等: source が既に archived 済みなら再実行とみなし no-op
  if src_archived is not null then
    return p_target;
  end if;

  -- 1) 衝突解消: 両者が同じ service_event に出席している行は target を残し、
  --    二重計上を避けるため lunch=max・checked_in_at=min をマージ。
  update public.attendance_records t
     set lunch_quantity = greatest(t.lunch_quantity, s.lunch_quantity),
         checked_in_at  = least(t.checked_in_at, s.checked_in_at)
    from public.attendance_records s
   where t.person_id = p_target
     and s.person_id = p_source
     and s.service_event_id = t.service_event_id;

  -- 2) 衝突した source 行を削除（target に既に同イベント行がある分）
  delete from public.attendance_records s
   where s.person_id = p_source
     and exists (
       select 1 from public.attendance_records t
        where t.person_id = p_target
          and t.service_event_id = s.service_event_id
     );

  -- 3) 非衝突行を target へ付け替え（unique 衝突は 2) で除去済み）
  update public.attendance_records
     set person_id = p_target
   where person_id = p_source;

  -- 4) source を論理削除（氏名等は監査のため温存）
  update public.people
     set archived_at = now()
   where id = p_source
     and archived_at is null;

  -- 5) 統合という操作の意味を audit に明示（行変更は write_audit が別途記録）
  insert into public.audit_logs
    (church_id, actor_user_id, action, entity_type, entity_id, before, after)
  values
    (src_church, uid, 'MERGE_PERSON', 'people', p_target,
     jsonb_build_object('source_id', p_source),
     jsonb_build_object('target_id', p_target));

  return p_target;
end;
$$;

-- 既定で PUBLIC に付く EXECUTE を剥奪し、authenticated のみに限定する
-- （anon は PUBLIC 経由でも実行不可にする）。
revoke all on function public.merge_person(uuid, uuid) from public;
grant execute on function public.merge_person(uuid, uuid) to authenticated;
