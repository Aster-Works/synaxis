import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { summarizePeriod, type PeriodAttendanceRow } from './aggregate';
import { summarizePeoplePresence } from './people-stats';
import { zonedDateOf } from './datetime';
import type {
  Period,
  PeriodReport,
  Person,
  PersonPresence,
  ServiceEvent,
  ServiceKind,
} from './types';

// 画面・CSV・（将来）Google Sheets が共有するサーバ集計ヘルパー。
// 取得は RLS 下（publishable + Cookie）。church_id を明示し越境を二重防御。

export interface ReportFilterInput {
  period: Period;
  kinds: ServiceKind[]; // 空配列 = 全種別
  ratedOnly: boolean;
}

// 明示範囲（Google Sheets の年度出力などで period の代わりに使う）
export interface RangeBounds {
  sinceISO: string;
  untilISO?: string;
}

function periodStart(period: Period): Date {
  const d = new Date();
  if (period === '3m') d.setMonth(d.getMonth() - 3);
  else if (period === '6m') d.setMonth(d.getMonth() - 6);
  else d.setTime(0);
  return d;
}

export async function getPeriodReport(
  supabase: SupabaseClient,
  churchId: string,
  timezone: string,
  filter: ReportFilterInput,
  bounds?: RangeBounds,
): Promise<PeriodReport> {
  let q = supabase
    .from('service_events')
    .select('*')
    .eq('church_id', churchId)
    .neq('status', 'cancelled')
    .gte('starts_at', bounds?.sinceISO ?? periodStart(filter.period).toISOString())
    .order('starts_at', { ascending: false });
  if (bounds?.untilISO) q = q.lt('starts_at', bounds.untilISO);
  if (filter.kinds.length > 0) q = q.in('kind', filter.kinds);
  if (filter.ratedOnly) q = q.eq('counts_toward_attendance_rate', true);

  const { data: eventsData } = await q;
  const events = (eventsData ?? []) as ServiceEvent[];
  const eventIds = events.map((e) => e.id);

  let attendance: PeriodAttendanceRow[] = [];
  if (eventIds.length > 0) {
    const { data } = await supabase
      .from('attendance_records')
      .select('service_event_id, person_id, lunch_quantity, person:people(age_group, relationship_status)')
      .eq('church_id', churchId)
      .in('service_event_id', eventIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    attendance = (data ?? []) as any;
  }

  const report = summarizePeriod({ events, attendance, timezone });
  return {
    ...report,
    filter: {
      period: filter.period,
      kinds: filter.kinds.length ? filter.kinds : 'all',
      ratedOnly: filter.ratedOnly,
    },
  };
}

export async function getPeopleStats(
  supabase: SupabaseClient,
  churchId: string,
  timezone: string,
  filter: ReportFilterInput,
  bounds?: RangeBounds,
): Promise<{ ratedEventCount: number; people: PersonPresence[] }> {
  let eventsQ = supabase
    .from('service_events')
    .select('id, starts_at, counts_toward_attendance_rate')
    .eq('church_id', churchId)
    .neq('status', 'cancelled')
    .gte('starts_at', bounds?.sinceISO ?? periodStart(filter.period).toISOString());
  if (bounds?.untilISO) eventsQ = eventsQ.lt('starts_at', bounds.untilISO);
  // まとめ集計(getPeriodReport)と母集団を一致させるため種別・出席率対象でも絞る。
  if (filter.kinds.length > 0) eventsQ = eventsQ.in('kind', filter.kinds);
  if (filter.ratedOnly) eventsQ = eventsQ.eq('counts_toward_attendance_rate', true);
  const [peopleRes, eventsRes] = await Promise.all([
    supabase
      .from('people')
      .select('*')
      .eq('church_id', churchId)
      .is('archived_at', null)
      .order('furigana', { ascending: true, nullsFirst: false }),
    eventsQ,
  ]);

  const people = (peopleRes.data ?? []) as Person[];
  const events = (eventsRes.data ?? []) as {
    id: string;
    starts_at: string;
    counts_toward_attendance_rate: boolean;
  }[];
  const ratedMap = new Map(events.map((e) => [e.id, e.counts_toward_attendance_rate]));
  // 礼拝→教会ローカル日付。出席率は「礼拝数」ではなく「rated 日数」で数える
  //（同じ日に朝礼拝と夕拝があっても、その日は1日分）。
  const dayMap = new Map(events.map((e) => [e.id, zonedDateOf(e.starts_at, timezone)]));
  const ratedEventCount = events.filter((e) => e.counts_toward_attendance_rate).length;
  const ratedDays = new Set(
    events
      .filter((e) => e.counts_toward_attendance_rate)
      .map((e) => dayMap.get(e.id)!),
  );
  const ratedDayCount = ratedDays.size;
  const eventIds = events.map((e) => e.id);

  let attendance: {
    person_id: string;
    checked_in_at: string;
    day: string;
    rated: boolean;
  }[] = [];
  if (eventIds.length > 0) {
    const { data } = await supabase
      .from('attendance_records')
      .select('person_id, checked_in_at, service_event_id')
      .eq('church_id', churchId)
      .in('service_event_id', eventIds);
    attendance = (data ?? []).map(
      (a: { person_id: string; checked_in_at: string; service_event_id: string }) => ({
        person_id: a.person_id,
        checked_in_at: a.checked_in_at,
        day: dayMap.get(a.service_event_id)!,
        rated: ratedMap.get(a.service_event_id) ?? false,
      }),
    );
  }

  const stats = summarizePeoplePresence({ people, attendance, ratedDayCount, timezone });
  // ratedEventCount は API 互換のため返す（出席率の分母は内部で日数 ratedDayCount を使用）。
  return { ratedEventCount, people: stats };
}

// 出席マトリクス（CSV「出席マトリクス」用）。行=人物・列=礼拝・値=出席有無。
export interface AttendanceMatrix {
  events: ServiceEvent[]; // 古い順（列）
  people: Person[]; // フリガナ順（行）
  present: Set<string>; // `${personId}|${eventId}`
}

export async function getAttendanceMatrix(
  supabase: SupabaseClient,
  churchId: string,
  filter: ReportFilterInput,
  bounds?: RangeBounds,
): Promise<AttendanceMatrix> {
  let q = supabase
    .from('service_events')
    .select('*')
    .eq('church_id', churchId)
    .neq('status', 'cancelled')
    .gte('starts_at', bounds?.sinceISO ?? periodStart(filter.period).toISOString())
    .order('starts_at', { ascending: true });
  if (bounds?.untilISO) q = q.lt('starts_at', bounds.untilISO);
  if (filter.kinds.length > 0) q = q.in('kind', filter.kinds);
  if (filter.ratedOnly) q = q.eq('counts_toward_attendance_rate', true);

  const [eventsRes, peopleRes] = await Promise.all([
    q,
    supabase
      .from('people')
      .select('*')
      .eq('church_id', churchId)
      .is('archived_at', null)
      .order('furigana', { ascending: true, nullsFirst: false }),
  ]);

  const events = (eventsRes.data ?? []) as ServiceEvent[];
  const people = (peopleRes.data ?? []) as Person[];
  const eventIds = events.map((e) => e.id);

  const present = new Set<string>();
  if (eventIds.length > 0) {
    const { data } = await supabase
      .from('attendance_records')
      .select('person_id, service_event_id')
      .eq('church_id', churchId)
      .in('service_event_id', eventIds);
    for (const a of (data ?? []) as { person_id: string; service_event_id: string }[]) {
      present.add(`${a.person_id}|${a.service_event_id}`);
    }
  }

  return { events, people, present };
}

// クエリ文字列から ReportFilter を組み立てる（route と page で共通化）。
const VALID_KINDS: ServiceKind[] = [
  'morning_worship',
  'evening_worship',
  'special_worship',
  'other',
];

export function parseReportFilter(params: {
  period?: string | null;
  kinds?: string | null;
  ratedOnly?: string | null;
}): ReportFilterInput {
  const period = (['3m', '6m', 'all'] as const).includes(params.period as Period)
    ? (params.period as Period)
    : '3m';
  const kinds = (params.kinds ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is ServiceKind => VALID_KINDS.includes(s as ServiceKind));
  return { period, kinds, ratedOnly: params.ratedOnly === '1' };
}
