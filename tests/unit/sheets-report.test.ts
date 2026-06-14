import { describe, it, expect } from 'vitest';
import { summarizePeriod, type PeriodAttendanceRow } from '@/app/lib/aggregate';
import { buildSummaryRows } from '@/app/lib/export-csv';
import type { ServiceEvent } from '@/app/lib/types';

// Google Sheets「まとめ」タブは buildSummaryRows を CSV と共有する。
// よって CSV と同じ純関数で組まれ、画面集計(summarizePeriod)と一致する。
// （実通信は Google 認証情報が必要なため別途・手動E2E。ここは合計一致を保証）

function ev(id: string, rated: boolean): ServiceEvent {
  return {
    id, church_id: 'c1', kind: 'morning_worship', name: id,
    starts_at: '2026-06-14T01:30:00Z', status: 'completed',
    counts_toward_attendance_rate: rated, lunch_enabled: true, note: null,
    created_by: null, created_at: '2026-06-14T01:30:00Z', updated_at: '2026-06-14T01:30:00Z',
  };
}

describe('Sheets まとめタブ = 画面集計 = CSV', () => {
  it('まとめの合計行が summarizePeriod.totals と一致する', () => {
    const events = [ev('m1', true), ev('s1', false)];
    const attendance: PeriodAttendanceRow[] = [
      { service_event_id: 'm1', lunch_quantity: 2, person: { age_group: 'adult', relationship_status: 'member' } },
      { service_event_id: 'm1', lunch_quantity: 0, person: { age_group: 'child', relationship_status: 'guest' } },
      { service_event_id: 's1', lunch_quantity: 0, person: { age_group: 'adult', relationship_status: 'seeker' } },
    ];
    const report = summarizePeriod({ events, attendance, timezone: 'Asia/Tokyo' });
    const rows = buildSummaryRows(report, 'Asia/Tokyo');
    const total = rows[rows.length - 1];
    expect(total[4]).toBe(report.totals.present); // 3
    expect(total[8]).toBe(report.totals.lunch); // 2
    // 出席率の分母は rated(=m1) のみ → ratedEvents 1, avgAttendance = 2/1 = 2
    expect(report.totals.ratedEvents).toBe(1);
    expect(report.totals.avgAttendance).toBe(2);
  });
});
