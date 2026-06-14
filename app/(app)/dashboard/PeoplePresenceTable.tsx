import {
  RELATIONSHIP_BADGE,
  RELATIONSHIP_LABELS,
  type PersonPresence,
} from '@/app/lib/types';

// 人物別の出席回数・出席率・初回/最終出席日。出席が多い順に上位を表示する。
export function PeoplePresenceTable({ people }: { people: PersonPresence[] }) {
  const rows = [...people]
    .filter((p) => p.count > 0)
    .sort((a, b) => b.count - a.count || b.rate - a.rate);

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
        この期間の出席記録がありません
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-[11px] text-slate-500">
            <th className="px-3 py-2 font-medium">氏名</th>
            <th className="px-2 py-2 text-right font-medium">出席</th>
            <th className="px-2 py-2 text-right font-medium">出席率</th>
            <th className="px-3 py-2 text-right font-medium">初回 / 最終</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.personId} className="border-b border-slate-100 last:border-0">
              <td className="px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-slate-800">{p.displayName}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ${RELATIONSHIP_BADGE[p.relationship]}`}
                  >
                    {RELATIONSHIP_LABELS[p.relationship]}
                  </span>
                  {p.isNewGuest && (
                    <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">
                      初来会
                    </span>
                  )}
                </div>
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-slate-700">{p.count}</td>
              <td className="px-2 py-2 text-right tabular-nums text-slate-700">
                {Math.round(p.rate * 100)}%
              </td>
              <td className="px-3 py-2 text-right text-[11px] tabular-nums text-slate-400">
                {p.firstOn ?? '—'} / {p.lastOn ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
