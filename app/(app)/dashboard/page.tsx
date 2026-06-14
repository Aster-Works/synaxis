import { getActiveChurch } from '@/app/lib/auth';
import { createSupabaseServerClient } from '@/app/lib/supabase/server';
import { getTodayEvents, getReceptionRows } from '@/app/lib/reception';
import { summarizeReception } from '@/app/lib/aggregate';
import { getPeriodReport, getPeopleStats, parseReportFilter } from '@/app/lib/reports';
import {
  SERVICE_KIND_LABELS,
  PERIOD_LABELS,
  RELATIONSHIP_LABELS,
  type RelationshipStatus,
} from '@/app/lib/types';
import { formatDateInZone, formatTimeInZone } from '@/app/lib/datetime';
import { PeriodFilter } from './PeriodFilter';
import { TrendChart } from './TrendChart';
import { PeoplePresenceTable } from './PeoplePresenceTable';
import { ExportButtons } from './ExportButtons';

type SearchParams = Promise<{ period?: string; kinds?: string; ratedOnly?: string }>;

const REL_ORDER: RelationshipStatus[] = ['member', 'regular_attendee', 'seeker', 'guest'];

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
  const supabase = await createSupabaseServerClient();

  const todayEvents = await getTodayEvents(supabase, active.church_id, tz);
  const todayCards = await Promise.all(
    todayEvents.map(async (event) => {
      const rows = await getReceptionRows(supabase, active.church_id, event.id);
      return { event, summary: summarizeReception(rows) };
    }),
  );

  const report = await getPeriodReport(supabase, active.church_id, tz, filter);
  const { people } = await getPeopleStats(supabase, active.church_id, tz, filter);
  const t = report.totals;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-slate-900">集計</h1>

      {/* 本日の礼拝 */}
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
                  <Metric label={active.church.child_label} value={summary.children} />
                  <Metric label="昼食" value={summary.lunchTotal} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 期間集計 */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-500">
          期間集計（{PERIOD_LABELS[filter.period]}）
        </h2>
        <PeriodFilter />
        <ExportButtons />

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          <Metric label="平均出席" value={t.avgAttendance} highlight />
          <Metric label="総出席" value={t.present} />
          <Metric label="大人" value={t.adults} />
          <Metric label={active.church.child_label} value={t.children} />
          <Metric label="昼食" value={t.lunch} />
          <Metric label="礼拝数" value={t.events} sub={`対象${t.ratedEvents}`} />
        </div>

        <div className="flex flex-wrap gap-2 rounded-xl bg-white p-3 text-xs text-slate-600 ring-1 ring-slate-200">
          {REL_ORDER.map((r) => (
            <span key={r} className="rounded-full bg-slate-50 px-2 py-1">
              {RELATIONSHIP_LABELS[r]} {t.byRelationship[r]}
            </span>
          ))}
          <span className="rounded-full bg-slate-50 px-2 py-1">
            朝 {t.byKind.morning_worship.present}
          </span>
          <span className="rounded-full bg-slate-50 px-2 py-1">
            夕 {t.byKind.evening_worship.present}
          </span>
          <span className="rounded-full bg-slate-50 px-2 py-1">
            特別 {t.byKind.special_worship.present}
          </span>
        </div>

        <TrendChart points={report.trend} />
      </section>

      {/* 礼拝別 */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-500">礼拝別</h2>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] text-slate-500">
                <th className="px-3 py-2 font-medium">礼拝</th>
                <th className="px-2 py-2 text-right font-medium">出席</th>
                <th className="px-2 py-2 text-right font-medium">大人</th>
                <th className="px-2 py-2 text-right font-medium">子ども</th>
                <th className="px-3 py-2 text-right font-medium">昼食</th>
              </tr>
            </thead>
            <tbody>
              {report.eventReports.slice(0, 30).map((r) => (
                <tr key={r.event.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2">
                    <span className="font-medium text-slate-800">{r.event.name}</span>
                    <span className="ml-1 text-[11px] text-slate-400">
                      {formatDateInZone(r.event.starts_at, tz)}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{r.present}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-500">{r.adults}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-500">{r.children}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">{r.lunch}</td>
                </tr>
              ))}
              {report.eventReports.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-400">
                    この期間の礼拝がありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 人物別 */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-500">人物別の出席</h2>
        <PeoplePresenceTable people={people} />
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: number;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl px-1 py-2 text-center ${highlight ? 'bg-indigo-50' : 'bg-white ring-1 ring-slate-200'}`}>
      <p
        className={`text-lg font-bold tabular-nums ${highlight ? 'text-indigo-700' : 'text-slate-800'}`}
      >
        {value}
      </p>
      <p className="text-[11px] text-slate-500">{label}</p>
      {sub && <p className="text-[10px] text-slate-400">{sub}</p>}
    </div>
  );
}
