import { defineConfig, devices } from '@playwright/test';

// スモーク E2E はローカルで実行する想定。
// 事前に `npm run db:start` でローカル Supabase を起動し、
// .env.local を設定したうえで `npm run test:e2e` を実行する。
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
  },
  projects: [
    {
      name: 'tablet',
      use: { ...devices['iPad (gen 7) landscape'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
