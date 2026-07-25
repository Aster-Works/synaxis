# Synaxis デプロイ / 本番運用ガイド（Phase 4 パイロット）

このドキュメントは、永福南キリスト教会でのパイロット運用に向けた本番構成と、
Jimi が行う残りの手順をまとめる。クラウド構築の大部分は完了済み。

## 構成（構築済み）

| 項目 | 値 |
|---|---|
| クラウド DB | Supabase プロジェクト **Synaxis**（リージョン ap-northeast-1 / 東京） |
| Supabase ref | `korslvkwqpyiagwyjroi` |
| Supabase URL | `https://korslvkwqpyiagwyjroi.supabase.co` |
| ホスティング | Vercel プロジェクト **synaxis**（team: **Aster Works** / slug `asterworks`。2026-07 に jimiaki7s-projects から移管） |
| 本番 URL | **https://synaxis-asterworks.vercel.app**（旧 `synaxis-ten.vercel.app` も同じ配信）<br>⚠ Vercel の Deployment Protection（SSO / `all_except_custom_domains`）が有効で、独自ドメイン未設定のため**会衆はアクセスできない**。パイロット開始前に解除するか独自ドメインを割り当てる |
| デプロイ | GitHub `Aster-Works/synaxis` 連携済み → **main へ push すると自動デプロイ** |
| 費用 | Supabase 無料枠（有効プロジェクトは Keryx と Synaxis の2つ） / Vercel Hobby |

- DB スキーマ・RLS・RPC はクラウドへ適用済み（`supabase/migrations/`）。
- ⚠ **migration 履歴がローカルと本番で版名不一致**（本番はダッシュボード/MCP 経由で投入されたため、
  ローカル11本が「未適用」、本番に別タイムスタンプの10本が記録されている）。このまま
  `supabase db push` すると初期スキーマから当てにいって事故る。新しい migration を本番へ入れる前に
  `supabase migration repair --status applied <既存の各版>` で履歴を揃え、`--dry-run` で
  「新規1本だけが残る」ことを確認してから push すること。
- 未適用の migration: `20260726050000_harden_table_privileges`（anon/authenticated の TRUNCATE 等剥奪。
  アプリ動作には不要なので未適用でも本番は正常。適用は上記の repair 後）。
- セキュリティアドバイザ確認済み。SECURITY DEFINER 関数は anon から実行不可、
  トリガー関数は全ロールから revoke 済み（`0009_harden_function_grants`）。
- Vercel に公開 env（`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`）
  を production/preview/development で設定済み。

## ⚠️ ログイン方式（メール＋パスワード／Google）— 本番ダッシュボード設定が必須

アプリのログインは **メール＋パスワード（主）＋ Google** に変更済み（マジックリンクは廃止。
ワンタイムリンクがメールの先読みで失効する不具合が多発したため）。アプリ側のコードは対応済みだが、
**以下の Supabase ダッシュボード設定を行うまで本番では動作しない**（Google は無効・既存ユーザーは
パスワード未設定のためログイン不可）。

### 1. Authentication → URL Configuration
- **Site URL**: `https://synaxis-ten.vercel.app`
- **Redirect URLs**（追加）: `https://synaxis-ten.vercel.app/**`
  （独自ドメインを後で割り当てたらそれも追加）

### 2. Authentication → Providers → Email
- **Confirm email** を **OFF**（確認メールなしで即ログインする運用）。
  ※ ON のままだと新規登録時に確認メールが必要になり、メール先読み/失効の問題が再発しうる。

### 3. Authentication → Providers → Google を有効化
1. **Google Cloud Console** → APIとサービス → 認証情報 → OAuth クライアント ID（種類: ウェブ）を作成。
   - 承認済みリダイレクト URI: `https://korslvkwqpyiagwyjroi.supabase.co/auth/v1/callback`
   - （Sheets 連携用に作成済みのクライアントへ、この URI を追記して流用しても可）
2. 取得した **クライアント ID** と **クライアントシークレット** を、Supabase の Google プロバイダ画面に
   貼り付けて有効化・保存。
3. OAuth 同意画面で、必要なら本番ユーザーのメールをテストユーザーに追加（公開ステータスに応じて）。

### 4. 既存ユーザー（マジックリンクで作った owner）のログイン手段
既存アカウントはパスワード未設定なので、次のいずれかで復帰する:
- **同じメールの Google でログイン**（同一メールなら既存ユーザーに識別子が結びつく）。教会の owner 権限を保つには
  **以前と同じ Google アカウント**でログインすること。または
- Supabase ダッシュボード → Authentication → Users → 該当ユーザーで **パスワードを設定/リカバリ送信**。

> ローカル開発: `supabase/config.toml` の `[auth.email] enable_confirmations=false` で確認メール不要。
> Google をローカルで試す場合は `[auth.external.google]` を `enabled=true` にし、env でクライアント
> ID/シークレットを与える（本番のホスト型は config.toml ではなくダッシュボードが設定の正）。

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
  手動は `vercel --prod --scope asterworks`。
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
