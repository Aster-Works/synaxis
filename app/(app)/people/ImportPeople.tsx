'use client';

import { useState, useTransition } from 'react';
import { Upload } from 'lucide-react';
import { importPeopleAction, type ImportResult } from './actions';

// CSV（人物一覧エクスポート互換）を名簿へ取り込む。owner/admin のみ表示。
export function ImportPeople() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, start] = useTransition();

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setResult(null);
    if (!f) {
      setText('');
      setFileName('');
      return;
    }
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ''));
    reader.readAsText(f); // UTF-8（エクスポートCSVと同じ）
  };

  const submit = () => {
    if (!text) return;
    setResult(null);
    start(async () => setResult(await importPeopleAction(text)));
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white py-3 text-sm font-semibold text-slate-600"
      >
        <Upload className="h-4 w-4" />
        CSVから取り込み
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">CSVから取り込み</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-slate-400 hover:text-slate-600"
        >
          閉じる
        </button>
      </div>

      <p className="text-xs text-slate-500">
        「集計」→ CSV出力の「人物一覧」をそのまま取り込めます（UTF-8）。
        氏名・ふりがな・立場・年齢区分を読み込み、<b>既存と同名の人はスキップ</b>します。
      </p>

      <input
        type="file"
        accept=".csv,text/csv"
        onChange={onFile}
        className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700"
      />

      <button
        onClick={submit}
        disabled={pending || !text}
        className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {pending ? '取り込み中…' : '取り込む'}
        {fileName && !pending ? `（${fileName}）` : ''}
      </button>

      {result?.error && (
        <p className="text-sm text-rose-600" role="alert">
          {result.error}
        </p>
      )}
      {result && result.error === undefined && (
        <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          <p>
            <b>{result.created ?? 0}件</b>を名簿に追加しました
            {result.skipped ? `（既存と同名 ${result.skipped}件はスキップ）` : ''}。
          </p>
          {result.rowErrors && result.rowErrors.length > 0 && (
            <details className="mt-2 text-xs text-slate-600">
              <summary className="cursor-pointer text-amber-700">
                取り込めなかった行 {result.rowErrors.length}件
              </summary>
              <ul className="mt-1 list-disc pl-4">
                {result.rowErrors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
