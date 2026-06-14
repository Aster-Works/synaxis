import { getActiveChurch } from '@/app/lib/auth';
import { createSupabaseServerClient } from '@/app/lib/supabase/server';
import { getTodayEvents, getReceptionRows } from '@/app/lib/reception';
import { summarizeReception } from '@/app/lib/aggregate';
import {
  getPeriodReportModes,
  getPeopleStatsModes,
  parseReportFilter,
} from '@/app/lib/reports';
import { SERVICE_KIND_LABELS, PERIOD_LABELS } from '@/app/lib/types';
import { formatTimeInZone } from '@/app/lib/datetime';
import { PeriodFilter } from './PeriodFilter';
import { ModeSwitch } from './ModeSwitch';
import { ModeSections } from './ModeSections';
import { Metric } from './Metric';

type SearchParams = Promise<{
  period?: string;
  kinds?: string;
  ratedOnly?: string;
}>;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const active = await getActiveChurch();
  if (!active) return null;

  const sp = await searchParams;
  const filter = parseReportFilter(sp);
  const tz = active.church.timezone;
  const childLabel = active.church.child_label;
  const supabase = await createSupabaseServerClient();

  // 互いに独立した集計は並列取得。集計方法（ユニーク/延べ）は両方まとめて算出し、
  // クライアント側で即時切替する（切替時のサーバー往復ゼロ）。
  const [todayEvents, reports, peopleModes] = await Promise.all([
    getTodayEvents(supabase, active.church_id, tz),
    getPeriodReportModes(supabase, active.church_id, tz, filter),
    getPeopleStatsModes(supabase, active.church_id, tz, filter),
  ]);
  const todayCards = await Promise.all(
    todayEvents.map(async (event) => {
      const rows = await getReceptionRows(supabase, active.church_id, event.id);
      return { event, summary: summarizeReception(rows) };
    }),
  );

  // CSV出力リンク用の基底クエリ（count は表示中モードに応じて ModeSections が付与）。
  const exportParams = new URLSearchParams();
  exportParams.set('period', filter.period);
  if (filter.kinds.length) exportParams.set('kinds', filter.kinds.join(','));
  if (filter.ratedOnly) exportParams.set('ratedOnly', '1');
  const baseParams = exportParams.toString();

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-slate-900">集計</h1>

      {/* 本日の礼拝（その礼拝に今だれが来ているか＝実数。集計方法の切替対象外） */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-500">本日の礼拝</h2>
        {todayCards.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
            本日の礼拝はありません
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {todayCards.map(({ event, summary }) => (
              <div key={event.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-baseline justify-between">
                  <p className="font-semibold text-slate-900">{event.name}</p>
                  <p className="text-xs text-slate-400">
                    {formatTimeInZone(event.starts_at, tz)} · {SERVICE_KIND_LABELS[event.kind]}
                  </p>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                  <Metric label="出席" value={summary.present} />
                  <Metric label="大人" value={summary.adults} />
                  <Metric label={childLabel} value={summary.children} />
                  <Metric label="昼食" value={summary.lunchTotal} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 期間集計：期間/種別/出席率対象フィルター（変更時はサーバー再取得） */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-500">
          期間集計（{PERIOD_LABELS[filter.period]}）
        </h2>
        <PeriodFilter />
      </section>

      {/* 集計方法トグル＋モード依存セクション（切替はクライアント側で即時） */}
      <ModeSwitch
        unique={
          <ModeSections
            report={reports.unique}
            people={peopleModes.unique}
            childLabel={childLabel}
            timezone={tz}
            baseParams={baseParams}
          />
        }
        total={
          <ModeSections
            report={reports.total}
            people={peopleModes.total}
            childLabel={childLabel}
            timezone={tz}
            baseParams={baseParams}
          />
        }
      />
    </div>
  );
}
