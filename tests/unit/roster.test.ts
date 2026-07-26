import { describe, it, expect } from 'vitest';
import { buildRosterTabs, borderBlocks } from '@/app/lib/google/roster';
import type { AttendanceMatrix } from '@/app/lib/reports';
import type {
  Person,
  ServiceEvent,
  ServiceKind,
  RelationshipStatus,
  AgeGroup,
} from '@/app/lib/types';

const TZ = 'Asia/Tokyo';

function ev(id: string, kind: ServiceKind, name: string, startsAt: string): ServiceEvent {
  return {
    id,
    church_id: 'c1',
    kind,
    name,
    starts_at: startsAt,
    status: 'completed',
    counts_toward_attendance_rate: kind === 'morning_worship',
    lunch_enabled: false,
    note: null,
    created_by: null,
    created_at: startsAt,
    updated_at: startsAt,
  };
}

function person(
  id: string,
  name: string,
  rel: RelationshipStatus,
  age: AgeGroup,
): Person {
  return {
    id,
    church_id: 'c1',
    display_name: name,
    furigana: name,
    relationship_status: rel,
    age_group: age,
    first_visit_on: null,
    archived_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

// JST: m1=1/4(朝), m2=2/1(朝), e1=1/4(夕), sp1=1/1(特別)
const m1 = ev('m1', 'morning_worship', '主日礼拝', '2026-01-04T01:30:00Z');
const m2 = ev('m2', 'morning_worship', '主日礼拝', '2026-02-01T01:30:00Z');
const e1 = ev('e1', 'evening_worship', '夕拝', '2026-01-04T09:00:00Z');
const sp1 = ev('sp1', 'special_worship', '元旦礼拝', '2026-01-01T01:30:00Z');

const pMember = person('pm', '会員 太郎', 'member', 'adult');
const pRegular = person('pr', '客員 花子', 'regular_attendee', 'adult');
const pSeeker = person('ps', '未信 次郎', 'seeker', 'adult');
const pGuest = person('pg', 'ビジター 三郎', 'guest', 'adult');
const pChild = person('pc', '会員 こども', 'member', 'child'); // 会員の子→子どもタブ

const matrix: AttendanceMatrix = {
  events: [sp1, m1, e1, m2], // 順不同でも builder が kind で振り分ける
  people: [pMember, pRegular, pSeeker, pGuest, pChild],
  present: new Set<string>([
    'pm|m1', 'pc|m1', 'pg|m1', // 朝1/4: 会員・子ども・ビジター
    'pm|m2', 'pr|m2', // 朝2/1: 会員・客員
    'pm|e1', // 夕1/4: 会員
    'pm|sp1', 'ps|sp1', // 元旦: 会員・未信
  ]),
};

function rowStarting(rows: (string | number | null)[][], label: string) {
  return rows.find((r) => r[0] === label);
}

describe('buildRosterTabs（エクセル風 名簿構造）', () => {
  const tabs = buildRosterTabs(matrix, 2026, TZ);
  const tab = (t: string) => tabs.find((x) => x.title === t)!;

  it('タブ構成が まとめ＋立場別＋特別礼拝', () => {
    expect(tabs.map((t) => t.title)).toEqual([
      'まとめ', '会員', '客員', '未信', '子ども', 'ビジター', '特別礼拝',
    ]);
  });

  it('まとめ：立場別・大人/小人/合計・朝/夕が主日ごと', () => {
    const r = tab('まとめ').rows as (string | number | null)[][];
    expect(rowStarting(r, '日付')).toEqual(['日付', 4, 1]); // 1/4, 2/1
    expect(rowStarting(r, '会員')).toEqual(['会員', 1, 1]);
    expect(rowStarting(r, '客員')).toEqual(['客員', 0, 1]);
    expect(rowStarting(r, 'ビジター')).toEqual(['ビジター', 1, 0]);
    expect(rowStarting(r, '大人(小4以上)')).toEqual(['大人(小4以上)', 2, 2]);
    expect(rowStarting(r, '小人(小3以下)')).toEqual(['小人(小3以下)', 1, 0]);
    expect(rowStarting(r, '合計')).toEqual(['合計', 3, 2]);
    expect(rowStarting(r, '夕')).toEqual(['夕', 1, '']); // 1/4 に夕拝1、2/1 は無し
  });

  it('会員タブ：人物×主日の出席マトリクス（○）＋出席回数・出席率', () => {
    const r = tab('会員').rows as (string | number | null)[][];
    expect(r[0]).toEqual(['2026年 主日礼拝出席者名簿']);
    expect(r[2]).toEqual(['#', '名前', 4, 1, '出席', '出席率(%)']); // ヘッダ（日）
    expect(r[3]).toEqual([1, '会員 太郎', '○', '○', 2, 100]); // 両主日出席=2/2
    // 大人会員のみ（子どもは別タブ）
    expect(r.filter((x) => typeof x[0] === 'number').length).toBe(1);
  });

  it('子どもタブ：age=child のみ・主日ごとの○と出席率', () => {
    const r = tab('子ども').rows as (string | number | null)[][];
    expect(r[3]).toEqual([1, '会員 こども', '○', '', 1, 50]); // 1/4のみ出席=1/2
  });

  it('出席率の分母は出席率対象の主日のみ', () => {
    // m2 を出席率対象外にすると、分母は m1 だけになる
    const m2off = { ...m2, counts_toward_attendance_rate: false };
    const tabs2 = buildRosterTabs(
      { ...matrix, events: [sp1, m1, e1, m2off] },
      2026,
      TZ,
    );
    const r = tabs2.find((t) => t.title === '会員')!.rows as (string | number | null)[][];
    // ○ は両主日に付くが、出席回数/率は rated の m1 のみで数える
    expect(r[3]).toEqual([1, '会員 太郎', '○', '○', 1, 100]);
  });

  it('特別礼拝タブ：出席者数と #・名前・○・立場', () => {
    const r = tab('特別礼拝').rows as (string | number | null)[][];
    expect(r[0]).toEqual(['元旦礼拝　2026-01-01']);
    expect(r[1]).toEqual(['出席者数', 2]);
    expect(r[2]).toEqual(['#', 'お名前', '礼拝', '立場']);
    const names = r.filter((x) => typeof x[0] === 'number').map((x) => x[1]);
    expect(names).toContain('会員 太郎');
    expect(names).toContain('未信 次郎');
  });
});

describe('borderBlocks（罫線を引く表ブロックの算出）', () => {
  const tabs = buildRosterTabs(matrix, 2026, TZ);
  const tab = (t: string) => tabs.find((x) => x.title === t)!;

  it('会員タブ：タイトル行を除き、ヘッダ〜人物行が1ブロック', () => {
    const blocks = borderBlocks(tab('会員').rows);
    // 行0=タイトル（1セル）は対象外。行1(月見出し)〜行3(会員太郎) の1ブロック。
    expect(blocks).toEqual([
      { startRow: 1, endRow: 4, cols: 2 + 2 + 2 }, // #,名前 + 主日2 + 出席,率
    ]);
  });

  it('まとめタブ：本表と月平均が空行・見出し行で分かれる', () => {
    const blocks = borderBlocks(tab('まとめ').rows);
    expect(blocks.length).toBe(2);
    expect(blocks[0].startRow).toBe(0); // 月見出し行〜夕行
    // 2ブロック目は【月平均】(1セル行)の次から
    expect(blocks[1].cols).toBe(4); // 月・大人・小人・合計
  });

  it('特別礼拝タブ：タイトル行を除いた出席者ブロック', () => {
    const blocks = borderBlocks(tab('特別礼拝').rows);
    expect(blocks).toEqual([
      { startRow: 1, endRow: 5, cols: 4 }, // 出席者数・ヘッダ・出席者2名
    ]);
  });

  it('空行と1セル行はブロックを区切る', () => {
    expect(
      borderBlocks([
        ['タイトル'],
        ['a', 'b'],
        ['c', 'd', 'e'],
        [],
        ['単独'],
        ['x', 'y'],
      ]),
    ).toEqual([
      { startRow: 1, endRow: 3, cols: 3 },
      { startRow: 5, endRow: 6, cols: 2 },
    ]);
  });
});
