-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 0007 guest_idempotency                                                  ║
-- ║ ゲスト作成（people INSERT）をサーバ側で冪等にするための冪等キー。      ║
-- ║                                                                        ║
-- ║ 背景: 受付のオフライン再送キューはゲストPOSTに x-client-op-id を付ける  ║
-- ║ が、弱電波でサーバ到達後に応答が失われると同じ入力を再送し、人物が      ║
-- ║ 二重作成され出席・昼食が二重計上される（不変条件「冪等」「集計ずれ無」）║
-- ║                                                                        ║
-- ║ 対策: people に client_op_id を持たせ (church_id, client_op_id) を一意  ║
-- ║ にする。サーバは再送時に既存 person を返す（INSERT...ON CONFLICT）。    ║
-- ║ NULL は複数許容（既存データ・管理インポートは client_op_id なしで可）。 ║
-- ║                                                                        ║
-- ║ 追加型・非破壊。ロールバック:                                           ║
-- ║   drop index if exists public.people_church_client_op_idx;             ║
-- ║   alter table public.people drop column if exists client_op_id;        ║
-- ╚══════════════════════════════════════════════════════════════════════╝

alter table public.people
  add column if not exists client_op_id uuid;

-- (church_id, client_op_id) を一意に。NULLS DISTINCT（既定）なので
-- client_op_id が NULL の行は何件でも共存できる（既存ゲスト・移行データに無害）。
-- 部分インデックス（where ...）にすると ON CONFLICT のアービタに使えないため、
-- 非部分のユニークインデックスにする（NULL 複数許容は NULLS DISTINCT が担保）。
create unique index if not exists people_church_client_op_idx
  on public.people (church_id, client_op_id);
