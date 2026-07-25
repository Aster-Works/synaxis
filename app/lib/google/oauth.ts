import 'server-only';
import { google } from 'googleapis';

// Google OAuth2 ヘルパー（サーバ専用）。env は呼び出し時に読む
// （未設定でもビルドは通る。実通信時にのみ必要）。

// 最小権限: drive.file（このアプリが作成したファイルだけ）+ email。
//
// 出力先のスプレッドシートは必ずアプリ自身が作成し（server.ts の spreadsheets.create）、
// その ID を保存して再利用するだけなので、ユーザーの既存ファイルには一切触れない。
// したがって全操作（create / get / batchUpdate / values.*）が drive.file で足りる。
//
// 広い `auth/spreadsheets` は Google の「機密スコープ」で、本番公開時に審査が必要になる。
// 審査を避けて同意画面を「テスト」のままにすると **リフレッシュトークンが7日で失効**し、
// 毎週の出力のたびに再接続が要る。非機密スコープだけなら審査なしで公開でき、これを回避できる。
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
];

export function oauthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_OAUTH_REDIRECT_URI,
  );
}

export function buildAuthUrl(state: string): string {
  return oauthClient().generateAuthUrl({
    access_type: 'offline', // refresh_token を得る
    prompt: 'consent', // 再接続でも refresh_token を確実に再発行
    include_granted_scopes: true,
    scope: GOOGLE_SCOPES,
    state,
  });
}
