import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getApiContext } from '@/app/lib/api';
import { getActiveChurch } from '@/app/lib/auth';
import { buildAuthUrl } from '@/app/lib/google/oauth';

export const runtime = 'nodejs';

// GET: owner/admin を検証し、CSRF nonce を httpOnly cookie に発行して
// state=base64({church, nonce}) 付きで Google 同意画面へリダイレクトする。
export async function GET(request: NextRequest) {
  const { user } = await getApiContext();
  if (!user) return NextResponse.redirect(`${request.nextUrl.origin}/login`);

  const active = await getActiveChurch();
  if (!active || !['owner', 'admin'].includes(active.role)) {
    return NextResponse.redirect(`${request.nextUrl.origin}/settings?google=forbidden`);
  }

  const nonce = randomUUID();
  const state = Buffer.from(
    JSON.stringify({ c: active.church_id, n: nonce }),
  ).toString('base64url');

  const res = NextResponse.redirect(buildAuthUrl(state));
  res.cookies.set('g_oauth_nonce', nonce, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return res;
}
