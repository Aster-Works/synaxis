import { describe, it, expect } from 'vitest';
import { toCsv, toCsvBody, UTF8_BOM } from '@/app/lib/csv';
import {
  buildSummaryRows,
  buildMatrixRows,
  buildGuestsRows,
} from '@/app/lib/export-csv';
import { summarizePeriod, type PeriodAttendanceRow } from '@/app/lib/aggregate';
import type { Person, PersonPresence, ServiceEvent } from '@/app/lib/types';

const TZ = 'Asia/Tokyo';

describe('toCsv', () => {
  it('BOM 付き・CRLF 区切り', () => {
    const out = toCsv([['a', 'b'], ['c', 'd']]);
    expect(out.startsWith(UTF8_BOM)).toBe(true);
    expect(out.slice(UTF8_BOM.length)).toBe('a,b\r\nc,d');
  });

  it('カンマ・引用符・改行を RFC4180 でエスケープ', () => {
    expect(toCsvBody([['a,b', 'x"y', 'l1\nl2']])).toBe('"a,b","x""y","l1\nl2"');
  });

  it('null/undefined は空文字', () => {
    expect(toCsvBody([[null, undefined, 0]])).toBe(',,0');
  });
});

function ev(id: string, rated: boolean): ServiceEvent {
  return {
    id, church_id: 'c1', kind: 'morning_worship', name: id,
    starts_at: '2026-06-14T01:30:00Z', status: 'completed',
    counts_toward_attendance_rate: rated, lunch_enabled: true, note: null,
    created_by: null, created_at: '2026-06-14T01:30:00Z', updated_at: '2026-06-14T01:30:00Z',
  };
}

describe('buildSummaryRows は集計と一致する（画面=CSV）', () => {
  it('合計行が summarizePeriod.totals と一致', () => {
    const events = [ev('m1', true), ev('m2', true)];
    const attendance: PeriodAttendanceRow[] = [
      { service_event_id: 'm1', lunch_quantity: 1, person: { age_group: 'adult', relationship_status: 'member' } },
      { service_event_id: 'm1', lunch_quantity: 0, person: { age_group: 'child', relationship_status: 'member' } },
      { service_event_id: 'm2', lunch_quantity: 2, person: { age_group: 'adult', relationship_status: 'guest' } },
    ];
    const report = summarizePeriod({ events, attendance, timezone: TZ });
    const rows = buildSummaryRows(report, TZ);
    const totalRow = rows[rows.length - 1];
    // [合計, ラベル, '', '', 総出席, 大人, 子ども, 不明, 昼食, 会員, 客員, 未信, ゲスト]
    expect(totalRow[0]).toBe('合計');
    expect(totalRow[4]).toBe(report.totals.present); // 3
    expect(totalRow[5]).toBe(report.totals.adults); // 2
    expect(totalRow[6]).toBe(report.totals.children); // 1
    expect(totalRow[8]).toBe(report.totals.lunch); // 3
    expect(report.totals.present).toBe(3);
  });
});

describe('buildMatrixRows', () => {
  it('行=人物・列=礼拝・値=○', () => {
    const people: Person[] = [
      { id: 'p1', church_id: 'c1', display_name: '太郎', furigana: 'たろう', relationship_status: 'member', age_group: 'adult', first_visit_on: null, archived_at: null, created_at: '', updated_at: '' },
    ];
    const events = [ev('m1', true)];
    const present = new Set(['p1|m1']);
    const rows = buildMatrixRows(events, people, present, TZ);
    expect(rows[0][0]).toBe('氏名');
    expect(rows[1][0]).toBe('太郎');
    expect(rows[1][2]).toBe('○'); // p1 が m1 に出席
  });
});

describe('buildGuestsRows', () => {
  it('現在 guest の人物のみ', () => {
    const people: PersonPresence[] = [
      { personId: 'g', displayName: 'ゲスト', furigana: null, relationship: 'guest', ageGroup: 'adult', count: 1, ratedCount: 1, rate: 1, firstOn: '2026-06-14', lastOn: '2026-06-14', isNewGuest: true },
      { personId: 'm', displayName: '会員', furigana: null, relationship: 'member', ageGroup: 'adult', count: 5, ratedCount: 5, rate: 1, firstOn: '2020-01-01', lastOn: '2026-06-14', isNewGuest: false },
    ];
    const rows = buildGuestsRows(people);
    expect(rows.length).toBe(2); // header + guest のみ
    expect(rows[1][0]).toBe('ゲスト');
  });
});
