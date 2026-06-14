'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import type { AgeGroup, AttendanceRecord, Person } from '@/app/lib/types';

const AGE_OPTIONS: { value: AgeGroup; label: string }[] = [
  { value: 'adult', label: '大人' },
  { value: 'child', label: '子ども' },
  { value: 'unknown', label: '不明' },
];

export function GuestModal({
  eventId,
  lunchEnabled,
  childLabel,
  onClose,
  onAdded,
}: {
  eventId: string;
  lunchEnabled: boolean;
  childLabel: string;
  onClose: () => void;
  onAdded: (person: Person, attendance: AttendanceRecord | null) => void;
}) {
  const [displayName, setDisplayName] = useState('');
  const [furigana, setFurigana] = useState('');
  const [ageGroup, setAgeGroup] = useState<AgeGroup>('adult');
  const [lunch, setLunch] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim()) {
      setError('名前を入力してください（不明なら仮の名前で可）');
      return;
    }
    setPending(true);
    setError('');

    const res = await fetch(`/api/events/${eventId}/guests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: displayName.trim(),
        furigana: furigana.trim() || undefined,
        ageGroup,
        relationshipStatus: 'guest',
        lunchQuantity: lunchEnabled ? lunch : 0,
      }),
    });

    setPending(false);
    if (res.ok || res.status === 207) {
      const { person, attendance } = await res.json();
      onAdded(person as Person, (attendance ?? null) as AttendanceRecord | null);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'ゲストの追加に失敗しました');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white p-5 sm:rounded-2xl"
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

        <form onSubmit={submit} className="space-y-3">
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
              フリガナ（任意）
            </label>
            <input
              value={furigana}
              onChange={(e) => setFurigana(e.target.value)}
              placeholder="やまだ"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              区分
            </label>
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
              <label className="mb-1 block text-sm font-medium text-slate-700">
                昼食数
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setLunch((n) => Math.max(0, n - 1))}
                  className="h-11 w-11 rounded-xl bg-slate-100 text-xl font-bold text-slate-600"
                >
                  −
                </button>
                <span className="w-10 text-center text-lg font-bold tabular-nums">
                  {lunch}
                </span>
                <button
                  type="button"
                  onClick={() => setLunch((n) => Math.min(20, n + 1))}
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
            disabled={pending}
            className="w-full rounded-xl bg-indigo-600 py-3.5 text-base font-bold text-white active:scale-[0.99] disabled:opacity-60"
          >
            {pending ? '追加中…' : '追加して出席にする'}
          </button>
        </form>
      </div>
    </div>
  );
}
