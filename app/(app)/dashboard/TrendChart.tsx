import type { TrendPoint } from '@/app/lib/types';

// 週ごとの総出席（うち子ども）を軽量 SVG 棒グラフで表示する純粋コンポーネント。
// 依存ライブラリは足さない。色だけに頼らずラベルと凡例を添える（§13.3）。
export function TrendChart({ points }: { points: TrendPoint[] }) {
  const data = points.slice(-16); // 直近16週まで
  if (data.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
        この期間のデータがありません
      </p>
    );
  }

  const W = 680;
  const H = 160;
  const pad = { top: 12, right: 8, bottom: 24, left: 8 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const max = Math.max(1, ...data.map((d) => d.present));
  const slot = innerW / data.length;
  const barW = Math.min(34, slot * 0.7);

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center gap-3 text-[11px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-indigo-500" />大人
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-400" />子ども
        </span>
        <span className="ml-auto">週ごとの総出席（直近{data.length}週）</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`週ごとの出席推移。最大 ${max} 人。`}
      >
        {data.map((d, i) => {
          const x = pad.left + i * slot + (slot - barW) / 2;
          const totalH = (d.present / max) * innerH;
          const childH = (d.children / max) * innerH;
          const adultH = totalH - childH;
          const yAdult = pad.top + innerH - totalH;
          const yChild = pad.top + innerH - childH;
          const label = d.weekStart.slice(5).replace('-', '/');
          return (
            <g key={d.weekStart}>
              <rect x={x} y={yAdult} width={barW} height={Math.max(0, adultH)} rx={2} fill="#6366f1" />
              <rect x={x} y={yChild} width={barW} height={Math.max(0, childH)} rx={2} fill="#34d399" />
              <text
                x={x + barW / 2}
                y={pad.top + innerH - totalH - 3}
                textAnchor="middle"
                fontSize="10"
                fill="#475569"
              >
                {d.present || ''}
              </text>
              {(i % 2 === 0 || data.length <= 8) && (
                <text
                  x={x + barW / 2}
                  y={H - 8}
                  textAnchor="middle"
                  fontSize="9"
                  fill="#94a3b8"
                >
                  {label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
