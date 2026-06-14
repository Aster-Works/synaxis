import type {
  ReceptionRow,
  RelationshipStatus,
  ServiceEvent,
  ServiceKind,
  AgeGroup,
  PeriodEventReport,
  PeriodTotals,
  PeriodReport,
  TrendPoint,
} from './types';
import { zonedWeekStart } from './datetime';

// 受付画面のリアルタイム合計。出席（attendance != null）のみを数える。
// 純関数なので単体テストで検証する（docs/PRODUCT_SPEC.md §14.1 集計ロジック）。
export interface ReceptionSummary {
  present: number;
  adults: number;
  children: number;
  unknownAge: number;
  lunchTotal: number;
  guests: number;
  byRelationship: Record<RelationshipStatus, number>;
}

export function summarizeReception(rows: ReceptionRow[]): ReceptionSummary {
  const summary: ReceptionSummary = {
    present: 0,
    adults: 0,
    children: 0,
    unknownAge: 0,
    lunchTotal: 0,
    guests: 0,
    byRelationship: {
      member: 0,
      regular_attendee: 0,
      seeker: 0,
      guest: 0,
    },
  };

  for (const { person, attendance } of rows) {
    if (!attendance) continue;

    summary.present += 1;
    summary.lunchTotal += attendance.lunch_quantity ?? 0;

    if (person.age_group === 'adult') summary.adults += 1;
    else if (person.age_group === 'child') summary.children += 1;
    else summary.unknownAge += 1;

    summary.byRelationship[person.relationship_status] += 1;
  }

  summary.guests = summary.byRelationship.guest;
  return summary;
}

// ── 期間集計（ダッシュボード・CSV・Google Sheets が共有する純関数）─────────
// 「画面・CSV・Sheets の主要合計が一致」(ROADMAP Phase3) を構造的に保証するため、
// 集計はすべてこの一関数に集約する。副作用なし＝単体テスト可能。

const emptyRel = (): Record<RelationshipStatus, number> => ({
  member: 0,
  regular_attendee: 0,
  seeker: 0,
  guest: 0,
});

export interface PeriodAttendanceRow {
  service_event_id: string;
  lunch_quantity: number;
  person: { age_group: AgeGroup; relationship_status: RelationshipStatus } | null;
}

export interface PeriodInput {
  events: ServiceEvent[]; // status<>'cancelled' 済み・新しい順
  attendance: PeriodAttendanceRow[];
  timezone: string;
}

const SERVICE_KINDS: ServiceKind[] = [
  'morning_worship',
  'evening_worship',
  'special_worship',
  'other',
];

export function summarizePeriod(input: PeriodInput): PeriodReport {
  const { events, attendance, timezone } = input;

  const per = new Map<string, PeriodEventReport>();
  for (const e of events) {
    per.set(e.id, {
      event: e,
      present: 0,
      adults: 0,
      children: 0,
      unknownAge: 0,
      lunch: 0,
      byRelationship: emptyRel(),
    });
  }

  for (const a of attendance) {
    const r = per.get(a.service_event_id);
    if (!r || !a.person) continue;
    r.present += 1;
    r.lunch += a.lunch_quantity ?? 0;
    if (a.person.age_group === 'adult') r.adults += 1;
    else if (a.person.age_group === 'child') r.children += 1;
    else r.unknownAge += 1;
    r.byRelationship[a.person.relationship_status] += 1;
  }

  const eventReports = events.map((e) => per.get(e.id)!);

  const byKind = {} as Record<ServiceKind, { events: number; present: number; lunch: number }>;
  for (const k of SERVICE_KINDS) byKind[k] = { events: 0, present: 0, lunch: 0 };

  const totals: PeriodTotals = {
    events: 0,
    ratedEvents: 0,
    present: 0,
    adults: 0,
    children: 0,
    unknownAge: 0,
    lunch: 0,
    byRelationship: emptyRel(),
    byKind,
    ratedPresent: 0,
    avgAttendance: 0,
  };

  for (const r of eventReports) {
    totals.events += 1;
    totals.present += r.present;
    totals.adults += r.adults;
    totals.children += r.children;
    totals.unknownAge += r.unknownAge;
    totals.lunch += r.lunch;
    (Object.keys(r.byRelationship) as RelationshipStatus[]).forEach((k) => {
      totals.byRelationship[k] += r.byRelationship[k];
    });
    const kindAgg = totals.byKind[r.event.kind];
    kindAgg.events += 1;
    kindAgg.present += r.present;
    kindAgg.lunch += r.lunch;
    // 出席率の分母は counts_toward_attendance_rate=true のイベントのみ
    if (r.event.counts_toward_attendance_rate) {
      totals.ratedEvents += 1;
      totals.ratedPresent += r.present;
    }
  }

  totals.avgAttendance =
    totals.ratedEvents > 0
      ? Math.round((totals.ratedPresent / totals.ratedEvents) * 10) / 10
      : 0;

  // 週推移（教会ローカル週起点でバケット）
  const buckets = new Map<string, TrendPoint>();
  for (const r of eventReports) {
    const wk = zonedWeekStart(r.event.starts_at, timezone);
    const b = buckets.get(wk) ?? { weekStart: wk, present: 0, adults: 0, children: 0 };
    b.present += r.present;
    b.adults += r.adults;
    b.children += r.children;
    buckets.set(wk, b);
  }
  const trend = [...buckets.values()].sort((x, y) =>
    x.weekStart.localeCompare(y.weekStart),
  );

  return {
    filter: { period: '3m', kinds: 'all', ratedOnly: false },
    eventReports,
    totals,
    trend,
  };
}
