'use client';

import { useMemo, useState } from 'react';
import { X, ArrowRight, Search } from 'lucide-react';
import {
  AGE_GROUP_LABELS,
  RELATIONSHIP_LABELS,
  type Person,
} from '@/app/lib/types';
import { matchDuplicateCandidates } from '@/app/lib/dedupe';

export function MergeModal({
  source,
  people,
  onClose,
  onMerged,
}: {
  source: Person;
  people: Person[];
  onClose: () => void;
  onMerged: () => void;
}) {
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<Person | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  // 統合先候補。検索が空なら source の重複候補を提示。
  const candidates = useMemo(() => {
    const others = people.filter((p) => p.id !== source.id && !p.archived_at);
    const q = query.trim().toLowerCase();
    if (!q) {
      return matchDuplicateCandidates(
        { displayName: source.display_name, furigana: source.furigana },
        others,
        { excludeId: source.id, threshold: 0.5, limit: 8 },
      ).map((c) => c.person as Person);
    }
    return others
      .filter(
        (p) =>
          p.display_name.toLowerCase().includes(q) ||
          (p.furigana ?? '').toLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [people, source, query]);

  async function confirmMerge() {
    if (!target) return;
    setPending(true);
    setError('');
    const res = await fetch(`/api/people/${source.id}/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetId: target.id }),
    });
    setPending(false);
    if (res.ok) onMerged();
    else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? '統合に失敗しました');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">人物を統合</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
            aria-label="閉じる"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          統合元 <b className="text-slate-900">{source.display_name}</b>{' '}
          を、選んだ統合先へまとめます。出席履歴は統合先に引き継がれ、
          <b>{source.display_name}</b> はアーカイブされます。
        </p>

        {!target ? (
          <>
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="統合先を検索"
                className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            {!query && candidates.length > 0 && (
              <p className="mb-1.5 text-xs font-medium text-amber-700">
                重複の可能性が高い候補
              </p>
            )}
            <ul className="space-y-1.5">
              {candidates.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => setTarget(p)}
                    className="flex w-full items-center justify-between rounded-lg bg-white px-3 py-2 text-left ring-1 ring-slate-200 active:scale-[0.99]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-900">
                        {p.display_name}
                      </span>
                      {p.furigana && (
                        <span className="block truncate text-[11px] text-slate-400">
                          {p.furigana}
                        </span>
                      )}
                    </span>
                    <span className="ml-2 shrink-0 text-[11px] text-slate-500">
                      {RELATIONSHIP_LABELS[p.relationship_status]}・
                      {AGE_GROUP_LABELS[p.age_group]}
                    </span>
                  </button>
                </li>
              ))}
              {candidates.length === 0 && (
                <li className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-400">
                  候補がありません
                </li>
              )}
            </ul>
          </>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-center gap-3 rounded-xl bg-slate-50 p-3">
              <span className="truncate text-sm font-medium text-slate-500 line-through">
                {source.display_name}
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="truncate text-sm font-bold text-slate-900">
                {target.display_name}
              </span>
            </div>

            {error && (
              <p className="mb-2 text-sm text-rose-600" role="alert">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setTarget(null)}
                disabled={pending}
                className="flex-1 rounded-xl bg-slate-100 py-3 text-sm font-semibold text-slate-600"
              >
                戻る
              </button>
              <button
                onClick={confirmMerge}
                disabled={pending}
                className="flex-1 rounded-xl bg-rose-600 py-3 text-sm font-bold text-white active:scale-[0.99] disabled:opacity-60"
              >
                {pending ? '統合中…' : 'この内容で統合する'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
