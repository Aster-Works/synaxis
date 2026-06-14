'use client';

import { useState, type ReactNode } from 'react';
import type { CountMode } from '@/app/lib/types';

// 集計方法（ユニーク/延べ）を「クライアント側だけ」で即時切替する。
// 両モードのセクションはサーバーで描画済みで props として渡される（unique / total）。
// 切替は表示の差し替えのみ＝サーバー往復ゼロ。
export function ModeSwitch({
  unique,
  total,
}: {
  unique: ReactNode;
  total: ReactNode;
}) {
  const [mode, setMode] = useState<CountMode>('unique');
  const choose = (m: CountMode) => setMode(m);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-slate-500">集計方法</span>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5">
          {(
            [
              ['unique', '1日1人1回'],
              ['total', '延べ'],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => choose(m)}
              aria-pressed={mode === m}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'unique' ? unique : total}
    </div>
  );
}
