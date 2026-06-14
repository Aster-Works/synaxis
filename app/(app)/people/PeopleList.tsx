'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Combine } from 'lucide-react';
import {
  AGE_GROUP_LABELS,
  RELATIONSHIP_BADGE,
  RELATIONSHIP_LABELS,
  type Person,
} from '@/app/lib/types';
import { MergeModal } from './MergeModal';

export function PeopleList({
  people,
  canMerge = false,
}: {
  people: Person[];
  canMerge?: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [mergeSource, setMergeSource] = useState<Person | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter(
      (p) =>
        p.display_name.toLowerCase().includes(q) ||
        (p.furigana ?? '').toLowerCase().includes(q),
    );
  }, [people, query]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="名前・フリガナで検索"
          className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        />
      </div>

      <p className="text-xs text-slate-400">{filtered.length}名</p>

      <ul className="space-y-2">
        {filtered.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-900">
                {p.display_name}
              </p>
              {p.furigana && (
                <p className="truncate text-[11px] text-slate-400">
                  {p.furigana}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="text-[11px] text-slate-400">
                {AGE_GROUP_LABELS[p.age_group]}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${RELATIONSHIP_BADGE[p.relationship_status]}`}
              >
                {RELATIONSHIP_LABELS[p.relationship_status]}
              </span>
              {canMerge && (
                <button
                  onClick={() => setMergeSource(p)}
                  className="flex items-center gap-0.5 rounded-lg px-1.5 py-1 text-[11px] text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  aria-label={`${p.display_name} を統合`}
                  title="この人を別の人物に統合"
                >
                  <Combine className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
            該当する人がいません
          </li>
        )}
      </ul>

      {mergeSource && (
        <MergeModal
          source={mergeSource}
          people={people}
          onClose={() => setMergeSource(null)}
          onMerged={() => {
            setMergeSource(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
