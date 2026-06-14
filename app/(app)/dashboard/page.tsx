import { getActiveChurch } from '@/app/lib/auth';
import { createSupabaseServerClient } from '@/app/lib/supabase/server';
import {
  getTodayEvents,
  getReceptionRows,
} from '@/app/lib/reception';
import { summarizeReception } from '@/app/lib/aggregate';
import { SERVICE_KIND_LABELS } from '@/app/lib/types';
import { formatTimeInZone } from '@/app/lib/datetime';

export default async function DashboardPage() {
  const active = await getActiveChurch();
  if (!active) return null;

  const supabase = await createSupabaseServerClient();
  const tz = active.church.timezone;
  const todayEvents = await getTodayEvents(supabase, active.church_id, tz);

  const cards = await Promise.all(
    todayEvents.map(async (event) => {
      const rows = await getReceptionRows(supabase, active.church_id, event.id);
      return { event, summary: summarizeReception(rows) };
    }),
  );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">集計</h1>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-500">本日の礼拝</h2>
        {cards.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
            本日の礼拝はありません
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {cards.map(({ event, summary }) => (
              <div
                key={event.id}
                className="rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div className="flex items-baseline justify-between">
                  <p className="font-semibold text-slate-900">{event.name}</p>
                  <p className="text-xs text-slate-400">
                    {formatTimeInZone(event.starts_at, tz)} ·{' '}
                    {SERVICE_KIND_LABELS[event.kind]}
                  </p>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                  <Metric label="出席" value={summary.present} />
                  <Metric label="大人" value={summary.adults} />
                  <Metric label={active.church.child_label} value={summary.children} />
                  <Metric label="昼食" value={summary.lunchTotal} />
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
                  <span>会員 {summary.byRelationship.member}</span>
                  <span>客員 {summary.byRelationship.regular_attendee}</span>
                  <span>未信 {summary.byRelationship.seeker}</span>
                  <span>ゲスト {summary.guests}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="text-xs text-slate-400">
        期間集計・推移グラフ・CSV/Google Sheets 出力は Phase 3 で実装します。
      </p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 px-1 py-1.5">
      <p className="text-lg font-bold tabular-nums text-slate-800">{value}</p>
      <p className="text-[11px] text-slate-500">{label}</p>
    </div>
  );
}
