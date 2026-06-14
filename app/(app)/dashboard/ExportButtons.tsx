'use client';

import { useSearchParams } from 'next/navigation';
import { Download } from 'lucide-react';

const EXPORTS: { type: string; label: string }[] = [
  { type: 'summary', label: 'まとめ' },
  { type: 'matrix', label: '出席マトリクス' },
  { type: 'guests', label: 'ゲスト' },
  { type: 'people', label: '人物一覧' },
];

// 現在の期間フィルターを引き継いだ CSV ダウンロードリンク。
// <a download> でブラウザがそのまま保存する（Content-Disposition: attachment）。
export function ExportButtons() {
  const params = useSearchParams();

  const href = (type: string) => {
    const p = new URLSearchParams(params.toString());
    p.set('type', type);
    return `/api/reports/export?${p.toString()}`;
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-slate-500">CSV出力:</span>
      {EXPORTS.map((e) => (
        <a
          key={e.type}
          href={href(e.type)}
          download
          className="flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
        >
          <Download className="h-3.5 w-3.5" />
          {e.label}
        </a>
      ))}
    </div>
  );
}
