// CSV シリアライズ（純関数）。Excel で文字化け・列ズレしないよう
// UTF-8 BOM + CRLF + RFC4180 エスケープ。

export type CsvCell = string | number | null | undefined;

export const UTF8_BOM = '﻿';

function escapeCell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  // 数値は注入リスクなし。そのまま出す（先頭の - を無害化しない）。
  if (typeof value === 'number') return String(value);
  let s = String(value);
  // CSV/フォーミュラインジェクション対策: Excel/LibreOffice が数式として
  // 評価し得る先頭文字（= + - @ TAB CR）を持つ文字列はシングルクォートで無害化。
  // 自由入力（人物名・礼拝名等）が受付権限で仕込まれてもセルが式にならない。
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
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
