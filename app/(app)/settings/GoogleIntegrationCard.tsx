'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';

// API が返す Google 側の診断情報を、Jimi 向けの原因・対処メッセージに変換する。
function hintForDetail(detail?: {
  httpStatus?: number;
  reason?: string;
  message?: string;
}): string {
  const reason = detail?.reason ?? '';
  if (reason === 'SERVICE_DISABLED')
    return 'Google Cloud で Google Sheets API / Drive API が有効になっていません。両方を有効化してください。';
  if (reason === 'ACCESS_TOKEN_SCOPE_INSUFFICIENT')
    return '連携の権限（スコープ）が不足しています。「接続を解除」してから、もう一度接続し直してください。';
  if (reason === 'PERMISSION_DENIED')
    return '権限エラーです（API 未有効化、またはスコープ不足の可能性）。Google Cloud の設定をご確認ください。';
  if (detail?.message) return `エラー詳細: ${detail.message}`;
  return '時間をおいてお試しください。';
}

export function GoogleIntegrationCard({
  connected,
  email,
  currentYear,
}: {
  connected: boolean;
  email: string | null;
  currentYear: number;
}) {
  const params = useSearchParams();
  const flash = params.get('google');
  const [year, setYear] = useState(currentYear);
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error' | 'reconnect'>(
    'idle',
  );
  const [url, setUrl] = useState('');
  const [errorHint, setErrorHint] = useState('');

  const years = [currentYear, currentYear - 1, currentYear - 2];

  async function runExport() {
    setStatus('running');
    setUrl('');
    setErrorHint('');
    const res = await fetch('/api/exports/google-sheets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year }),
    });
    if (res.ok) {
      const data = await res.json();
      setUrl(data.spreadsheetUrl ?? '');
      setStatus('done');
    } else if (res.status === 409) {
      setStatus('reconnect');
    } else {
      const data = await res.json().catch(() => ({}));
      setErrorHint(hintForDetail(data?.detail));
      setStatus('error');
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-500">Google スプレッドシート連携</h2>

      {flash === 'connected' && (
        <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Google と接続しました。
        </p>
      )}
      {flash === 'disconnected' && (
        <p className="mb-3 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
          接続を解除しました。
        </p>
      )}
      {(flash === 'error' || flash === 'forbidden' || flash === 'noRefresh') && (
        <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {flash === 'noRefresh'
            ? '再接続が必要です。もう一度お試しください。'
            : '接続に失敗しました。'}
        </p>
      )}

      {!connected ? (
        <div>
          <p className="mb-3 text-sm text-slate-500">
            出席集計を Google スプレッドシートへ出力できます。owner/admin が接続します。
          </p>
          <a
            href="/api/integrations/google/connect"
            className="inline-block rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white"
          >
            Google と接続する
          </a>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            接続済み{email ? `（${email}）` : ''}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}年
                </option>
              ))}
            </select>
            <button
              onClick={runExport}
              disabled={status === 'running'}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {status === 'running' ? '出力中…' : 'スプレッドシートへ出力'}
            </button>
            <form action="/api/integrations/google/disconnect" method="post">
              <button
                type="submit"
                className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600"
              >
                接続を解除
              </button>
            </form>
          </div>

          {status === 'done' && url && (
            <p className="text-sm text-emerald-700">
              出力しました。
              <a href={url} target="_blank" rel="noreferrer" className="ml-1 underline">
                スプレッドシートを開く
              </a>
            </p>
          )}
          {status === 'reconnect' && (
            <p className="text-sm text-rose-700">
              接続の有効期限が切れています。「接続を解除」してから再接続してください。
            </p>
          )}
          {status === 'error' && (
            <p className="text-sm text-rose-700">
              出力に失敗しました。{errorHint || '時間をおいてお試しください。'}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
