import { describe, it, expect } from 'vitest';
import { summarizePeriod, type PeriodAttendanceRow } from '@/app/lib/aggregate';
import type { ServiceEvent, ServiceKind, AgeGroup, RelationshipStatus } from '@/app/lib/types';

function ev(
  id: string,
  kind: ServiceKind,
  startsAt: string,
  rated: boolean,
): ServiceEvent {
  return {
    id,
    church_id: 'c1',
    kind,
    name: id,
    starts_at: startsAt,
    status: 'completed',
    counts_toward_attendance_rate: rated,
    lunch_enabled: true,
    note: null,
    created_by: null,
    created_at: startsAt,
    updated_at: startsAt,
  };
}

function att(
  eventId: string,
  age: AgeGroup,
  rel: RelationshipStatus,
  lunch = 0,
): PeriodAttendanceRow {
  return {
    service_event_id: eventId,
    lunch_quantity: lunch,
    person: { age_group: age, relationship_status: rel },
  };
}

const TZ = 'Asia/Tokyo';

describe('summarizePeriod', () => {
  it('0件なら totals 全0・trend空・avgAttendance 0', () => {
    const r = summarizePeriod({ events: [], attendance: [], timezone: TZ });
    expect(r.totals.present).toBe(0);
    expect(r.totals.ratedEvents).toBe(0);
    expect(r.totals.avgAttendance).toBe(0);
    expect(r.trend).toEqual([]);
  });

  it('出席率の分母は counts_toward_attendance_rate=true のイベントのみ', () => {
    // 朝礼拝2回(rated) + 特別礼拝1回(not rated)
    const events = [
      ev('m1', 'morning_worship', '2026-06-07T01:30:00Z', true), // 6/7(日) JST
      ev('m2', 'morning_worship', '2026-06-14T01:30:00Z', true), // 6/14(日)
      ev('s1', 'special_worship', '2026-06-10T09:00:00Z', false),
    ];
    const attendance = [
      att('m1', 'adult', 'member', 1),
      att('m1', 'adult', 'member', 0),
      att('m1', 'child', 'member', 0),
      att('m2', 'adult', 'guest', 2),
      att('s1', 'adult', 'member'),
      att('s1', 'adult', 'seeker'),
      att('s1', 'adult', 'member'),
      att('s1', 'adult', 'member'),
      att('s1', 'adult', 'member'),
    ];
    const r = summarizePeriod({ events, attendance, timezone: TZ });

    expect(r.totals.present).toBe(9);
    expect(r.totals.ratedEvents).toBe(2);
    expect(r.totals.ratedPresent).toBe(4); // m1:3 + m2:1
    expect(r.totals.avgAttendance).toBe(2.0); // 4 / 2
    expect(r.totals.lunch).toBe(3); // 1 + 2
    expect(r.totals.adults).toBe(8);
    expect(r.totals.children).toBe(1);
  });

  it('byKind が種別ごとに events/present/lunch を分ける', () => {
    const events = [
      ev('m', 'morning_worship', '2026-06-14T01:30:00Z', true),
      ev('e', 'evening_worship', '2026-06-14T09:00:00Z', false),
    ];
    const attendance = [
      att('m', 'adult', 'member', 1),
      att('e', 'adult', 'member', 0),
      att('e', 'adult', 'regular_attendee', 0),
    ];
    const r = summarizePeriod({ events, attendance, timezone: TZ });
    expect(r.totals.byKind.morning_worship).toEqual({ events: 1, present: 1, lunch: 1 });
    expect(r.totals.byKind.evening_worship).toEqual({ events: 1, present: 2, lunch: 0 });
    expect(r.totals.byRelationship.member).toBe(2);
    expect(r.totals.byRelationship.regular_attendee).toBe(1);
  });

  it('週推移は教会ローカル週起点でまとめる（同一週の朝礼拝と夕拝が合算）', () => {
    // 2026-06-14 は日曜。朝(JST 10:30)と夕(JST 18:00)は同じ週(週初め 6/14)。
    const events = [
      ev('m', 'morning_worship', '2026-06-14T01:30:00Z', true),
      ev('e', 'evening_worship', '2026-06-14T09:00:00Z', false),
      ev('prev', 'morning_worship', '2026-06-07T01:30:00Z', true),
    ];
    const attendance = [
      att('m', 'adult', 'member'),
      att('m', 'child', 'member'),
      att('e', 'adult', 'member'),
      att('prev', 'adult', 'member'),
    ];
    const r = summarizePeriod({ events, attendance, timezone: TZ });
    expect(r.trend.length).toBe(2);
    const wk614 = r.trend.find((t) => t.weekStart === '2026-06-14');
    expect(wk614).toBeDefined();
    expect(wk614!.present).toBe(3); // 朝2 + 夕1
    expect(wk614!.children).toBe(1);
    expect(r.trend[0].weekStart < r.trend[1].weekStart).toBe(true); // 昇順
  });
});
