import { describe, it, expect } from 'vitest';
import { buildRosterTabs } from '@/app/lib/google/roster';
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

  it('会員タブ：人物×主日の出席マトリクス（○）', () => {
    const r = tab('会員').rows as (string | number | null)[][];
    expect(r[0]).toEqual(['2026年 主日礼拝出席者名簿']);
    expect(r[2]).toEqual(['#', '名前', 4, 1]); // ヘッダ（日）
    expect(r[3]).toEqual([1, '会員 太郎', '○', '○']); // 会員は両主日に出席
    // 大人会員のみ（子どもは別タブ）
    expect(r.filter((x) => typeof x[0] === 'number').length).toBe(1);
  });

  it('子どもタブ：age=child のみ・主日ごとの○', () => {
    const r = tab('子ども').rows as (string | number | null)[][];
    expect(r[3]).toEqual([1, '会員 こども', '○', '']); // 1/4のみ出席
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
