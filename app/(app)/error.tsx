'use client';

import { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';

// 受付・名簿・集計で一時的なデータ取得失敗が起きたときの画面。
// これが無いと Next.js 既定の英語エラー画面になり、主日の受付が止まる。
// 「空データを正常表示する」誤魔化しはしない（何が起きたか伝えて再試行させる）。
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app] 画面の描画に失敗しました', error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-center">
      <h1 className="text-lg font-bold text-slate-900">
        データを読み込めませんでした
      </h1>
      <p className="text-sm text-slate-600">
        通信または接続が一時的に不安定な可能性があります。
        受付の未送信データは端末に保存されているので、
        つながり次第そのまま送信されます。
      </p>
      <button
        type="button"
        onClick={reset}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-base font-semibold text-white active:scale-[0.99]"
      >
        <RefreshCw className="h-5 w-5" />
        もう一度読み込む
      </button>
      {error.digest && (
        <p className="text-xs text-slate-400">エラーID: {error.digest}</p>
      )}
    </div>
  );
}
