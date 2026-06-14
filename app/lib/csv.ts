// CSV シリアライズ（純関数）。Excel で文字化け・列ズレしないよう
// UTF-8 BOM + CRLF + RFC4180 エスケープ。

export type CsvCell = string | number | null | undefined;

export const UTF8_BOM = '﻿';

function escapeCell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// 行配列を CSV 文字列へ（BOM なし）。
export function toCsvBody(rows: CsvCell[][]): string {
  return rows.map((row) => row.map(escapeCell).join(',')).join('\r\n');
}

// BOM 付き CSV（ダウンロード用）。
export function toCsv(rows: CsvCell[][]): string {
  return UTF8_BOM + toCsvBody(rows);
}
