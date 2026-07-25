import { describe, it, expect } from 'vitest';
import { kanaRowOf, KANA_ROWS } from '@/app/lib/kana';

describe('kanaRowOf（五十音「行」判定）', () => {
  it('ひらがな先頭で行を返す', () => {
    expect(kanaRowOf('あさみ')).toBe('あ');
    expect(kanaRowOf('きくち')).toBe('か');
    expect(kanaRowOf('すずき')).toBe('さ');
    expect(kanaRowOf('たかはし')).toBe('た');
    expect(kanaRowOf('のむら')).toBe('な');
    expect(kanaRowOf('ひらた')).toBe('は');
    expect(kanaRowOf('もりた')).toBe('ま');
    expect(kanaRowOf('やまだ')).toBe('や');
    expect(kanaRowOf('りんどう')).toBe('ら');
    expect(kanaRowOf('わたなべ')).toBe('わ');
  });

  it('濁点・半濁点は清音の行に寄せる', () => {
    expect(kanaRowOf('がもう')).toBe('か'); // が→か行
    expect(kanaRowOf('ざいつ')).toBe('さ'); // ざ→さ行
    expect(kanaRowOf('ばば')).toBe('は'); // ば→は行
    expect(kanaRowOf('ぱくり')).toBe('は'); // ぱ→は行
  });

  it('カタカナ（全角・半角）も同じ行に正規化', () => {
    expect(kanaRowOf('ヤマダ')).toBe('や');
    expect(kanaRowOf('ｻｲﾌｪﾙﾄ')).toBe('さ'); // 半角カナ→さ行
  });

  it('小書き・促音も行へ', () => {
    expect(kanaRowOf('ぁ')).toBe('あ');
    expect(kanaRowOf('っち')).toBe('た'); // っ→た行
  });

  it('読み無し・かな以外は「他」', () => {
    expect(kanaRowOf(null)).toBe('他');
    expect(kanaRowOf('')).toBe('他');
    expect(kanaRowOf('  ')).toBe('他');
    expect(kanaRowOf('Smith')).toBe('他');
    expect(kanaRowOf('123')).toBe('他');
  });

  it('KANA_ROWS は あ〜わ＋他', () => {
    expect(KANA_ROWS).toEqual(['あ', 'か', 'さ', 'た', 'な', 'は', 'ま', 'や', 'ら', 'わ', '他']);
  });
});

describe('kanaRowOf（ヴ・旧仮名）', () => {
  it('ヴ は あ行、ゐ・ゑ は わ行', () => {
    expect(kanaRowOf('ヴぁいおりん')).toBe('あ'); // ヴ→ゔ
    expect(kanaRowOf('ゐのうえ')).toBe('わ');
    expect(kanaRowOf('ゑびす')).toBe('わ');
  });
});
