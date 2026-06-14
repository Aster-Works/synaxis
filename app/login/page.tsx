'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/app/lib/supabase/client';

function LoginForm() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') ?? '/check-in';

  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>(
    'idle',
  );
  const [message, setMessage] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus('sending');
    setMessage('');

    const supabase = createSupabaseBrowserClient();
    const callback = `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(
      redirect,
    )}`;

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: callback },
    });

    if (error) {
      setStatus('error');
      setMessage(error.message);
    } else {
      setStatus('sent');
      setMessage('ログイン用のリンクをメールで送信しました。');
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Synaxis
        </h1>
        <p className="mt-2 text-sm text-slate-500">礼拝出席・昼食管理</p>
      </div>

      {status === 'sent' ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <p className="font-medium text-emerald-800">{message}</p>
          <p className="mt-2 text-sm text-emerald-700">
            メール内のリンクを開くとログインできます。
          </p>
          <p className="mt-4 text-xs text-emerald-600">
            （ローカル開発では Inbucket{' '}
            <a
              className="underline"
              href="http://127.0.0.1:54524"
              target="_blank"
              rel="noreferrer"
            >
              http://127.0.0.1:54524
            </a>{' '}
            にメールが届きます）
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              メールアドレス
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
          </div>

          {status === 'error' && (
            <p className="text-sm text-rose-600" role="alert">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={status === 'sending'}
            className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-base font-semibold text-white transition active:scale-[0.99] disabled:opacity-60"
          >
            {status === 'sending' ? '送信中…' : 'ログインリンクを送る'}
          </button>

          <p className="text-center text-xs text-slate-400">
            登録済みのメールにログイン用リンクを送ります。
          </p>
        </form>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
