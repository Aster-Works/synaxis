# Synaxis デプロイ / 本番運用ガイド（Phase 4 パイロット）

このドキュメントは、永福南キリスト教会でのパイロット運用に向けた本番構成と、
Jimi が行う残りの手順をまとめる。クラウド構築の大部分は完了済み。

## 構成（構築済み）

| 項目 | 値 |
|---|---|
| クラウド DB | Supabase プロジェクト **Synaxis**（リージョン ap-northeast-1 / 東京） |
| Supabase ref | `korslvkwqpyiagwyjroi` |
| Supabase URL | `https://korslvkwqpyiagwyjroi.supabase.co` |
| ホスティング | Vercel プロジェクト **synaxis**（team: jimiaki7s-projects） |
| 本番 URL | **https://synaxis-ten.vercel.app** |
| デプロイ | GitHub `jimiaki7/synaxis` 連携済み → **main へ push すると自動デプロイ** |
| 費用 | Supabase 無料枠（有効プロジェクトは Keryx と Synaxis の2つ） / Vercel Hobby |

- DB スキーマ・RLS・RPC（migration 9本）はクラウドへ適用済み（`supabase/migrations/`）。
- セキュリティアドバイザ確認済み。SECURITY DEFINER 関数は anon から実行不可、
  トリガー関数は全ロールから revoke 済み（`0009_harden_function_grants`）。
- Vercel に公開 env（`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`）
  を production/preview/development で設定済み。

## ⚠️ 最初に必要な手順: Supabase Auth のリダイレクト URL 設定

**これを行うまで本番でログインできない**（マジックリンクのリダイレクトが拒否される）。

Supabase ダッシュボード → 対象プロジェクト Synaxis → **Authentication → URL Configuration**:

- **Site URL**: `https://synaxis-ten.vercel.app`
- **Redirect URLs**（追加）:
  - `https://synaxis-ten.vercel.app/**`
  - （独自ドメインを後で割り当てたらそれも追加）

保存後、本番でメールログインが通るようになる（メールは Supabase の組み込み SMTP か、
本番運用なら独自 SMTP を Authentication → Emails で設定推奨。無料枠の送信制限に注意）。

## 実データ（現行 Excel）の本番移行

個人情報（氏名）をチャット・ログに残さないため、**移行はローカルからクラウド DB へ
直接**行う（スクリプトが Excel→DB を直結し、データは画面に出ない）。

1. クラウドの **secret(service_role) キー**を取得: ダッシュボード → Project Settings →
   API → `service_role` / secret key。**サーバ専用・ブラウザやチャットに貼らない。**
2. 本番アプリ `https://synaxis-ten.vercel.app` にサインアップ → オンボーディングで
   教会「永福南キリスト教会」を作成（あなたが owner になる）。
3. 作成した教会の id を控える（Supabase Studio の `public.churches` で確認可）。
4. 中間 JSON を生成（読み取り専用・元 Excel は変更しない）:
   ```bash
   python3 scripts/extract-excel.py
   ```
5. まず **dry-run**（書き込まない・件数照合のみ）:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://korslvkwqpyiagwyjroi.supabase.co \
   SUPABASE_SECRET_KEY=<cloud secret> \
   TARGET_CHURCH_ID=<永福南の church id> \
   npx tsx scripts/migrate-from-excel.ts
   ```
6. 件数（人物275＋特別6・出席2204 など）を確認し、問題なければ **--apply**:
   ```bash
   ... 同じ env ... npx tsx scripts/migrate-from-excel.ts -- --apply
   ```
7. 移行後、ダッシュボードの集計が現行 Excel の「まとめ」と一致するか照合する。
   子ども区分の relationship や同名候補は、人物ページの「統合」で目視確認・統合する。

> 受付端末（タブレット）のユーザーには owner が `/settings`（後続実装の招待 UI、
> または当面は Supabase で `church_memberships` に receptionist を追加）で権限を付与する。

## Google スプレッドシート連携（任意）

[README「Google 連携セットアップ」](../README.md) の手順で Google Cloud の OAuth
クライアントを作成し、Vercel に下記 env を設定（production）してから再デプロイ:

```
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
GOOGLE_OAUTH_REDIRECT_URI=https://synaxis-ten.vercel.app/api/integrations/google/callback,
GOOGLE_TOKEN_ENC_KEY  (openssl rand -base64 32)
```

承認済みリダイレクト URI に上記 callback を Google 側にも登録する。設定するまで
Google 出力機能のみ未稼働（受付・集計・CSV は影響なし）。

## 今後のデプロイ・スキーマ変更

- **アプリ**: `git push origin main` で Vercel が自動ビルド・デプロイ。
  手動は `vercel --prod --scope jimiaki7s-projects`。
- **スキーマ変更**: `supabase/migrations/` に追加型 migration を足し、クラウドへ適用
  （`supabase link --project-ref korslvkwqpyiagwyjroi` 後 `supabase db push`、
  または Supabase MCP の apply_migration）。**破壊的変更は事前バックアップと
  Jimi の承認後に**（CLAUDE_CODE_PROMPT §4 / AGENTS.md）。

## バックアップ / 復旧 / ロールバック

- **パイロット初回2週**: 紙または現行 Excel を併用してバックアップとする
  （ROADMAP Phase 4）。集計は毎週、画面 / CSV と突き合わせる。
- **DB バックアップ**: 無料枠は日次自動バックアップ（保持期間に制限）。重要な節目では
  CSV 出力（`/api/reports/export`）を保存。PITR は有料プラン。
- **アプリのロールバック**: Vercel ダッシュボード → Deployments → 以前の正常な
  デプロイを「Promote to Production」で即時切り戻し可能。
- **重大障害時**: ①受付は紙へ退避 → ②原因切り分け（Vercel ログ / Supabase ログ）→
  ③アプリは前デプロイへロールバック、DB は最新バックアップから復元。

## 週次レビュー（Phase 4 運用）

毎週、以下を確認する（ROADMAP Phase 4）:
- 集計差異: ダッシュボードの数値と紙/Excel の一致。
- 同期失敗: 受付端末で「未同期」が残っていないか。
- 重複人物: 人物ページで同名・表記揺れを統合（出席履歴は保持される）。
- 受付担当の操作上の迷いを記録し、機能追加より入力速度・信頼性の修正を優先する。
