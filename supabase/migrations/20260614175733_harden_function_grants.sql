-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 0009 harden_function_grants                                            ║
-- ║ SECURITY DEFINER 関数の EXECUTE 権限を厳格化（多層防御）。             ║
-- ║                                                                        ║
-- ║ 背景: クラウド Supabase は新規 public 関数に既定で anon/authenticated  ║
-- ║ への EXECUTE を付与する。revoke from public だけでは anon の明示付与が  ║
-- ║ 残り、PostgREST 経由(/rest/v1/rpc/...)で anon が呼べてしまう。各関数は   ║
-- ║ 内部で auth.uid()/has_role を検証するためデータ漏洩はしないが、         ║
-- ║ 攻撃面を断つため明示的に剥奪する（Supabase security advisor 0028/0029）。║
-- ║                                                                        ║
-- ║  - 業務RPC(create_church/merge_person/google_*): anon を剥奪、         ║
-- ║    authenticated は維持（内部 authz あり・意図通り）。                  ║
-- ║  - トリガー関数: RPC 公開不要。全ロールから剥奪（トリガーは所有者       ║
-- ║    権限で発火するため EXECUTE 付与は不要）。search_path も固定。        ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- 業務 RPC: anon / public を剥奪（authenticated は維持）
revoke execute on function public.create_church(text, text)                          from anon, public;
revoke execute on function public.merge_person(uuid, uuid)                           from anon, public;
revoke execute on function public.save_google_integration(uuid, text, text, text)    from anon, public;
revoke execute on function public.read_google_refresh_token(uuid, text)              from anon, public;
revoke execute on function public.get_google_integration_status(uuid)                from anon, public;
revoke execute on function public.get_google_spreadsheet_id(uuid, integer)           from anon, public;
revoke execute on function public.set_google_spreadsheet_id(uuid, integer, text)     from anon, public;
revoke execute on function public.delete_google_integration(uuid)                    from anon, public;

-- トリガー関数: RPC 公開しない（全ロール剥奪。トリガー発火には影響しない）
revoke execute on function public.handle_new_user()             from anon, authenticated, public;
revoke execute on function public.set_updated_at()              from anon, authenticated, public;
revoke execute on function public.enforce_attendance_church()   from anon, authenticated, public;
revoke execute on function public.write_audit()                 from anon, authenticated, public;
revoke execute on function public.write_membership_audit()      from anon, authenticated, public;

-- set_updated_at の search_path を固定（advisor 0011 function_search_path_mutable）
alter function public.set_updated_at() set search_path = '';
