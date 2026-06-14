import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/app/lib/supabase/server';

// Magic Link / OTP のコールバック。
// PKCE の `code` を受け取りセッションへ交換する（cookie はサーバークライアントが設定）。
// 互換のため token_hash 形式も処理する。
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const redirectTo = searchParams.get('redirect') ?? '/check-in';

  const supabase = await createSupabaseServerClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${redirectTo}`);
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      type: type as any,
      token_hash: tokenHash,
    });
    if (!error) {
      return NextResponse.redirect(`${origin}${redirectTo}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
