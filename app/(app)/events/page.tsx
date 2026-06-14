import { getActiveChurch } from '@/app/lib/auth';
import { createSupabaseServerClient } from '@/app/lib/supabase/server';
import {
  SERVICE_KIND_LABELS,
  SERVICE_STATUS_LABELS,
  type ServiceEvent,
} from '@/app/lib/types';
import { formatDateInZone, formatTimeInZone } from '@/app/lib/datetime';
import { EventForm } from './EventForm';

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

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">礼拝</h1>

      {canManage && <EventForm />}

      <ul className="space-y-2">
        {events.map((e) => (
          <li
            key={e.id}
            className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3"
          >
            <div>
              <p className="font-medium text-slate-900">{e.name}</p>
              <p className="text-xs text-slate-500">
                {formatDateInZone(e.starts_at, active.church.timezone)}{' '}
                {formatTimeInZone(e.starts_at, active.church.timezone)} ·{' '}
                {SERVICE_KIND_LABELS[e.kind]}
                {e.lunch_enabled && ' · 昼食'}
                {e.counts_toward_attendance_rate && ' · 出席率対象'}
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
              {SERVICE_STATUS_LABELS[e.status]}
            </span>
          </li>
        ))}
        {events.length === 0 && (
          <li className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
            礼拝がまだありません
          </li>
        )}
      </ul>
    </div>
  );
}
