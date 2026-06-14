'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Trash2 } from 'lucide-react';
import {
  RELATIONSHIP_LABELS,
  RELATIONSHIP_ORDER,
  AGE_GROUP_LABELS,
  type AgeGroup,
  type Person,
  type RelationshipStatus,
} from '@/app/lib/types';

const AGE_GROUPS: AgeGroup[] = ['adult', 'child', 'unknown'];

export function PersonEditModal({
  person,
  childLabel,
  onClose,
}: {
  person: Person;
  childLabel: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(person.display_name);
  const [furigana, setFurigana] = useState(person.furigana ?? '');
  const [relationship, setRelationship] = useState<RelationshipStatus>(
    person.relationship_status,
  );
  const [ageGroup, setAgeGroup] = useState<AgeGroup>(person.age_group);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim()) {
      setError('氏名を入力してください');
      return;
    }
    setPending(true);
    setError('');
    const res = await fetch(`/api/people/${person.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: displayName.trim(),
        furigana: furigana.trim() || undefined,
        relationshipStatus: relationship,
        ageGroup,
        firstVisitOn: person.first_visit_on ?? undefined,
      }),
    });
    setPending(false);
    if (res.ok) {
      router.refresh();
      onClose();
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? '更新に失敗しました');
    }
  }

  async function remove() {
    setPending(true);
    setError('');
    const res = await fetch(`/api/people/${person.id}`, { method: 'DELETE' });
    setPending(false);
    if (res.ok) {
      router.refresh();
      onClose();
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? '削除に失敗しました');
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
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">人物を編集</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="閉じる">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={save} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                氏名 <span className="text-rose-500">*</span>
              </label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={100}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">フリガナ</label>
              <input
                value={furigana}
                onChange={(e) => setFurigana(e.target.value)}
                maxLength={100}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">立場</label>
              <select
                value={relationship}
                onChange={(e) => setRelationship(e.target.value as RelationshipStatus)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {RELATIONSHIP_ORDER.map((r) => (
                  <option key={r} value={r}>{RELATIONSHIP_LABELS[r]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">年齢区分</label>
              <select
                value={ageGroup}
                onChange={(e) => setAgeGroup(e.target.value as AgeGroup)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {AGE_GROUPS.map((a) => (
                  <option key={a} value={a}>{a === 'child' ? childLabel : AGE_GROUP_LABELS[a]}</option>
                ))}
              </select>
            </div>
          </div>

          {error && <p className="text-sm text-rose-600" role="alert">{error}</p>}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending ? '保存中…' : '保存する'}
          </button>
        </form>

        <div className="mt-4 border-t border-slate-100 pt-3">
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-rose-600"
            >
              <Trash2 className="h-3.5 w-3.5" />
              この人物を削除
            </button>
          ) : (
            <div className="rounded-lg bg-rose-50 p-3">
              <p className="mb-2 text-xs text-rose-700">
                削除すると、この人物の出席履歴もすべて消えます。よろしいですか？
                （別人と重複している場合は、削除ではなく「統合」を使ってください）
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmDelete(false)}
                  disabled={pending}
                  className="flex-1 rounded-lg bg-white py-2 text-xs font-medium text-slate-600 ring-1 ring-slate-200"
                >
                  やめる
                </button>
                <button
                  onClick={remove}
                  disabled={pending}
                  className="flex-1 rounded-lg bg-rose-600 py-2 text-xs font-bold text-white disabled:opacity-60"
                >
                  {pending ? '削除中…' : '削除する'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
