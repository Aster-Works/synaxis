'use client';

import { useActionState } from 'react';
import { createChurchAction, type OnboardingState } from './actions';

const initialState: OnboardingState = {};

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState(
    createChurchAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label
          htmlFor="name"
          className="mb-1.5 block text-sm font-medium text-slate-700"
        >
          教会名
        </label>
        <input
          id="name"
          name="name"
          required
          maxLength={120}
          placeholder="例: 永福南キリスト教会"
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        />
      </div>

      <div>
        <label
          htmlFor="slug"
          className="mb-1.5 block text-sm font-medium text-slate-700"
        >
          識別子（slug）
        </label>
        <input
          id="slug"
          name="slug"
          required
          pattern="[a-z0-9\-]+"
          maxLength={40}
          placeholder="例: eifukuminami"
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        />
        <p className="mt-1 text-xs text-slate-400">
          英小文字・数字・ハイフン。URL などで使う一意の識別子です。
        </p>
      </div>

      {state.error && (
        <p className="text-sm text-rose-600" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-base font-semibold text-white transition active:scale-[0.99] disabled:opacity-60"
      >
        {pending ? '作成中…' : '教会を作成して始める'}
      </button>
    </form>
  );
}
