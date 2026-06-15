'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Combine, Pencil } from 'lucide-react';
import {
  AGE_GROUP_LABELS,
  RELATIONSHIP_BADGE,
  RELATIONSHIP_LABELS,
  RELATIONSHIP_ORDER,
  type Person,
  type RelationshipStatus,
} from '@/app/lib/types';
import { kanaRowOf, KANA_ROWS } from '@/app/lib/kana';
import { MergeModal } from './MergeModal';
import { PersonEditModal } from './PersonEditModal';

export function PeopleList({
  people,
  canMerge = false,
  canEdit = false,
  childLabel = '子ども',
}: {
  people: Person[];
  canMerge?: boolean;
  canEdit?: boolean;
  childLabel?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [rel, setRel] = useState<RelationshipStatus | null>(null); // 立場フィルター（null=全て）
  const [kanaRow, setKanaRow] = useState<string | null>(null); // 五十音「行」フィルター（null=全て）
  const [mergeSource, setMergeSource] = useState<Person | null>(null);
  const [editPerson, setEditPerson] = useState<Person | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter((p) => {
      if (rel && p.relationship_status !== rel) return false;
      if (kanaRow && kanaRowOf(p.furigana) !== kanaRow) return false;
      if (
        q &&
        !p.display_name.toLowerCase().includes(q) &&
        !(p.furigana ?? '').toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [people, query, rel, kanaRow]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="名前・ふりがなで検索"
          className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        />
      </div>

      {/* 立場フィルター（全／会員・客員・未信・ビジター） */}
      <div className="flex gap-1.5">
        <button
          onClick={() => setRel(null)}
          aria-pressed={rel === null}
          className={`flex-1 rounded-lg py-1.5 text-xs font-medium ${
            rel === null
              ? 'bg-slate-900 text-white'
              : 'bg-white text-slate-600 ring-1 ring-slate-200'
          }`}
        >
          全
        </button>
        {RELATIONSHIP_ORDER.map((r) => (
          <button
            key={r}
            onClick={() => setRel((cur) => (cur === r ? null : r))}
            aria-pressed={rel === r}
            className={`flex-1 rounded-lg py-1.5 text-xs font-medium ${
              rel === r
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 ring-1 ring-slate-200'
            }`}
          >
            {RELATIONSHIP_LABELS[r]}
          </button>
        ))}
      </div>

      {/* あかさたな（五十音「行」）フィルター。ふりがなの先頭で絞り込む */}
      <div className="flex flex-wrap gap-1">
        <button
          onClick={() => setKanaRow(null)}
          aria-pressed={kanaRow === null}
          className={`min-w-[34px] rounded-md py-1 text-xs font-medium ${
            kanaRow === null
              ? 'bg-indigo-600 text-white'
              : 'bg-white text-slate-600 ring-1 ring-slate-200'
          }`}
        >
          全
        </button>
        {KANA_ROWS.map((r) => (
          <button
            key={r}
            onClick={() => setKanaRow((cur) => (cur === r ? null : r))}
            aria-pressed={kanaRow === r}
            className={`min-w-[34px] flex-1 rounded-md py-1 text-xs font-medium ${
              kanaRow === r
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-slate-600 ring-1 ring-slate-200'
            }`}
          >
            {r}
          </button>
        ))}
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
              {canEdit && (
                <button
                  onClick={() => setEditPerson(p)}
                  className="flex items-center gap-0.5 rounded-lg px-1.5 py-1 text-[11px] text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  aria-label={`${p.display_name} を編集`}
                  title="この人物を編集・削除"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
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

      {editPerson && (
        <PersonEditModal
          person={editPerson}
          childLabel={childLabel}
          onClose={() => setEditPerson(null)}
        />
      )}
    </div>
  );
}
