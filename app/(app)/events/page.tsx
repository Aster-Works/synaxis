import Link from 'next/link';
import { ListChecks } from 'lucide-react';
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
import { fetchAllAttendance } from '@/app/lib/reports';
import { EventForm } from './EventForm';
import { EventRowEdit } from './EventRowEdit';

export default async function EventsPage() {
  const active = await getActiveChurch();
  if (!active) return null;

  const canManage = ['owner', 'admin'].includes(active.role);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('service_events')
    .select('*')
    .eq('church_id', active.church_id)
    .order('starts_at', { ascending: false })
    .limit(50);
  if (error) {
    throw new Error(`礼拝データの取得に失敗しました: ${error.message}`);
  }
  const events = (data ?? []) as ServiceEvent[];

  // 各礼拝の集計（出席・大人・子ども・昼食）を受付/ダッシュボードと同じ純関数で算出する。
  const eventIds = events.map((e) => e.id);
  let attendance: PeriodAttendanceRow[] = [];
  if (eventIds.length > 0) {
    attendance = await fetchAllAttendance<PeriodAttendanceRow>(
      supabase,
      active.church_id,
      eventIds,
      'service_event_id, person_id, lunch_quantity, person:people(age_group, relationship_status)',
    );
  }
  // 一覧は「その礼拝に実際に出席した数」を出すため延べ(total)で数える。
  // 既定の unique（1日1人1回）だと、同日に朝礼拝と夕拝がある場合、
  // 夕拝の出席が朝礼拝出席者のぶんだけ少なく表示されてしまう。
  const { eventReports } = summarizePeriod({
    events,
    attendance,
    timezone: active.church.timezone,
    countMode: 'total',
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
                    {/* 延べ＝この礼拝の実出席者数（受付画面と一致）。集計タブの既定は
                        「1日1人1回」なので、同日に複数礼拝がある日は数字が異なる。 */}
                    <span>
                      出席（延べ）{' '}
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
                  <>
                    {/* この礼拝の出席を編集（開催済みでも修正モードで受付UIを開く） */}
                    <Link
                      href={`/check-in?event=${e.id}`}
                      aria-label="出席を編集"
                      title="出席を編集"
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    >
                      <ListChecks className="h-4 w-4" />
                    </Link>
                    <EventRowEdit event={e} timezone={active.church.timezone} />
                  </>
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
