import { NextResponse, type NextRequest } from 'next/server';
import { apiError, getApiContext } from '@/app/lib/api';
import { getActiveChurch } from '@/app/lib/auth';
import type { AgeGroup, Period, ServiceEvent } from '@/app/lib/types';

// 期間集計の基本版（Phase 1）。礼拝ごとの出席・昼食合計と全体集計を返す。
// 出席率の分母は counts_toward_attendance_rate=true のイベント数。
export async function GET(request: NextRequest) {
  const { supabase, user } = await getApiContext();
  if (!user) return apiError('認証が必要です', 401);

  const active = await getActiveChurch();
  if (!active) return apiError('所属教会がありません', 404);

  const period = (request.nextUrl.searchParams.get('period') ?? '3m') as Period;
  const start = new Date();
  if (period === '3m') start.setMonth(start.getMonth() - 3);
  else if (period === '6m') start.setMonth(start.getMonth() - 6);
  else start.setTime(0); // all

  const { data: eventsData } = await supabase
    .from('service_events')
    .select('*')
    .eq('church_id', active.church_id)
    .neq('status', 'cancelled')
    .gte('starts_at', new Date(start).toISOString())
    .order('starts_at', { ascending: false });

  const events = (eventsData ?? []) as ServiceEvent[];
  const eventIds = events.map((e) => e.id);

  let attendance: {
    service_event_id: string;
    lunch_quantity: number;
    person: { age_group: AgeGroup } | null;
  }[] = [];

  if (eventIds.length > 0) {
    const { data } = await supabase
      .from('attendance_records')
      .select('service_event_id, lunch_quantity, person:people(age_group)')
      .in('service_event_id', eventIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    attendance = (data ?? []) as any;
  }

  const perEvent = new Map<
    string,
    { present: number; adults: number; children: number; lunch: number }
  >();
  for (const id of eventIds) {
    perEvent.set(id, { present: 0, adults: 0, children: 0, lunch: 0 });
  }
  for (const a of attendance) {
    const agg = perEvent.get(a.service_event_id);
    if (!agg) continue;
    agg.present += 1;
    agg.lunch += a.lunch_quantity ?? 0;
    if (a.person?.age_group === 'adult') agg.adults += 1;
    else if (a.person?.age_group === 'child') agg.children += 1;
  }

  const eventReports = events.map((e) => ({
    event: e,
    ...(perEvent.get(e.id) ?? { present: 0, adults: 0, children: 0, lunch: 0 }),
  }));

  const ratedEvents = eventReports.filter(
    (r) => r.event.counts_toward_attendance_rate,
  );
  const totalPresentRated = ratedEvents.reduce((s, r) => s + r.present, 0);
  const avgAttendance =
    ratedEvents.length > 0
      ? Math.round((totalPresentRated / ratedEvents.length) * 10) / 10
      : 0;

  return NextResponse.json({
    period,
    eventReports,
    totals: {
      events: events.length,
      ratedEvents: ratedEvents.length,
      avgAttendance,
      lunch: eventReports.reduce((s, r) => s + r.lunch, 0),
    },
  });
}
