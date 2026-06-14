-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 0001 core_tenancy                                                      ║
-- ║ マルチテナントの中核: churches / profiles / church_memberships        ║
-- ║                                                                        ║
-- ║ 方針:                                                                  ║
-- ║  - すべての ID は DB 側で生成（gen_random_uuid / identity）。          ║
-- ║  - 認可は church_memberships を正とする（RLS は 0003 で付与）。        ║
-- ║  - 追加型 migration。既存データを破壊しない。                          ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- ── churches（教会＝テナント）─────────────────────────────────────────
create table if not exists public.churches (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  timezone    text not null default 'Asia/Tokyo',
  child_label text not null default '子ども',
  created_at  timestamptz not null default now(),
  archived_at timestamptz
);

-- ── profiles（auth.users と 1:1。表示名のみ。機密は持たない）──────────
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now()
);

-- ── church_memberships（ユーザーの教会内ロール。認可の正）──────────────
create table if not exists public.church_memberships (
  church_id  uuid not null references public.churches(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('owner','admin','receptionist','viewer')),
  invited_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (church_id, user_id)
);

-- RLS ポリシー / 認可ヘルパーが参照するため索引を付ける。
create index if not exists church_memberships_user_idx   on public.church_memberships(user_id);
create index if not exists church_memberships_church_idx on public.church_memberships(church_id);

-- ── サインアップ時に profiles を自動作成 ───────────────────────────────
-- security definer + 固定 search_path（空）。参照は完全修飾する。
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data->>'display_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 教会オンボーディング用 RPC（原子的に教会＋owner所属を作成）─────────
-- RLS の鶏卵問題（owner になる前に membership を作れない）を回避する。
-- security definer で実行し、auth.uid() を owner として登録する。
create or replace function public.create_church(p_name text, p_slug text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
  uid    uuid := (select auth.uid());
begin
  if uid is null then
    raise exception '認証が必要です';
  end if;

  insert into public.churches (name, slug)
  values (p_name, p_slug)
  returning id into new_id;

  insert into public.church_memberships (church_id, user_id, role, invited_by)
  values (new_id, uid, 'owner', uid);

  return new_id;
end;
$$;

-- 既定で PUBLIC に付く EXECUTE を剥奪し、authenticated のみに限定する。
revoke all on function public.create_church(text, text) from public;
grant execute on function public.create_church(text, text) to authenticated;
