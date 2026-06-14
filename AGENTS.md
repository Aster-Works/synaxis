# Synaxis — AIエージェント向けガイド

## これは「あなたの知っている Next.js」ではない

本リポジトリは **Next.js 16.2.6 / React 19** を使用する。学習データと API・規約・ファイル構成が
異なる可能性がある。コードを書く前に、必要に応じて `node_modules/next/dist/docs/` の該当ガイドを読み、
非推奨警告（deprecation notice）に従うこと。

## このプロダクトは何か

教会の主日礼拝の受付（出席チェックイン・昼食集計）を、紙/Excel の後入力から当日入力へ移す
モバイル・タブレット優先の Web アプリ。最初は単一教会で実運用し、その後マルチテナント SaaS へ広げる。

- プロダクト仕様: `docs/PRODUCT_SPEC.md`
- ロードマップ: `docs/ROADMAP.md`

## 破ってはいけない不変条件（最優先）

1. 通常の画面・API 処理で `service_role` / secret キーを使わない。秘密鍵は `scripts/` の管理用途のみ。
2. `anon` に人物・出席データを許可しない。公開スキーマの全テーブルで RLS を有効化する。
3. 教会所有データには必ず `church_id` を持たせ、教会間で読み書きできないことをテストで保証する。
4. API は「トグル」ではなく「望む最終状態を設定する」冪等設計にする。
5. DB の ID は DB 側（`gen_random_uuid()` / identity）で生成する。
6. 既存データを失う破壊的 migration をいきなり行わない。migration は追加型で、ロールバック方針を書く。
7. 受付 UX の長所（2タップ以内・大ボタン・楽観的更新・ゲスト即時追加・直前操作の取消）を壊さない。

## 開発の進め方

- 段階を踏む：調査 → 実装計画 → 実装 → lint/型/テスト。各まとまりで品質ゲートを回す。
- 入力は Zod で検証する。認証ユーザーと選択中の教会を毎回検証する。
- RLS で参照する `church_id` / `user_id` にはインデックスを付ける。
- 集計の分母は「出席記録の有無」ではなく `service_events`（`counts_toward_attendance_rate`）。

## 品質ゲート

```bash
npm run lint
npm run build
npm test          # Vitest（単体・コンポーネント）
npm run db:test   # pgTAP（DB制約・RLS教会間分離）
```

RLS の教会間分離テストと主要フローのテストが通らない限り、本番へ出さない。
