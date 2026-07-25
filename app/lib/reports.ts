import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { summarizePeriod, type PeriodAttendanceRow } from './aggregate';
import { summarizePeoplePresence } from './people-stats';
import { zonedDateOf } from './datetime';
import type {
  CountMode,
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
  countMode: CountMode; // 'unique'＝1日1人1回 / 'total'＝延べ
}

// 明示範囲（Google Sheets の年度出力などで period の代わりに使う）
export interface RangeBounds {
  sinceISO: string;
  untilISO?: string;
}

export function periodStart(period: Period): Date {
  const d = new Date();
  const day = d.getDate();
  if (period === '3m') d.setMonth(d.getMonth() - 3);
  else if (period === '6m') d.setMonth(d.getMonth() - 6);
  else {
    d.setTime(0);
    return d;
  }
  // 月末オーバーフローを前月末日へクランプ（5/31 の3ヶ月前が 3/2 になる JS の挙動対策）。
  if (d.getDate() !== day) d.setDate(0);
  return d;
}

// PostgREST は max_rows（既定1000）で結果を黙って切り捨てる。切り捨てられると
// ダッシュボード・CSV・Sheets が「三者一致のまま全部過少」になり検出できないため、
// 出席は必ずページングで全件取得する。.in() の礼拝ID列も URL 長対策で分割する。
//
// ページングは offset ではなく keyset（id > 直前の最大id）で進める。理由は2つ:
//  - 終了条件を「0件が返るまで」にでき、サーバ側 max_rows がページサイズより
//    小さく設定されても切り捨てに戻らない（offset 方式は max_rows と結合する）。
//  - 受付中の同時 INSERT で行がページ境界をまたいでも、重複・欠落が起きない。
const ATTENDANCE_PAGE = 1000;
const EVENT_ID_CHUNK = 100;

export async function fetchAllAttendance<T>(
  supabase: SupabaseClient,
  churchId: string,
  eventIds: string[],
  select: string,
): Promise<T[]> {
  const rows: T[] = [];
  // keyset のカーソルに使うため id を必ず取得する（呼び出し側の select には不要）。
  const selectWithId = /(^|,)\s*id\s*(,|$)/.test(select) ? select : `id, ${select}`;

  for (let i = 0; i < eventIds.length; i += EVENT_ID_CHUNK) {
    const chunk = eventIds.slice(i, i + EVENT_ID_CHUNK);
    let cursor: string | null = null;
    for (;;) {
      let q = supabase
        .from('attendance_records')
        .select(selectWithId)
        .eq('church_id', churchId)
        .in('service_event_id', chunk)
        .order('id', { ascending: true })
        .limit(ATTENDANCE_PAGE);
      if (cursor) q = q.gt('id', cursor);

      const { data, error } = await q;
      if (error) {
        throw new Error(`出席データの取得に失敗しました: ${error.message}`);
      }
      const batch = (data ?? []) as unknown as (T & { id: string })[];
      if (batch.length === 0) break;
      rows.push(...batch);
      cursor = batch[batch.length - 1].id;
    }
  }
  return rows;
}

// 期間集計を「ユニーク」「延べ」両方まとめて返す（DB取得は1回・集計のみ2回）。
// クライアント側で集計方法を即時切替するため、両モードを一度に算出する。
export async function getPeriodReportModes(
  supabase: SupabaseClient,
  churchId: string,
  timezone: string,
  filter: ReportFilterInput,
  bounds?: RangeBounds,
): Promise<{ unique: PeriodReport; total: PeriodReport }> {
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

  const { data: eventsData, error: eventsError } = await q;
  if (eventsError) {
    throw new Error(`礼拝データの取得に失敗しました: ${eventsError.message}`);
  }
  const events = (eventsData ?? []) as ServiceEvent[];
  const eventIds = events.map((e) => e.id);

  let attendance: PeriodAttendanceRow[] = [];
  if (eventIds.length > 0) {
    attendance = await fetchAllAttendance<PeriodAttendanceRow>(
      supabase,
      churchId,
      eventIds,
      'service_event_id, person_id, lunch_quantity, person:people(age_group, relationship_status)',
    );
  }

  const make = (countMode: CountMode): PeriodReport => {
    const report = summarizePeriod({ events, attendance, timezone, countMode });
    return {
      ...report,
      filter: {
        period: filter.period,
        kinds: filter.kinds.length ? filter.kinds : 'all',
        ratedOnly: filter.ratedOnly,
        countMode,
      },
    };
  };
  return { unique: make('unique'), total: make('total') };
}

export async function getPeriodReport(
  supabase: SupabaseClient,
  churchId: string,
  timezone: string,
  filter: ReportFilterInput,
  bounds?: RangeBounds,
): Promise<PeriodReport> {
  const both = await getPeriodReportModes(supabase, churchId, timezone, filter, bounds);
  return filter.countMode === 'total' ? both.total : both.unique;
}

// 人物別統計を「ユニーク」「延べ」両方まとめて返す（DB取得は1回・集計のみ2回）。
export async function getPeopleStatsModes(
  supabase: SupabaseClient,
  churchId: string,
  timezone: string,
  filter: ReportFilterInput,
  bounds?: RangeBounds,
): Promise<{
  ratedEventCount: number;
  unique: PersonPresence[];
  total: PersonPresence[];
}> {
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

  if (peopleRes.error) {
    throw new Error(`人物データの取得に失敗しました: ${peopleRes.error.message}`);
  }
  if (eventsRes.error) {
    throw new Error(`礼拝データの取得に失敗しました: ${eventsRes.error.message}`);
  }
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
    const data = await fetchAllAttendance<{
      person_id: string;
      checked_in_at: string;
      service_event_id: string;
    }>(supabase, churchId, eventIds, 'person_id, checked_in_at, service_event_id');
    attendance = data.map(
      (a: { person_id: string; checked_in_at: string; service_event_id: string }) => ({
        person_id: a.person_id,
        checked_in_at: a.checked_in_at,
        day: dayMap.get(a.service_event_id)!,
        rated: ratedMap.get(a.service_event_id) ?? false,
      }),
    );
  }

  const make = (countMode: CountMode) =>
    summarizePeoplePresence({
      people,
      attendance,
      ratedDayCount,
      ratedEventCount,
      countMode,
      timezone,
    });
  return { ratedEventCount, unique: make('unique'), total: make('total') };
}

export async function getPeopleStats(
  supabase: SupabaseClient,
  churchId: string,
  timezone: string,
  filter: ReportFilterInput,
  bounds?: RangeBounds,
): Promise<{ ratedEventCount: number; people: PersonPresence[] }> {
  const both = await getPeopleStatsModes(supabase, churchId, timezone, filter, bounds);
  return {
    ratedEventCount: both.ratedEventCount,
    people: filter.countMode === 'total' ? both.total : both.unique,
  };
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

  if (eventsRes.error) {
    throw new Error(`礼拝データの取得に失敗しました: ${eventsRes.error.message}`);
  }
  if (peopleRes.error) {
    throw new Error(`人物データの取得に失敗しました: ${peopleRes.error.message}`);
  }
  const events = (eventsRes.data ?? []) as ServiceEvent[];
  const people = (peopleRes.data ?? []) as Person[];
  const eventIds = events.map((e) => e.id);

  const present = new Set<string>();
  if (eventIds.length > 0) {
    const data = await fetchAllAttendance<{
      person_id: string;
      service_event_id: string;
    }>(supabase, churchId, eventIds, 'person_id, service_event_id');
    for (const a of data) {
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
  count?: string | null;
}): ReportFilterInput {
  const period = (['3m', '6m', 'all'] as const).includes(params.period as Period)
    ? (params.period as Period)
    : '3m';
  const kinds = (params.kinds ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is ServiceKind => VALID_KINDS.includes(s as ServiceKind));
  // 既定は 'unique'（1日1人1回）。'total' のときだけ延べ。
  const countMode: CountMode = params.count === 'total' ? 'total' : 'unique';
  return { period, kinds, ratedOnly: params.ratedOnly === '1', countMode };
}
