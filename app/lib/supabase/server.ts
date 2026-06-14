import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

// サーバー（Server Component / Route Handler / Server Action）用クライアント。
// publishable キーのみを使い、ユーザーの Cookie セッションで RLS を必ず通す。
// service_role / secret キーはここでは絶対に使わない。
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component から呼ばれた場合は set できない。
            // セッション更新は middleware が担うため無視してよい。
          }
        },
      },
    },
  );
}
