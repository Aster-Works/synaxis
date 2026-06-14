'use client';

import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { AgeGroup, Person } from '@/app/lib/types';
import { matchDuplicateCandidates, type DuplicateCandidate } from '@/app/lib/dedupe';

const AGE_OPTIONS: { value: AgeGroup; label: string }[] = [
  { value: 'adult', label: '大人' },
  { value: 'child', label: '子ども' },
  { value: 'unknown', label: '不明' },
];

export interface GuestInput {
  displayName: string;
  furigana?: string;
  ageGroup: AgeGroup;
  relationshipStatus: 'guest';
  lunchQuantity: number;
}

export function GuestModal({
  lunchEnabled,
  childLabel,
  people,
  onClose,
  onAddGuest,
  onAttendExisting,
}: {
  lunchEnabled: boolean;
  childLabel: string;
  people: Person[];
  onClose: () => void;
  onAddGuest: (input: GuestInput) => void;
  onAttendExisting: (person: Person, lunchQuantity: number) => void;
}) {
  const [displayName, setDisplayName] = useState('');
  const [furigana, setFurigana] = useState('');
  const [ageGroup, setAgeGroup] = useState<AgeGroup>('adult');
  const [lunch, setLunch] = useState(0);
  const [error, setError] = useState('');
  const [candidates, setCandidates] = useState<DuplicateCandidate[]>([]);

  // 名前入力をデバウンスして重複候補を算出（クライアント照合・純関数）
  useEffect(() => {
    const t = setTimeout(() => {
      if (!displayName.trim() && !furigana.trim()) {
        setCandidates([]);
        return;
      }
      setCandidates(
        matchDuplicateCandidates({ displayName, furigana }, people, {
          threshold: 0.7,
          limit: 5,
        }),
      );
    }, 200);
    return () => clearTimeout(t);
  }, [displayName, furigana, people]);

  const lunchQty = useMemo(() => (lunchEnabled ? lunch : 0), [lunchEnabled, lunch]);

  function submitNew(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim()) {
      setError('名前を入力してください（不明なら仮の名前で可）');
      return;
    }
    onAddGuest({
      displayName: displayName.trim(),
      furigana: furigana.trim() || undefined,
      ageGroup,
      relationshipStatus: 'guest',
      lunchQuantity: lunchQty,
    });
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
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">ゲストを追加</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
            aria-label="閉じる"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submitNew} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              名前 <span className="text-rose-500">*</span>
            </label>
            <input
              autoFocus
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="例: 山田さん / お連れの方"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              ふりがな（任意）
            </label>
            <input
              value={furigana}
              onChange={(e) => setFurigana(e.target.value)}
              placeholder="やまだ"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
          </div>

          {/* 重複候補（既にいる人なら出席にできる） */}
          {candidates.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5">
              <p className="mb-1.5 text-xs font-medium text-amber-800">
                この方ではありませんか？（既にいる方なら出席にできます）
              </p>
              <ul className="space-y-1.5">
                {candidates.map((c) => (
                  <li key={c.person.id}>
                    <button
                      type="button"
                      onClick={() => onAttendExisting(c.person as Person, lunchQty)}
                      className="flex w-full items-center justify-between rounded-lg bg-white px-3 py-2 text-left ring-1 ring-amber-200 active:scale-[0.99]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-slate-900">
                          {c.person.display_name}
                        </span>
                        {c.person.furigana && (
                          <span className="block truncate text-[11px] text-slate-400">
                            {c.person.furigana}
                          </span>
                        )}
                      </span>
                      <span className="ml-2 shrink-0 text-xs font-semibold text-amber-700">
                        この人を出席に
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[11px] text-amber-700/80">
                別人なら、下のボタンで新規ゲストとして追加してください。
              </p>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">区分</label>
            <div className="flex gap-1.5">
              {AGE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAgeGroup(opt.value)}
                  className={`flex-1 rounded-xl py-2.5 text-sm font-medium ${
                    ageGroup === opt.value
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {opt.value === 'child' ? childLabel : opt.label}
                </button>
              ))}
            </div>
          </div>

          {lunchEnabled && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">昼食数</label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setLunch((n) => Math.max(0, Math.round((n - 0.5) * 2) / 2))}
                  className="h-11 w-11 rounded-xl bg-slate-100 text-xl font-bold text-slate-600"
                >
                  −
                </button>
                <span className="w-10 text-center text-lg font-bold tabular-nums">{lunch}</span>
                <button
                  type="button"
                  onClick={() => setLunch((n) => Math.min(20, Math.round((n + 0.5) * 2) / 2))}
                  className="h-11 w-11 rounded-xl bg-slate-100 text-xl font-bold text-slate-600"
                >
                  ＋
                </button>
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-rose-600" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="w-full rounded-xl bg-indigo-600 py-3.5 text-base font-bold text-white active:scale-[0.99]"
          >
            {candidates.length > 0 ? '新規ゲストとして追加' : '追加して出席にする'}
          </button>
        </form>
      </div>
    </div>
  );
}
