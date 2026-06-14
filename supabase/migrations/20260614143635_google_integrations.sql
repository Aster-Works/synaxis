-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 0009 google_integrations                                               ║
-- ║ Google 連携トークンを非公開スキーマに暗号化保存。PRODUCT_SPEC §8.2/§11 ║
-- ║                                                                        ║
-- ║ 不変条件:                                                              ║
-- ║  - private スキーマ。anon/authenticated に GRANT しない（直接SELECT不可）║
-- ║  - 読み書きは public の security definer RPC のみ（create_church 作法） ║
-- ║  - refresh_token は pgp_sym_encrypt で暗号化。鍵は DB に保存しない      ║
-- ║    （アプリ env GOOGLE_TOKEN_ENC_KEY を RPC 引数で渡す）                ║
-- ║  - 通常処理で service_role を使わない                                   ║
-- ║ ロールバック: drop function/table（末尾コメント参照）                  ║
-- ╚══════════════════════════════════════════════════════════════════════╝

create extension if not exists pgcrypto with schema extensions;

create table if not exists private.google_integrations (
  church_id               uuid primary key references public.churches(id) on delete cascade,
  connected_by            uuid references auth.users(id),
  encrypted_refresh_token text not null,
  google_account_email    text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create table if not exists private.google_spreadsheets (
  church_id      uuid not null references public.churches(id) on delete cascade,
  fiscal_year    integer not null,
  spreadsheet_id text not null,
  updated_at     timestamptz not null default now(),
  primary key (church_id, fiscal_year)
);

-- private テーブルだが二重の安全策として RLS を有効化し、ポリシーを作らない
-- （＝直接アクセスは常に拒否。security definer RPC のみが通る）。
alter table private.google_integrations enable row level security;
alter table private.google_spreadsheets enable row level security;

-- ── 保存（接続）: owner/admin のみ。冪等（再接続で上書き）─────────────────
create or replace function public.save_google_integration(
  p_church uuid, p_refresh_token text, p_email text, p_enc_key text
) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception '認証が必要です'; end if;
  if not private.has_role(p_church, array['owner','admin']) then
    raise exception 'Google 連携を設定する権限がありません';
  end if;
  if p_refresh_token is null or length(p_refresh_token) = 0 then
    raise exception 'refresh_token がありません';
  end if;
  insert into private.google_integrations
    (church_id, connected_by, encrypted_refresh_token, google_account_email)
  values
    (p_church, uid, extensions.pgp_sym_encrypt(p_refresh_token, p_enc_key), p_email)
  on conflict (church_id) do update set
    connected_by = excluded.connected_by,
    encrypted_refresh_token = excluded.encrypted_refresh_token,
    google_account_email = excluded.google_account_email,
    updated_at = now();
end; $$;

-- ── 復号して refresh_token を返す: owner/admin のみ。サーバ専用モジュール
--    だけが呼ぶ（戻り値はクライアントへ返さない）。──────────────────────────
create or replace function public.read_google_refresh_token(
  p_church uuid, p_enc_key text
) returns text
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); enc bytea;
begin
  if uid is null then raise exception '認証が必要です'; end if;
  if not private.has_role(p_church, array['owner','admin']) then
    raise exception 'Google 連携を利用する権限がありません';
  end if;
  select encrypted_refresh_token::bytea into enc
    from private.google_integrations where church_id = p_church;
  if enc is null then return null; end if;
  return extensions.pgp_sym_decrypt(enc, p_enc_key);
end; $$;

-- ── 接続状態（メール・接続日時）: owner/admin。トークンは絶対返さない。──────
create or replace function public.get_google_integration_status(p_church uuid)
returns table (google_account_email text, connected_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_role(p_church, array['owner','admin']) then
    raise exception '権限がありません';
  end if;
  return query
    select g.google_account_email, g.created_at
      from private.google_integrations g where g.church_id = p_church;
end; $$;

-- ── 年度スプレッドシート ID の取得/保存（出力時に使用）: owner/admin。──────
create or replace function public.get_google_spreadsheet_id(p_church uuid, p_year integer)
returns text
language plpgsql security definer set search_path = '' as $$
declare sid text;
begin
  if not private.has_role(p_church, array['owner','admin']) then
    raise exception '権限がありません';
  end if;
  select spreadsheet_id into sid from private.google_spreadsheets
    where church_id = p_church and fiscal_year = p_year;
  return sid;
end; $$;

create or replace function public.set_google_spreadsheet_id(
  p_church uuid, p_year integer, p_spreadsheet_id text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_role(p_church, array['owner','admin']) then
    raise exception '権限がありません';
  end if;
  insert into private.google_spreadsheets (church_id, fiscal_year, spreadsheet_id)
  values (p_church, p_year, p_spreadsheet_id)
  on conflict (church_id, fiscal_year) do update set
    spreadsheet_id = excluded.spreadsheet_id, updated_at = now();
end; $$;

-- ── 解除: トークン・spreadsheet マッピングを削除。owner/admin。冪等。────────
create or replace function public.delete_google_integration(p_church uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_role(p_church, array['owner','admin']) then
    raise exception '権限がありません';
  end if;
  delete from private.google_integrations where church_id = p_church;
  delete from private.google_spreadsheets where church_id = p_church;
  insert into public.audit_logs (church_id, actor_user_id, action, entity_type, entity_id)
  values (p_church, (select auth.uid()), 'GOOGLE_DISCONNECT', 'google_integration', null);
end; $$;

-- ── EXECUTE 権限: PUBLIC から剥奪し authenticated のみ（anon 不可）──────────
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.save_google_integration(uuid,text,text,text)',
    'public.read_google_refresh_token(uuid,text)',
    'public.get_google_integration_status(uuid)',
    'public.get_google_spreadsheet_id(uuid,integer)',
    'public.set_google_spreadsheet_id(uuid,integer,text)',
    'public.delete_google_integration(uuid)'
  ] loop
    execute format('revoke all on function %s from public', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;

-- service_role（scripts 専用）には private スキーマを付与（管理用途）。
grant usage on schema private to service_role;
grant all on all tables in schema private to service_role;

-- ロールバック:
--   drop function public.delete_google_integration(uuid);
--   drop function public.set_google_spreadsheet_id(uuid,integer,text);
--   drop function public.get_google_spreadsheet_id(uuid,integer);
--   drop function public.get_google_integration_status(uuid);
--   drop function public.read_google_refresh_token(uuid,text);
--   drop function public.save_google_integration(uuid,text,text,text);
--   drop table private.google_spreadsheets;
--   drop table private.google_integrations;
