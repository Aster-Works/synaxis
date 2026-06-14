import { type NextRequest } from 'next/server';
import { updateSession } from '@/app/lib/supabase/session';

// Next.js 16 の Proxy 規約（旧 middleware）。認証セッションの更新と保護ルート。
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // 静的アセットと画像以外のすべてに適用する。
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
