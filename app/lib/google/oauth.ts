import 'server-only';
import { google } from 'googleapis';

// Google OAuth2 ヘルパー（サーバ専用）。env は呼び出し時に読む
// （未設定でもビルドは通る。実通信時にのみ必要）。

// 最小権限: drive.file（アプリが作成したファイルのみ）+ spreadsheets + email。
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets',
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
