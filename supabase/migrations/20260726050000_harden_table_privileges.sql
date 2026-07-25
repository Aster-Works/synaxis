-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ テーブル権限の堅牢化（RLS 監査 2026-07-26 の指摘対応）                  ║
-- ║                                                                        ║
-- ║ 背景:                                                                  ║
-- ║  TRUNCATE は RLS の外側で動く（行レベルでなくテーブルレベルの権限）。   ║
-- ║  現状 PostgREST は TRUNCATE を発行しないため実害は無いが、Supabase の   ║
-- ║  既定 ACL が anon / authenticated へ TRUNCATE 等を自動付与するため、    ║
-- ║  「今後 public に追加されるテーブル」も含めて先に爆発半径を潰す。       ║
-- ║  0003 と 0009 の権限剥奪は当時のオブジェクトの手書き列挙であり、        ║
-- ║  恒久ルールではなかった。                                              ║
-- ║                                                                        ║
-- ║  private スキーマ関数は PUBLIC への暗黙 EXECUTE だけを剥奪する。        ║
-- ║  ポリシー式は「問い合わせを実行したユーザー」の権限で評価されるため、   ║
-- ║  authenticated が EXECUTE を失うと全ポリシーが権限エラーになるが、      ║
-- ║  0003:64-66 が authenticated へ**明示的に** grant しているため無事。    ║
-- ║  （安全性は rls_isolation.test.sql が authenticated で読み書きを        ║
-- ║   検証しているので、この migration 適用後に緑であることで実証する）     ║
-- ║                                                                        ║
-- ║ ロールバック方針: 破壊的変更なし（権限の剥奪のみ・データ無影響）。      ║
-- ║ revoke を戻す場合は必要な権限だけを個別に grant する。                  ║
-- ║ 冪等: revoke / alter default privileges はいずれも再実行可能。          ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- 既存テーブル: anon は全権限を剥奪（現状ゼロだが将来の混入に備えて明示）。
revoke all on all tables in schema public from anon;

-- 既存テーブル: authenticated からアプリが使わない高権限を剥奪する。
-- SELECT / INSERT / UPDATE / DELETE は RLS 前提で残す（PostgREST が使う）。
-- MAINTAIN は PostgreSQL 17 以降にしか存在しないため、ここでは扱わない
-- （データ破壊に直結しない権限であり、旧バージョンでの migration 失敗を避ける）。
revoke truncate, references, trigger
  on all tables in schema public
  from authenticated;

-- 将来 postgres が public に作るテーブルへ自動付与させない。
alter default privileges for role postgres in schema public
  revoke all on tables from anon;
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from authenticated;

-- private スキーマ関数: 関数作成時に PUBLIC へ付く暗黙の EXECUTE を剥奪する
-- （authenticated は 0003:64-66 の明示 grant を持つため影響しない）。
-- anon はスキーマ USAGE を持たないので元から到達できないが、多重防御にする。
revoke execute on all functions in schema private from public;
alter default privileges for role postgres in schema private
  revoke execute on functions from public;
