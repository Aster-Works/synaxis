import { describe, it, expect } from 'vitest';
import { normalizeName, matchDuplicateCandidates, type PersonLike } from '@/app/lib/dedupe';

function p(id: string, name: string, furigana: string | null, archived = false): PersonLike {
  return {
    id,
    display_name: name,
    furigana,
    relationship_status: 'member',
    age_group: 'adult',
    archived_at: archived ? '2026-01-01T00:00:00Z' : null,
  };
}

describe('normalizeName', () => {
  it('カタカナとひらがなを同一化', () => {
    expect(normalizeName('ヤマダ')).toBe(normalizeName('やまだ'));
  });
  it('全角空白の有無を無視', () => {
    expect(normalizeName('山田　太郎')).toBe(normalizeName('山田太郎'));
  });
  it('半角カナを NFKC→ひらがなで吸収', () => {
    expect(normalizeName('ﾔﾏﾀﾞ')).toBe('やまだ');
  });
  it('中黒・長音を除去', () => {
    expect(normalizeName('リンカーン')).toBe(normalizeName('リン・カン'));
  });
  it('英字は小文字化', () => {
    expect(normalizeName('Yamada')).toBe('yamada');
  });
  it('null/undefined/空は空文字', () => {
    expect(normalizeName(null)).toBe('');
    expect(normalizeName(undefined)).toBe('');
    expect(normalizeName('')).toBe('');
  });
});

describe('matchDuplicateCandidates', () => {
  const people: PersonLike[] = [
    p('1', '山田 太郎', 'やまだ たろう'),
    p('2', '山田 花子', 'やまだ はなこ'),
    p('3', '田中 健', 'たなか けん'),
    p('4', '佐藤 めぐみ', null),
    p('5', '古い 人', 'ふるい ひと', true), // archived
  ];

  it('完全一致は score=1, exact', () => {
    const r = matchDuplicateCandidates({ displayName: 'やまだたろう' }, people);
    expect(r[0].person.id).toBe('1');
    expect(r[0].score).toBe(1);
    expect(r[0].reason).toBe('exact');
  });

  it('部分一致（2文字以上の包含）は partial', () => {
    const r = matchDuplicateCandidates({ displayName: 'やまだ' }, people);
    const ids = r.map((c) => c.person.id);
    expect(ids).toContain('1');
    expect(ids).toContain('2');
    expect(r.find((c) => c.person.id === '1')?.reason).toBe('partial');
  });

  it('1文字入力では部分一致を出さない（ノイズ抑制）', () => {
    const r = matchDuplicateCandidates({ displayName: 'や' }, people);
    expect(r.every((c) => c.reason !== 'partial')).toBe(true);
  });

  it('1文字違いは fuzzy で閾値を超える', () => {
    const r = matchDuplicateCandidates({ displayName: 'たなが けん' }, people, {
      threshold: 0.7,
    });
    expect(r.some((c) => c.person.id === '3')).toBe(true);
  });

  it('archived は除外', () => {
    const r = matchDuplicateCandidates({ displayName: 'ふるいひと' }, people);
    expect(r.some((c) => c.person.id === '5')).toBe(false);
  });

  it('excludeId は除外（統合用途）', () => {
    const r = matchDuplicateCandidates({ displayName: 'やまだたろう' }, people, {
      excludeId: '1',
    });
    expect(r.some((c) => c.person.id === '1')).toBe(false);
  });

  it('フリガナ一致でも候補に出る（氏名が漢字で不一致でも）', () => {
    const r = matchDuplicateCandidates(
      { displayName: 'ヤマダ タロウ', furigana: 'やまだ たろう' },
      people,
    );
    expect(r[0].person.id).toBe('1');
  });

  it('limit で打ち切る', () => {
    const r = matchDuplicateCandidates({ displayName: '山田' }, people, { limit: 1 });
    expect(r.length).toBe(1);
  });

  it('入力が空なら候補なし', () => {
    expect(matchDuplicateCandidates({ displayName: '' }, people)).toEqual([]);
  });
});
