'use client';
import { createBrowserClient } from '@supabase/ssr';

// ブラウザ用クライアント。publishable キーのみ。RLS を必ず通す。
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
