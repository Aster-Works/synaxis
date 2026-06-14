# Synaxis

教会の主日礼拝の **受付（出席チェックイン・昼食集計）** を、紙/Excel の後入力から
当日入力へ移すモバイル・タブレット優先の Web アプリ。まず単一教会で実運用し、
その後、教会ごとに個人情報を厳格に分離したマルチテナント SaaS へ拡張する。

> Synaxis（σύναξις）＝「礼拝のための集まり」。

- プロダクト仕様: [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md)
- ロードマップ: [`docs/ROADMAP.md`](docs/ROADMAP.md)
- AI エージェント向けガイド / 不変条件: [`AGENTS.md`](AGENTS.md)

## 技術スタック

| 領域 | 採用 |
|---|---|
| フレームワーク | Next.js 16.2.6（App Router）/ React 19 |
| 言語 | TypeScript |
| スタイル | Tailwind CSS v4 |
| DB / 認証 | Supabase（Postgres + Auth + RLS）、`@supabase/ssr` |
| 入力検証 | Zod |
| テスト | Vitest（単体・コンポーネント）/ pgTAP（DB・RLS）/ Playwright（E2E） |
| タイムゾーン | `Asia/Tokyo` 前提 |

## 必要環境

- Node.js 20+
- Docker（ローカル Supabase スタック用）
- Supabase CLI（`brew install supabase/tap/supabase`）

## セットアップ

```bash
# 1. 依存をインストール
npm install

# 2. ローカル Supabase を起動（Docker）。初回はイメージ取得に時間がかかる。
npm run db:start
#   → 出力される API URL / anon(publishable) key / service_role(secret) key を控える

# 3. 環境変数を設定
cp .env.example .env.local
#   NEXT_PUBLIC_SUPABASE_URL            ← API URL（既定 http://127.0.0.1:54321）
#   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ← anon / publishable key
#   SUPABASE_SECRET_KEY                 ← service_role / secret key（管理スクリプト専用）

# 4. マイグレーション + シードを適用
npm run db:reset

# 5. 開発サーバー
npm run dev   # http://localhost:3000
```

ローカルの Supabase Studio は `http://127.0.0.1:54523`、メール確認は Inbucket
`http://127.0.0.1:54524`（マジックリンクのメールはここに届く）。

> ポートは既定（543xx）から **545xx** にずらしてある（同マシンの他 Supabase
> プロジェクトとの競合回避のため。`supabase/config.toml` 参照）。

## スクリプト

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー |
| `npm run build` | 本番ビルド |
| `npm run lint` | ESLint |
| `npm test` | Vitest（単体・コンポーネント） |
| `npm run test:e2e` | Playwright スモーク E2E（要ローカル起動） |
| `npm run db:start` / `db:stop` | ローカル Supabase の起動 / 停止 |
| `npm run db:reset` | migration + seed を再適用（**ローカルのみ**。データは消える） |
| `npm run db:test` | pgTAP（DB 制約・RLS 教会間分離テスト） |
| `npm run db:types` | ローカル DB から TypeScript 型を生成 |

## データモデル（概要）

「立場（relationship_status）」と「年齢区分（age_group）」を分離し、礼拝の開催実績を
`service_events` として保持する。出席は `(service_event_id, person_id)` で一意。
昼食は当面 `attendance_records.lunch_quantity`。詳細は `docs/PRODUCT_SPEC.md` §8。

```
churches ─┬─ church_memberships ─ auth.users(profiles)
          ├─ people
          ├─ service_events ─┬─ attendance_records ─ people
          │                  └─ service_templates
          └─ audit_logs
```

## セキュリティ不変条件

- 通常処理で `service_role` / secret キーを使わない（秘密鍵は `scripts/` の管理用途のみ）。
- 公開スキーマ全テーブルで RLS 有効。`anon` に人物・出席データを許可しない。
- 認可は `church_memberships` を正とする。教会間でデータを読み書きできないことを pgTAP で検証。

詳細は [`AGENTS.md`](AGENTS.md) と `docs/PRODUCT_SPEC.md` §9 を参照。

## バックアップ / 破壊的変更の方針

- migration は **追加型**。破壊的変更（カラム削除・型変更・データ削除）は単独セッションで行わず、
  事前バックアップとロールバック手順を文書化してから実施する。
- 本番 Supabase への破壊的 migration・本番データの削除/統合は、必ず管理者（Jimi）の確認後に行う。
- ローカルは `npm run db:reset` でいつでも初期化できる（データは消える）。

## Google 連携セットアップ（任意・Phase 3）

出席集計を Google スプレッドシートへ出力する機能。Google Cloud の OAuth
クライアントが必要で、これが無い間は接続/出力の**実通信は未検証**（コード・
migration・RLS は完成済み）。手順:

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクト作成。
2. 「API とサービス」で **Google Sheets API** と **Google Drive API** を有効化。
3. OAuth 同意画面を構成（ユーザータイプ=外部）。テスト段階はテストユーザーに
   自分の Google アカウントを追加（審査不要で利用可）。スコープに
   `drive.file` / `spreadsheets` / `userinfo.email` を登録（最小権限）。
4. 認証情報 → OAuth クライアント ID（ウェブアプリ）を作成。承認済みリダイレクト
   URI に `http://localhost:3000/api/integrations/google/callback`（＋本番 URL）。
5. 払い出された ID/シークレットと暗号鍵を `.env.local` に設定:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/integrations/google/callback
   GOOGLE_TOKEN_ENC_KEY=$(openssl rand -base64 32)
   ```
   `GOOGLE_TOKEN_ENC_KEY` は `SUPABASE_SECRET_KEY` と同じ「サーバ専用・ブラウザに
   出さない」区分。`refresh_token` は private スキーマに pgcrypto で暗号化保存し、
   鍵は DB に置かない。接続は owner/admin のみ。「接続を解除」でトークンを revoke
   ＆ DB から削除する。
6. `/settings`（owner/admin）の「Google スプレッドシート連携」から接続→出力。

## ロードマップ進捗

- [x] **Phase 0** ベースライン確立（足場・設定・ローカル DB・テスト基盤・CI）
- [x] **Phase 1** 安全なマルチテナント基盤（Auth/SSR・RLS・新スキーマ・移行スクリプト）
- [x] **Phase 2** 日曜運用 MVP（Realtime 複数端末同期・オフライン再試行キュー・重複候補検出・人物統合）
- [x] **Phase 3** 集計・移行・Google Sheets（ダッシュボード/期間集計・CSV出力・Excel移行・Google連携※実通信は要設定）
- [~] **Phase 4** 単一教会パイロット — 本番デプロイ済み（Supabase東京＋Vercel: https://synaxis-ten.vercel.app）。
  実データ移行と4週間の実地運用検証は [`docs/DEPLOY.md`](docs/DEPLOY.md) 参照
- [ ] Phase 5 他教会向けベータ
- [ ] Phase 6 課金
- [ ] Phase 5 他教会向けベータ
- [ ] Phase 6 課金

詳細は [`docs/ROADMAP.md`](docs/ROADMAP.md)。
