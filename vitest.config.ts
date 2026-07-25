import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
      // `server-only` は Node で import すると throw するため、
      // サーバ専用モジュール（app/lib/reports.ts 等）のテスト用に空実装へ差し替える。
      'server-only': fileURLToPath(
        new URL('./tests/unit/server-only-stub.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // Vitest は単体・コンポーネントテストを担当。
    // DB(RLS)テストは pgTAP（supabase test db）、E2E は Playwright が担当する。
    include: ['app/**/*.test.{ts,tsx}', 'tests/unit/**/*.test.{ts,tsx}'],
  },
});
