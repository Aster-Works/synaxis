// 集計の小さな数値カード（本日の礼拝カードと期間集計で共有）。
export function Metric({
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
    <div
      className={`rounded-xl px-1 py-2 text-center ${highlight ? 'bg-indigo-50' : 'bg-white ring-1 ring-slate-200'}`}
    >
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
