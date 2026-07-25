// オープンリダイレクト対策: リダイレクト先の指定をアプリ内パスに限定する純関数。
// "https://evil.com" はもちろん、"//evil.com"（プロトコル相対）や
// "/\\evil.com"（一部ブラウザが \ を / と解釈）、"@evil.com"（origin と連結すると
// userinfo 扱いになり authority が evil.com になる）も弾く。
export function safeInternalPath(
  value: string | null | undefined,
  fallback: string,
): string {
  if (!value || !value.startsWith('/')) return fallback;
  if (value.startsWith('//') || value.startsWith('/\\')) return fallback;
  return value;
}
