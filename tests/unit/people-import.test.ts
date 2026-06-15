import { describe, it, expect } from 'vitest';
import { parseCsv, normName, parsePeopleCsv } from '@/app/lib/people-import';

describe('parseCsv', () => {
  it('BOM・引用符・""エスケープ・CRLF を扱う', () => {
    const text = '﻿氏名,ふりがな\r\n"山田, 太郎","やまだ ""たろう"""\r\n佐藤,さとう\n';
    expect(parseCsv(text)).toEqual([
      ['氏名', 'ふりがな'],
      ['山田, 太郎', 'やまだ "たろう"'],
      ['佐藤', 'さとう'],
    ]);
  });
});

describe('normName', () => {
  it('全角空白・連続空白を畳み込む', () => {
    expect(normName(' 山田　太郎 ')).toBe('山田 太郎');
    expect(normName('山田  太郎')).toBe('山田 太郎');
  });
});

describe('parsePeopleCsv', () => {
  const header = '氏名,ふりがな,立場,年齢区分,出席回数,出席率(%),初回出席,最終出席';

  it('人物一覧CSVを名簿行に変換（立場・年齢区分をマップ）', () => {
    const csv = [
      header,
      '山田 太郎,やまだ たろう,会員,大人,12,100,2020-04-01,2026-06-14',
      '佐藤 めぐみ,さとう めぐみ,客員,大人,3,25,2021-09-12,2026-06-07',
      '田中 けん,たなか けん,未信,大人,1,8,,',
      '山田 みこと,やまだ みこと,会員,子ども,9,75,2019-05-05,2026-06-14',
    ].join('\n');
    const r = parsePeopleCsv(csv, new Set());
    expect(r.headerError).toBeUndefined();
    expect(r.rows).toHaveLength(4);
    expect(r.rows[0]).toEqual({
      display_name: '山田 太郎',
      furigana: 'やまだ たろう',
      relationship_status: 'member',
      age_group: 'adult',
      first_visit_on: '2020-04-01',
    });
    expect(r.rows[1].relationship_status).toBe('regular_attendee'); // 客員
    expect(r.rows[2].relationship_status).toBe('seeker'); // 未信
    expect(r.rows[2].first_visit_on).toBeNull(); // 空欄
    expect(r.rows[3].age_group).toBe('child'); // 子ども
  });

  it('既存と同名はスキップ、ファイル内の重複も1件に', () => {
    const csv = [
      header,
      '山田 太郎,やまだ,会員,大人,,,,', // 既存
      '新井 花子,あらい,客員,大人,,,,',
      '新井 花子,あらい,客員,大人,,,,', // ファイル内重複
    ].join('\n');
    const r = parsePeopleCsv(csv, new Set([normName('山田 太郎')]));
    expect(r.rows.map((x) => x.display_name)).toEqual(['新井 花子']);
    expect(r.skippedExisting).toBe(2); // 山田(既存) + 新井(ファイル内重複)
  });

  it('氏名列が無ければヘッダエラー', () => {
    const r = parsePeopleCsv('なまえ,よみ\nあ,い', new Set());
    expect(r.headerError).toContain('氏名');
    expect(r.rows).toHaveLength(0);
  });

  it('氏名だけのCSVでも取り込める（立場=客員・年齢=大人の既定）', () => {
    const r = parsePeopleCsv('氏名\n鈴木 一郎', new Set());
    expect(r.rows[0]).toMatchObject({
      display_name: '鈴木 一郎',
      relationship_status: 'regular_attendee',
      age_group: 'adult',
      furigana: null,
    });
  });
});
