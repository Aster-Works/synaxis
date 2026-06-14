'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { PERIOD_LABELS, SERVICE_KIND_LABELS, type Period, type ServiceKind } from '@/app/lib/types';

const PERIODS: Period[] = ['3m', '6m', 'all'];
const KINDS = Object.keys(SERVICE_KIND_LABELS) as ServiceKind[];

export function PeriodFilter() {
  const router = useRouter();
  const params = useSearchParams();

  const period = (params.get('period') as Period) ?? '3m';
  const ratedOnly = params.get('ratedOnly') === '1';
  const selectedKinds = new Set(
    (params.get('kinds') ?? '').split(',').filter(Boolean) as ServiceKind[],
  );

  const update = useCallback(
    (mut: (p: URLSearchParams) => void) => {
      const next = new URLSearchParams(params.toString());
      mut(next);
      router.replace(`/dashboard?${next.toString()}`, { scroll: false });
    },
    [params, router],
  );

  const toggleKind = (k: ServiceKind) =>
    update((p) => {
      const set = new Set(selectedKinds);
      if (set.has(k)) set.delete(k);
      else set.add(k);
      if (set.size === 0) p.delete('kinds');
      else p.set('kinds', [...set].join(','));
    });

  return (
    <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
      <div className="flex gap-1.5">
        {PERIODS.map((p) => (
          <button
            key={p}
            onClick={() => update((sp) => sp.set('period', p))}
            className={`flex-1 rounded-lg py-1.5 text-xs font-medium ${
              period === p ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {KINDS.map((k) => {
          return (
            <button
              key={k}
              onClick={() => toggleKind(k)}
              aria-pressed={selectedKinds.has(k)}
              className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${
                selectedKinds.has(k)
                  ? 'bg-indigo-600 text-white ring-indigo-600'
                  : 'bg-white text-slate-500 ring-slate-200'
              }`}
            >
              {selectedKinds.has(k) ? '✓ ' : ''}
              {SERVICE_KIND_LABELS[k]}
            </button>
          );
        })}
        {selectedKinds.size === 0 && (
          <span className="self-center text-[11px] text-slate-400">（全種別）</span>
        )}
      </div>

      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={ratedOnly}
          onChange={(e) => update((p) => (e.target.checked ? p.set('ratedOnly', '1') : p.delete('ratedOnly')))}
        />
        出席率対象の礼拝のみ（特別礼拝などを除外）
      </label>
    </div>
  );
}
