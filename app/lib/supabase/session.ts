import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// 認証不要で到達できるパス（ログイン・認証コールバック・静的）
const PUBLIC_PREFIXES = ['/login', '/auth'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
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
