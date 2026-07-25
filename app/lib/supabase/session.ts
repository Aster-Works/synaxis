import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// 認証不要で到達できるパス（ログイン・認証コールバック・静的）
const PUBLIC_PREFIXES = ['/login', '/auth'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export function isApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}

// アドレスバー遷移・リンク・フォーム送信によるトップレベル遷移か。
// fetch/XHR は Sec-Fetch-Dest: empty を送る。ヘッダ非対応の環境では
// Accept に text/html を含むかで判定する。
export function isDocumentNavigation(headers: Headers): boolean {
  const dest = headers.get('sec-fetch-dest');
  if (dest) return dest === 'document';
  return (headers.get('accept') ?? '').includes('text/html');
}

// セッション Cookie の更新（トークン自動リフレッシュ）と保護ルートの強制。
// Supabase 公式の SSR パターンに準拠する（proxy から呼ぶ）。
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // 重要: createServerClient と getUser の間に処理を挟まない。
  // getUser は Supabase Auth サーバーでトークンを検証する。
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  if (!user && !isPublicPath(pathname)) {
    // fetch/XHR で呼ばれた API は HTML へリダイレクトせず 401 JSON を返す。
    // リダイレクトに追従して 200 のログイン HTML が返ると、クライアントは
    // 成功と誤認して古い受付データを表示し続けてしまう（useReceptionSync）。
    // ただし /api/* にはブラウザ遷移で到達するものもある（CSV ダウンロードの
    // <a download>、Google 連携の <a>/<form>、Google からのコールバック）。
    // これらは JSON を見せずに従来どおりログインへ送る。
    if (isApiPath(pathname) && !isDocumentNavigation(request.headers)) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  // ログイン済みでログインページに来たら受付へ
  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/check-in';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
