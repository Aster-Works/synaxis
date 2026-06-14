import { test, expect } from '@playwright/test';

// スモーク E2E（ローカル実行）。`npm run db:start` と .env.local 設定のうえ
// `npm run test:e2e`。Supabase が無くても、保護ルートのリダイレクトと
// ログイン画面の表示は検証できる（proxy の getUser 失敗時は未認証扱い）。

test('未認証で保護ルートへ行くとログインへリダイレクトする', async ({ page }) => {
  await page.goto('/check-in');
  await expect(page).toHaveURL(/\/login/);
  await expect(page).toHaveURL(/redirect=%2Fcheck-in/);
});

test('ログイン画面が表示される', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Synaxis' })).toBeVisible();
  await expect(page.getByLabel('メールアドレス')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'ログインリンクを送る' }),
  ).toBeVisible();
});

// 認証後の受付フロー（出席トグル・ゲスト追加・昼食）はローカルで
// マジックリンク（Inbucket/Mailpit）経由で手動検証する。
// 完全自動化は Phase 2 で storageState を用いて追加予定。
