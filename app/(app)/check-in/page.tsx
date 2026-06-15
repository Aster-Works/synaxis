import Link from 'next/link';
import { getActiveChurch } from '@/app/lib/auth';
import { createSupabaseServerClient } from '@/app/lib/supabase/server';
import {
  getReceptionEvents,
  pickCurrentEvent,
  getReceptionRows,
  getEventById,
} from '@/app/lib/reception';
import type { ServiceEvent } from '@/app/lib/types';
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
  const canComplete = ['owner', 'admin'].includes(active.role);
  const supabase = await createSupabaseServerClient();
  const events = await getReceptionEvents(supabase, active.church_id);

  // 通常は受付一覧（予定・受付中）から選ぶ。明示指定された礼拝が一覧に無い場合は、
  // 開催済み等の「出席を編集（修正モード）」として読み込む（owner/admin のみ）。
  let selected: ServiceEvent | null =
    (eventParam && events.find((e) => e.id === eventParam)) || null;
  let correctionMode = false;
  let switcherEvents = events;
  if (!selected && eventParam && canComplete) {
    const ev = await getEventById(supabase, eventParam);
    if (ev) {
      selected = ev;
      correctionMode = true;
      switcherEvents = [ev]; // 修正モードでは礼拝切替を出さない
    }
  }
  if (!selected) selected = pickCurrentEvent(events);

  if (!selected) {
    return (
      <div className="mx-auto mt-10 max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <h1 className="text-lg font-semibold text-slate-900">
          受付できる礼拝がありません
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          受付を始めるには「礼拝」から礼拝を作成してください。
          「すぐ受付中にする」を選ぶと、日付に関係なくここに表示されます。
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
      key={selected.id}
      event={selected}
      events={switcherEvents}
      initialRows={rows}
      canEdit={canEdit}
      canComplete={canComplete}
      correctionMode={correctionMode}
      churchId={active.church_id}
      timezone={active.church.timezone}
      childLabel={active.church.child_label}
    />
  );
}
