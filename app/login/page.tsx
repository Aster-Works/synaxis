'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/app/lib/supabase/client';

type Mode = 'signin' | 'signup';

// Supabase の英語エラーを会衆向けの日本語に置き換える。
function jaError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials'))
    return 'メールアドレスまたはパスワードが正しくありません。';
  if (m.includes('email not confirmed'))
    return 'メールアドレスの確認が完了していません。届いた確認メールのリンクを開いてください。';
  if (m.includes('user already registered') || m.includes('already been registered'))
    return 'このメールアドレスは登録済みです。「ログイン」からお入りください。';
  if (m.includes('password should be at least') || m.includes('at least 6'))
    return 'パスワードは6文字以上で入力してください。';
  if (m.includes('weak') || m.includes('pwned'))
    return 'パスワードが簡単すぎます。別のパスワードを設定してください。';
  if (m.includes('rate limit') || m.includes('too many'))
    return '試行回数が多すぎます。しばらく待ってからお試しください。';
  return message;
}

function LoginForm() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') ?? '/check-in';
  const authError = searchParams.get('error'); // /auth/callback 失敗時

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<null | 'password' | 'google'>(null);
  const [error, setError] = useState<string | null>(
    authError ? 'ログインに失敗しました。もう一度お試しください。' : null,
  );
  const [info, setInfo] = useState<string | null>(null);

  function callbackUrl() {
    return `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(
      redirect,
    )}`;
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setBusy('password');
    setError(null);
    setInfo(null);
    const supabase = createSupabaseBrowserClient();

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        setError(jaError(error.message));
        setBusy(null);
        return;
      }
      // Cookie セッションが確定したのちフル遷移（サーバーが確実に拾う）。
      window.location.assign(redirect);
      return;
    }

    // 新規登録（確認メールなし運用ならそのままセッションが返る）。
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: callbackUrl() },
    });
    if (error) {
      setError(jaError(error.message));
      setBusy(null);
      return;
    }
    if (data.session) {
      window.location.assign(redirect);
      return;
    }
    // 確認メール必須設定の場合（本番で「Confirm email」を ON にしている場合）。
    setInfo('確認メールを送信しました。メール内のリンクを開くとログインできます。');
    setBusy(null);
  }

  async function handleGoogle() {
    setBusy('google');
    setError(null);
    setInfo(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl() },
    });
    if (error) {
      // 失敗時のみここに戻る（成功時は Google へ遷移する）。
      setError(jaError(error.message));
      setBusy(null);
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

      {/* ログイン / 新規登録 切り替え */}
      <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
        {(
          [
            ['signin', 'ログイン'],
            ['signup', '新規登録'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setMode(key);
              setError(null);
              setInfo(null);
            }}
            className={`rounded-lg py-2 text-sm font-semibold transition ${
              mode === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Google ログイン */}
      <button
        type="button"
        onClick={handleGoogle}
        disabled={busy !== null}
        className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-slate-300 bg-white px-4 py-3 text-base font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-[0.99] disabled:opacity-60"
      >
        <GoogleIcon />
        {busy === 'google' ? 'Google に移動中…' : 'Google で続ける'}
      </button>

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-slate-200" />
        <span className="text-xs text-slate-400">または</span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <form onSubmit={handlePassword} className="space-y-4">
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

        <div>
          <label
            htmlFor="password"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            パスワード
          </label>
          <input
            id="password"
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'signup' ? '6文字以上' : '••••••••'}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
        </div>

        {error && (
          <p className="text-sm text-rose-600" role="alert">
            {error}
          </p>
        )}
        {info && (
          <p
            className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700"
            role="status"
          >
            {info}
          </p>
        )}

        <button
          type="submit"
          disabled={busy !== null}
          className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-base font-semibold text-white transition active:scale-[0.99] disabled:opacity-60"
        >
          {busy === 'password'
            ? '処理中…'
            : mode === 'signin'
              ? 'ログイン'
              : '登録してはじめる'}
        </button>

        <p className="text-center text-xs text-slate-400">
          {mode === 'signin'
            ? 'メールアドレスとパスワード、または Google でログインできます。'
            : 'メールとパスワードで登録します。確認メールは不要です。'}
        </p>
      </form>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
