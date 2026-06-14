import {
  RELATIONSHIP_LABELS,
  type RelationshipStatus,
  type PeriodReport,
  type PersonPresence,
} from '@/app/lib/types';
import { formatDateInZone } from '@/app/lib/datetime';
import { TrendChart } from './TrendChart';
import { PeoplePresenceTable } from './PeoplePresenceTable';
import { Metric } from './Metric';

const REL_ORDER: RelationshipStatus[] = ['member', 'regular_attendee', 'seeker', 'guest'];
const EXPORTS: { type: string; label: string }[] = [
  { type: 'summary', label: 'まとめ' },
  { type: 'matrix', label: '出席マトリクス' },
  { type: 'guests', label: 'ゲスト' },
  { type: 'people', label: '人物一覧' },
];

// 集計方法（ユニーク/延べ）に依存するセクション一式。サーバーで各モード分を一度に
// 描画し、ModeSwitch（クライアント）が表示を切り替える＝切替時のサーバー往復ゼロ。
export function ModeSections({
  report,
  people,
  childLabel,
  timezone,
  baseParams,
}: {
  report: PeriodReport;
  people: PersonPresence[];
  childLabel: string;
  timezone: string;
  baseParams: string; // period/kinds/ratedOnly のクエリ文字列（count は除く）
}) {
  const t = report.totals;
  const unique = report.filter.countMode === 'unique';
  const countParam = unique ? '' : '&count=total';
  const exportHref = (type: string) =>
    `/api/reports/export?type=${type}${baseParams ? `&${baseParams}` : ''}${countParam}`;

  return (
    <div className="space-y-5">
      {/* CSV出力（表示中のモードを引き継ぐ） */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">CSV出力:</span>
        {EXPORTS.map((e) => (
          <a
            key={e.type}
            href={exportHref(e.type)}
            download
            className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
          >
            {e.label}
          </a>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        <Metric label="平均出席" value={t.avgAttendance} highlight />
        <Metric label="総出席" value={t.present} />
        <Metric label="大人" value={t.adults} />
        <Metric label={childLabel} value={t.children} />
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

      {/* 日別 */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-500">
          日別（{unique ? 'ユニーク出席' : '延べ出席'}）
        </h2>
        {report.dayReports.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
            この期間の出席がありません
          </p>
        ) : (
          <div className="space-y-2">
            {report.dayReports.slice(0, 30).map((d) => (
              <div key={d.date} className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-semibold text-slate-900">
                    {formatDateInZone(`${d.date}T12:00:00Z`, timezone)}
                  </p>
                  <p className="text-sm">
                    <span className="text-[11px] text-slate-500">
                      {unique ? 'ユニーク出席' : '延べ出席'}{' '}
                    </span>
                    <span className="font-bold tabular-nums text-indigo-700">{d.present}</span>
                  </p>
                </div>
                {/* 礼拝内訳：unique は先頭=最初の礼拝・以降は「+N＝新規」。total は各礼拝の実数 */}
                <p className="mt-1 text-xs text-slate-600">
                  {d.services.map((s, i) => (
                    <span key={s.eventId}>
                      {i > 0 && <span className="text-slate-300"> ・ </span>}
                      {s.name}{' '}
                      <span className="font-semibold tabular-nums text-slate-800">
                        {unique && i > 0 ? '+' : ''}
                        {s.present}
                      </span>
                    </span>
                  ))}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                  <span>
                    大人 <span className="font-semibold text-slate-700">{d.adults}</span>
                  </span>
                  <span>
                    {childLabel}{' '}
                    <span className="font-semibold text-slate-700">{d.children}</span>
                  </span>
                  <span className="text-slate-300">｜</span>
                  {REL_ORDER.map((r) => (
                    <span key={r}>
                      {RELATIONSHIP_LABELS[r]}{' '}
                      <span className="font-semibold text-slate-700">
                        {d.byRelationship[r]}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
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
                      {formatDateInZone(r.event.starts_at, timezone)}
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
