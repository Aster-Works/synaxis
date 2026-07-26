import { NextResponse, type NextRequest } from 'next/server';
import { google } from 'googleapis';
import { getApiContext } from '@/app/lib/api';
import { oauthClient } from '@/app/lib/google/oauth';

export const runtime = 'nodejs';

// GET: Google からのコールバック。state の nonce を cookie と照合し、code を
// トークンへ交換、refresh_token を暗号化保存（save_google_integration RPC）。
// トークンはレスポンスに一切載せない。
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const stateRaw = searchParams.get('state');
  const { supabase, user } = await getApiContext();
  if (!user || !code || !stateRaw) {
    return NextResponse.redirect(`${origin}/settings?google=error`);
  }

  let churchId: string;
  let nonce: string;
  try {
    const parsed = JSON.parse(Buffer.from(stateRaw, 'base64url').toString());
    churchId = parsed.c;
    nonce = parsed.n;
  } catch {
    return NextResponse.redirect(`${origin}/settings?google=error`);
  }

  const cookieNonce = request.cookies.get('g_oauth_nonce')?.value;
  if (!cookieNonce || cookieNonce !== nonce) {
    return NextResponse.redirect(`${origin}/settings?google=error`);
  }

  // 暗号鍵の未設定を保存前に検知する（空のままだと保存は成功するのに
  // 読み出しが常に失敗する「接続済みなのに毎回エラー」状態になる）。
  if (!process.env.GOOGLE_TOKEN_ENC_KEY) {
    console.error('[google-callback] GOOGLE_TOKEN_ENC_KEY が未設定のため保存できません');
    return NextResponse.redirect(`${origin}/settings?google=error`);
  }

  const client = oauthClient();
  let tokens;
  try {
    ({ tokens } = await client.getToken(code));
  } catch {
    return NextResponse.redirect(`${origin}/settings?google=error`);
  }
  if (!tokens.refresh_token) {
    // refresh_token が無い（既に同意済み等）→ 再同意へ誘導（古い保存は壊さない）
    return NextResponse.redirect(`${origin}/settings?google=noRefresh`);
  }

  // Google の同意画面は権限ごとのチェックボックス（granular consent）で、
  // drive.file のチェックを外したまま「続行」できる。その場合も refresh_token は
  // 発行されるため、ここで検証しないと「接続済みなのに出力が必ず失敗」する。
  // 保存せずに付与を取り消し、チェックを促すメッセージへ誘導する。
  if (!(tokens.scope ?? '').includes('https://www.googleapis.com/auth/drive.file')) {
    try {
      await client.revokeToken(tokens.refresh_token);
    } catch {
      /* 取り消し失敗は致命的でない（保存していないので実害なし） */
    }
    return NextResponse.redirect(`${origin}/settings?google=noScope`);
  }

  client.setCredentials(tokens);
  let email: string | null = null;
  try {
    const me = await google.oauth2({ version: 'v2', auth: client }).userinfo.get();
    email = me.data.email ?? null;
  } catch {
    /* email 取得失敗は致命的でない */
  }

  // owner/admin 検証 + 暗号化保存は RPC が担う（state 改ざんでも has_role で越境不可）。
  const { error } = await supabase.rpc('save_google_integration', {
    p_church: churchId,
    p_refresh_token: tokens.refresh_token,
    p_email: email,
    p_enc_key: process.env.GOOGLE_TOKEN_ENC_KEY,
  });

  const res = NextResponse.redirect(
    `${origin}/settings?google=${error ? 'error' : 'connected'}`,
  );
  res.cookies.delete('g_oauth_nonce');
  return res;
}
