'use client';

import { useActionState } from 'react';
import { createEventAction, type EventFormState } from './actions';
import { SERVICE_KIND_LABELS } from '@/app/lib/types';

const initial: EventFormState = {};

export function EventForm() {
  const [state, action, pending] = useActionState(createEventAction, initial);

  return (
    <form
      action={action}
      className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4"
    >
      <h2 className="font-semibold text-slate-900">礼拝を作成</h2>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            種別
          </label>
          <select
            name="kind"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            defaultValue="morning_worship"
          >
            {Object.entries(SERVICE_KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            名称
          </label>
          <input
            name="name"
            required
            defaultValue="主日朝礼拝"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          開始日時
        </label>
        <input
          type="datetime-local"
          name="startsAtLocal"
          required
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="open" defaultChecked />
          すぐ受付中にする
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="countsToward" defaultChecked />
          出席率の分母に含める
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="lunchEnabled" />
          昼食あり
        </label>
      </div>

      <input
        name="note"
        placeholder="備考（任意）"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />

      {state.error && (
        <p className="text-sm text-rose-600" role="alert">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="text-sm text-emerald-600">礼拝を作成しました。</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? '作成中…' : '作成する'}
      </button>
    </form>
  );
}
