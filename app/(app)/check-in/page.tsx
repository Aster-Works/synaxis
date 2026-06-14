import Link from 'next/link';
import { getActiveChurch } from '@/app/lib/auth';
import { createSupabaseServerClient } from '@/app/lib/supabase/server';
import {
  getTodayEvents,
  pickCurrentEvent,
  getReceptionRows,
} from '@/app/lib/reception';
import { CheckInClient } from './CheckInClient';

type SearchParams = Promise<{ event?: string }>;

export default async function CheckInPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { event: eventParam } = await searchParams;
  const active = await getActiveChurch();
  if (!active) return null; // レイアウトで /onboarding へ誘導済み

  const canEdit = ['owner', 'admin', 'receptionist'].includes(active.role);
  const supabase = await createSupabaseServerClient();
  const events = await getTodayEvents(
    supabase,
    active.church_id,
    active.church.timezone,
  );

  const selected =
    (eventParam && events.find((e) => e.id === eventParam)) ||
    pickCurrentEvent(events);

  if (!selected) {
    return (
      <div className="mx-auto mt-10 max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <h1 className="text-lg font-semibold text-slate-900">
          本日の礼拝がありません
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          受付を始めるには、まず礼拝イベントを作成してください。
        </p>
        {['owner', 'admin'].includes(active.role) ? (
          <Link
            href="/events"
            className="mt-5 inline-block rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white"
          >
            礼拝を作成する
          </Link>
        ) : (
          <p className="mt-5 text-xs text-slate-400">
            管理者に礼拝の作成を依頼してください。
          </p>
        )}
      </div>
    );
  }

  const rows = await getReceptionRows(supabase, active.church_id, selected.id);

  return (
    <CheckInClient
      event={selected}
      events={events}
      initialRows={rows}
      canEdit={canEdit}
      timezone={active.church.timezone}
      childLabel={active.church.child_label}
    />
  );
}
