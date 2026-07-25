import { NextResponse, type NextRequest } from 'next/server';
import { getApiContext } from '@/app/lib/api';
import { getActiveChurch } from '@/app/lib/auth';
import { revokeRefreshToken } from '@/app/lib/google/server';

export const runtime = 'nodejs';

// POST: 接続解除。Google 側 revoke を試行（失敗は無視）→ DB から確実に削除。
// 解除後はトークンを利用できない（Phase3 完了条件）。
export async function POST(request: NextRequest) {
  const { supabase, user } = await getApiContext();
  if (!user) return NextResponse.redirect(`${request.nextUrl.origin}/login`, { status: 303 });

  const active = await getActiveChurch();
  if (!active || !['owner', 'admin'].includes(active.role)) {
    return NextResponse.redirect(`${request.nextUrl.origin}/settings?google=forbidden`, {
      status: 303,
    });
  }

  await revokeRefreshToken(supabase, active.church_id);
  const { error } = await supabase.rpc('delete_google_integration', {
    p_church: active.church_id,
  });
  // DB から消せていないのに「解除済み」と表示しない（暗号化トークンが残るため）。
  return NextResponse.redirect(
    `${request.nextUrl.origin}/settings?google=${error ? 'error' : 'disconnected'}`,
    { status: 303 },
  );
}
