# 教会礼拝出席管理 SaaS プロダクト仕様書

- 状態: 実装開始用ドラフト
- 作成日: 2026-06-14
- 対象リポジトリ: `/Users/james/church-attendance`
- 仮称: Church Attendance

## 1. エグゼクティブサマリー

このプロダクトは、教会の礼拝受付を「紙・Excelへの後入力」から「礼拝当日の高速なチェックインと自動集計」へ移行する、モバイル・タブレット優先のWebアプリである。

最初は永福南キリスト教会の実運用を確実に置き換え、その後、他教会が自分たちで登録・利用できるマルチテナントSaaSへ拡張する。

最重要価値は次の3点である。

1. 礼拝開始前後の忙しい時間でも、迷わず素早く入力できる。
2. 朝礼拝・昼食・夕拝・特別礼拝を正確に集計し、Excel作業を減らす。
3. 教会ごとの個人情報を厳格に分離し、安全に複数教会へ展開できる。

## 2. 調査から得た前提

### 2.1 現行プロトタイプの強み

- Next.js 16.2.6、React 19、Supabaseを使用している。
- 受付画面はタブレット操作を意識し、出席・昼食を大きなボタンで入力できる。
- 楽観的更新により、タップ後の反応が速い。
- ビジターを名前だけで即時追加し、同時に当日出席へ登録できる。
- 朝礼拝、夕拝、昼食のリアルタイム合計を確認できる。
- CSVによるクロス集計出力がある。
- 2026-06-14時点で `npm run build` は成功している。

### 2.2 現行プロトタイプの主要課題

- 認証がなく、RLSポリシーが `anon` を含む全アクセス許可になっている。
- 全データが単一教会前提で、他教会のデータを分離できない。
- 通常処理でも `service_role` を優先できる設計になっており、製品版では危険である。
- 礼拝種別が `morning` / `evening` に固定され、元旦礼拝、受難日礼拝などを自然に扱えない。
- 「子ども」が立場の一種になっており、「会員である子ども」などを表現できない。
- 出席率の分母が「1人以上の出席記録がある朝礼拝日」なので、イベント自体を記録しない限り正確にならない。
- `attendance_records.id` をクライアント側相当の時刻・乱数で生成しており、衝突時の挙動に不安がある。
- Googleスプレッドシート出力はモックである。
- 入力検証、監査ログ、自動テスト、オフライン再送が不足している。
- 2026-06-14時点で `npm run lint` は、受付画面と管理画面の `react-hooks/set-state-in-effect` により2件失敗する。

### 2.3 実運用Excelから確認できた要件

対象ファイル: `/Users/james/Documents/礼拝出席名簿_2026集計用-1.xlsx`

- 9シートで構成されている。
- 会員、客員、未信、子ども、ビジターを別シートで管理している。
- 週ごとの主日礼拝出席を `○` で記録している。
- まとめシートでは、会員・客員・未信・ビジターを大人として集計し、子どもを別集計している。
- 朝礼拝と夕拝の合計、月平均、年間行事の備考を管理している。
- 元旦礼拝と受難日礼拝は特別礼拝として別シートに記録している。
- ビジターが1シートに収まらず `ビジター2` が存在する。
- 前年ビジターの出席回数を見て、翌年に客員・未信などへ整理する運用がある。
- 現行Excelには昼食の記録がないため、昼食集計はWebアプリで新たに正式管理する。

このため、製品版では「立場」「年齢区分」「礼拝イベント」「出席」「昼食」を別概念として設計する。

## 3. プロダクト原則

1. **日曜朝の操作速度を最優先する。**
2. **入力は2タップ以内、ゲスト追加は30秒以内を目標にする。**
3. **不安定な通信でも入力を失わない。**
4. **教会間のデータ漏えいを構造的に防ぐ。**
5. **Excelの見た目をそのままDB設計に持ち込まない。**
6. **通常礼拝と特別礼拝を同じイベントモデルで扱う。**
7. **課金より先に、単一教会での継続利用と価値検証を優先する。**

## 4. 対象ユーザーと権限

| ロール | 主な利用者 | 権限 |
|---|---|---|
| `owner` | 主任牧師、教会責任者 | 全権限、教会設定、ユーザー招待、連携、課金 |
| `admin` | 教会スタッフ、集計担当 | 人物・礼拝・出席・集計・エクスポート管理 |
| `receptionist` | 受付奉仕者 | 当日の出席、昼食、ゲスト追加、当日集計の閲覧 |
| `viewer` | 役員、閲覧担当 | 集計・履歴の閲覧、許可されたエクスポート |

原則として、受付担当に課金・連携設定・全ユーザー管理を見せない。

## 5. スコープ

### 5.1 初期製品に含める

- 朝礼拝、夕拝、特別礼拝、その他集会のイベント作成・管理
- 人物マスター
- 出席チェックイン
- 昼食数の入力・集計
- ゲストのクイック追加
- ゲストから継続出席者・会員への区分変更
- 当日集計と期間集計
- CSV出力
- Googleスプレッドシート出力
- Supabase Authによるログイン
- 教会単位のマルチテナント
- ユーザー招待とロール管理
- Excel/CSVからの初期データ移行
- 操作監査ログ
- 将来の課金に備えた権限・契約状態の土台

### 5.2 初期製品に含めない

- 献金・会計管理
- 牧会記録、相談記録、機密メモ
- 教会員向けSNS、チャット
- 奉仕シフト管理
- 児童チェックアウト・保護者照合
- 複雑なCRM、メール配信
- 席数予約やイベントチケット販売

## 6. 主要ユーザーフロー

### 6.1 礼拝受付を開始する

1. 受付担当がログインする。
2. 現在時刻に最も近い「本日の礼拝」が自動選択される。
3. 予定された礼拝がない場合は、権限のあるユーザーが即時作成できる。
4. 受付画面には礼拝名、日時、総出席、昼食合計、同期状態を固定表示する。

受け入れ条件:

- 通常の日曜は、ログイン後1操作以内で受付画面へ到達できる。
- 違う礼拝を選んだ場合は、画面上で明確に識別できる。
- 開催済みイベントだけが出席率の分母に含まれる。

### 6.2 既存人物を出席登録する

1. 名前・フリガナ検索、または一覧から人物を見つける。
2. 「出席」をタップする。
3. 必要なら「昼食」をタップし、数量を変更する。
4. 複数端末の集計へ反映される。

受け入れ条件:

- タップ直後に見た目と合計数が更新される。
- 同じ人物を二重登録できない。
- 同じ状態を再送しても結果が変わらない。
- 保存失敗時は入力を失わず、再試行状態が分かる。

### 6.3 ゲストを追加する

1. 「ゲスト追加」を開く。
2. 名前を入力する。名前不明の場合は仮名登録も許可する。
3. 年齢区分、昼食数を任意入力する。
4. 保存と同時に選択中の礼拝へ出席登録する。

受け入れ条件:

- 名前だけなら30秒以内で登録できる。
- 類似名がある場合は重複候補を表示する。
- 後日、既存人物へ統合しても出席履歴を失わない。

### 6.4 集計・振り返りを行う

1. 管理者が期間と礼拝種別を選択する。
2. 総出席、大人、子ども、立場別、昼食、夕拝、ゲスト数を確認する。
3. 人物ごとの出席回数・出席率・初回/最終出席日を確認する。
4. CSVまたはGoogleスプレッドシートへ出力する。

受け入れ条件:

- 特別礼拝を通常主日礼拝の出席率から除外できる。
- 年齢区分と立場を独立して集計できる。
- エクスポート結果が画面上の合計と一致する。

## 7. 画面仕様

### 7.1 `/check-in`

- タブレット・スマートフォン最優先。
- 上部固定: 礼拝名、日付、総出席、大人、子ども、昼食、同期状態。
- 礼拝切替: 本日分を優先表示し、過去日編集は明示的操作にする。
- 検索: 名前、フリガナ。
- フィルター: 全員、最近の出席者、未出席、出席済み、ゲスト。
- 人物行: 名前、必要最小限の区分、出席ボタン、昼食ボタン。
- 昼食ボタンは数量 `0 / 1 / 2...` を扱える。
- ゲスト追加ボタンは常に到達しやすい位置に置く。
- 誤操作を戻せる「直前の操作を取り消す」を用意する。

### 7.2 `/dashboard`

- 本日の礼拝カード
- 直近の礼拝推移
- 朝・夕・特別礼拝の集計
- 大人・子ども・立場別の内訳
- 初来会ゲスト、再来会ゲスト
- 出席データに異常がある場合の警告

### 7.3 `/people`

- 検索、フィルター、並び替え
- 人物の新規作成、編集、アーカイブ
- 立場と年齢区分の独立編集
- 出席履歴、初回出席、最終出席、出席回数
- 重複人物の統合

### 7.4 `/events`

- 礼拝イベントの一覧・作成・編集
- 通常礼拝、夕拝、特別礼拝、その他
- 「出席率の分母に含める」設定
- 備考・行事名
- 受付開始、開催済み、キャンセルの状態管理

### 7.5 `/settings`

- 教会名、タイムゾーン、子ども区分の表示名
- ユーザー招待、ロール変更
- Google連携
- データインポート・エクスポート
- 課金管理（課金導入後）

## 8. ドメインモデル

### 8.1 設計上の重要決定

- `members` ではなく `people` と呼ぶ。ゲストも同じ人物履歴として扱うため。
- 「立場」と「年齢区分」を分離する。
- 礼拝の開催実績を `service_events` として保持する。
- 出席は人物と礼拝イベントの組み合わせで一意にする。
- 昼食は当面 `attendance_records.lunch_quantity` とし、将来複数メニューが必要になった時点で別テーブル化する。
- すべての教会所有データに `church_id` を持たせる。

### 8.2 推奨テーブル

#### `churches`

- `id uuid primary key`
- `name text not null`
- `slug text unique not null`
- `timezone text not null default 'Asia/Tokyo'`
- `child_label text not null default '子ども'`
- `created_at timestamptz`
- `archived_at timestamptz null`

#### `profiles`

- `id uuid primary key references auth.users`
- `display_name text`
- `created_at timestamptz`

#### `church_memberships`

- `church_id uuid references churches`
- `user_id uuid references auth.users`
- `role text check in ('owner','admin','receptionist','viewer')`
- `invited_by uuid null`
- `created_at timestamptz`
- primary key: `(church_id, user_id)`

#### `people`

- `id uuid primary key default gen_random_uuid()`
- `church_id uuid not null`
- `display_name text not null`
- `furigana text null`
- `relationship_status text check in ('member','regular_attendee','seeker','guest')`
- `age_group text check in ('adult','child','unknown')`
- `first_visit_on date null`
- `archived_at timestamptz null`
- `created_at timestamptz`
- `updated_at timestamptz`

注意:

- `child` は `relationship_status` に入れない。
- 初期版では住所、電話番号、詳細な牧会メモを保存しない。

#### `service_events`

- `id uuid primary key default gen_random_uuid()`
- `church_id uuid not null`
- `kind text check in ('morning_worship','evening_worship','special_worship','other')`
- `name text not null`
- `starts_at timestamptz not null`
- `status text check in ('scheduled','open','completed','cancelled')`
- `counts_toward_attendance_rate boolean not null default false`
- `lunch_enabled boolean not null default false`
- `note text null`
- `created_by uuid null`
- `created_at timestamptz`
- `updated_at timestamptz`

#### `service_templates`

- `id uuid primary key`
- `church_id uuid not null`
- `name text not null`
- `kind text not null`
- `weekday smallint`
- `start_time time`
- `lunch_enabled boolean`
- `counts_toward_attendance_rate boolean`
- `active boolean`

定期礼拝からイベントを作るために使用する。初期段階では手動作成でもよい。

#### `attendance_records`

- `id uuid primary key default gen_random_uuid()`
- `church_id uuid not null`
- `service_event_id uuid not null`
- `person_id uuid not null`
- `lunch_quantity smallint not null default 0 check (lunch_quantity >= 0)`
- `checked_in_at timestamptz not null default now()`
- `checked_in_by uuid null`
- `source text check in ('reception','admin','import')`
- `created_at timestamptz`
- `updated_at timestamptz`
- unique: `(service_event_id, person_id)`

DB制約またはトリガーで、`church_id` がイベント・人物と一致することを保証する。

#### `audit_logs`

- `id bigint generated always as identity primary key`
- `church_id uuid not null`
- `actor_user_id uuid null`
- `action text not null`
- `entity_type text not null`
- `entity_id uuid null`
- `before jsonb null`
- `after jsonb null`
- `created_at timestamptz`

#### `google_integrations`

サーバー専用の非公開スキーマに置く。

- `church_id uuid primary key`
- `connected_by uuid`
- `encrypted_refresh_token text`
- `spreadsheet_id text null`
- `created_at timestamptz`
- `updated_at timestamptz`

#### `subscriptions`

- `church_id uuid primary key`
- `stripe_customer_id text unique`
- `stripe_subscription_id text unique null`
- `stripe_price_id text null`
- `status text`
- `current_period_end timestamptz null`
- `updated_at timestamptz`

契約状態はStripe webhookを正とする。

## 9. 認証・認可・マルチテナント

### 9.1 認証

- Supabase Authと `@supabase/ssr` を利用する。
- 初期はメールOTPまたはMagic Linkを推奨する。
- Next.jsの保護ルートではCookieの内容だけを信頼せず、Supabaseの現行推奨に従い `getClaims()` または必要に応じて `getUser()` で検証する。
- 新しいSupabase publishable key形式を使用する。

### 9.2 RLS

- 公開スキーマの全テーブルでRLSを有効化する。
- `anon` への人物・出席データアクセスは一切許可しない。
- 通常の画面・API処理で `service_role` / secret keyを使用しない。
- 権限判定は `church_memberships` を基準にする。
- RLSポリシーで参照する `church_id`、`user_id` にはインデックスを付ける。
- RLSポリシーには `TO authenticated` を明示する。
- 権限ヘルパー関数を使う場合は非公開スキーマに置き、`security definer` と固定 `search_path` を慎重に設定する。
- 集計ビューを作る場合は `security_invoker = true` を使用するか、非公開スキーマに置く。

### 9.3 ロール権限

- `receptionist`: `service_events` 読み取り、当日出席の作成・更新・削除、ゲスト作成。
- `viewer`: 読み取りのみ。
- `admin`: 教会内データ管理。
- `owner`: 管理者権限に加え、ユーザー・連携・課金管理。

### 9.4 セキュリティ必須テスト

- 教会Aの全ロールから教会Bの人物・礼拝・出席を読み書きできない。
- `receptionist` が教会設定・課金・ユーザーロールを変更できない。
- 未認証ユーザーが人物・出席データを取得できない。
- GoogleトークンとStripe秘密情報がクライアントへ返らない。

## 10. API設計

APIは状態を「トグル」するのではなく、望む最終状態を設定する。これにより再送を安全にする。

### 10.1 主要エンドポイント案

- `GET /api/events/current`
- `GET /api/events/:eventId/reception`
- `PUT /api/events/:eventId/attendance/:personId`
- `DELETE /api/events/:eventId/attendance/:personId`
- `POST /api/events/:eventId/guests`
- `GET /api/reports/attendance`
- `POST /api/exports/google-sheets`
- `POST /api/imports/people`
- `POST /api/imports/attendance`

`PUT attendance` の入力例:

```json
{
  "lunchQuantity": 1
}
```

### 10.2 API共通要件

- Zod等で入力を検証する。
- 認証ユーザーと選択教会を毎回検証する。
- すべてのクエリに明示的な `church_id` フィルターを付ける。
- ユーザー向けエラーとログ向けエラーを分離する。
- 監査対象操作を記録する。
- チェックインAPIは冪等にする。

## 11. Googleスプレッドシート出力

### 11.1 方針

- 単一のサービスアカウントへ各教会がシート共有する方式は、SaaS展開では採用しない。
- 教会のowner/adminがGoogle OAuthで接続し、その教会が利用したファイルだけにアクセスする。
- Google推奨の最小権限として、可能な限り `drive.file` スコープを使用する。
- 最初は「ボタンを押した時だけ出力・更新」にし、自動同期は後回しにする。

### 11.2 出力シート

1. `まとめ`
   - 日付、礼拝名、朝、夕、特別礼拝、総出席、大人、子ども、昼食、立場別、備考
2. `出席マトリクス`
   - 行: 人物
   - 列: 礼拝イベント
   - 値: `○`
3. `ゲスト`
   - 氏名、初回出席、最終出席、出席回数、現在の立場
4. `人物一覧`
   - 氏名、フリガナ、立場、年齢区分、状態

### 11.3 出力要件

- 画面集計と出力集計が一致する。
- 同じ教会・同じ年度は、既存のスプレッドシートを更新できる。
- 出力中・成功・失敗状態を画面表示する。
- 個人の機密メモは出力しない。
- OAuthトークン失効時は再接続を促す。

## 12. データ移行

### 12.1 現行Supabaseデータ

- 現在の `members` を `people` へ移行する。
- 現在の `category='child'` は `age_group='child'` とし、`relationship_status` は移行時レビュー対象にする。
- `attendance_records` の日付・礼拝種別ごとに `service_events` を生成する。
- `has_lunch=true` は `lunch_quantity=1` に変換する。
- 移行後、元レコード数と新レコード数を照合する。

### 12.2 Excelデータ

- 一度限りの移行スクリプトを作る。
- 会員、客員、未信、子ども、ビジター、ビジター2を読み取る。
- 日付列と `○` の交点から出席履歴を作る。
- 元旦礼拝・受難日礼拝を特別礼拝イベントとして移行する。
- `まとめ` と `→2026` は照合資料として利用し、正規データの直接インポート元にはしない。
- 人名重複・表記揺れは自動統合せず、候補リストを出して管理者が確認する。
- 元ファイルは変更しない。

## 13. 非機能要件

### 13.1 性能

- 200人一覧の初期表示: 通常回線で2秒以内を目標。
- 出席タップの視覚反映: 100ms以内。
- 保存完了表示: 通常回線で1秒以内を目標。
- 同時利用端末: 初期目標4台以上。

### 13.2 信頼性

- 楽観的更新と再試行キューを使用する。
- 通信断時は未同期件数を表示する。
- 同じリクエストの再送で重複を起こさない。
- 複数端末の変更をRealtimeまたは再取得で収束させる。
- 日曜の運用中に障害が起きた場合、CSVまたは紙へ退避できる導線を残す。

### 13.3 アクセシビリティ

- タッチターゲットは原則44px以上。
- 色だけで出席状態を表現しない。
- キーボード操作とスクリーンリーダー用ラベルを用意する。
- 日本語表示を標準とする。

### 13.4 プライバシー

- 保存する個人情報を必要最小限にする。
- 教会単位のデータエクスポートと削除手順を用意する。
- 監査ログに秘密情報を保存しない。
- 本番ログへ人名などを過剰に出力しない。

## 14. テスト戦略

### 14.1 必須テスト

- DB制約とRLS: pgTAPまたは同等のDBテスト
- 集計ロジック: 単体テスト
- Route Handler / Server Action: 認証・認可・入力検証テスト
- 受付画面: 出席、取消、昼食、ゲスト追加、通信失敗
- E2E: ログインから受付、集計、エクスポートまで
- データ移行: 件数照合、合計照合、再実行安全性

### 14.2 最低品質ゲート

```bash
npm run lint
npm run build
npm test
```

さらに、RLSの教会間分離テストと主要E2Eが成功しない限り、本番へ出さない。

## 15. 課金設計

課金は、複数教会が継続利用する兆候を確認してから実装する。

### 15.1 初期案

- パイロット: 無料
- 有料版: 1教会単位の月額プランを1種類から開始
- 将来: ユーザー数、保存期間、高度なレポート等で上位プランを検討

### 15.2 実装方針

- Stripe Billing + Checkout Sessionsを使用する。
- 契約変更・支払方法変更はStripe Customer Portalへ委ねる。
- 契約状態はwebhookで同期し、ブラウザからの戻りURLだけを信頼しない。
- 課金対象は個人ユーザーではなく `church` とする。
- 課金停止時も、一定期間は読み取り・データエクスポートを許可する。

## 16. 成功指標

- 礼拝後のExcel転記時間が80%以上減る。
- 受付担当が説明なし、または5分以内の説明で利用できる。
- 出席・昼食の集計差異が実運用上ゼロになる。
- 4週連続でWebアプリが主たる記録方法として使われる。
- パイロット教会以外の2教会以上が継続利用を希望する。
- 日曜の主要操作でデータ消失が発生しない。

## 17. 実装上の固定判断

- 既存プロトタイプの受付UXは捨てず、段階的に移行する。
- データモデルとRLSを先に直し、その後に画面を拡張する。
- 通常処理でsecret/service role keyを使わない。
- 課金は最後に実装する。
- Google Sheetsはサービスアカウント方式ではなく、教会ごとのOAuth接続を採用する。
- 外部連携より先に、受付・集計・マルチテナントの品質を完成させる。

## 18. 参考資料

- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Next.js User Management / SSR Auth](https://supabase.com/docs/guides/getting-started/tutorials/with-nextjs)
- [Supabase Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization)
- [Google Sheets API scopes](https://developers.google.com/workspace/sheets/api/scopes)
- [Google Sheets: Create and manage spreadsheets](https://developers.google.com/workspace/sheets/api/guides/create)
- [Stripe SaaS guide](https://docs.stripe.com/saas)
- [Stripe Customer Portal](https://docs.stripe.com/customer-management/integrate-customer-portal)
