// ふりがな（読み）の先頭文字から五十音「行」を判定する純関数。
// 受付・人物一覧の「あかさたな」行フィルターで共有する。
// - 半角カナ/全角カナ/ひらがなを正規化（NFKC＋カタカナ→ひらがな）
// - 濁点・半濁点・小書きは各行に含めて判定（が→か行、ぱ→は行、っ→た行 など）
// - 読みが無い/かな以外（英字等）は「他」

const ROWS: { row: string; chars: string }[] = [
  { row: 'あ', chars: 'あいうえおぁぃぅぇぉ' },
  { row: 'か', chars: 'かきくけこがぎぐげごゕゖ' },
  { row: 'さ', chars: 'さしすせそざじずぜぞ' },
  { row: 'た', chars: 'たちつてとだぢづでどっ' },
  { row: 'な', chars: 'なにぬねの' },
  { row: 'は', chars: 'はひふへほばびぶべぼぱぴぷぺぽ' },
  { row: 'ま', chars: 'まみむめも' },
  { row: 'や', chars: 'やゆよゃゅょ' },
  { row: 'ら', chars: 'らりるれろ' },
  { row: 'わ', chars: 'わをんゎ' },
];

// フィルターに並べる行（末尾の「他」はかな以外・読み無し用）。
export const KANA_ROWS: string[] = [...ROWS.map((r) => r.row), '他'];

export function kanaRowOf(furigana: string | null | undefined): string {
  if (!furigana) return '他';
  const s = furigana.normalize('NFKC').trim();
  if (!s) return '他';
  let c = s[0];
  const code = c.charCodeAt(0);
  // カタカナ（ァ..ヶ）→ ひらがなへ寄せる
  if (code >= 0x30a1 && code <= 0x30f6) c = String.fromCharCode(code - 0x60);
  for (const { row, chars } of ROWS) if (chars.includes(c)) return row;
  return '他';
}
