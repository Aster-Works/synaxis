-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 0002 people_events_attendance                                          ║
-- ║ ドメイン本体: people / service_events / service_templates /            ║
-- ║               attendance_records / audit_logs                          ║
-- ║                                                                        ║
-- ║ 設計上の要点（docs/PRODUCT_SPEC.md §8）:                               ║
-- ║  - 「立場(relationship_status)」と「年齢区分(age_group)」を分離。      ║
-- ║  - 礼拝の開催実績を service_events として保持（集計の分母の正）。      ║
-- ║  - 出席は (service_event_id, person_id) で一意。                       ║
-- ║  - 昼食は当面 attendance_records.lunch_quantity。                      ║
-- ║  - すべての教会所有データに church_id を持たせる。                     ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- ── 共通: updated_at 自動更新 ─────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ── people（人物マスター。ゲストも同じ履歴で扱う）──────────────────────
create table if not exists public.people (
  id                  uuid primary key default gen_random_uuid(),
  church_id           uuid not null references public.churches(id) on delete cascade,
  display_name        text not null,
  furigana            text,
  relationship_status text not null default 'guest'
    check (relationship_status in ('member','regular_attendee','seeker','guest')),
  age_group           text not null default 'unknown'
    check (age_group in ('adult','child','unknown')),
  first_visit_on      date,
  archived_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
-- 注: child は relationship_status ではなく age_group。住所・電話・牧会メモは持たない。

create index if not exists people_church_idx          on public.people(church_id);
create index if not exists people_church_furigana_idx on public.people(church_id, furigana);
create index if not exists people_church_status_idx   on public.people(church_id, relationship_status);

create trigger trg_people_updated_at
  before update on public.people
  for each row execute function public.set_updated_at();

-- ── service_events（礼拝イベント。通常・夕拝・特別を同一モデルで）──────
create table if not exists public.service_events (
  id                            uuid primary key default gen_random_uuid(),
  church_id                     uuid not null references public.churches(id) on delete cascade,
  kind                          text not null
    check (kind in ('morning_worship','evening_worship','special_worship','other')),
  name                          text not null,
  starts_at                     timestamptz not null,
  status                        text not null default 'scheduled'
    check (status in ('scheduled','open','completed','cancelled')),
  counts_toward_attendance_rate boolean not null default false,
  lunch_enabled                 boolean not null default false,
  note                          text,
  created_by                    uuid references auth.users(id),
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);

create index if not exists service_events_church_idx        on public.service_events(church_id);
create index if not exists service_events_church_starts_idx on public.service_events(church_id, starts_at desc);

create trigger trg_service_events_updated_at
  before update on public.service_events
  for each row execute function public.set_updated_at();

-- ── service_templates（定期礼拝の雛形。イベント生成に使用）─────────────
create table if not exists public.service_templates (
  id                            uuid primary key default gen_random_uuid(),
  church_id                     uuid not null references public.churches(id) on delete cascade,
  name                          text not null,
  kind                          text not null
    check (kind in ('morning_worship','evening_worship','special_worship','other')),
  weekday                       smallint check (weekday between 0 and 6),  -- 0=日
  start_time                    time,
  lunch_enabled                 boolean not null default false,
  counts_toward_attendance_rate boolean not null default false,
  active                        boolean not null default true,
  created_at                    timestamptz not null default now()
);
create index if not exists service_templates_church_idx on public.service_templates(church_id);

-- ── attendance_records（出席・昼食ログ）───────────────────────────────
create table if not exists public.attendance_records (
  id               uuid primary key default gen_random_uuid(),
  church_id        uuid not null references public.churches(id) on delete cascade,
  service_event_id uuid not null references public.service_events(id) on delete cascade,
  person_id        uuid not null references public.people(id) on delete cascade,
  lunch_quantity   smallint not null default 0 check (lunch_quantity >= 0),
  checked_in_at    timestamptz not null default now(),
  checked_in_by    uuid references auth.users(id),
  source           text not null default 'reception'
    check (source in ('reception','admin','import')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- 同じ礼拝・同じ人物の二重登録を防止（冪等 upsert の競合キー）
  unique (service_event_id, person_id)
);

create index if not exists attendance_church_idx on public.attendance_records(church_id);
create index if not exists attendance_event_idx  on public.attendance_records(service_event_id);
create index if not exists attendance_person_idx on public.attendance_records(person_id);

create trigger trg_attendance_updated_at
  before update on public.attendance_records
  for each row execute function public.set_updated_at();

-- ── church_id 整合トリガー ─────────────────────────────────────────────
-- 出席の church_id が、紐づく service_event と person の church_id と一致する
-- ことを DB レベルで保証する。アプリが誤った church_id を渡しても、
-- 教会Aの人物を教会Bのイベントに登録するような越境を不可能にする。
create or replace function public.enforce_attendance_church()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev_church uuid;
  p_church  uuid;
begin
  select church_id into ev_church from public.service_events where id = new.service_event_id;
  select church_id into p_church  from public.people         where id = new.person_id;

  if ev_church is null or p_church is null then
    raise exception 'service_event または person が存在しません';
  end if;

  -- church_id 未指定なら event 側から補完する。
  if new.church_id is null then
    new.church_id := ev_church;
  end if;

  if new.church_id <> ev_church or new.church_id <> p_church then
    raise exception 'church_id がイベント(%)・人物(%)と一致しません', ev_church, p_church;
  end if;

  return new;
end;
$$;

create trigger trg_enforce_attendance_church
  before insert or update on public.attendance_records
  for each row execute function public.enforce_attendance_church();

-- ── audit_logs（操作監査。書き込みは security definer トリガーのみ）──────
create table if not exists public.audit_logs (
  id            bigint generated always as identity primary key,
  church_id     uuid not null references public.churches(id) on delete cascade,
  actor_user_id uuid,
  action        text not null,
  entity_type   text not null,
  entity_id     uuid,
  before        jsonb,
  after         jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists audit_logs_church_idx on public.audit_logs(church_id, created_at desc);
