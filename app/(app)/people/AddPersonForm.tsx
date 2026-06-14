'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { UserPlus } from 'lucide-react';
import {
  RELATIONSHIP_LABELS,
  RELATIONSHIP_ORDER,
  AGE_GROUP_LABELS,
  type AgeGroup,
} from '@/app/lib/types';
import { createPersonAction, type PersonFormState } from './actions';

const initial: PersonFormState = {};
const AGE_GROUPS: AgeGroup[] = ['adult', 'child', 'unknown'];

export function AddPersonForm({ childLabel }: { childLabel: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createPersonAction, initial);
  const formRef = useRef<HTMLFormElement>(null);

  // 追加成功でフォームをリセット（連続登録しやすく）
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-indigo-300 bg-indigo-50 py-3 text-sm font-semibold text-indigo-700"
      >
        <UserPlus className="h-4 w-4" />
        人物を追加
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={action}
      className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">人物を追加</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-slate-400 hover:text-slate-600"
        >
          閉じる
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            氏名 <span className="text-rose-500">*</span>
          </label>
          <input
            name="displayName"
            required
            maxLength={100}
            placeholder="山田 太郎"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            フリガナ
          </label>
          <input
            name="furigana"
            maxLength={100}
            placeholder="やまだ たろう"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">立場</label>
          <select
            name="relationshipStatus"
            defaultValue="member"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {RELATIONSHIP_ORDER.map((r) => (
              <option key={r} value={r}>
                {RELATIONSHIP_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            年齢区分
          </label>
          <select
            name="ageGroup"
            defaultValue="adult"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {AGE_GROUPS.map((a) => (
              <option key={a} value={a}>
                {a === 'child' ? childLabel : AGE_GROUP_LABELS[a]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {state.error && (
        <p className="text-sm text-rose-600" role="alert">
          {state.error}
        </p>
      )}
      {state.ok && <p className="text-sm text-emerald-600">追加しました。続けて入力できます。</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? '追加中…' : '追加する'}
      </button>
    </form>
  );
}
