import { getActiveChurch } from '@/app/lib/auth';
import { createSupabaseServerClient } from '@/app/lib/supabase/server';
import {
  SERVICE_KIND_LABELS,
  SERVICE_STATUS_LABELS,
  type ServiceEvent,
  type PeriodEventReport,
} from '@/app/lib/types';
import { formatDateInZone, formatTimeInZone } from '@/app/lib/datetime';
import { summarizePeriod, type PeriodAttendanceRow } from '@/app/lib/aggregate';
import { EventForm } from './EventForm';
import { EventRowEdit } from './EventRowEdit';

export default async function EventsPage() {
  const active = await getActiveChurch();
  if (!active) return null;

  const canManage = ['owner', 'admin'].includes(active.role);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('service_events')
    .select('*')
    .eq('church_id', active.church_id)
    .order('starts_at', { ascending: false })
    .limit(50);
  const events = (data ?? []) as ServiceEvent[];

  // 各礼拝の集計（出席・大人・子ども・昼食）を受付/ダッシュボードと同じ純関数で算出する。
  const eventIds = events.map((e) => e.id);
  let attendance: PeriodAttendanceRow[] = [];
  if (eventIds.length > 0) {
    const { data: att } = await supabase
      .from('attendance_records')
      .select('service_event_id, lunch_quantity, person:people(age_group, relationship_status)')
      .eq('church_id', active.church_id)
      .in('service_event_id', eventIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    attendance = (att ?? []) as any;
  }
  const { eventReports } = summarizePeriod({
    events,
    attendance,
    timezone: active.church.timezone,
  });
  const reportByEvent = new Map<string, PeriodEventReport>(
    eventReports.map((r) => [r.event.id, r]),
  );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">礼拝</h1>

      {canManage && <EventForm />}

      <ul className="space-y-2">
        {events.map((e) => {
          const r = reportByEvent.get(e.id);
          return (
            <li
              key={e.id}
              className="flex items-start justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-slate-900">{e.name}</p>
                <p className="text-xs text-slate-500">
                  {formatDateInZone(e.starts_at, active.church.timezone)}{' '}
                  {formatTimeInZone(e.starts_at, active.church.timezone)} ·{' '}
                  {SERVICE_KIND_LABELS[e.kind]}
                  {e.lunch_enabled && ' · 昼食'}
                  {e.counts_toward_attendance_rate && ' · 出席率対象'}
                </p>
                {/* 集計（受付・ダッシュボードと同じ数字）。出席があるときのみ表示。 */}
                {r && r.present > 0 && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-600">
                    <span>
                      出席{' '}
                      <span className="font-semibold text-slate-900">{r.present}</span>
                    </span>
                    <span>
                      大人 <span className="font-semibold">{r.adults}</span>
                    </span>
                    <span>
                      {active.church.child_label}{' '}
                      <span className="font-semibold">{r.children}</span>
                    </span>
                    {e.lunch_enabled && (
                      <span>
                        昼食 <span className="font-semibold">{r.lunch}</span>
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                  {SERVICE_STATUS_LABELS[e.status]}
                </span>
                {canManage && (
                  <EventRowEdit event={e} timezone={active.church.timezone} />
                )}
              </div>
            </li>
          );
        })}
        {events.length === 0 && (
          <li className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
            礼拝がまだありません
          </li>
        )}
      </ul>
    </div>
  );
}
