import { describe, it, expect } from 'vitest';
import { isApiPath, isDocumentNavigation } from '@/app/lib/supabase/session';

// 未認証時、fetch で呼ばれた API は 401 JSON、ブラウザ遷移はログインへリダイレクト。
// この分岐を誤ると (a) CSV ダウンロードや Google 連携で生 JSON が表示される、
// (b) 受付の fetch がログイン HTML を 200 と誤認して古い表示のまま動き続ける。
describe('isApiPath', () => {
  it('/api と /api/ 配下だけを API と判定する', () => {
    expect(isApiPath('/api')).toBe(true);
    expect(isApiPath('/api/events/current')).toBe(true);
    expect(isApiPath('/apidocs')).toBe(false);
    expect(isApiPath('/check-in')).toBe(false);
  });
});

describe('isDocumentNavigation', () => {
  it('ブラウザのトップレベル遷移（リンク・フォーム・OAuthコールバック）', () => {
    expect(
      isDocumentNavigation(
        new Headers({ 'sec-fetch-dest': 'document', accept: 'text/html' }),
      ),
    ).toBe(true);
  });

  it('fetch/XHR は遷移ではない（Accept に text/html があっても Dest を優先）', () => {
    expect(isDocumentNavigation(new Headers({ 'sec-fetch-dest': 'empty' }))).toBe(false);
    expect(
      isDocumentNavigation(
        new Headers({ 'sec-fetch-dest': 'empty', accept: 'text/html' }),
      ),
    ).toBe(false);
  });

  it('Sec-Fetch-Dest 非対応環境は Accept で判定する', () => {
    expect(isDocumentNavigation(new Headers({ accept: 'text/html,*/*' }))).toBe(true);
    expect(isDocumentNavigation(new Headers({ accept: '*/*' }))).toBe(false);
    expect(isDocumentNavigation(new Headers())).toBe(false);
  });
});
