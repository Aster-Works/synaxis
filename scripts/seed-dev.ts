/**
 * ローカル開発用: dev ユーザーを作成し、サンプル教会の owner として紐づける。
 *
 *   npm run db:seed:dev
 *
 * 前提: `npm run db:start` 済み、.env.local 設定済み。
 * 秘密鍵(SUPABASE_SECRET_KEY)を使う管理スクリプト。通常のアプリ処理では使わない。
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import ws from 'ws';

// Node 20 では global WebSocket が無いため supabase-js の Realtime 初期化が失敗する。
// 管理スクリプトでは Realtime を使わないが、クライアント構築のため polyfill する。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).WebSocket ??= ws;

config({ path: '.env.local' });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SECRET = process.env.SUPABASE_SECRET_KEY!;
const SAMPLE_CHURCH_ID = '00000000-0000-0000-0000-0000000000c1';
const DEV_EMAIL = 'dev@synaxis.test';

if (!URL || !SECRET) {
  console.error('NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SECRET_KEY が必要です。');
  process.exit(1);
}

const admin = createClient(URL, SECRET, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // 1) dev ユーザー（存在すれば再利用）
  let userId: string | undefined;
  const created = await admin.auth.admin.createUser({
    email: DEV_EMAIL,
    email_confirm: true,
    user_metadata: { display_name: '開発ユーザー' },
  });

  if (created.error) {
    // 既存の場合は一覧から探す
    const { data } = await admin.auth.admin.listUsers();
    userId = data.users.find((u) => u.email === DEV_EMAIL)?.id;
  } else {
    userId = created.data.user?.id;
  }

  if (!userId) {
    console.error('dev ユーザーの作成・取得に失敗しました。');
    process.exit(1);
  }

  // 2) サンプル教会の owner として紐づける（冪等 upsert）
  const { error: memErr } = await admin.from('church_memberships').upsert(
    { church_id: SAMPLE_CHURCH_ID, user_id: userId, role: 'owner' },
    { onConflict: 'church_id,user_id' },
  );
  if (memErr) {
    console.error('membership の作成に失敗:', memErr.message);
    process.exit(1);
  }

  console.log('✓ dev ユーザー準備完了');
  console.log(`  email      : ${DEV_EMAIL}`);
  console.log(`  user_id    : ${userId}`);
  console.log(`  church     : サンプル教会 (${SAMPLE_CHURCH_ID}) の owner`);
  console.log('');
  console.log('ログイン: /login で上記メールを入力 →');
  console.log('  Inbucket (http://127.0.0.1:54524) に届くマジックリンクを開く。');
}

main();
